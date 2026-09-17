<!--
  资料库（资料储藏室）— 单屏房间页
  设计稿：docs/prototypes/library-prototype-v3.html（单屏 app-shell，仅文件列表内部滚动）
  结构：标题带（标题/胶带/统计/最近取出/迷你天空窗）→ 工具栏 → 侧栏筛选 + 文件区（列表/网格）
  数据层：useLibrary（后端 /library/** 未就绪时回退演示数据）
-->
<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  ArrowUpRight,
  Download,
  Flower2,
  FolderOpen,
  FolderPlus,
  Info,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import LibraryFileDrawer from './LibraryFileDrawer.vue'
import LibraryUploadModal from './LibraryUploadModal.vue'
import {
  LIBRARY_CATEGORIES,
  fmtSize,
  useLibrary,
} from '@/composables/useLibrary'
import { regenLibraryFileAi, searchLibrarySemantic, type LibraryFile } from '@/api/libraryController'
import './library.css'

const {
  files,
  recycleFiles,
  tags,
  collections,
  summary,
  recentFileId,
  recentFileAt,
  demoMode,
  loading,
  loadAll,
  removeFiles,
  restoreFiles,
  purgeFiles,
  setTags,
  createTag,
  createCollection,
  renameTag,
  deleteTag,
  renameCollection,
  deleteCollection,
  removeFileFromCollection,
  renameFile,
  addToCollection,
  openFile,
  transferToKnowledge,
  applyUploadedFiles,
} = useLibrary()

/* ================= 视图状态 ================= */
const view = ref<'list' | 'grid'>('list')
const recycle = ref(false)
const category = ref<string | null>(null)
const collection = ref<number | null>(null)
const tagFilter = ref<number[]>([])
const keyword = ref('')
const sort = ref<'time' | 'name' | 'size'>('time')
const sortDir = ref<'asc' | 'desc'>('desc')
const SORT_DEFAULT_DIR = { time: 'desc', name: 'asc', size: 'desc' } as const
const SORTS = [
  { key: 'time', label: '最近上传' },
  { key: 'name', label: '名称' },
  { key: 'size', label: '大小' },
] as const

const selected = ref(new Set<number>())
const drawerId = ref<number | null>(null)
const drawerOpen = ref(false)
const uploadOpen = ref(false)

const confirmState = reactive({
  open: false,
  title: '',
  desc: '',
  okText: '确定',
  onOk: null as null | (() => void),
})

const batchColOpen = ref(false)
const batchTagOpen = ref(false)
const batchTagName = ref('')

/* 标签 / 合集 / 文件本体的内联编辑状态 */
const creatingCol = ref(false)
const newColName = ref('')
const renamingTagId = ref<number | null>(null)
const renamingTagName = ref('')
const renamingColId = ref<number | null>(null)
const renamingColName = ref('')

/** 内联输入出现即聚焦 */
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }

onMounted(() => {
  /* 兜底：舞台曾被横向滚动过则复位（overflow: clip 已从源头禁止） */
  document.getElementById('stage')?.scrollTo?.(0, 0)
  loadAll()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

/* 覆盖层关闭优先级：确认 > 上传 > 抽屉（Shell 自身的 Esc 在本页为 no-op） */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (confirmState.open) {
    confirmState.open = false
    return
  }
  if (uploadOpen.value) {
    uploadOpen.value = false
    return
  }
  drawerOpen.value = false
}

/* ================= 派生数据 ================= */
const tagMap = computed(() => new Map(tags.value.map((t) => [t.id, t])))
const colMap = computed(() => new Map(collections.value.map((c) => [c.id, c])))

const categoryCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const f of files.value) counts.set(f.category, (counts.get(f.category) ?? 0) + 1)
  return counts
})
const sideCategories = LIBRARY_CATEGORIES.filter((c) => c.key !== 'OTHER')

const colCounts = computed(() => {
  const counts = new Map<number, number>()
  for (const f of files.value)
    for (const id of f.collectionIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
})
const tagUse = computed(() => {
  const counts = new Map<number, number>()
  for (const f of files.value)
    for (const id of f.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
})

/** 列表/网格行数据：回收站条目补齐 LibraryFile 必缺字段，附带 deletedAt */
type RowFile = LibraryFile & { deletedAt?: string }

/* ================= 语义搜索 ================= */
/** 关键词的向量检索结果：fileId → 匹配分（0~1） */
const semanticScores = ref<Map<number, number>>(new Map())
const semanticLoading = ref(false)
let semanticTimer: number | null = null
let semanticSeq = 0

watch(keyword, (kw) => {
  if (semanticTimer != null) window.clearTimeout(semanticTimer)
  const q = kw.trim()
  if (q.length < 2) {
    semanticScores.value = new Map()
    return
  }
  semanticTimer = window.setTimeout(async () => {
    const seq = ++semanticSeq
    semanticLoading.value = true
    try {
      const res = await searchLibrarySemantic(q, 20)
      if (seq !== semanticSeq) return
      const map = new Map<number, number>()
      if (res.data.code === 0 && res.data.data) {
        for (const f of res.data.data) {
          if (f.score != null) map.set(f.id, f.score)
        }
      }
      semanticScores.value = map
    } catch {
      if (seq === semanticSeq) semanticScores.value = new Map()
    } finally {
      if (seq === semanticSeq) semanticLoading.value = false
    }
  }, 500)
})

const semanticVisible = computed(
  () => !recycle.value && keyword.value.trim().length >= 2 && semanticScores.value.size > 0,
)

const visibleFiles = computed<RowFile[]>(() => {
  let list: RowFile[] = files.value
  if (recycle.value) {
    list = recycleFiles.value.map((r) => ({
      id: r.id,
      name: r.name,
      ext: r.ext,
      category: r.category,
      size: r.size,
      uploadedAt: r.uploadedAt,
      tagIds: [],
      collectionIds: [],
      aiStatus: 'NONE' as const,
      deletedAt: r.deletedAt,
    }))
  } else {
    list = files.value.map((f) => ({ ...f }))
    if (category.value) list = list.filter((f) => f.category === category.value)
    if (collection.value) list = list.filter((f) => f.collectionIds.includes(collection.value!))
    if (tagFilter.value.length)
      list = list.filter((f) => tagFilter.value.every((t) => f.tagIds.includes(t)))
    const kw = keyword.value.trim().toLowerCase()
    if (kw) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(kw) ||
          (f.aiSummary ?? '').toLowerCase().includes(kw) ||
          f.tagIds.some((id) => tagMap.value.get(id)?.name.toLowerCase().includes(kw)),
      )
    }
    /* 语义命中但本地关键词没命中的文件，附上匹配分补充到尾部 */
    if (semanticVisible.value) {
      const present = new Set(list.map((f) => f.id))
      const extras = files.value
        .filter((f) => !present.has(f.id) && semanticScores.value.has(f.id))
        .map((f) => ({ ...f, score: semanticScores.value.get(f.id) }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      list = list.concat(extras)
    }
    /* 本地命中的也标上语义分，供行内展示 */
    if (semanticVisible.value) {
      for (const row of list) {
        const s = semanticScores.value.get(row.id)
        if (s != null && row.score == null) row.score = s
      }
      list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b as RowFile).uploadedAt.localeCompare(a.uploadedAt))
    }
  }
  const dir = sortDir.value === 'asc' ? 1 : -1
  const sorted = [...list]
  if (semanticVisible.value) {
    return sorted
  }
  if (sort.value === 'name') sorted.sort((a, b) => dir * a.name.localeCompare(b.name, 'zh'))
  else if (sort.value === 'size') sorted.sort((a, b) => dir * (a.size - b.size))
  else sorted.sort((a, b) => dir * a.uploadedAt.localeCompare(b.uploadedAt))
  return sorted
})

const allSelected = computed(
  () => visibleFiles.value.length > 0 && visibleFiles.value.every((f) => selected.value.has(f.id)),
)
const someSelected = computed(
  () => selected.value.size > 0 && !allSelected.value,
)

const hasActiveFilter = computed(
  () =>
    !recycle.value &&
    Boolean(category.value || collection.value || tagFilter.value.length || keyword.value.trim()),
)

const crumb = computed(() => {
  if (recycle.value) return '回收站'
  let c = '全部文件'
  if (category.value) c = LIBRARY_CATEGORIES.find((x) => x.key === category.value)?.label ?? c
  if (collection.value) c = `合集 · ${colMap.value.get(collection.value)?.name ?? ''}`
  if (tagFilter.value.length)
    c += ` ＋ 标签 ${tagFilter.value.map((t) => tagMap.value.get(t)?.name ?? t).join(' ＋ ')}`
  if (keyword.value.trim()) c += ` · “${keyword.value.trim()}”`
  return c
})

const npFile = computed(() =>
  recentFileId.value != null ? (files.value.find((f) => f.id === recentFileId.value) ?? null) : null,
)
const usedGb = computed(() => (summary.value.usedBytes / 1024 ** 3).toFixed(1))
const quotaGb = computed(() => Math.round(summary.value.quotaBytes / 1024 ** 3).toString())

const drawerFile = computed(() =>
  drawerId.value != null ? (files.value.find((f) => f.id === drawerId.value) ?? null) : null,
)
watch(drawerFile, (f) => {
  if (drawerOpen.value && !f) drawerOpen.value = false
})

/* ================= 筛选 / 排序 ================= */
function toggleSort(key: 'time' | 'name' | 'size') {
  if (sort.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sort.value = key
    sortDir.value = SORT_DEFAULT_DIR[key]
  }
}
function toggleTagFilter(id: number) {
  tagFilter.value = tagFilter.value.includes(id)
    ? tagFilter.value.filter((x) => x !== id)
    : [...tagFilter.value, id]
}
function clearFilters() {
  category.value = null
  collection.value = null
  tagFilter.value = []
  keyword.value = ''
}
function toggleRecycle() {
  recycle.value = !recycle.value
  selected.value = new Set()
}

/* ================= 选择 ================= */
function toggleSel(id: number, checked: boolean) {
  const next = new Set(selected.value)
  checked ? next.add(id) : next.delete(id)
  selected.value = next
}
function toggleSelAll(checked: boolean) {
  selected.value = checked ? new Set(visibleFiles.value.map((f) => f.id)) : new Set()
}

/* ================= 动作 ================= */
function openDrawer(id: number) {
  if (recycle.value) return
  drawerId.value = id
  drawerOpen.value = true
}

async function handleDownload(file: LibraryFile) {
  const url = await openFile(file.id)
  if (url) {
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    message.success('已获取预签名下载链接（1 小时内有效）')
  } else {
    message.info('演示数据：预签名下载链接待后端接入')
  }
}

function undoableRemove(ids: number[]) {
  const n = ids.length
  removeFiles(ids)
    .then((undo) => {
      message.info({
        content: h('span', null, [
          n > 1 ? `已将 ${n} 个文件移入回收站，30 天内可恢复` : '已移入回收站，30 天内可恢复',
          h(
            'a',
            {
              class: 'libr-undo-link',
              onClick: () => {
                message.destroy()
                undo().then(() => message.success('已撤销，文件已放回资料库'))
              },
            },
            '撤销',
          ),
        ]),
        duration: 5.2,
      })
    })
    .catch(() => message.error('移入回收站失败，请稍后重试'))
}

/** 行内快捷加入第一个合集 */
function quickAddToCollection(file: LibraryFile) {
  const col = collections.value[0]
  if (!col) {
    message.info('还没有合集：待后端接入后可新建（演示）')
    return
  }
  addToCollection([file.id], col.id).then(() => message.success(`已加入「${col.name}」`))
}

function askPurge(ids: number[]) {
  confirmState.title = '彻底删除'
  confirmState.desc = `选中的 ${ids.length} 个文件将被永久删除，MinIO 对象同步清理，此操作不可恢复。`
  confirmState.okText = '彻底删除'
  confirmState.onOk = () => {
    purgeFiles(ids).then(() => {
      selected.value = new Set()
      message.error(`已彻底删除 ${ids.length} 个文件`)
    })
  }
  confirmState.open = true
}

function handleRestore(ids: number[]) {
  restoreFiles(ids).then(() => {
    selected.value = new Set()
    message.success(`已恢复 ${ids.length} 个文件`)
  })
}

function handleUploadCompleted(newFiles: LibraryFile[]) {
  if (newFiles.length) {
    applyUploadedFiles(newFiles)
    message.success(`上传完成：${newFiles.length} 个成功（AI 解析已排队）`)
  } else {
    loadAll()
  }
}

/* 抽屉动作 */
function onDrawerDelete(file: LibraryFile) {
  drawerOpen.value = false
  undoableRemove([file.id])
}
function onDrawerRemoveTag(file: LibraryFile, tagId: number) {
  setTags(
    file.id,
    file.tagIds.filter((t) => t !== tagId),
  )
}
async function onDrawerAcceptSuggest(file: LibraryFile, name: string) {
  const tag = await createTag(name)
  if (tag && !file.tagIds.includes(tag.id)) {
    setTags(file.id, [...file.tagIds, tag.id])
    message.success(`已接受 AI 建议标签「${name}」`)
  }
}
async function onDrawerCreateTag(file: LibraryFile, name: string) {
  const tag = await createTag(name)
  if (tag && !file.tagIds.includes(tag.id)) {
    setTags(file.id, [...file.tagIds, tag.id])
  }
}
function onDrawerAddCollection(file: LibraryFile, collectionId: number) {
  addToCollection([file.id], collectionId).then(() =>
    message.success('已加入合集'),
  )
}
function onDrawerTransferKb(file: LibraryFile) {
  transferToKnowledge(file.id).then(() => {
    drawerOpen.value = false
    message.success('已转入知识库：切块 → 向量化 → 可 RAG 问答')
  })
}
function onDrawerRegen(file: LibraryFile) {
  if (demoMode.value) {
    message.info('演示数据：AI 摘要由本地示例生成')
    return
  }
  regenLibraryFileAiSafe(file.id)
}
async function regenLibraryFileAiSafe(id: number) {
  try {
    await regenLibraryFileAi(id)
    message.info('已提交重新生成任务（异步）')
  } catch {
    message.error('提交失败，请稍后重试')
  }
}

/* 批量动作 */
function batchAddToCollection(collectionId: number) {
  addToCollection([...selected.value], collectionId).then(() => {
    message.success(`已把 ${selected.value.size} 个文件加入合集`)
    batchColOpen.value = false
    selected.value = new Set()
  })
}
function batchApplyTag() {
  const name = batchTagName.value.trim()
  if (!name) return
  createTag(name).then((tag) => {
    if (!tag) return
    const targets = files.value.filter((f) => selected.value.has(f.id))
    Promise.all(
      targets.map((f) =>
        setTags(f.id, f.tagIds.includes(tag.id) ? f.tagIds : [...f.tagIds, tag.id]),
      ),
    ).then(() => {
      message.success(`已为 ${targets.length} 个文件打上「${name}」`)
      batchTagOpen.value = false
      batchTagName.value = ''
      selected.value = new Set()
    })
  })
}

/* ================= 标签 / 合集 / 文件本体编辑 ================= */
const UNSUPPORTED_HINT = '该操作待后端接入（契约见交接文档 §4.5）'
function editFail(supported: boolean) {
  if (!supported) message.info(UNSUPPORTED_HINT)
  else message.error('操作失败，请稍后重试')
}

function submitNewCollection() {
  if (!creatingCol.value) return
  creatingCol.value = false
  const name = newColName.value.trim()
  if (!name) return
  createCollection(name).then((r) => {
    if (r.col) {
      message.success(`已创建合集「${name}」`)
      newColName.value = ''
    } else editFail(r.supported)
  })
}
function startRenameTag(id: number) {
  renamingTagId.value = id
  renamingTagName.value = tags.value.find((t) => t.id === id)?.name ?? ''
}
function submitRenameTag() {
  const id = renamingTagId.value
  const name = renamingTagName.value.trim()
  renamingTagId.value = null
  if (id == null || !name) return
  renameTag(id, name).then((r) => {
    if (r.ok) message.success(`标签已重命名为「${name}」`)
    else editFail(r.supported)
  })
}
function removeTagById(id: number) {
  deleteTag(id).then((r) => {
    if (r.ok) {
      tagFilter.value = tagFilter.value.filter((t) => t !== id)
      message.success('标签已删除（文件上的引用同步移除）')
    } else editFail(r.supported)
  })
}
function startRenameCollection(id: number) {
  renamingColId.value = id
  renamingColName.value = collections.value.find((c) => c.id === id)?.name ?? ''
}
function submitRenameCollection() {
  const id = renamingColId.value
  const name = renamingColName.value.trim()
  renamingColId.value = null
  if (id == null || !name) return
  renameCollection(id, name).then((r) => {
    if (r.ok) message.success(`合集已重命名为「${name}」`)
    else editFail(r.supported)
  })
}
function askDeleteCollection(id: number) {
  const col = collections.value.find((c) => c.id === id)
  if (!col) return
  confirmState.title = '删除合集'
  confirmState.desc = `合集「${col.name}」将被删除，其中的文件会保留、仅解除归属。`
  confirmState.okText = '删除'
  confirmState.onOk = () => {
    deleteCollection(id).then((r) => {
      if (r.ok) {
        if (collection.value === id) collection.value = null
        message.success(`合集「${col.name}」已删除`)
      } else editFail(r.supported)
    })
  }
  confirmState.open = true
}
function onDrawerRemoveCollection(file: LibraryFile, collectionId: number) {
  removeFileFromCollection(file.id, collectionId).then((r) => {
    if (r.ok) message.success('已移出合集')
    else editFail(r.supported)
  })
}
function onDrawerRename(file: LibraryFile, name: string) {
  renameFile(file.id, name).then((r) => {
    if (r.ok) message.success('已重命名')
    else editFail(r.supported)
  })
}
</script>

<template>
  <StationRoomShell
    brand-path="/library"
    note-label="Library · 资料储藏室"
    room="library"
    fill="frame"
  >
    <div class="libr-page" :class="{ 'has-sel': selected.size > 0 }">
      <!-- 标题带 -->
      <section class="libr-hero">
        <div class="libr-hero-left">
          <div class="libr-kana">ラーニングロッカー</div>
          <div class="libr-hero-row">
            <h1 class="libr-title">资料库</h1>
            <span class="libr-tape">欢迎来到我的储藏室！</span>
            <div class="libr-hero-sub">
              <Flower2 :size="13" style="color: var(--c-sakura)" />
              <span>收藏 · 分类 · 重新发现</span>
              <span class="stat"><b>{{ summary.fileCount }}</b> 个文件</span>
              <span class="stat"><b>{{ usedGb }}</b> / {{ quotaGb }} GB</span>
              <span v-if="demoMode" class="libr-demo-chip">
                <Info :size="11" /> 演示数据 · 后端待接入
              </span>
            </div>
          </div>
        </div>

        <button v-if="npFile" class="libr-np" aria-label="打开最近取出的文件" @click="openDrawer(npFile.id)">
          <span class="libr-np-dot" />
          <span class="libr-np-main">
            <span class="libr-np-title">最近取出 · {{ npFile.name }}</span>
            <span class="libr-np-sub">{{ recentFileAt || npFile.uploadedAt.slice(0, 10) }} 打开过</span>
          </span>
          <span class="libr-np-ico"><ArrowUpRight :size="12" :stroke-width="2.2" /></span>
        </button>

        <div class="libr-sky" aria-hidden="true">
          <div class="libr-sky-sun" />
          <div class="libr-sky-cloud c1" />
          <div class="libr-sky-cloud c2" />
          <div class="libr-sky-hill h1" />
          <div class="libr-sky-hill h2" />
        </div>
      </section>

      <!-- 工具栏 -->
      <div class="libr-toolbar">
        <label class="libr-search" :class="{ 'has-kw': !!keyword.trim() }">
          <Search :size="15" />
          <input
            v-model="keyword"
            type="text"
            placeholder="搜索文件名、摘要、标签…"
            aria-label="搜索文件"
          />
          <button class="libr-search-clear" aria-label="清空搜索" type="button" @click="keyword = ''">
            <X :size="11" />
          </button>
        </label>
        <button class="libr-btn primary" @click="uploadOpen = true">
          <Upload :size="14" /> 上传文件
        </button>
        <div class="libr-seg">
          <button :class="{ active: view === 'list' }" title="列表视图" aria-label="列表视图" @click="view = 'list'">
            <List :size="14" />
          </button>
          <button :class="{ active: view === 'grid' }" title="网格视图" aria-label="网格视图" @click="view = 'grid'">
            <LayoutGrid :size="14" />
          </button>
        </div>
        <button class="libr-btn" :class="{ primary: recycle }" aria-label="切换回收站视图" @click="toggleRecycle">
          <Trash2 :size="14" /> 回收站
        </button>
      </div>

      <!-- 主体 -->
      <div class="libr-layout" :class="{ recycle }">
        <!-- 侧栏 -->
        <aside class="libr-panel libr-sidebar">
          <div>
            <div class="libr-side-title">类型 <span class="en">TYPES</span></div>
            <button class="libr-nav-item" :class="{ active: category === null }" @click="category = null; selected = new Set()">
              <FolderOpen :size="15" />
              全部文件
              <span class="count">{{ files.length }}</span>
            </button>
            <button
              v-for="c in sideCategories"
              :key="c.key"
              class="libr-nav-item"
              :class="{ active: category === c.key }"
              @click="category = c.key; selected = new Set()"
            >
              <span class="libr-dot" :class="`tagcolor-${c.color}`" />
              {{ c.label }}
              <span class="count">{{ categoryCounts.get(c.key) ?? 0 }}</span>
            </button>
          </div>
          <div>
            <div class="libr-side-title">我的合集 <span class="en">SHELVES</span></div>
            <button
              v-for="c in collections"
              :key="c.id"
              class="libr-nav-item"
              :class="{ active: collection === c.id }"
              @click="collection = collection === c.id ? null : c.id"
            >
              <span class="libr-spine" :class="`tagcolor-${c.color ?? 'violet'}`" />
              <template v-if="renamingColId === c.id">
                <input
                  v-model="renamingColName"
                  v-focus
                  class="libr-tag-input"
                  style="width: 110px; padding: 1px 8px"
                  @click.stop
                  @keydown.enter="submitRenameCollection"
                  @keydown.esc="renamingColId = null"
                  @blur="submitRenameCollection"
                />
              </template>
              <template v-else>
                <span class="nav-name">{{ c.name }}</span>
                <span class="count">{{ colCounts.get(c.id) ?? 0 }}</span>
                <span class="nav-edit" @click.stop>
                  <button class="libr-icon-btn" title="重命名合集" :aria-label="`重命名合集 ${c.name}`" @click="startRenameCollection(c.id)">
                    <Pencil :size="12" />
                  </button>
                  <button class="libr-icon-btn danger" title="删除合集" :aria-label="`删除合集 ${c.name}`" @click="askDeleteCollection(c.id)">
                    <X :size="12" />
                  </button>
                </span>
              </template>
            </button>
            <input
              v-if="creatingCol"
              v-model="newColName"
              v-focus
              class="libr-tag-input"
              style="margin: 4px 0 0 5px; width: 150px"
              placeholder="合集名，回车确认"
              @click.stop
              @keydown.enter="submitNewCollection"
              @keydown.esc="creatingCol = false"
              @blur="submitNewCollection"
            />
            <button
              class="libr-nav-item"
              style="color: var(--ink-faint)"
              @click="creatingCol = true; newColName = ''"
            >
              <Plus :size="15" />
              新建合集
            </button>
          </div>
          <div>
            <div class="libr-side-title">标签 <span class="en">TAGS</span></div>
            <div class="libr-tag-cloud">
              <span
                v-for="t in tags"
                :key="t.id"
                class="libr-tag-chip"
                :class="[`tagcolor-${t.color ?? 'violet'}`, { active: tagFilter.includes(t.id) }]"
                role="button"
                tabindex="0"
                @click="toggleTagFilter(t.id)"
                @keydown.enter="toggleTagFilter(t.id)"
              >
                <template v-if="renamingTagId === t.id">
                  <input
                    v-model="renamingTagName"
                    v-focus
                    class="libr-tag-input"
                    style="width: 84px; padding: 0 8px"
                    @click.stop
                    @keydown.enter="submitRenameTag"
                    @keydown.esc="renamingTagId = null"
                    @blur="submitRenameTag"
                  />
                </template>
                <template v-else>
                  {{ t.name }}
                  <span class="n">{{ tagUse.get(t.id) ?? 0 }}</span>
                  <span class="tag-edit" @click.stop>
                    <button class="libr-icon-btn" title="重命名标签" :aria-label="`重命名标签 ${t.name}`" @click="startRenameTag(t.id)">
                      <Pencil :size="11" />
                    </button>
                    <button class="libr-icon-btn danger" title="删除标签" :aria-label="`删除标签 ${t.name}`" @click="removeTagById(t.id)">
                      <X :size="11" />
                    </button>
                  </span>
                </template>
              </span>
            </div>
          </div>
        </aside>

        <!-- 文件区 -->
        <main class="libr-panel libr-content">
          <div class="libr-filterbar">
            <span class="libr-crumb"><b>{{ crumb }}</b></span>
            <button v-if="hasActiveFilter" class="libr-chip-clear" @click="clearFilters">
              清除筛选 <X :size="10" />
            </button>
            <div class="libr-sortseg">
              <span
                v-for="s in SORTS"
                :key="s.key"
                :class="{ active: sort === s.key }"
                role="button"
                tabindex="0"
                @click="toggleSort(s.key)"
                @keydown.enter="toggleSort(s.key)"
              >
                {{ s.label }}<span v-if="sort === s.key" class="dir">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </span>
            </div>
          </div>

          <div v-if="recycle" class="libr-recycle-note">
            <Info :size="14" />
            回收站文件保留 30 天，到期自动清理；彻底删除不可恢复
          </div>

          <div class="libr-filearea">
            <div v-if="loading && !visibleFiles.length" class="libr-empty">加载中…</div>
            <template v-else-if="!visibleFiles.length">
              <div class="libr-empty">
                <FolderOpen :size="44" :stroke-width="1.4" />
                <div>{{ recycle ? '回收站是空的' : '没有匹配的文件 — 换个筛选条件试试' }}</div>
                <button v-if="hasActiveFilter" class="libr-btn" style="margin-top: 16px" @click="clearFilters">
                  清除全部筛选
                </button>
              </div>
            </template>

            <!-- 列表视图 -->
            <div v-else-if="view === 'list'" class="libr-table-wrap">
              <table class="libr-table">
                <thead>
                  <tr>
                    <th style="width: 36px">
                      <input
                        type="checkbox"
                        :checked="allSelected"
                        :indeterminate="someSelected"
                        :aria-label="recycle ? '全选回收站文件' : '全选文件'"
                        @click.stop
                        @change="toggleSelAll(($event.target as HTMLInputElement).checked)"
                      />
                    </th>
                    <th>文件名</th>
                    <th style="width: 110px">大小</th>
                    <th style="width: 130px">{{ recycle ? '删除时间' : '上传时间' }}</th>
                    <th v-if="!recycle">标签</th>
                    <th :style="{ width: recycle ? '170px' : '130px' }"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="f in visibleFiles"
                    :key="f.id"
                    class="libr-row"
                    :class="{ selected: selected.has(f.id) }"
                    role="button"
                    tabindex="0"
                    @click="openDrawer(f.id)"
                    @keydown.enter="openDrawer(f.id)"
                  >
                    <td @click.stop>
                      <input
                        type="checkbox"
                        :checked="selected.has(f.id)"
                        :aria-label="`选择 ${f.name}`"
                        @change="toggleSel(f.id, ($event.target as HTMLInputElement).checked)"
                      />
                    </td>
                    <td>
                      <div class="libr-fname">
                        <span class="libr-ftype" :class="`cat-${f.category}`">{{ f.ext.toUpperCase().slice(0, 4) }}</span>
                        <span class="name">{{ f.name }}</span>
                        <span v-if="!recycle && f.aiStatus === 'DONE'" class="libr-ai-badge">
                          <Sparkles :size="11" /> AI
                        </span>
                        <span v-else-if="!recycle && f.aiStatus === 'PENDING'" class="libr-ai-badge pending">
                          AI 解析中…
                        </span>
                        <span v-if="!recycle && f.score != null" class="libr-sem-badge" title="语义匹配分">
                          语义 {{ Math.round(f.score * 100) }}%
                        </span>
                      </div>
                    </td>
                    <td class="libr-meta-txt">{{ fmtSize(f.size) }}</td>
                    <td class="libr-meta-txt">{{ recycle ? f.deletedAt : f.uploadedAt.slice(0, 10) }}</td>
                    <td v-if="!recycle">
                      <div class="libr-cell-tags">
                        <span
                          v-for="t in f.tagIds"
                          :key="t"
                          class="libr-mini-tag"
                          :class="`tagcolor-${tagMap.get(t)?.color ?? 'violet'}`"
                        >
                          {{ tagMap.get(t)?.name ?? t }}
                        </span>
                        <span v-if="!f.tagIds.length" class="libr-meta-txt">—</span>
                      </div>
                    </td>
                    <td @click.stop>
                      <div v-if="recycle" class="libr-row-actions" style="opacity: 1">
                        <button class="libr-btn" @click="handleRestore([f.id])">恢复</button>
                        <button class="libr-btn ghost-danger" @click="askPurge([f.id])">彻底删除</button>
                      </div>
                      <div v-else class="libr-row-actions">
                        <button class="libr-icon-btn" title="下载" :aria-label="`下载 ${f.name}`" @click="handleDownload(f)">
                          <Download :size="14" />
                        </button>
                        <button
                          class="libr-icon-btn"
                          title="加入合集"
                          :aria-label="`将 ${f.name} 加入合集`"
                          @click="quickAddToCollection(f)"
                        >
                          <FolderPlus :size="14" />
                        </button>
                        <button
                          class="libr-icon-btn danger"
                          title="移入回收站"
                          :aria-label="`将 ${f.name} 移入回收站`"
                          @click="undoableRemove([f.id])"
                        >
                          <Trash2 :size="14" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 网格视图 -->
            <div v-else class="libr-grid">
              <div
                v-for="f in visibleFiles"
                :key="f.id"
                class="libr-grid-card"
                :class="{ selected: selected.has(f.id) }"
                role="button"
                tabindex="0"
                @click="openDrawer(f.id)"
                @keydown.enter="openDrawer(f.id)"
              >
                <input
                  type="checkbox"
                  class="gcheck"
                  :checked="selected.has(f.id)"
                  :aria-label="`选择 ${f.name}`"
                  @click.stop
                  @change="toggleSel(f.id, ($event.target as HTMLInputElement).checked)"
                />
                <div v-if="!recycle" class="gactions" @click.stop>
                  <button class="libr-icon-btn" title="下载" :aria-label="`下载 ${f.name}`" @click="handleDownload(f)">
                    <Download :size="13" />
                  </button>
                  <button class="libr-icon-btn danger" title="移入回收站" :aria-label="`将 ${f.name} 移入回收站`" @click="undoableRemove([f.id])">
                    <Trash2 :size="13" />
                  </button>
                </div>
                <div class="libr-grid-thumb">
                  <span class="libr-ftype" :class="`cat-${f.category}`">{{ f.ext.toUpperCase().slice(0, 4) }}</span>
                </div>
                <div class="gname" :title="f.name">{{ f.name }}</div>
                <div class="gmeta">
                  {{ fmtSize(f.size) }} · {{ recycle ? `删于 ${f.deletedAt ?? ''}` : f.uploadedAt.slice(0, 10) }}
                </div>
                <div v-if="!recycle" class="libr-cell-tags" style="max-width: none">
                  <span
                    v-for="t in f.tagIds"
                    :key="t"
                    class="libr-mini-tag"
                    :class="`tagcolor-${tagMap.get(t)?.color ?? 'violet'}`"
                  >
                    {{ tagMap.get(t)?.name ?? t }}
                  </span>
                  <span v-if="f.aiStatus === 'DONE'" class="libr-ai-badge"><Sparkles :size="11" /> AI</span>
                  <span v-else-if="f.aiStatus === 'PENDING'" class="libr-ai-badge pending">AI 解析中…</span>
                  <span v-if="f.score != null" class="libr-sem-badge" title="语义匹配分">
                    语义 {{ Math.round(f.score * 100) }}%
                  </span>
                </div>
                <button v-if="recycle" class="libr-btn" @click.stop="handleRestore([f.id])">恢复</button>
              </div>
            </div>
          </div>

          <div class="libr-foot">
            {{ recycle ? `回收站 · ${visibleFiles.length} 个文件` : `共 ${visibleFiles.length} 个文件${selected.size ? ` · 已选 ${selected.size} 项` : ''}` }}
          </div>
        </main>
      </div>

      <!-- 批量操作条 -->
      <div class="libr-batchbar" :class="{ show: selected.size > 0 }">
        <span>已选 <span class="sel-n">{{ selected.size }}</span> 项</span>
        <template v-if="!recycle">
          <button class="libr-btn" @click="batchColOpen = true">加入合集</button>
          <button class="libr-btn" @click="batchTagOpen = true; batchTagName = ''">打标签</button>
          <button class="libr-btn ghost-danger" @click="undoableRemove([...selected])">移入回收站</button>
        </template>
        <template v-else>
          <button class="libr-btn" @click="handleRestore([...selected])">恢复所选</button>
          <button class="libr-btn danger" @click="askPurge([...selected])">彻底删除</button>
        </template>
        <button class="libr-btn" @click="selected = new Set()">取消</button>
      </div>

      <!-- 详情抽屉 -->
      <LibraryFileDrawer
        :open="drawerOpen"
        :file="drawerFile"
        :tags="tags"
        :collections="collections"
        :demo="demoMode"
        @close="drawerOpen = false"
        @download="handleDownload"
        @remove-tag="onDrawerRemoveTag"
        @accept-suggest="onDrawerAcceptSuggest"
        @create-tag="onDrawerCreateTag"
        @add-collection="onDrawerAddCollection"
        @remove-collection="onDrawerRemoveCollection"
        @rename="onDrawerRename"
        @transfer-kb="onDrawerTransferKb"
        @delete="onDrawerDelete"
        @regen="onDrawerRegen"
      />

      <!-- 上传弹窗 -->
      <LibraryUploadModal
        :open="uploadOpen"
        :demo="demoMode"
        @close="uploadOpen = false"
        @completed="handleUploadCompleted"
      />

      <!-- 二次确认弹窗（Teleport 到 #stage 以盖过 topbar） -->
      <Teleport to="#stage" defer>
        <div v-if="confirmState.open" class="libr-modal-mask" style="z-index: 65" @click.self="confirmState.open = false">
          <div class="libr-modal confirm" role="dialog" aria-modal="true" :aria-label="confirmState.title">
            <h3>{{ confirmState.title }}</h3>
            <div class="desc" style="margin-bottom: 6px">{{ confirmState.desc }}</div>
            <div class="libr-modal-foot">
              <button class="libr-btn" @click="confirmState.open = false">取消</button>
              <button
                class="libr-btn danger"
                @click="
                  confirmState.open = false;
                  confirmState.onOk?.()
                "
              >
                {{ confirmState.okText }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 批量加入合集 -->
      <Teleport to="#stage" defer>
        <div v-if="batchColOpen" class="libr-modal-mask" style="z-index: 65" @click.self="batchColOpen = false">
          <div class="libr-modal confirm" role="dialog" aria-modal="true" aria-label="加入合集">
            <h3>加入合集</h3>
            <div class="desc">为选中的 {{ selected.size }} 个文件选择一个合集</div>
            <div class="libr-drawer-tags" style="margin-top: 4px">
              <button
                v-for="c in collections"
                :key="c.id"
                class="libr-tag-chip"
                :class="`tagcolor-${c.color ?? 'violet'}`"
                style="font-size: 13.5px; padding: 6px 16px"
                @click="batchAddToCollection(c.id)"
              >
                {{ c.name }}
              </button>
              <span v-if="!collections.length" class="libr-meta-txt">还没有合集</span>
            </div>
            <div class="libr-modal-foot">
              <button class="libr-btn" @click="batchColOpen = false">取消</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 批量打标签 -->
      <Teleport to="#stage" defer>
        <div v-if="batchTagOpen" class="libr-modal-mask" style="z-index: 65" @click.self="batchTagOpen = false">
          <div class="libr-modal confirm" role="dialog" aria-modal="true" aria-label="批量打标签">
            <h3>批量打标签</h3>
            <div class="desc">为选中的 {{ selected.size }} 个文件追加一个标签</div>
            <input
              v-model="batchTagName"
              class="libr-tag-input"
              style="width: 100%; padding: 8px 14px; font-size: 13.5px"
              placeholder="输入标签名，如：考研数学"
              @keydown.enter="batchApplyTag"
            />
            <div class="libr-modal-foot">
              <button class="libr-btn" @click="batchTagOpen = false">取消</button>
              <button class="libr-btn primary" @click="batchApplyTag">添加</button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </StationRoomShell>
</template>
