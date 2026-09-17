<script setup lang="ts">
/**
 * 精读笔记审阅页：
 * 左编辑（Markdown 工具条 + Ctrl+S 保存 + 多 tab 冲突检测）右预览（目录 TOC 联动滚动），
 * 右侧操作面板支持重新蒸馏、发布/同步博客、加入/重建知识库索引；
 * 原文链接失效时降级展示采集时缓存的 raw_text 快照。
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  getKnowledgeNoteDetail,
  indexKnowledgeNote,
  listKnowledgeBases,
  publishKnowledgeNoteBlog,
  redistillKnowledgeNote,
  reindexKnowledgeNote,
  syncKnowledgeNoteBlog,
  updateKnowledgeNote,
} from '@/api/knowledge'
import { getAllCategories } from '@/api/blogCategoryController'
import { getAllTags } from '@/api/blogTagController'
import { renderBlogMarkdown } from '@/utils/blogMarkdown'
import {
  canIndexKb,
  canPublishBlog,
  canReindexKb,
  canSyncBlog,
} from '@/utils/knowledgeNoteStatus'
import { loadReadingUxSettings, type ReadingUxSettings } from '@/utils/readingSettings'
import { useCapabilitiesStore } from '@/stores/capabilities'
import ReadingRoomShell from '@/components/reading/ReadingRoomShell.vue'
import '@/assets/blog-prose.css'
import KnowledgeStatusChip from '@/components/knowledge/KnowledgeStatusChip.vue'

const route = useRoute()
const router = useRouter()
const capsStore = useCapabilitiesStore()
/** 博客模块开关：关闭时隐藏发布/同步博客入口 */
const blogEnabled = computed(() => !capsStore.loaded || capsStore.enabled('blog'))
const noteId = computed(() => String(route.params.noteId ?? ''))

const loading = ref(false)
const saving = ref(false)
const detail = ref<API.KnowledgeNoteDetailVO | null>(null)
/** 加载/保存时的服务端 updateTime，用于多 tab 冲突检测 */
const loadedUpdateTime = ref<string | null>(null)

// 可编辑表单：标题 / 标签 / 蒸馏后的 Markdown 正文
const form = reactive({
  title: '',
  tags: '',
  distilledMd: '',
})

// Markdown 渲染为 HTML 预览；TOC 与滚动高亮均基于该渲染结果
const previewHtml = computed(() => renderBlogMarkdown(form.distilledMd || ''))

const note = computed(() => detail.value?.note)
const kbId = computed(() => detail.value?.knowledgeDocument?.knowledgeBaseId)

/* ---- 状态步骤条：采集 → 蒸馏 → 发布 → 入库 ---- */
type StepState = 'done' | 'active' | 'todo' | 'error'
const statusSteps = computed<{ key: string; label: string; state: StepState }[]>(() => {
  const n = note.value
  const pub = n?.publishStatus
  const idx = n?.indexStatus
  const distillFailed = String(n?.status || '').toUpperCase() === 'FAILED'
  const publishState: StepState =
    pub === 'PUBLISHED'
      ? 'done'
      : pub === 'SYNC_FAILED'
        ? 'error'
        : pub === 'DRAFT_CREATED' || pub === 'SYNC_REQUIRED'
          ? 'active'
          : 'todo'
  const indexState: StepState =
    idx === 'INDEXED'
      ? 'done'
      : idx === 'INDEX_FAILED'
        ? 'error'
        : idx === 'REINDEX_REQUIRED'
          ? 'active'
          : 'todo'
  return [
    { key: 'collect', label: '采集', state: 'done' },
    { key: 'distill', label: '蒸馏', state: distillFailed ? 'error' : 'done' },
    { key: 'publish', label: '发布博客', state: publishState },
    { key: 'index', label: '入知识库', state: indexState },
  ]
})

/* ---- 预览 TOC（从渲染后的 h1-h3 提取，滚动高亮） ---- */
const mdPreviewRef = ref<HTMLElement | null>(null)
const toc = ref<{ id: string; text: string; level: number }[]>([])
const activeTocId = ref('')

const buildToc = () => {
  const el = mdPreviewRef.value
  if (!el) {
    toc.value = []
    return
  }
  const heads = Array.from(el.querySelectorAll('h1, h2, h3')) as HTMLElement[]
  toc.value = heads.map((h, i) => {
    if (!h.id) h.id = `kb-toc-${i}`
    return { id: h.id, text: h.textContent || '', level: Number(h.tagName.slice(1)) }
  })
  activeTocId.value = toc.value[0]?.id || ''
}

const scrollToHeading = (id: string) => {
  const el = mdPreviewRef.value
  if (!el) return
  const target = el.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
  if (target) {
    el.scrollTo({ top: Math.max(target.offsetTop - 12, 0), behavior: 'smooth' })
    activeTocId.value = id
  }
}

const onPreviewScroll = () => {
  const el = mdPreviewRef.value
  if (!el || !toc.value.length) return
  const scrollTop = el.scrollTop
  let current = toc.value[0]?.id ?? ''
  for (const item of toc.value) {
    const t = el.querySelector(`#${CSS.escape(item.id)}`) as HTMLElement | null
    if (t && t.offsetTop - 20 <= scrollTop) current = item.id
  }
  activeTocId.value = current
}

const rawOpen = ref(false)

const publishOpen = ref(false)
const publishLoading = ref(false)
const categoryOptions = ref<API.BlogCategoryVO[]>([])
const tagOptions = ref<API.BlogTagVO[]>([])

const publishForm = reactive({
  categoryId: undefined as number | string | undefined,
  tagIds: [] as (number | string)[],
  status: 0,
})

const readingUx = ref<ReadingUxSettings>({
  defaultAsDraft: true,
  askOpenEditor: true,
  redistillConfirmRequired: true,
})

const indexOpen = ref(false)
const indexLoading = ref(false)
const kbMode = ref<'existing' | 'create'>('existing')
const kbOptions = ref<{ label: string; value: string | number }[]>([])
const indexForm = reactive({
  knowledgeBaseId: undefined as number | string | undefined,
  knowledgeBaseName: '',
  knowledgeBaseDescription: '',
})

/* ---- Markdown 编辑器 ---- */
const editorTextarea = ref<HTMLTextAreaElement | null>(null)
const editorTab = ref<'edit' | 'preview'>('edit')

watch(previewHtml, () => {
  nextTick(buildToc)
})

const wordCount = computed(() => {
  const text = form.distilledMd || ''
  const chineseChars = (text.match(/[一-鿿]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
})

function insertMarkdown(before: string, after = '') {
  const el = editorTextarea.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = form.distilledMd.substring(start, end)
  const replacement = before + selected + after
  form.distilledMd = form.distilledMd.substring(0, start) + replacement + form.distilledMd.substring(end)
  nextTick(() => {
    el.focus()
    const newPos = start + before.length + selected.length + after.length
    el.setSelectionRange(newPos, newPos)
  })
}

/* ---- 数据加载 ---- */

const loadDetail = async () => {
  if (!noteId.value) return
  loading.value = true
  try {
    const res = await getKnowledgeNoteDetail(noteId.value)
    if (res.data.code === 0 && res.data.data) {
      detail.value = res.data.data
      loadedUpdateTime.value = res.data.data.note?.updateTime ?? null
      form.title = res.data.data.note?.title || ''
      form.tags = res.data.data.note?.tags || ''
      form.distilledMd = res.data.data.distilledMd || ''
      nextTick(buildToc)
    } else {
      message.error(res.data.message || '精读不存在')
      router.replace('/admin/knowledge/notes')
    }
  } finally {
    loading.value = false
  }
}

const runRouteAction = async () => {
  const action = String(route.query.action || '')
  if (!action) return
  await nextTick()
  if (action === 'publish' && canPublishBlog(note.value?.publishStatus)) {
    openPublish()
  } else if (action === 'sync' && canSyncBlog(note.value?.publishStatus)) {
    handleSync()
  } else if (action === 'index' && canIndexKb(note.value?.indexStatus)) {
    openIndex()
  } else if (action === 'reindex' && canReindexKb(note.value?.indexStatus)) {
    handleReindex()
  }
  router.replace({ path: route.path, query: {} })
}

const handleSave = async () => {
  saving.value = true
  try {
    if (!(await ensureNoNewerSave())) return
    const res = await updateKnowledgeNote(noteId.value, {
      title: form.title.trim(),
      tags: form.tags.trim() || undefined,
      distilledMd: form.distilledMd,
    })
    if (res.data.code === 0 && res.data.data) {
      message.success('内容已保存')
      const saved = res.data.data
      if (detail.value?.note) {
        detail.value = {
          ...detail.value,
          note: { ...detail.value.note, ...saved },
        }
      }
      loadedUpdateTime.value = saved.updateTime ?? loadedUpdateTime.value
      if (saved.publishStatus === 'SYNC_REQUIRED') {
        message.info('如果该精读已发布博客，需要同步博客')
      }
      if (saved.indexStatus === 'REINDEX_REQUIRED') {
        message.info('如果该精读已加入知识库，需要重建索引')
      }
      await loadDetail()
    } else {
      message.error(res.data.message || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

/**
 * 多 tab 冲突提示：保存前取一次服务端快照，若 updateTime 比本页加载时更新，
 * 说明其它标签页已保存，由用户决定覆盖（后端最后保存生效）或重新加载。
 */
const ensureNoNewerSave = async (): Promise<boolean> => {
  try {
    const res = await getKnowledgeNoteDetail(noteId.value)
    if (res.data.code !== 0 || !res.data.data?.note) return true
    const latest = res.data.data.note.updateTime ?? null
    if (latest && loadedUpdateTime.value && latest !== loadedUpdateTime.value) {
      return new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '检测到已有更新的保存',
          content:
            '另一个标签页已保存过这份精读。继续保存会覆盖对方的修改（后端按最后保存生效）。',
          okText: '仍要覆盖',
          cancelText: '重新加载',
          onOk: () => resolve(true),
          onCancel: () => {
            void loadDetail()
            resolve(false)
          },
        })
      })
    }
  } catch {
    /* 冲突检测失败不阻断保存（网络抖动时按后端最后保存生效兜底） */
  }
  return true
}

/** 原文失效溯源降级：HEAD 探测失败（404/410 等）时展示 source_document.raw_text 缓存快照 */
const sourceFallbackOpen = ref(false)
const sourceUnavailable = ref(false)

async function openSourceWithFallback(url?: string | null) {
  if (!url) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  let reachable = false
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    })
    reachable = res.ok
  } catch {
    // CORS 拦截或网络异常时无法可靠判定，按可打开处理（避免误伤正常外链）
    reachable = true
  } finally {
    clearTimeout(timer)
  }
  if (reachable) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    sourceUnavailable.value = true
    sourceFallbackOpen.value = true
  }
}

const runRedistill = async () => {
  const res = await redistillKnowledgeNote(noteId.value)
  if (res.data.code === 0 && res.data.data) {
    message.success('重新蒸馏完成')
    detail.value = res.data.data
    form.title = res.data.data.note?.title || ''
    form.tags = res.data.data.note?.tags || ''
    form.distilledMd = res.data.data.distilledMd || ''
  } else {
    message.error(res.data.message || '重新蒸馏失败')
  }
}

const handleRedistill = async () => {
  const ux = await loadReadingUxSettings()
  readingUx.value = ux
  if (!ux.redistillConfirmRequired) {
    await runRedistill()
    return
  }
  Modal.confirm({
    title: '重新蒸馏',
    content:
      '重新蒸馏会覆盖当前 Markdown 内容。如果你已手动修改，修改内容会丢失。是否继续？',
    onOk: runRedistill,
  })
}

const loadBlogMeta = async () => {
  const [catRes, tagRes] = await Promise.all([getAllCategories(), getAllTags()])
  if (catRes.data.code === 0) {
    categoryOptions.value = (catRes.data.data ?? []) as API.BlogCategoryVO[]
  }
  if (tagRes.data.code === 0) {
    tagOptions.value = (tagRes.data.data ?? []) as API.BlogTagVO[]
  }
}

const openPublish = async () => {
  const [ux] = await Promise.all([loadReadingUxSettings(), loadBlogMeta()])
  readingUx.value = ux
  publishForm.categoryId = undefined
  publishForm.tagIds = []
  publishForm.status = ux.defaultAsDraft ? 0 : 1
  publishOpen.value = true
}

const submitPublish = async () => {
  publishLoading.value = true
  try {
    const res = await publishKnowledgeNoteBlog(noteId.value, {
      categoryId: publishForm.categoryId,
      tagIds: publishForm.tagIds,
      status: publishForm.status,
    })
    if (res.data.code === 0 && res.data.data) {
      publishOpen.value = false
      const postId = res.data.data.id
      if (readingUx.value.askOpenEditor) {
        Modal.confirm({
          title: '博客已创建',
          content: '是否跳转到博客编辑器？',
          okText: '打开博客编辑器',
          cancelText: '留在当前页',
          onOk: () => {
            if (postId != null) router.push(`/blog/edit/${postId}`)
          },
          onCancel: () => loadDetail(),
        })
      } else {
        message.success('博客已创建')
      }
      await loadDetail()
    } else {
      message.error(res.data.message || '发布失败，若已关联博客请使用同步')
    }
  } finally {
    publishLoading.value = false
  }
}

const handleSync = () => {
  Modal.confirm({
    title: '同步博客',
    content: '同步会覆盖博客文章的标题和正文。是否继续？',
    onOk: async () => {
      const res = await syncKnowledgeNoteBlog(noteId.value)
      if (res.data.code === 0) {
        message.success('同步成功')
        await loadDetail()
      } else {
        message.error(res.data.message || '同步失败')
      }
    },
  })
}

const loadKbOptions = async () => {
  const res = await listKnowledgeBases({ pageNum: 1, pageSize: 100 })
  if (res.data.code === 0 && res.data.data?.records) {
    kbOptions.value = res.data.data.records
      .filter((k) => k.id != null)
      .map((k) => ({ label: k.name || String(k.id), value: k.id! }))
  }
}

const openIndex = async () => {
  await loadKbOptions()
  kbMode.value = 'existing'
  indexForm.knowledgeBaseId = undefined
  indexForm.knowledgeBaseName = ''
  indexForm.knowledgeBaseDescription = ''
  indexOpen.value = true
}

const submitIndex = async () => {
  if (kbMode.value === 'existing' && indexForm.knowledgeBaseId == null) {
    message.warning('请选择知识库')
    return
  }
  if (kbMode.value === 'create' && !indexForm.knowledgeBaseName.trim()) {
    message.warning('请填写知识库名称')
    return
  }
  indexLoading.value = true
  try {
    const body: API.KnowledgeNoteIndexRequest =
      kbMode.value === 'existing'
        ? { knowledgeBaseId: indexForm.knowledgeBaseId }
        : {
            knowledgeBaseName: indexForm.knowledgeBaseName.trim(),
            knowledgeBaseDescription: indexForm.knowledgeBaseDescription.trim() || undefined,
          }
    const res = await indexKnowledgeNote(noteId.value, body)
    if (res.data.code === 0 && res.data.data) {
      indexOpen.value = false
      message.success('已加入知识库')
      await loadDetail()
    } else {
      message.error(res.data.message || '入库失败')
    }
  } finally {
    indexLoading.value = false
  }
}

const handleReindex = () => {
  Modal.confirm({
    title: '重建索引',
    content: '重建索引会删除旧切块并重新向量化当前 Markdown。是否继续？',
    onOk: async () => {
      const res = await reindexKnowledgeNote(noteId.value)
      if (res.data.code === 0) {
        message.success('重建完成')
        await loadDetail()
      } else {
        message.error(res.data.message || '重建失败')
      }
    },
  })
}

const openKb = () => {
  if (kbId.value != null) router.push(`/knowledge/${kbId.value}`)
}

watch(
  () => route.params.noteId,
  async () => {
    await loadDetail()
    await runRouteAction()
  },
)

const onEditorKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (!saving.value) void handleSave()
  }
}

onMounted(async () => {
  readingUx.value = await loadReadingUxSettings()
  await loadDetail()
  await runRouteAction()
  window.addEventListener('keydown', onEditorKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEditorKeydown)
})
</script>

<template>
  <ReadingRoomShell>
    <div id="page-detail" class="detail-page" :aria-busy="loading">
      <div class="page-title">
        <h1 class="font-display">审阅文章</h1>
        <span class="sub">左编辑 · 右预览 · Ctrl+S 保存</span>
      </div>

      <div class="detail-work">
      <main class="detail-main">
        <div class="band glass detail-heading">
          <div class="field on">
            <label for="detail-title">精读标题</label>
            <input id="detail-title" v-model="form.title" class="inp detail-title-input" placeholder="输入标题…" />
          </div>
          <div class="field on">
            <label for="detail-tags">标签</label>
            <input id="detail-tags" v-model="form.tags" class="inp" placeholder="逗号分隔，如 Spring, Java" />
          </div>
          <div class="folio-meta detail-folio-meta">
            <KnowledgeStatusChip type="source" :status="note?.sourceType" />
            <KnowledgeStatusChip type="publish" :status="note?.publishStatus" />
            <KnowledgeStatusChip type="index" :status="note?.indexStatus" />
            <span>{{ wordCount.toLocaleString() }} 字</span>
            <a
              v-if="note?.sourceUrl"
              href="#"
              @click.prevent="openSourceWithFallback(note.sourceUrl)"
            >查看原始来源 ↗</a>
          </div>
        </div>

        <div class="band status-mini">
          <template v-for="(step, i) in statusSteps" :key="step.key">
            <span class="s" :class="{ done: step.state === 'done', on: step.state === 'active', error: step.state === 'error' }">
              {{ step.state === 'done' ? '✓' : i + 1 }} {{ step.label }}
            </span>
            <span v-if="i < statusSteps.length - 1" class="arrow">→</span>
          </template>
        </div>

        <section id="detailMdPreview" class="md-preview md-split-panel" aria-label="Markdown 精读全文">
          <header class="md-toolbar">
            <span class="lab font-display">MARKDOWN · 左编辑 / 右预览</span>
            <div class="md-seg md-seg-mobile" role="tablist" aria-label="内容模式">
              <button type="button" :class="{ on: editorTab === 'edit' }" @click="editorTab = 'edit'">编辑</button>
              <button type="button" :class="{ on: editorTab === 'preview' }" @click="editorTab = 'preview'">预览</button>
            </div>
          </header>
          <div class="md-split">
            <div
              class="md-editor-shell"
              :class="{ 'is-active-pane': editorTab === 'edit' }"
            >
              <div class="editor-tools" aria-label="Markdown 工具">
                <button type="button" @click="insertMarkdown('# ')">H1</button>
                <button type="button" @click="insertMarkdown('## ')">H2</button>
                <button type="button" @click="insertMarkdown('**', '**')"><b>B</b></button>
                <button type="button" @click="insertMarkdown('*', '*')"><i>I</i></button>
                <button type="button" @click="insertMarkdown('[', '](url)')">链接</button>
                <button type="button" @click="insertMarkdown('```\n', '\n```')">代码</button>
              </div>
              <textarea
                ref="editorTextarea"
                v-model="form.distilledMd"
                class="md-body raw md-source"
                placeholder="在此编辑 Markdown 内容…"
              />
            </div>
            <div
              class="md-preview-pane"
              :class="{ 'is-active-pane': editorTab === 'preview' }"
            >
              <div
                ref="mdPreviewRef"
                class="md-body blog-prose"
                v-html="previewHtml"
                @scroll="onPreviewScroll"
              />
              <nav v-if="toc.length" class="detail-toc" aria-label="文章目录">
                <button
                  v-for="item in toc"
                  :key="item.id"
                  type="button"
                  :class="{ active: activeTocId === item.id }"
                  :style="{ paddingLeft: `${(item.level - 1) * 10 + 8}px` }"
                  @click="scrollToHeading(item.id)"
                >
                  {{ item.text }}
                </button>
              </nav>
            </div>
          </div>
        </section>
      </main>

      <aside class="detail-deck">
        <div class="deck-panel glass">
          <span class="tape alt" />
          <h3 class="font-display">这篇</h3>
          <div class="stat-row">
            <div class="stat-pill"><div class="n">{{ note?.sourceUrl ? 1 : 0 }}</div><div class="l">来源</div></div>
            <div class="stat-pill"><div class="n">{{ wordCount.toLocaleString() }}</div><div class="l">字</div></div>
          </div>
          <div class="detail-folio-meta" style="margin-top: 10px">
            <KnowledgeStatusChip type="publish" :status="note?.publishStatus" />
            <KnowledgeStatusChip type="index" :status="note?.indexStatus" />
          </div>
        </div>
        <div class="deck-panel glass">
          <h3 class="font-display">操作</h3>
          <div class="col-stack">
            <button type="button" class="chip-btn sm primary" :disabled="saving" @click="handleSave">{{ saving ? '保存中…' : '保存修改' }}</button>
            <button type="button" class="chip-btn sm" @click="handleRedistill">重新蒸馏</button>
            <button v-if="blogEnabled && canPublishBlog(note?.publishStatus)" type="button" class="chip-btn sm" @click="openPublish">发布博客</button>
            <button v-if="blogEnabled && canSyncBlog(note?.publishStatus)" type="button" class="chip-btn sm" @click="handleSync">同步博客</button>
            <button v-if="canIndexKb(note?.indexStatus)" type="button" class="chip-btn sm" @click="openIndex">加入知识库</button>
            <button v-if="canReindexKb(note?.indexStatus)" type="button" class="chip-btn sm" @click="handleReindex">重建索引</button>
            <button v-if="note?.blogPostId" type="button" class="chip-btn sm" @click="router.push(`/blog/edit/${note.blogPostId}`)">打开博客</button>
            <button v-if="kbId != null" type="button" class="chip-btn sm" @click="openKb">打开知识库</button>
          </div>
        </div>
        <div class="deck-panel glass source-panel">
          <h3 class="font-display">原文摘要</h3>
          <p class="about text-pretty">{{ detail?.rawTextSummary || '（无摘要）' }}</p>
          <button type="button" class="chip-btn sm" @click="rawOpen = true">查看完整原文</button>
        </div>
        <div class="cta-foot">
          <div><div class="lbl font-display">再采一篇</div><div class="sub">返回采集台</div></div>
          <button type="button" class="chip-btn primary sm" @click="router.push('/admin/knowledge/ingest')">→</button>
        </div>
      </aside>
      </div>
    </div>



    <a-modal v-model:open="rawOpen" title="完整原文" width="800px" :footer="null">
      <pre class="raw-full">{{ detail?.rawText || '（无内容）' }}</pre>
    </a-modal>

    <a-modal
      v-model:open="sourceFallbackOpen"
      title="原文链接已失效"
      width="760px"
      :footer="null"
    >
      <a-alert
        v-if="sourceUnavailable"
        type="warning"
        show-icon
        message="原网页暂时无法访问，已降级展示采集时的缓存快照（source_document.raw_text）"
        style="margin-bottom: 12px"
      />
      <pre class="raw-full">{{ detail?.rawText || '（无缓存快照）' }}</pre>
    </a-modal>

    <a-modal v-model:open="publishOpen" title="发布博客" :confirm-loading="publishLoading" ok-text="确认发布" @ok="submitPublish">
      <a-form layout="vertical">
        <a-form-item label="分类">
          <a-select v-model:value="publishForm.categoryId" allow-clear placeholder="选择分类" :options="categoryOptions.map((c) => ({ label: c.name, value: c.id! }))" />
        </a-form-item>
        <a-form-item label="标签">
          <a-select v-model:value="publishForm.tagIds" mode="multiple" allow-clear placeholder="选择标签" :options="tagOptions.map((t) => ({ label: t.name, value: t.id! }))" />
        </a-form-item>
        <a-form-item label="发布状态">
          <a-radio-group v-model:value="publishForm.status">
            <a-radio :value="0">草稿</a-radio>
            <a-radio :value="1">直接发布</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="indexOpen" title="加入知识库" :confirm-loading="indexLoading" ok-text="确认入库" @ok="submitIndex">
      <a-radio-group v-model:value="kbMode" style="margin-bottom: 16px">
        <a-radio-button value="existing">选择已有</a-radio-button>
        <a-radio-button value="create">新建知识库</a-radio-button>
      </a-radio-group>
      <a-form layout="vertical">
        <a-form-item v-if="kbMode === 'existing'" label="知识库" required>
          <a-select v-model:value="indexForm.knowledgeBaseId" allow-clear placeholder="选择知识库" :options="kbOptions" />
        </a-form-item>
        <template v-else>
          <a-form-item label="名称" required><a-input v-model:value="indexForm.knowledgeBaseName" /></a-form-item>
          <a-form-item label="描述"><a-textarea v-model:value="indexForm.knowledgeBaseDescription" :rows="3" /></a-form-item>
        </template>
      </a-form>
    </a-modal>
  </ReadingRoomShell>
</template>

<style scoped>
.detail-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.42fr);
  gap: 10px 14px;
  padding: 14px 18px;
}

.detail-heading .field {
  display: flex;
}

.detail-heading .folio-meta {
  grid-column: 1 / -1;
  padding-top: 4px;
}

.detail-heading .folio-meta a {
  color: var(--room);
  text-decoration: none;
}

.detail-title-input {
  font-family: "ZCOOL KuaiLe", "PingFang SC", sans-serif;
  font-size: 18px !important;
  letter-spacing: 1px;
}

.md-editor-shell {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

.md-split-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.md-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.md-split .md-editor-shell {
  border-right: 1px dashed rgba(165, 172, 196, 0.35);
  min-height: 0;
}

.md-preview-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.md-preview-pane .md-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.md-seg-mobile {
  display: none;
}

@media (max-width: 960px) {
  .md-seg-mobile {
    display: inline-flex;
  }

  .md-split {
    grid-template-columns: 1fr;
  }

  .md-split .md-editor-shell,
  .md-split .md-preview-pane {
    display: none;
  }

  .md-split .md-editor-shell.is-active-pane,
  .md-split .md-preview-pane.is-active-pane {
    display: flex;
  }

  .md-split .md-editor-shell {
    border-right: 0;
  }
}

.editor-tools {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px dashed rgba(165, 172, 196, 0.3);
}

.editor-tools button,
.detail-toc button {
  border: 0;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 7px;
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 11px;
  padding: 4px 8px;
}

.editor-tools button:hover,
.detail-toc button:hover,
.detail-toc button.active {
  background: var(--room-soft);
  color: var(--room);
}

.md-source {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 0;
  border-radius: 0;
  resize: none;
  outline: 0;
  padding: 12px 14px;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
}

.detail-toc {
  display: flex;
  gap: 4px;
  max-height: 108px;
  overflow: auto;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-top: 1px dashed rgba(165, 172, 196, 0.3);
}

.detail-toc button {
  text-align: left;
}

.status-mini .s.error {
  color: #c45a72;
  background: #fff0f3;
}

.status-copy {
  overflow: hidden;
  font-family: "PingFang SC", sans-serif !important;
  font-size: 10px !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-panel p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0 0 10px;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}

#page-detail .md-preview .md-body.blog-prose {
  max-width: none;
}

#page-detail .md-preview .md-body.blog-prose :deep(p),
#page-detail .md-preview .md-body.blog-prose :deep(h1),
#page-detail .md-preview .md-body.blog-prose :deep(h2),
#page-detail .md-preview .md-body.blog-prose :deep(h3),
#page-detail .md-preview .md-body.blog-prose :deep(ul),
#page-detail .md-preview .md-body.blog-prose :deep(ol),
#page-detail .md-preview .md-body.blog-prose :deep(blockquote),
#page-detail .md-preview .md-body.blog-prose :deep(pre) {
  max-width: 72ch;
}

@media (max-width: 960px) {
  .detail-heading {
    grid-template-columns: 1fr;
  }
}

.raw-full {
  max-height: 60vh;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.65;
  padding: 12px;
  background: rgba(255, 255, 255, 0.82);
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 14px;
  color: var(--ink);
}
</style>
