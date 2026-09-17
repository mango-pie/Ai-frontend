/**
 * 知识库管理 API — 接口前缀 /kb/knowledge-bases
 * 提供知识库的创建与增删改查，是知识库模块的顶层资源。
 */
import request from '@/request'

/** GET /kb/knowledge-bases — 分页查询知识库列表 */
export async function listKnowledgeBases(
  params?: API.KnowledgeBaseQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageKnowledgeBaseVO>('/kb/knowledge-bases', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** POST /kb/knowledge-bases — 创建知识库 */
export async function createKnowledgeBase(
  body: API.KnowledgeBaseCreateRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeBaseVO>('/kb/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  })
}

/** GET /kb/knowledge-bases/{id} — 获取知识库详情 */
export async function getKnowledgeBase(id: number | string, options?: { [key: string]: unknown }) {
  return request<API.BaseResponseKnowledgeBaseVO>(`/kb/knowledge-bases/${id}`, {
    method: 'GET',
    ...(options || {}),
  })
}

/** PUT /kb/knowledge-bases/{id} — 更新知识库信息 */
export async function updateKnowledgeBase(
  id: number | string,
  body: API.KnowledgeBaseUpdateRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeBaseVO>(`/kb/knowledge-bases/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  })
}

/** DELETE /kb/knowledge-bases/{id} — 删除知识库 */
export async function deleteKnowledgeBase(id: number | string, options?: { [key: string]: unknown }) {
  return request<API.BaseResponseBoolean>(`/kb/knowledge-bases/${id}`, {
    method: 'DELETE',
    ...(options || {}),
  })
}
