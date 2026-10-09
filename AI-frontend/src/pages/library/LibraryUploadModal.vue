<!--
  资料库 · 上传弹窗
  真实模式：点击/拖入选择文件 → SHA-256 → upload-init（命中秒传 / 预签名 PUT 直传）→ upload-complete
  演示模式（demo=true）：使用内置示例文件模拟完整链路（哈希/秒传/进度）
  完成后 emit completed(newFiles)；真实模式 newFiles 为空数组，由父级重新拉取列表
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Check, CloudUpload, Info, X } from 'lucide-vue-next'
import {
  completeLibraryUpload,
  initLibraryUpload,
  type LibraryFile,
} from '@/api/libraryController'
import { categoryOfExt, fmtSize } from '@/composables/useLibrary'
import { sha256HexOfFile } from '@/utils/sha256'

const props = defineProps<{
  open: boolean
  demo: boolean
}>()

const emit = defineEmits<{
  close: []
  completed: [files: LibraryFile[]]
}>()

type UploadState = 'wait' | 'hash' | 'instant' | 'uploading' | 'done' | 'failed'
interface UploadItem {
  name: string
  size: number
  state: UploadState
  p: number
  big: boolean
  realFile?: File
  result?: LibraryFile
  error?: string
}

const items = reactive<UploadItem[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const starting = ref(false)
const allDone = ref(false)

const canStart = computed(() => items.some((i) => i.state === 'wait'))

watch(
  () => props.open,
  (open) => {
    if (open) {
      items.splice(0)
      starting.value = false
      allDone.value = false
    }
  },
)

function pickFiles() {
  if (props.demo) loadDemoItems()
  else fileInput.value?.click()
}

function addRealFiles(list: File[]) {
  for (const f of list) {
    items.push({
      name: f.name,
      size: f.size,
      state: 'wait',
      p: 0,
      big: f.size > 50 * 1024 * 1024,
      realFile: f,
    })
  }
}

function onRealFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  addRealFiles(files)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (props.demo) {
    loadDemoItems()
    return
  }
  addRealFiles(Array.from(e.dataTransfer?.files ?? []))
}

/** 演示模式：内置示例（含一个秒传命中、一个大文件直传） */
function loadDemoItems() {
  items.splice(0)
  items.push(
    { name: 'CS61B 期中复习笔记.pdf', size: 5.2 * 1024 * 1024, state: 'wait', p: 0, big: false },
    { name: 'Attention Is All You Need.pdf', size: 2.4 * 1024 * 1024, state: 'wait', p: 0, big: false },
    { name: '课程录像 04.mp4', size: 512 * 1024 * 1024, state: 'wait', p: 0, big: true },
  )
}

function removeItem(idx: number) {
  if (items[idx]?.state === 'wait') items.splice(idx, 1)
}

function libraryFileContentUrl(fileId: number | string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
  return `${base}/library/files/${fileId}/content`
}

function xhrPut(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`HTTP ${xhr.status}`))
        return
      }
      const text = xhr.responseText?.trim()
      if (text) {
        try {
          const body = JSON.parse(text) as { code?: number; message?: string }
          if (typeof body.code === 'number' && body.code !== 0) {
            reject(new Error(body.message || '上传失败'))
            return
          }
        } catch {
          /* MinIO 预签名 PUT 可能返回空或非 JSON */
        }
      }
      resolve()
    }
    xhr.onerror = () => reject(new Error('network error'))
    xhr.send(file)
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runItem(item: UploadItem) {
  if (props.demo) {
    /* 演示链路：哈希 → （第 2 个文件秒传）→ 进度 */
    item.state = 'hash'
    item.p = 0
    await sleep(350)
    item.p = 60
    await sleep(250)
    if (item.name.includes('Attention')) {
      item.state = 'instant'
      return
    }
    item.state = 'uploading'
    item.p = 5
    while (item.p < 100) {
      await sleep(220)
      item.p = Math.min(100, item.p + Math.round(12 + Math.random() * 18))
    }
    item.state = 'done'
    return
  }

  const real = item.realFile
  if (!real) {
    item.state = 'failed'
    return
  }
  try {
    item.state = 'hash'
    item.p = 0
    item.error = undefined
    const sha = await sha256HexOfFile(real)
    const init = await initLibraryUpload({ fileName: real.name, size: real.size, sha256: sha })
    const body = init.data
    if (body?.code !== 0 || !body.data) {
      throw new Error(body?.message || 'upload-init 失败')
    }
    const payload = body.data
    if (payload.mode === 'instant') {
      item.state = 'instant'
      item.result = payload.file
      return
    }
    item.state = 'uploading'
    item.p = 3
    // 生产 MinIO 在 127.0.0.1 隧道里，浏览器 PUT 预签名会失败；统一走后端中转。
    const putUrl = libraryFileContentUrl(payload.fileId)
    await xhrPut(putUrl, real, (p) => (item.p = Math.max(3, p)))
    const done = await completeLibraryUpload(payload.fileId)
    const completed = done.data?.code === 0 ? done.data.data : undefined
    // direct 模式下 init 响应不含 file 记录，以 complete 的返回为准；失败时留空交给 start() 兜底合成
    item.result = completed
    item.p = 100
    item.state = 'done'
  } catch (err) {
    console.warn('[library] 上传失败', item.name, err)
    item.error = err instanceof Error ? err.message : String(err)
    item.state = 'failed'
  }
}

async function start() {
  if (starting.value || !canStart.value) return
  starting.value = true
  const wait = items.filter((i) => i.state === 'wait')
  await Promise.all(wait.map((i) => runItem(i)))
  starting.value = false
  allDone.value = true

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const uploaded: LibraryFile[] = items
    .filter((i) => i.state === 'done' || i.state === 'instant')
    .map((i, idx) =>
      i.result ?? {
        id: Date.now() + idx,
        name: i.name,
        ext: i.name.split('.').pop()?.toLowerCase() ?? 'bin',
        category: categoryOfExt(i.name.split('.').pop() ?? ''),
        size: i.size,
        uploadedAt: at,
        tagIds: [],
        collectionIds: [],
        aiStatus: 'NONE' as const,
        sha256: 'demo…' + Math.random().toString(16).slice(2, 6),
      },
    )
  emit('completed', uploaded)
}
</script>

<template>
  <!-- Teleport 到 #stage：盖过 topbar 且留在缩放舞台内 -->
  <Teleport to="#stage" defer>
    <div v-if="open" class="libr-modal-mask" @click.self="emit('close')">
      <div class="libr-modal" role="dialog" aria-modal="true" aria-labelledby="libr-upload-title">
        <h3 id="libr-upload-title">上传到资料库</h3>
        <div class="desc">
          单文件建议 ≤ 50MB · 上传前自动计算 SHA-256，重复文件秒传
          <span v-if="demo" style="color: var(--c-sun)">（演示模式：使用示例文件）</span>
        </div>
        <div
          class="libr-dropzone"
          :class="{ over: dragOver }"
          role="button"
          tabindex="0"
          @click="pickFiles"
          @keydown.enter="pickFiles"
          @dragover.prevent="dragOver = true"
          @dragenter.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <CloudUpload :size="34" :stroke-width="1.6" />
          <div>拖拽文件到这里，或点击选择</div>
          <div class="formats">PDF · DOCX · MD · TXT · EPUB · 图片 · 音视频 · 代码 · 压缩包</div>
        </div>
        <input ref="fileInput" type="file" multiple hidden @change="onRealFiles" />
        <div v-if="items.length" class="libr-upload-list">
          <div v-for="(it, idx) in items" :key="it.name + idx" class="libr-upload-item">
            <div class="un">{{ it.name }}</div>
            <template v-if="it.state === 'hash'">
              <span class="us">计算 SHA-256…</span>
              <div class="libr-uprog"><i :style="{ width: it.p + '%' }" /></div>
            </template>
            <span v-else-if="it.state === 'instant'" class="libr-instant-badge">✦ 秒传命中</span>
            <template v-else-if="it.state === 'uploading'">
              <span class="us">{{ it.p }}%{{ it.big ? ' · 预签名直传' : '' }}</span>
              <div class="libr-uprog"><i :style="{ width: it.p + '%' }" /></div>
            </template>
            <span v-else-if="it.state === 'done'" class="libr-done-badge"><Check :size="13" /> 完成</span>
            <span v-else-if="it.state === 'failed'" class="libr-fail-badge" :title="it.error">
              <Info :size="13" /> 失败{{ it.error ? ` · ${it.error}` : '' }}
            </span>
            <span v-else class="us">{{ fmtSize(it.size) }}</span>
            <button
              v-if="it.state === 'wait'"
              class="libr-upx"
              :aria-label="`移除 ${it.name}`"
              @click="removeItem(idx)"
            >
              <X :size="11" />
            </button>
          </div>
        </div>
        <div class="libr-modal-foot">
          <button class="libr-btn" @click="emit('close')">关闭</button>
          <button class="libr-btn primary" :disabled="!canStart || starting" @click="start">
            {{ starting ? '上传中…' : allDone ? '上传完成' : '开始上传' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
