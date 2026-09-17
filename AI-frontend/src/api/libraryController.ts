/**
 * 资料库 API — 对应后端 LibraryController（待实现，契约见
 * Ai-Backend/docs/p1-frontend-waiting-endpoints.md §「资料库」），接口前缀 /library
 * 所有请求 silent404：模块未启用（Controller 未注册）时静默降级，
 * 页面（useLibrary）回退为本地演示数据，后端就绪后自动切换真实数据。
 */
import request from '@/request'

/** 文件大类（按扩展名归类，用于筛选与图标展示） */
export type LibraryCategory =
  | 'DOCUMENT'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'CODE'
  | 'ARCHIVE'
  | 'OTHER'

/** AI 解析状态：NONE 未解析 / PENDING 排队或解析中 / DONE 完成 / FAILED 失败 */
export type LibraryAiStatus = 'NONE' | 'PENDING' | 'DONE' | 'FAILED'

export type LibraryTag = {
  id: number
  name: string
  /** 主题色 key（sakura / violet / lilac / blue / mint / sun），缺省 violet */
  color?: string
}

/** 合集（书脊） */
export type LibraryCollection = {
  id: number
  name: string
  color?: string
}

/** 资料库文件条目（含标签/合集关联与 AI 解析状态） */
export type LibraryFile = {
  id: number
  name: string
  /** 小写扩展名（不含点） */
  ext: string
  category: LibraryCategory
  size: number
  /** 上传时间 'yyyy-MM-dd HH:mm' */
  uploadedAt: string
  tagIds: number[]
  collectionIds: number[]
  aiStatus: LibraryAiStatus
  aiSummary?: string
  /** SHA-256（秒传去重键），展示用缩略形式 */
  sha256?: string
  /** MinIO 对象键，如 library/1/202609/<sha>.pdf */
  objectKey?: string
  /** 语义搜索匹配分（0~1），仅语义检索结果带 */
  score?: number
}

/** 回收站文件条目（软删除态，保留 30 天） */
export type LibraryRecycleFile = {
  id: number
  name: string
  ext: string
  category: LibraryCategory
  size: number
  uploadedAt: string
  /** 删除时间 'yyyy-MM-dd'，保留 30 天 */
  deletedAt: string
}

/** 资料库容量概览：文件数、已用/配额字节数及最近取出记录 */
export type LibrarySummary = {
  fileCount: number
  usedBytes: number
  quotaBytes: number
  /** 「最近取出」文件 id（最近一次下载/打开） */
  recentFileId?: number
  recentFileAt?: string
}

/**
 * POST /library/files/upload-init 返回：
 * - instant：SHA-256 命中秒传，文件直接入库
 * - direct：返回预签名 PUT URL，前端直传 MinIO 后调 upload-complete
 */
export type LibraryUploadInitResult =
  | { mode: 'instant'; file: LibraryFile }
  | { mode: 'direct'; fileId: number; uploadUrl: string; objectKey: string }

/** 后端通用响应结构的宽松形式（模块未实现时可能缺省字段） */
type LibraryResponse<T> = { code?: number; data?: T; message?: string }

/** GET /library/summary — 容量统计 + 最近取出 */
export async function getLibrarySummary() {
  return request<LibraryResponse<LibrarySummary>>('/library/summary', {
    method: 'GET',
    silent404: true,
  })
}

/** GET /library/files — 按筛选条件列出文件（keyword 搜文件名/摘要/标签名） */
export async function listLibraryFiles(params: {
  keyword?: string
  category?: LibraryCategory
  collectionId?: number
  tagIds?: number[]
  sort?: 'time' | 'name' | 'size'
  dir?: 'asc' | 'desc'
}) {
  return request<LibraryResponse<LibraryFile[]>>('/library/files', {
    method: 'GET',
    params,
    silent404: true,
  })
}

/** GET /library/recycle — 回收站列表 */
export async function listLibraryRecycle() {
  return request<LibraryResponse<LibraryRecycleFile[]>>('/library/recycle', {
    method: 'GET',
    silent404: true,
  })
}

/** GET /library/tags — 全部标签 */
export async function listLibraryTags() {
  return request<LibraryResponse<LibraryTag[]>>('/library/tags', {
    method: 'GET',
    silent404: true,
  })
}

/** POST /library/tags — 新建标签 */
export async function createLibraryTag(name: string, color?: string) {
  return request<LibraryResponse<LibraryTag>>('/library/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { name, color },
    silent404: true,
  })
}

/** GET /library/collections — 全部合集 */
export async function listLibraryCollections() {
  return request<LibraryResponse<LibraryCollection[]>>('/library/collections', {
    method: 'GET',
    silent404: true,
  })
}

/** POST /library/collections — 新建合集（契约 §4.5，后端待实现） */
export async function createLibraryCollection(name: string, color?: string) {
  return request<LibraryResponse<LibraryCollection>>('/library/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { name, color },
    silent404: true,
  })
}

/** PUT /library/tags/{id} — 重命名标签（契约 §4.5，后端待实现） */
export async function renameLibraryTag(id: number, name: string, color?: string) {
  return request<LibraryResponse<LibraryTag>>(`/library/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: { name, color },
    silent404: true,
  })
}

/** DELETE /library/tags/{id} — 删除标签（后端应同步剥离文件上的引用；契约 §4.5，后端待实现） */
export async function deleteLibraryTag(id: number) {
  return request<LibraryResponse<boolean>>(`/library/tags/${id}`, {
    method: 'DELETE',
    silent404: true,
  })
}

/** PUT /library/collections/{id} — 合集重命名（契约 §4.5，后端待实现） */
export async function renameLibraryCollection(id: number, name: string) {
  return request<LibraryResponse<boolean>>(`/library/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: { name },
    silent404: true,
  })
}

/** DELETE /library/collections/{id} — 删除合集（文件保留、仅解除归属；契约 §4.5，后端待实现） */
export async function deleteLibraryCollection(id: number) {
  return request<LibraryResponse<boolean>>(`/library/collections/${id}`, {
    method: 'DELETE',
    silent404: true,
  })
}

/** POST /library/files/{id}/collections/remove — 移出合集（契约 §4.5，后端待实现） */
export async function removeLibraryFileFromCollection(fileId: number, collectionId: number) {
  return request<LibraryResponse<boolean>>(`/library/files/${fileId}/collections/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { collectionId },
    silent404: true,
  })
}

/** POST /library/files/{id}/rename — 文件重命名（契约 §4.5，后端待实现） */
export async function renameLibraryFile(id: number, name: string) {
  return request<LibraryResponse<LibraryFile>>(`/library/files/${id}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { name },
    silent404: true,
  })
}

/** POST /library/files/upload-init — 上传初始化（SHA-256 去重，命中秒传） */
export async function initLibraryUpload(body: { fileName: string; size: number; sha256: string }) {
  return request<LibraryResponse<LibraryUploadInitResult>>('/library/files/upload-init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    silent404: true,
  })
}

/** POST /library/files/upload-complete — 预签名直传完成后的登记 */
export async function completeLibraryUpload(fileId: number) {
  return request<LibraryResponse<LibraryFile>>('/library/files/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { fileId },
    silent404: true,
  })
}

/** GET /library/files/{id}/download-url — 预签名下载链接（默认 3600s 有效） */
export async function getLibraryDownloadUrl(id: number) {
  return request<LibraryResponse<{ url: string; expiresIn: number }>>(
    `/library/files/${id}/download-url`,
    { method: 'GET', silent404: true },
  )
}

/** POST /library/files/delete — 批量移入回收站（软删除，30 天可恢复） */
export async function deleteLibraryFiles(ids: number[]) {
  return request<LibraryResponse<boolean>>('/library/files/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { ids },
    silent404: true,
  })
}

/** POST /library/recycle/restore — 批量恢复 */
export async function restoreLibraryFiles(ids: number[]) {
  return request<LibraryResponse<boolean>>('/library/recycle/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { ids },
    silent404: true,
  })
}

/** POST /library/recycle/purge — 批量彻底删除（MinIO 对象同步清理，不可恢复） */
export async function purgeLibraryFiles(ids: number[]) {
  return request<LibraryResponse<boolean>>('/library/recycle/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { ids },
    silent404: true,
  })
}

/** POST /library/files/{id}/tags — 覆盖式更新文件标签 */
export async function setLibraryFileTags(id: number, tagIds: number[]) {
  return request<LibraryResponse<boolean>>(`/library/files/${id}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { tagIds },
    silent404: true,
  })
}

/** POST /library/files/collections — 批量加入合集 */
export async function addLibraryFilesToCollection(fileIds: number[], collectionId: number) {
  return request<LibraryResponse<boolean>>('/library/files/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { fileIds, collectionId },
    silent404: true,
  })
}

/** POST /library/files/{id}/transfer-knowledge — 转入知识库（切块 → 向量化 → RAG） */
export async function transferLibraryFileToKnowledge(id: number) {
  return request<LibraryResponse<boolean>>(`/library/files/${id}/transfer-knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    silent404: true,
  })
}

/** POST /library/files/{id}/ai-regenerate — 重新生成 AI 摘要（异步任务） */
export async function regenLibraryFileAi(id: number) {
  return request<LibraryResponse<boolean>>(`/library/files/${id}/ai-regenerate`, {
    method: 'POST',
    silent404: true,
  })
}

/** GET /library/files/semantic-search — 语义搜索（向量匹配文件名 + AI 摘要，返回带 score） */
export async function searchLibrarySemantic(q: string, limit = 20) {
  return request<LibraryResponse<LibraryFile[]>>('/library/files/semantic-search', {
    method: 'GET',
    params: { q, limit },
    silent404: true,
  })
}

/** POST /library/files/{id}/open — 记录一次「取出」（刷新最近取出） */
export async function markLibraryFileOpened(id: number) {
  return request<LibraryResponse<boolean>>(`/library/files/${id}/open`, {
    method: 'POST',
    silent404: true,
  })
}
