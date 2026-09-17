/**
 * 资料库（资料储藏室）数据层
 * - 优先走后端 /library/**（契约见 Ai-Backend/docs/p1-frontend-waiting-endpoints.md）
 * - 端点 404（模块未实现/未启用）时自动回退为本地演示数据（demoMode = true），
 *   界面出现「演示数据」角标；后端就绪后无需改前端，刷新即切换真实数据
 * - 筛选/排序当前在前端完成（个人库量级足够），后端参数已预留
 */
import { computed, ref } from 'vue'
import {
  addLibraryFilesToCollection,
  createLibraryCollection,
  createLibraryTag,
  deleteLibraryCollection,
  deleteLibraryTag,
  deleteLibraryFiles,
  getLibraryDownloadUrl,
  getLibrarySummary,
  listLibraryCollections,
  listLibraryFiles,
  listLibraryRecycle,
  listLibraryTags,
  markLibraryFileOpened,
  purgeLibraryFiles,
  removeLibraryFileFromCollection,
  renameLibraryCollection,
  renameLibraryFile,
  renameLibraryTag,
  restoreLibraryFiles,
  setLibraryFileTags,
  transferLibraryFileToKnowledge,
  type LibraryCategory,
  type LibraryCollection,
  type LibraryFile,
  type LibraryRecycleFile,
  type LibrarySummary,
  type LibraryTag,
} from '@/api/libraryController'

/* ================= 类型与工具 ================= */

export const LIBRARY_CATEGORIES: Array<{ key: LibraryCategory; label: string; color: string }> = [
  { key: 'DOCUMENT', label: '文档', color: 'blue' },
  { key: 'IMAGE', label: '图片', color: 'sakura' },
  { key: 'AUDIO', label: '音频', color: 'sun' },
  { key: 'VIDEO', label: '视频', color: 'lilac' },
  { key: 'CODE', label: '代码', color: 'mint' },
  { key: 'ARCHIVE', label: '压缩包', color: 'violet' },
  { key: 'OTHER', label: '其他', color: 'faint' },
]

export const EXT_CATEGORY: Record<string, LibraryCategory> = {
  pdf: 'DOCUMENT', doc: 'DOCUMENT', docx: 'DOCUMENT', ppt: 'DOCUMENT', pptx: 'DOCUMENT',
  xls: 'DOCUMENT', xlsx: 'DOCUMENT', txt: 'DOCUMENT', md: 'DOCUMENT', csv: 'DOCUMENT', epub: 'DOCUMENT',
  jpg: 'IMAGE', jpeg: 'IMAGE', png: 'IMAGE', gif: 'IMAGE', webp: 'IMAGE', svg: 'IMAGE',
  mp3: 'AUDIO', wav: 'AUDIO', flac: 'AUDIO', m4a: 'AUDIO',
  mp4: 'VIDEO', mkv: 'VIDEO', mov: 'VIDEO', webm: 'VIDEO',
  java: 'CODE', py: 'CODE', ts: 'CODE', js: 'CODE', vue: 'CODE', html: 'CODE', sql: 'CODE', json: 'CODE',
  zip: 'ARCHIVE', rar: 'ARCHIVE', tar: 'ARCHIVE', gz: 'ARCHIVE',
}

export function categoryOfExt(ext: string): LibraryCategory {
  return EXT_CATEGORY[ext.toLowerCase()] ?? 'OTHER'
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB'
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
  return bytes + ' B'
}

const GB = 1024 ** 3
const TAG_COLORS = ['violet', 'sakura', 'blue', 'mint', 'sun', 'lilac']

/* ================= 演示数据（后端就绪前使用） ================= */

function demoTags(): LibraryTag[] {
  return [
    { id: 1, name: '深度学习', color: 'sakura' },
    { id: 2, name: 'RAG', color: 'violet' },
    { id: 3, name: '数学', color: 'blue' },
    { id: 4, name: '英语', color: 'mint' },
    { id: 5, name: 'Vue', color: 'lilac' },
    { id: 6, name: '部署', color: 'sun' },
  ]
}

function demoCollections(): LibraryCollection[] {
  return [
    { id: 1, name: '机器学习入门', color: 'sakura' },
    { id: 2, name: '考研数学', color: 'blue' },
    { id: 3, name: '前端进阶', color: 'mint' },
  ]
}

function demoFiles(): LibraryFile[] {
  return [
    { id: 1, name: 'Attention Is All You Need.pdf', ext: 'pdf', category: 'DOCUMENT', size: 2.4 * 1024 * 1024, uploadedAt: '2026-09-12 21:40', tagIds: [1, 2], collectionIds: [1], aiStatus: 'DONE',
      aiSummary: 'Transformer 原始论文：提出完全基于自注意力机制的序列建模架构，取代 RNN 循环结构；并行训练显著提速，机器翻译 BLEU 刷新当时纪录。建议搭配位置编码与多头注意力两节精读。', sha256: 'a3f8…9c2d' },
    { id: 2, name: 'RAG 综述笔记.md', ext: 'md', category: 'DOCUMENT', size: 48 * 1024, uploadedAt: '2026-09-11 10:02', tagIds: [2], collectionIds: [1], aiStatus: 'DONE',
      aiSummary: '自己整理的 RAG 技术综述：检索增强生成的三段式流程（切块 / 向量化 / 重排），对比了朴素 RAG 与 Advanced RAG 在召回率上的差异，附 pgvector 实践要点。', sha256: '7b21…e4a8' },
    { id: 3, name: '线性代数讲义（第 3 章）.pdf', ext: 'pdf', category: 'DOCUMENT', size: 8.1 * 1024 * 1024, uploadedAt: '2026-09-10 15:26', tagIds: [3], collectionIds: [2], aiStatus: 'PENDING' },
    { id: 4, name: 'transformers 源码阅读.zip', ext: 'zip', category: 'ARCHIVE', size: 46.2 * 1024 * 1024, uploadedAt: '2026-09-09 22:11', tagIds: [1], collectionIds: [1], aiStatus: 'NONE' },
    { id: 5, name: 'B 站课程：手写 Vue3 响应式.mp4', ext: 'mp4', category: 'VIDEO', size: 388 * 1024 * 1024, uploadedAt: '2026-09-08 19:55', tagIds: [5], collectionIds: [3], aiStatus: 'NONE' },
    { id: 6, name: '考研英语高频词.csv', ext: 'csv', category: 'DOCUMENT', size: 96 * 1024, uploadedAt: '2026-09-06 08:30', tagIds: [4], collectionIds: [2], aiStatus: 'NONE' },
    { id: 7, name: '论文配图 - 注意力热力图.png', ext: 'png', category: 'IMAGE', size: 1.2 * 1024 * 1024, uploadedAt: '2026-09-05 17:18', tagIds: [1], collectionIds: [1], aiStatus: 'NONE' },
    { id: 8, name: 'K8s 部署踩坑记录.md', ext: 'md', category: 'DOCUMENT', size: 22 * 1024, uploadedAt: '2026-09-03 23:47', tagIds: [6], collectionIds: [], aiStatus: 'DONE',
      aiSummary: '记录 MinIO + MySQL 在 K8s 上的 StatefulSet 部署过程：PVC 存储类选型、探针配置、以及 Ingress 透传大文件上传时的超时坑（client_max_body_size）。' },
    { id: 9, name: '英语播客 - Lex #421.mp3', ext: 'mp3', category: 'AUDIO', size: 92 * 1024 * 1024, uploadedAt: '2026-09-01 07:12', tagIds: [4], collectionIds: [], aiStatus: 'NONE' },
    { id: 10, name: 'useReadingRoomCraft.ts', ext: 'ts', category: 'CODE', size: 9.6 * 1024, uploadedAt: '2026-08-30 14:09', tagIds: [5], collectionIds: [3], aiStatus: 'NONE' },
    { id: 11, name: '概率论习题集.pdf', ext: 'pdf', category: 'DOCUMENT', size: 12.7 * 1024 * 1024, uploadedAt: '2026-08-28 20:33', tagIds: [3], collectionIds: [2], aiStatus: 'NONE' },
    { id: 12, name: '数据集 - winequality.csv', ext: 'csv', category: 'DOCUMENT', size: 84 * 1024, uploadedAt: '2026-08-26 11:50', tagIds: [1], collectionIds: [], aiStatus: 'NONE' },
  ]
}

function demoRecycle(): LibraryRecycleFile[] {
  return [
    { id: 101, name: '旧版开题报告.docx', ext: 'docx', category: 'DOCUMENT', size: 340 * 1024, uploadedAt: '2026-08-20 09:14', deletedAt: '2026-09-10' },
    { id: 102, name: '课表截图.png', ext: 'png', category: 'IMAGE', size: 640 * 1024, uploadedAt: '2026-07-02 18:00', deletedAt: '2026-09-12' },
  ]
}

/* ================= Composable ================= */

function unwrap<T>(res: { data?: { code?: number; data?: T } }): T | null {
  const payload = res.data
  if (payload && payload.code === 0 && payload.data !== undefined && payload.data !== null) {
    return payload.data
  }
  return null
}

/** 404（模块未注册）或网络不可达 → 视为后端未就绪 */
function isUnavailable(err: unknown): boolean {
  const anyErr = err as { response?: { status?: number }; request?: unknown }
  return !anyErr?.response || anyErr.response?.status === 404
}

/**
 * 编辑类端点统一探测：404/405 = 后端尚未实现（supported=false，UI 提示待接入；
 * Spring 对「路径存在但方法未映射」返回 405，对完全未注册返回 404）；
 * 其余错误按后端拒绝处理（supported=true + data=null，UI 提示失败），不向上抛。
 */
async function callSupported<T>(
  fn: () => Promise<{ data?: { code?: number; data?: T } }>,
): Promise<{ supported: boolean; data: T | null }> {
  try {
    const res = await fn()
    return { supported: true, data: unwrap(res) }
  } catch (err) {
    if (isUnavailable(err)) return { supported: false, data: null }
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 405) return { supported: false, data: null }
    console.warn('[library] 编辑操作失败', err)
    return { supported: true, data: null }
  }
}

export function useLibrary() {
  const files = ref<LibraryFile[]>([])
  const recycleFiles = ref<LibraryRecycleFile[]>([])
  const tags = ref<LibraryTag[]>([])
  const collections = ref<LibraryCollection[]>([])
  const recentFileId = ref<number | null>(null)
  const recentFileAt = ref<string>('')
  const demoMode = ref(false)
  const loading = ref(false)
  const realSummary = ref<LibrarySummary | null>(null)

  const summary = computed<LibrarySummary>(() => {
    const s = realSummary.value
    if (!demoMode.value && s) {
      return {
        ...s,
        fileCount: files.value.length,
        recentFileId: recentFileId.value ?? s.recentFileId,
        recentFileAt: recentFileAt.value || s.recentFileAt,
      }
    }
    return {
      fileCount: files.value.length,
      usedBytes: files.value.reduce((sum, f) => sum + f.size, 0),
      quotaBytes: 20 * GB,
      recentFileId: recentFileId.value ?? undefined,
      recentFileAt: recentFileAt.value,
    }
  })

  /** 拉取全量数据；任何端点未就绪 → 演示模式 */
  async function loadAll() {
    loading.value = true
    try {
      const [summaryRes, filesRes, recycleRes, tagsRes, colsRes] = await Promise.all([
        getLibrarySummary(),
        listLibraryFiles({}),
        listLibraryRecycle(),
        listLibraryTags(),
        listLibraryCollections(),
      ])
      const s = unwrap(summaryRes)
      const fs = unwrap(filesRes)
      const rc = unwrap(recycleRes)
      const tg = unwrap(tagsRes)
      const cl = unwrap(colsRes)
      if (!fs) throw new Error('library api unavailable')
      files.value = fs
      recycleFiles.value = rc ?? []
      tags.value = tg ?? []
      collections.value = cl ?? []
      realSummary.value = s
      recentFileId.value = s?.recentFileId ?? null
      recentFileAt.value = s?.recentFileAt ?? ''
      demoMode.value = false
    } catch (err) {
      if (!isUnavailable(err)) {
        // 登录失效等已由全局拦截器处理；此处只吞非 404 异常，仍进演示模式
        console.warn('[library] 云端加载失败，回退演示数据', err)
      }
      demoMode.value = true
      files.value = demoFiles()
      recycleFiles.value = demoRecycle()
      tags.value = demoTags()
      collections.value = demoCollections()
      recentFileId.value = 2
      recentFileAt.value = '2026-09-11'
    } finally {
      loading.value = false
    }
  }

  async function reloadIfReal() {
    if (!demoMode.value) await loadAll()
  }

  /** 批量移入回收站；返回撤销函数（真实模式走 restore，演示模式本地放回） */
  async function removeFiles(ids: number[]): Promise<() => Promise<void>> {
    if (demoMode.value) {
      const removed = files.value.filter((f) => ids.includes(f.id))
      files.value = files.value.filter((f) => !ids.includes(f.id))
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      recycleFiles.value = [
        ...removed.map((f) => ({
          id: f.id, name: f.name, ext: f.ext, category: f.category,
          size: f.size, uploadedAt: f.uploadedAt, deletedAt: day,
        })),
        ...recycleFiles.value,
      ]
      return async () => {
        recycleFiles.value = recycleFiles.value.filter((r) => !ids.includes(r.id))
        files.value = [...files.value, ...removed]
      }
    }
    await deleteLibraryFiles(ids)
    await loadAll()
    return async () => {
      await restoreLibraryFiles(ids)
      await loadAll()
    }
  }

  /** 批量恢复 */
  async function restoreFiles(ids: number[]) {
    if (demoMode.value) {
      const back = recycleFiles.value.filter((r) => ids.includes(r.id))
      const original = demoFiles().filter((f) => ids.includes(f.id))
      recycleFiles.value = recycleFiles.value.filter((r) => !ids.includes(r.id))
      files.value = [...files.value, ...(original.length ? original : back.map((r) => ({
        id: r.id, name: r.name, ext: r.ext, category: r.category, size: r.size,
        uploadedAt: r.uploadedAt, tagIds: [], collectionIds: [], aiStatus: 'NONE' as const,
      })))]
      return
    }
    await restoreLibraryFiles(ids)
    await loadAll()
  }

  /** 批量彻底删除（不可恢复） */
  async function purgeFiles(ids: number[]) {
    if (demoMode.value) {
      recycleFiles.value = recycleFiles.value.filter((r) => !ids.includes(r.id))
      return
    }
    await purgeLibraryFiles(ids)
    await loadAll()
  }

  /** 覆盖式更新文件标签 */
  async function setTags(fileId: number, tagIds: number[]) {
    const f = files.value.find((x) => x.id === fileId)
    if (f) f.tagIds = [...tagIds]
    if (!demoMode.value) await setLibraryFileTags(fileId, tagIds)
  }

  /** 新建标签（演示模式本地创建） */
  async function createTag(name: string): Promise<LibraryTag | null> {
    const exists = tags.value.find((t) => t.name === name)
    if (exists) return exists
    if (demoMode.value) {
      const tag: LibraryTag = {
        id: Math.max(0, ...tags.value.map((t) => t.id)) + 1,
        name,
        color: TAG_COLORS[tags.value.length % TAG_COLORS.length],
      }
      tags.value = [...tags.value, tag]
      return tag
    }
    const created = unwrap(await createLibraryTag(name))
    if (created) tags.value = [...tags.value, created]
    return created
  }

  /* ================= 标签 / 合集 / 文件本体编辑（契约 §4.5） ================= */
  /** col 为 null 且 supported=false 表示后端端点未实现（UI 提示待接入） */
  async function createCollection(
    name: string,
    color?: string,
  ): Promise<{ supported: boolean; col: LibraryCollection | null }> {
    if (demoMode.value) {
      const col: LibraryCollection = {
        id: Math.max(0, ...collections.value.map((c) => c.id)) + 1,
        name,
        color: color ?? TAG_COLORS[collections.value.length % TAG_COLORS.length],
      }
      collections.value = [...collections.value, col]
      return { supported: true, col }
    }
    const r = await callSupported(() => createLibraryCollection(name, color))
    if (r.data) collections.value = [...collections.value, r.data]
    return { supported: r.supported, col: r.data }
  }

  async function renameTag(id: number, name: string): Promise<{ supported: boolean; ok: boolean }> {
    if (demoMode.value) {
      tags.value = tags.value.map((t) => (t.id === id ? { ...t, name } : t))
      return { supported: true, ok: true }
    }
    const r = await callSupported(() => renameLibraryTag(id, name))
    if (r.data) {
      tags.value = tags.value.map((t) => (t.id === id ? { ...t, name } : t))
      return { supported: true, ok: true }
    }
    return { supported: r.supported, ok: false }
  }

  async function deleteTag(id: number): Promise<{ supported: boolean; ok: boolean }> {
    if (demoMode.value) {
      tags.value = tags.value.filter((t) => t.id !== id)
      files.value = files.value.map((f) => ({ ...f, tagIds: f.tagIds.filter((t) => t !== id) }))
      return { supported: true, ok: true }
    }
    const r = await callSupported(() => deleteLibraryTag(id))
    if (r.data) {
      tags.value = tags.value.filter((t) => t.id !== id)
      files.value = files.value.map((f) => ({ ...f, tagIds: f.tagIds.filter((t) => t !== id) }))
      return { supported: true, ok: true }
    }
    return { supported: r.supported, ok: false }
  }

  async function renameCollection(id: number, name: string): Promise<{ supported: boolean; ok: boolean }> {
    if (demoMode.value) {
      collections.value = collections.value.map((c) => (c.id === id ? { ...c, name } : c))
      return { supported: true, ok: true }
    }
    const r = await callSupported(() => renameLibraryCollection(id, name))
    if (r.data) {
      collections.value = collections.value.map((c) => (c.id === id ? { ...c, name } : c))
      return { supported: true, ok: true }
    }
    return { supported: r.supported, ok: false }
  }

  async function deleteCollection(id: number): Promise<{ supported: boolean; ok: boolean }> {
    if (demoMode.value) {
      collections.value = collections.value.filter((c) => c.id !== id)
      files.value = files.value.map((f) => ({ ...f, collectionIds: f.collectionIds.filter((c) => c !== id) }))
      return { supported: true, ok: true }
    }
    const r = await callSupported(() => deleteLibraryCollection(id))
    if (r.data) {
      collections.value = collections.value.filter((c) => c.id !== id)
      files.value = files.value.map((f) => ({ ...f, collectionIds: f.collectionIds.filter((c) => c !== id) }))
      return { supported: true, ok: true }
    }
    return { supported: r.supported, ok: false }
  }

  async function removeFileFromCollection(fileId: number, collectionId: number): Promise<{ supported: boolean; ok: boolean }> {
    if (demoMode.value) {
      files.value = files.value.map((f) =>
        f.id === fileId ? { ...f, collectionIds: f.collectionIds.filter((c) => c !== collectionId) } : f,
      )
      return { supported: true, ok: true }
    }
    const r = await callSupported(() => removeLibraryFileFromCollection(fileId, collectionId))
    if (r.data) {
      files.value = files.value.map((f) =>
        f.id === fileId ? { ...f, collectionIds: f.collectionIds.filter((c) => c !== collectionId) } : f,
      )
      return { supported: true, ok: true }
    }
    return { supported: r.supported, ok: false }
  }

  async function renameFile(id: number, name: string): Promise<{ supported: boolean; ok: boolean }> {
    if (demoMode.value) {
      files.value = files.value.map((f) => (f.id === id ? { ...f, name } : f))
      return { supported: true, ok: true }
    }
    const r = await callSupported(() => renameLibraryFile(id, name))
    if (r.data) {
      files.value = files.value.map((f) => (f.id === id ? { ...r.data!, ...f, name: r.data!.name } : f))
      return { supported: true, ok: true }
    }
    return { supported: r.supported, ok: false }
  }

  /** 批量加入合集 */
  async function addToCollection(fileIds: number[], collectionId: number) {
    if (demoMode.value) {
      files.value = files.value.map((f) =>
        fileIds.includes(f.id) && !f.collectionIds.includes(collectionId)
          ? { ...f, collectionIds: [...f.collectionIds, collectionId] }
          : f,
      )
      return
    }
    await addLibraryFilesToCollection(fileIds, collectionId)
    await reloadIfReal()
  }

  /** 记录「取出」，返回预签名下载链接（演示模式返回 null） */
  async function openFile(id: number): Promise<string | null> {
    recentFileId.value = id
    recentFileAt.value = new Date().toISOString().slice(0, 10)
    if (demoMode.value) return null
    markLibraryFileOpened(id).catch(() => undefined)
    try {
      const res = unwrap(await getLibraryDownloadUrl(id))
      return res?.url ?? null
    } catch {
      return null
    }
  }

  /** 转入知识库：排队解析 */
  async function transferToKnowledge(id: number) {
    const f = files.value.find((x) => x.id === id)
    if (f) f.aiStatus = 'PENDING'
    if (!demoMode.value) await transferLibraryFileToKnowledge(id)
  }

  /** 上传完成后把新文件插入列表头部（由上传弹窗回调） */
  function applyUploadedFiles(newFiles: LibraryFile[]) {
    files.value = [...newFiles, ...files.value]
  }

  return {
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
  }
}

export type LibraryStore = ReturnType<typeof useLibrary>
