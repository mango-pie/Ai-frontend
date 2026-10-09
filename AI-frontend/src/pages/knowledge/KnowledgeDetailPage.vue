<script setup lang="ts">
/**
 * 知识库详情页（馆藏文档管理）
 * 通过路由参数 kbId 定位知识库，按 ?upload=1 区分两种形态：
 * 1) 上传台：拖放/点选文件 → 校验类型 → 上传入库（上传后为 PENDING）；
 * 2) 馆藏列表：文档行展示解析状态（PENDING/PARSING/SUCCESS/FAILED），
 *    支持触发解析、失败重试、下载、删除，双击 SUCCESS 文档可预览切块（chunk）。
 * 解析中的文档以 2.5s 轮询刷新状态直至终态，右侧面板汇总解析健康度。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { getKnowledgeBase } from '@/api/knowledge'
import {
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  getKnowledgeDocumentDownloadUrl,
  listKnowledgeDocumentChunks,
  listKnowledgeDocuments,
  parseKnowledgeDocument,
  uploadKnowledgeDocument,
} from '@/api/knowledge'
import {
  KB_UPLOAD_ACCEPT,
  canParseDocument,
  formatFileSize,
  isAllowedKbUploadFile,
  isParsedDocument,
  isParsingDocument,
} from '@/utils/knowledgeFormat'
import KnowledgeRoomShell from '@/components/knowledge/KnowledgeRoomShell.vue'

const route = useRoute()
const router = useRouter()
// 当前知识库 id（路由参数）与是否处于“上传台”形态（?upload=1）
const kbId = computed(() => String(route.params.kbId ?? ''))
const showUpload = computed(() => route.query.upload === '1' || route.query.upload === 'true')

// ── 状态区：知识库信息、文档列表、选中行、上传与轮询 ──
const kbLoading = ref(false)
const kb = ref<API.KnowledgeBaseVO | null>(null)
const loading = ref(false)
const dataSource = ref<API.KnowledgeDocumentVO[]>([])
const total = ref(0)
const selectedId = ref<string | number | null>(null)
const uploading = ref(false)
// 待上传文件（选好但未提交）与隐藏的文件输入框引用
const pendingFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 文档列表查询参数：默认每页 50 条，支持按文件名/类型/解析状态过滤
const query = reactive<API.KnowledgeDocumentQueryRequest>({
  pageNum: 1,
  pageSize: 50,
  fileName: undefined,
  fileType: undefined,
  parseStatus: undefined,
})

// 文档 id -> 轮询定时器 的映射：解析中的文档各自独立轮询
const pollTimers = new Map<string, ReturnType<typeof setInterval>>()
// 切块预览抽屉：开关、加载态、切块列表与文档名
const chunkOpen = ref(false)
const chunkLoading = ref(false)
const chunks = ref<API.KnowledgeChunkVO[]>([])
const chunkDocName = ref('')
// 正在触发解析的文档 id 集合（用于按钮防抖）
const parsingIds = ref<Set<string>>(new Set())

// 解析状态归一化为四种契约态：SUCCESS/PARSING/FAILED/PENDING
const pillStatus = (status?: string) => {
  const u = String(status || '').toUpperCase()
  if (u === 'PARSED' || u === 'SUCCESS') return 'SUCCESS'
  if (u === 'PARSING') return 'PARSING'
  if (u === 'FAILED') return 'FAILED'
  return 'PENDING'
}

// 解析进度条的视觉宽度：完成 100%、解析中 62%、其余 0%（无精确百分比，仅示意）
const parseBarWidth = (status?: string) => {
  const p = pillStatus(status)
  if (p === 'SUCCESS') return '100%'
  if (p === 'PARSING') return '62%'
  return '0%'
}

// 按文件类型/文件名推断文档图标类别（pdf / md / 通用二进制）
const docIco = (fileType?: string, fileName?: string) => {
  const t = (fileType || fileName || '').toLowerCase()
  if (t.includes('pdf')) return 'pdf'
  if (t.includes('md') || t.includes('markdown')) return 'md'
  if (t.includes('doc')) return 'md'
  return 'bin'
}

// 当前选中的文档：未显式选中时回退到列表第一行
const selected = computed(() => {
  if (selectedId.value == null) return dataSource.value[0] ?? null
  return dataSource.value.find((d) => String(d.id) === String(selectedId.value)) ?? dataSource.value[0] ?? null
})

// 按解析状态统计各类文档数量（供右侧解析进度面板使用）
const counts = computed(() => {
  const c = { ok: 0, parsing: 0, pending: 0, failed: 0 }
  for (const d of dataSource.value) {
    const p = pillStatus(d.parseStatus)
    if (p === 'SUCCESS') c.ok += 1
    else if (p === 'PARSING') c.parsing += 1
    else if (p === 'FAILED') c.failed += 1
    else c.pending += 1
  }
  return c
})

// 四种状态占文档总数的百分比：驱动健康度堆叠条宽度
const healthPct = computed(() => {
  const n = dataSource.value.length || 1
  return {
    ok: `${(counts.value.ok / n) * 100}%`,
    parsing: `${(counts.value.parsing / n) * 100}%`,
    pending: `${(counts.value.pending / n) * 100}%`,
    failed: `${(counts.value.failed / n) * 100}%`,
  }
})

// ── 解析轮询 ──
// 停止指定文档的轮询
const stopPoll = (id: string) => {
  const t = pollTimers.get(id)
  if (t) {
    clearInterval(t)
    pollTimers.delete(id)
  }
}

// 停止全部轮询（离开页面时清理，避免内存泄漏与无效请求）
const clearAllPolls = () => {
  for (const id of pollTimers.keys()) stopPoll(id)
}

// 局部更新列表中某一行的数据（轮询到新状态时避免整表刷新）
const patchRow = (doc: API.KnowledgeDocumentVO) => {
  const idx = dataSource.value.findIndex((d) => String(d.id) === String(doc.id))
  if (idx >= 0) dataSource.value[idx] = { ...dataSource.value[idx], ...doc }
}

// 对解析中的文档启动 2.5s 轮询：到达终态（SUCCESS/FAILED）即停止，
// 成功时提示并刷新知识库概览，失败时展示 errorMessage；请求异常也停止轮询
const startPoll = (id: number | string) => {
  const key = String(id)
  stopPoll(key)
  const timer = setInterval(async () => {
    try {
      const res = await getKnowledgeDocument(id)
      if (res.data.code === 0 && res.data.data) {
        const doc = res.data.data
        patchRow(doc)
        if (isParsedDocument(doc.parseStatus) || doc.parseStatus === 'FAILED') {
          stopPoll(key)
          if (doc.parseStatus === 'FAILED') message.error(doc.errorMessage || '解析失败')
          else {
            message.success('解析完成')
            fetchKb()
          }
        }
      }
    } catch {
      stopPoll(key)
    }
  }, 2500)
  pollTimers.set(key, timer)
}

// 加载知识库基本信息：不存在时提示并跳回列表页
const fetchKb = async () => {
  kbLoading.value = true
  try {
    const res = await getKnowledgeBase(kbId.value)
    if (res.data.code === 0 && res.data.data) kb.value = res.data.data
    else {
      message.error(res.data.message || '知识库不存在')
      router.replace('/knowledge')
    }
  } finally {
    kbLoading.value = false
  }
}

// 加载文档列表：默认选中第一行，并为所有“解析中”的文档恢复轮询
const fetchDocs = async () => {
  loading.value = true
  try {
    const res = await listKnowledgeDocuments(kbId.value, { ...query })
    if (res.data.code === 0 && res.data.data) {
      dataSource.value = res.data.data.records ?? []
      total.value = res.data.data.totalRow ?? 0
      if (selectedId.value == null && dataSource.value[0]?.id != null) {
        selectedId.value = dataSource.value[0].id
      }
      for (const row of dataSource.value) {
        if (row.id != null && isParsingDocument(row.parseStatus)) startPoll(row.id)
      }
    } else message.error(res.data.message || '文档列表加载失败')
  } finally {
    loading.value = false
  }
}

// 同时刷新库信息与文档列表
const refreshAll = async () => {
  await Promise.all([fetchKb(), fetchDocs()])
}

// 点击行选中文档（双击行为另走切块预览）
const selectDoc = (row: API.KnowledgeDocumentVO) => {
  if (row.id != null) selectedId.value = row.id
}

// 进入/退出上传台：用路由 query 切换形态，便于直接分享上传链接
const goUpload = () => router.replace({ path: `/knowledge/${kbId.value}`, query: { upload: '1' } })
const leaveUpload = () => router.replace(`/knowledge/${kbId.value}`)

// 点选文件：校验扩展名/大小是否允许上传，不合法则提示并清空选择
const onPickFile = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const check = isAllowedKbUploadFile(file)
  if (!check.ok) {
    message.error(check.message)
    input.value = ''
    return
  }
  pendingFile.value = file
}

// 拖放文件：与点选走同一套校验
const onDrop = (e: DragEvent) => {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const check = isAllowedKbUploadFile(file)
  if (!check.ok) {
    message.error(check.message)
    return
  }
  pendingFile.value = file
}

// 提交上传：成功后清空待传文件、刷新列表并退出上传台
const submitUpload = async () => {
  if (!pendingFile.value || uploading.value) return
  uploading.value = true
  try {
    const res = await uploadKnowledgeDocument(kbId.value, pendingFile.value)
    if (res.data.code === 0) {
      message.success(`${pendingFile.value.name} 上传成功`)
      pendingFile.value = null
      if (fileInputRef.value) fileInputRef.value.value = ''
      await refreshAll()
      leaveUpload()
    } else message.error(res.data.message || '上传失败')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '上传失败')
  } finally {
    uploading.value = false
  }
}

// 触发解析（默认作用于选中文档）：仅 PENDING/FAILED 状态可解析；
// 后端若立即进入解析中则挂轮询，若同步完成则直接刷新库信息
const handleParse = async (row?: API.KnowledgeDocumentVO | null) => {
  const target = row ?? selected.value
  if (!target?.id || !canParseDocument(target.parseStatus)) {
    message.info('当前文档无需解析或不可解析')
    return
  }
  const id = String(target.id)
  parsingIds.value.add(id)
  try {
    const res = await parseKnowledgeDocument(target.id)
    if (res.data.code === 0 && res.data.data) {
      message.success('已开始解析')
      patchRow(res.data.data)
      if (isParsingDocument(res.data.data.parseStatus)) startPoll(target.id)
      else if (isParsedDocument(res.data.data.parseStatus)) {
        message.success('解析完成')
        await fetchKb()
      }
    } else message.error(res.data.message || '触发解析失败')
  } finally {
    parsingIds.value.delete(id)
  }
}

// 一键重试所有解析失败的文档
const retryFailed = async () => {
  const failed = dataSource.value.filter((d) => pillStatus(d.parseStatus) === 'FAILED')
  if (!failed.length) {
    message.info('没有失败项')
    return
  }
  for (const row of failed) await handleParse(row)
}

// 下载文档：向后端换取临时下载链接后在新标签打开
const handleDownload = async (row: API.KnowledgeDocumentVO) => {
  if (row.id == null) return
  const res = await getKnowledgeDocumentDownloadUrl(row.id)
  if (res.data.code === 0 && res.data.data?.url) window.open(res.data.data.url, '_blank')
  else message.error(res.data.message || '获取下载链接失败')
}

// 删除文档：二次确认后先停轮询再删除；若删除的是当前选中行则清空选中
const handleDelete = (row: API.KnowledgeDocumentVO) => {
  Modal.confirm({
    title: '删除文档',
    content: `确认删除「${row.fileName}」？`,
    okType: 'danger',
    onOk: async () => {
      if (row.id == null) return
      stopPoll(String(row.id))
      const res = await deleteKnowledgeDocument(row.id)
      if (res.data.code === 0) {
        message.success('已删除')
        if (String(selectedId.value) === String(row.id)) selectedId.value = null
        await refreshAll()
      } else message.error(res.data.message || '删除失败')
    },
  })
}

// 打开切块预览抽屉：仅解析 SUCCESS 的文档可看，拉取前 50 条切块内容
const openChunks = async (row: API.KnowledgeDocumentVO) => {
  if (row.id == null || !isParsedDocument(row.parseStatus)) {
    message.info('仅 SUCCESS 文档可预览切块')
    return
  }
  chunkDocName.value = row.fileName || ''
  chunkOpen.value = true
  chunkLoading.value = true
  try {
    const res = await listKnowledgeDocumentChunks(row.id, { pageNum: 1, pageSize: 50 })
    if (res.data.code === 0) chunks.value = res.data.data ?? []
    else {
      message.error(res.data.message || '加载切块失败')
      chunks.value = []
    }
  } finally {
    chunkLoading.value = false
  }
}

// 挂载时加载库信息与文档列表；卸载时清理所有轮询定时器
onMounted(refreshAll)
onBeforeUnmount(clearAllPolls)
</script>

<template>
  <KnowledgeRoomShell :note-label="`Knowledge · ${kb?.name || '馆藏详情'}`">
    <!-- Upload desk -->
    <div v-if="showUpload" class="shell">
      <aside class="side side-stack anim" style="animation-delay: 0.08s">
        <button class="back-chip" type="button" @click="leaveUpload">← 返回馆藏 · Esc</button>
        <div class="side-card glass">
          <span class="tape" />
          <h3 class="font-display">{{ kb?.name || '知识库' }}</h3>
          <p class="about">multipart 字段 <b>file</b> · 上传后为 PENDING</p>
        </div>
        <div class="panel glass">
          <div class="eyebrow">解析流水线</div>
          <div class="pipeline">
            <div class="step s1 on"><span class="dot" />PENDING · 待解析</div>
            <div class="step s2"><span class="dot" />PARSING · 解析中</div>
            <div class="step s3"><span class="dot" />SUCCESS · 可问答</div>
            <div class="step s4"><span class="dot" />FAILED · 可重试</div>
          </div>
        </div>
        <div class="panel glass" style="flex: 1; display: flex; flex-direction: column; min-height: 0">
          <div class="eyebrow">本库已有</div>
          <div class="intake">
            <div v-for="d in dataSource.slice(0, 6)" :key="String(d.id)" class="intake-row">
              <span class="t">{{ (d.createTime || '').slice(5, 16) || '—' }}</span>
              <span class="n">{{ d.fileName }}</span>
              <span class="d" :class="pillStatus(d.parseStatus)">{{ pillStatus(d.parseStatus) }}</span>
            </div>
          </div>
        </div>
      </aside>

      <main class="main room-col anim" style="animation-delay: 0.16s; justify-content: center">
        <div class="room-head" style="max-width: 680px; width: 100%; margin: 0 auto 8px">
          <div>
            <div class="eyebrow">INTAKE DESK</div>
            <h1 class="font-display">上传文档</h1>
            <p class="sub">拖到桌面 · 再提交入库</p>
          </div>
        </div>
        <div class="form-card">
          <span class="fr-mount" aria-hidden="true" />
          <span class="edge-fold" aria-hidden="true" />
          <div class="eyebrow" style="margin-top: 4px">/knowledge/{{ kbId }} · upload</div>
          <p class="h-sub" style="margin-top: 6px; color: var(--ink-soft); font-size: 13px">
            支持 pdf / md 等
          </p>
          <button
            type="button"
            class="dropzone"
            @click="fileInputRef?.click()"
            @dragover.prevent
            @drop="onDrop"
          >
            <div class="ph">FILE</div>
            <div class="font-display" style="font-size: 18px; letter-spacing: 1px; color: var(--craft-c)">
              拖放或点击选择
            </div>
            <div class="meta">点选文件</div>
          </button>
          <input
            ref="fileInputRef"
            type="file"
            :accept="KB_UPLOAD_ACCEPT"
            hidden
            @change="onPickFile"
          />
          <div v-if="pendingFile" class="file-chip">
            <span>{{ pendingFile.name }}</span>
            <span class="status-pill PENDING"><i />待提交</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 14px">
            <button class="chip-btn primary" type="button" :disabled="!pendingFile || uploading" @click="submitUpload">
              {{ uploading ? '上传中…' : '提交入库' }}
            </button>
            <button class="chip-btn" type="button" @click="leaveUpload">返回馆藏</button>
          </div>
        </div>
      </main>

      <aside class="deck anim" style="animation-delay: 0.24s">
        <div class="panel glass">
          <span class="tape sun" />
          <div class="eyebrow">当前库</div>
          <div class="kb-badge" style="margin-top: 8px"><span class="dot" /><span>{{ kb?.name }}</span></div>
        </div>
        <div class="panel glass" style="flex: 1; display: flex; flex-direction: column">
          <div class="eyebrow">入库提示</div>
          <div class="hint-box">
            上传后为 PENDING。<br />
            触发 parse 直至终态。<br />
            失败看 errorMessage，可重试。
          </div>
          <div class="blotter" style="margin-top: auto">
            <div class="k">馆员便签</div>
            <div class="v">新文件排在队首。至少 1 篇 SUCCESS 再进问答。</div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Detail archive -->
    <div v-else class="shell" :aria-busy="kbLoading || loading">
      <aside class="side side-stack anim" style="animation-delay: 0.08s">
        <button class="back-chip" type="button" @click="router.push('/knowledge')">← 返回列表 · Esc</button>
        <div class="side-card glass">
          <span class="tape" />
          <h3 class="font-display">{{ kb?.name || '知识库' }}</h3>
          <p class="about">馆藏文档与解析态。上传后 PENDING → parse。</p>
          <button class="chip-btn primary block" type="button" style="margin-top: 10px" @click="goUpload">
            上传文档
          </button>
        </div>
        <div class="panel glass">
          <div class="eyebrow">契约四态</div>
          <div class="state-legend">
            <span class="ok"><i />SUCCESS</span>
            <span class="parsing"><i />PARSING</span>
            <span class="pending"><i />PENDING</span>
            <span class="failed"><i />FAILED</span>
          </div>
        </div>
        <div class="panel glass" style="flex: 1; display: flex; flex-direction: column; min-height: 0">
          <div class="eyebrow">入库流水</div>
          <div class="intake">
            <div v-for="d in dataSource.slice(0, 8)" :key="String(d.id)" class="intake-row">
              <span class="t">{{ (d.createTime || '').slice(5, 16) || '—' }}</span>
              <span class="n">{{ d.fileName }}</span>
              <span class="d" :class="pillStatus(d.parseStatus)">{{ pillStatus(d.parseStatus) }}</span>
            </div>
            <div v-if="!dataSource.length" class="intake-row">
              <span class="t">—</span>
              <span class="n">暂无文档</span>
              <span class="d PENDING">空</span>
            </div>
          </div>
        </div>
      </aside>

      <main class="main room-col anim" style="animation-delay: 0.16s">
        <div class="room-head">
          <div>
            <div class="eyebrow">ARCHIVE ROOM</div>
            <h1 class="font-display">馆藏文档</h1>
            <p class="sub">点行选中 · SUCCESS 可进问答</p>
          </div>
          <div class="tools">
            <button class="chip-btn sm" type="button" @click="goUpload">再上传</button>
            <button class="chip-btn sm primary" type="button" @click="router.push(`/knowledge/${kbId}/chat`)">
              进入问答
            </button>
          </div>
        </div>

        <div class="detail-main folio-room glass">
          <span class="fr-mount" aria-hidden="true" />
          <div class="detail-hero">
            <div class="left">
              <div class="eyebrow">文档与解析</div>
              <h1 class="font-display">本库书架</h1>
              <p class="h-sub">轮询至终态 · chunk 预览仅 SUCCESS</p>
            </div>
            <div
              class="period-chip"
              style="
                padding: 6px 10px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.7);
                border: 1px dashed color-mix(in srgb, var(--craft-c) 28%, transparent);
              "
            >
              <div class="n font-display" style="font-size: 13px; color: var(--craft-c)">
                <span class="p-dot" />馆藏
              </div>
            </div>
          </div>

          <div class="detail-body">
            <!-- 文档列表：单击选中、双击预览切块；行内含图标/元信息/解析进度条与状态徽标，
                 SUCCESS 且有切块时展示 CHUNK 预览入口，FAILED 时展示错误信息 -->
            <div class="doc-list">
              <button
                v-for="row in dataSource"
                :key="String(row.id)"
                type="button"
                class="doc-row"
                :class="{ 'is-on': String(row.id) === String(selected?.id) }"
                @click="selectDoc(row)"
                @dblclick="openChunks(row)"
              >
                <span class="doc-ico" :class="docIco(row.fileType, row.fileName)" aria-hidden="true" />
                <div>
                  <div class="name">{{ row.fileName }}</div>
                  <div class="path">
                    {{ row.fileType || 'file' }} · {{ formatFileSize(row.fileSize) }}
                    <template v-if="row.createTime"> · {{ row.createTime }}</template>
                  </div>
                  <div class="parse-bar"><i :style="{ width: parseBarWidth(row.parseStatus) }" /></div>
                  <div
                    v-if="isParsedDocument(row.parseStatus) && (row.chunkCount ?? 0) > 0"
                    class="chunk-preview"
                  >
                    <div class="cap">CHUNK 预览</div>
                    切块 · chunkCount={{ row.chunkCount }} · 双击打开
                  </div>
                  <div
                    v-else-if="pillStatus(row.parseStatus) === 'FAILED'"
                    class="chunk-preview"
                    style="border-color: color-mix(in srgb, var(--c-sakura) 40%, transparent)"
                  >
                    <div class="cap">FAILED</div>
                    {{ row.errorMessage || '解析失败，可重试' }}
                  </div>
                </div>
                <span class="status-pill" :class="pillStatus(row.parseStatus)">
                  <i />
                  {{ pillStatus(row.parseStatus) }}
                  <template v-if="isParsedDocument(row.parseStatus)"> · {{ row.chunkCount ?? 0 }}</template>
                </span>
              </button>
              <div v-if="!dataSource.length && !loading" class="doc-row" style="cursor: default; opacity: 0.7">
                <span class="doc-ico bin" />
                <div>
                  <div class="name">还没有文档</div>
                  <div class="path">点左栏或底部上传</div>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-foot">
            <button class="chip-btn sm" type="button" @click="handleParse()">开始解析</button>
            <button class="chip-btn sm" type="button" @click="retryFailed">重试失败项</button>
            <span style="flex: 1" />
            <button class="chip-btn sm primary" type="button" @click="router.push(`/knowledge/${kbId}/chat`)">
              进入问答
            </button>
          </div>
        </div>
      </main>

      <aside class="deck anim" style="animation-delay: 0.24s">
        <div class="panel glass parse-summary">
          <span class="tape sun" />
          <div class="eyebrow">解析进度</div>
          <div class="parse-ring">
            <div class="pr-top">
              <span class="n font-display">{{ counts.ok }}</span>
              <span class="l">篇 SUCCESS</span>
            </div>
            <div class="health-bar" role="img" aria-label="解析占比">
              <i class="ok" :style="{ width: healthPct.ok }" />
              <i class="parsing" :style="{ width: healthPct.parsing }" />
              <i class="pending" :style="{ width: healthPct.pending }" />
              <i class="failed" :style="{ width: healthPct.failed }" />
            </div>
          </div>
          <div class="rowline"><span>PARSING</span><b>{{ counts.parsing }}</b></div>
          <div class="rowline"><span>PENDING</span><b>{{ counts.pending }}</b></div>
          <div class="rowline"><span>FAILED</span><b>{{ counts.failed }}</b></div>
        </div>
        <div class="panel glass" style="flex: 1; display: flex; flex-direction: column">
          <div class="eyebrow">下一步</div>
          <div class="blotter" style="margin-top: 4px">
            <div class="k">馆员便签</div>
            <div class="v">上传 → 解析 SUCCESS → 快捷问答。失败先看 errorMessage。</div>
          </div>
          <button
            class="chip-btn primary block"
            type="button"
            style="margin-top: auto"
            @click="router.push(`/knowledge/${kbId}/chat`)"
          >
            进入问答
          </button>
          <button class="chip-btn block" type="button" style="margin-top: 8px" @click="goUpload">继续上传</button>
        </div>
      </aside>
    </div>

    <!-- 切块预览抽屉：按序号列出文档切块文本内容 -->
    <a-drawer v-model:open="chunkOpen" :title="`切块 · ${chunkDocName}`" width="480" placement="right">
      <a-spin :spinning="chunkLoading">
        <a-list :data-source="chunks" item-layout="vertical">
          <template #renderItem="{ item, index }">
            <a-list-item>
              <div style="font-size: 12px; opacity: 0.65; margin-bottom: 4px">#{{ index + 1 }}</div>
              <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.55">{{ item.content }}</div>
            </a-list-item>
          </template>
        </a-list>
      </a-spin>
    </a-drawer>
  </KnowledgeRoomShell>
</template>
