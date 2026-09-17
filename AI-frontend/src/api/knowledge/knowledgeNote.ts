/**
 * 知识库笔记 API — 对应后端 KnowledgeNoteController，接口前缀 /admin/knowledge
 * 涵盖 URL/文件摄取、笔记 CRUD、复习状态流转、蒸馏、博客发布、向量索引与异步阅读任务
 */
import request from '@/request'

/** 摄取/蒸馏/索引等长耗时操作的统一超时：5 分钟 */
const LONG_TIMEOUT = 300_000

/** POST /admin/knowledge/ingest/url — 摄取单个 URL 为笔记（抓取 + AI 蒸馏，长耗时） */
export async function ingestKnowledgeUrl(
  body: API.KnowledgeIngestUrlRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeNoteDetailVO>('/admin/knowledge/ingest/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    timeout: LONG_TIMEOUT,
    ...(options || {}),
  })
}

/** POST /admin/knowledge/ingest/file — multipart: file + title/tags */
export async function ingestKnowledgeFile(
  file: File,
  params?: API.KnowledgeIngestFileRequest,
  options?: { [key: string]: unknown },
) {
  const form = new FormData()
  form.append('file', file)
  if (params?.title) form.append('title', params.title)
  if (params?.tags) form.append('tags', params.tags)
  return request<API.BaseResponseKnowledgeNoteDetailVO>('/admin/knowledge/ingest/file', {
    method: 'POST',
    data: form,
    timeout: LONG_TIMEOUT,
    ...(options || {}),
  })
}

/** GET /admin/knowledge/notes — 分页查询笔记列表 */
export async function listKnowledgeNotes(
  params?: API.KnowledgeNoteQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageKnowledgeNoteVO>('/admin/knowledge/notes', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/knowledge/notes/{noteId} — 获取笔记详情（含蒸馏内容与索引状态） */
export async function getKnowledgeNoteDetail(
  noteId: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeNoteDetailVO>(`/admin/knowledge/notes/${noteId}`, {
    method: 'GET',
    ...(options || {}),
  })
}

/** PUT /admin/knowledge/notes/{noteId} — 更新笔记（标题/标签/正文等） */
export async function updateKnowledgeNote(
  noteId: number | string,
  body: API.KnowledgeNoteUpdateRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeNoteVO>(`/admin/knowledge/notes/${noteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  })
}

/** DELETE /admin/knowledge/notes/{noteId} — 删除笔记 */
export async function deleteKnowledgeNote(
  noteId: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseBoolean>(`/admin/knowledge/notes/${noteId}`, {
    method: 'DELETE',
    ...(options || {}),
  })
}

/** PUT /admin/knowledge/notes/{noteId}/review-status — 复习状态流转 NEW/REVIEWING/MASTERED */
export async function updateKnowledgeNoteReviewStatus(
  noteId: number | string,
  reviewStatus: string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeNoteVO>(
    `/admin/knowledge/notes/${noteId}/review-status`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: { reviewStatus },
      ...(options || {}),
    },
  )
}

/** POST /admin/knowledge/notes/{noteId}/redistill — 重新 AI 蒸馏笔记内容（长耗时） */
export async function redistillKnowledgeNote(
  noteId: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeNoteDetailVO>(
    `/admin/knowledge/notes/${noteId}/redistill`,
    {
      method: 'POST',
      timeout: LONG_TIMEOUT,
      ...(options || {}),
    },
  )
}

/** POST /admin/knowledge/notes/{noteId}/publish-blog — 将笔记发布为博客文章 */
export async function publishKnowledgeNoteBlog(
  noteId: number | string,
  body: API.KnowledgeNotePublishRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseBlogPostVO>(`/admin/knowledge/notes/${noteId}/publish-blog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  })
}

/** POST /admin/knowledge/notes/{noteId}/sync-blog — 同步笔记最新内容到已关联的博客文章 */
export async function syncKnowledgeNoteBlog(
  noteId: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseBlogPostVO>(`/admin/knowledge/notes/${noteId}/sync-blog`, {
    method: 'POST',
    ...(options || {}),
  })
}

/** POST /admin/knowledge/notes/{noteId}/index — 首次建立向量索引（切块 + 向量化，长耗时） */
export async function indexKnowledgeNote(
  noteId: number | string,
  body: API.KnowledgeNoteIndexRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeDocumentVO>(`/admin/knowledge/notes/${noteId}/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    timeout: LONG_TIMEOUT,
    ...(options || {}),
  })
}

/** POST /admin/knowledge/notes/{noteId}/reindex — 重建向量索引（长耗时） */
export async function reindexKnowledgeNote(
  noteId: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeDocumentVO>(`/admin/knowledge/notes/${noteId}/reindex`, {
    method: 'POST',
    timeout: LONG_TIMEOUT,
    ...(options || {}),
  })
}

/** POST /admin/knowledge/search/preview — 同步调试用；产品主路径用 submitKnowledgeReadingSearch */
export async function searchKnowledgePreview(
  body: API.KnowledgeSearchPreviewRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeSearchPreviewVO>('/admin/knowledge/search/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    timeout: LONG_TIMEOUT,
    ...(options || {}),
  })
}

/** POST /admin/knowledge/reading-jobs/search — 异步搜索，立即返回 jobId */
export async function submitKnowledgeReadingSearch(
  body: API.KnowledgeSearchPreviewRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeReadingJobVO>('/admin/knowledge/reading-jobs/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  })
}

/** POST /admin/knowledge/ingest/batch-url — 多源合并为 1 篇 note（可传 jobId 复用搜索任务） */
export async function ingestKnowledgeBatchUrl(
  body: API.KnowledgeIngestBatchUrlRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeReadingJobVO>(
    '/admin/knowledge/ingest/batch-url',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      timeout: LONG_TIMEOUT,
      ...(options || {}),
    },
  )
}

/** GET /admin/knowledge/reading-jobs — 当前用户任务分页列表 */
export async function listKnowledgeReadingJobs(
  params?: API.KnowledgeReadingJobQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageKnowledgeReadingJobVO>(
    '/admin/knowledge/reading-jobs',
    {
      method: 'GET',
      params: { ...params },
      // 后端 V2 任务列表端点尚未部署：404 时静默，页面以无任务态呈现
      silent404: true,
      ...(options || {}),
    },
  )
}

/** GET /admin/knowledge/reading-jobs/{jobId} — 查询异步阅读任务进度与结果 */
export async function getKnowledgeReadingJob(
  jobId: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeReadingJobVO>(
    `/admin/knowledge/reading-jobs/${jobId}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  )
}
