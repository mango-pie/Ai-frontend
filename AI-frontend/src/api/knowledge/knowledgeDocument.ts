/**
 * 知识库文档 API — 接口前缀 /kb
 * 覆盖知识库文档的上传（multipart）、解析、分块查看、下载与删除等全流程。
 */
import request from '@/request'
import type { AxiosProgressEvent } from 'axios'

/** GET /kb/knowledge-bases/{kbId}/documents — 分页查询知识库内文档 */
export async function listKnowledgeDocuments(
  kbId: number | string,
  params?: API.KnowledgeDocumentQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageKnowledgeDocumentVO>(`/kb/knowledge-bases/${kbId}/documents`, {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** POST /kb/knowledge-bases/{kbId}/documents — multipart field: file — 上传文档并支持进度回调 */
export async function uploadKnowledgeDocument(
  kbId: number | string,
  file: File,
  onUploadProgress?: (e: AxiosProgressEvent) => void,
  options?: { [key: string]: unknown },
) {
  const form = new FormData()
  form.append('file', file)
  return request<API.BaseResponseKnowledgeDocumentVO>(`/kb/knowledge-bases/${kbId}/documents`, {
    method: 'POST',
    data: form,
    onUploadProgress,
    ...(options || {}),
  })
}

/** GET /kb/documents/{id} — 获取文档详情（含解析/向量化状态） */
export async function getKnowledgeDocument(id: number | string, options?: { [key: string]: unknown }) {
  return request<API.BaseResponseKnowledgeDocumentVO>(`/kb/documents/${id}`, {
    method: 'GET',
    ...(options || {}),
  })
}

/** DELETE /kb/documents/{id} — 删除文档 */
export async function deleteKnowledgeDocument(
  id: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseBoolean>(`/kb/documents/${id}`, {
    method: 'DELETE',
    ...(options || {}),
  })
}

/** GET /kb/documents/{id}/download-url — 获取文档临时下载链接 */
export async function getKnowledgeDocumentDownloadUrl(
  id: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeDownloadUrlVO>(`/kb/documents/${id}/download-url`, {
    method: 'GET',
    ...(options || {}),
  })
}

/** POST /kb/documents/{id}/parse — 触发文档解析（切块 → 向量化入库） */
export async function parseKnowledgeDocument(
  id: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeDocumentVO>(`/kb/documents/${id}/parse`, {
    method: 'POST',
    ...(options || {}),
  })
}

/** GET /kb/documents/{id}/chunks — 分页查看文档切块结果（默认每页 20 条） */
export async function listKnowledgeDocumentChunks(
  id: number | string,
  params?: { pageNum?: number; pageSize?: number },
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseListKnowledgeChunkVO>(`/kb/documents/${id}/chunks`, {
    method: 'GET',
    params: {
      pageNum: params?.pageNum ?? 1,
      pageSize: params?.pageSize ?? 20,
    },
    ...(options || {}),
  })
}
