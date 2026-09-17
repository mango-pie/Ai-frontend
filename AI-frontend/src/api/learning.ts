/**
 * V3 领域知识树 — API 服务层
 * 基路径: /admin/knowledge/learning
 */
import request from '@/request'
import type {
  LearningDomain,
  LearningTreeVO,
  LearningLeafVO,
  GateRequest,
  GateResponse,
  AttachRequest,
  AttachResponse,
  BatchSuggestItem,
  LearningReviewQuizVO,
} from './learning.types'

/** 接口统一前缀：知识树管理端路径 */
const BASE = '/admin/knowledge/learning'

/** GET /domains — 领域列表 */
export async function getDomains() {
  return request<API.BaseResponse<LearningDomain[]>>(`${BASE}/domains`, {
    method: 'GET',
  })
}

/** POST /domains — 创建领域 */
export async function createDomain(body: { name: string; sortOrder?: number }) {
  return request<API.BaseResponse<LearningDomain>>(`${BASE}/domains`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
}

/** PUT /domains/{id} — 更新领域 */
export async function updateDomain(
  id: number | string,
  body: { name?: string; sortOrder?: number },
) {
  return request<API.BaseResponse<LearningDomain>>(`${BASE}/domains/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
}

/** DELETE /domains/{id} — 删除领域（级联逻辑删枝与叶） */
export async function deleteDomain(id: number | string) {
  return request<API.BaseResponseBoolean>(`${BASE}/domains/${id}`, {
    method: 'DELETE',
  })
}

/** GET /domains/{domainId}/tree — 树快照 */
export async function getTree(domainId: number | string, includeLeaves = false) {
  return request<API.BaseResponse<LearningTreeVO>>(
    `${BASE}/domains/${domainId}/tree`,
    {
      method: 'GET',
      params: { includeLeaves },
    },
  )
}

/** POST /domains/{domainId}/branches — 建枝 */
export async function createBranch(
  domainId: number | string,
  body: { title: string; parentBranchId: number | string; sortOrder?: number },
) {
  return request<API.BaseResponse<{ id: number | string }>>(
    `${BASE}/domains/${domainId}/branches`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
    },
  )
}

/** PUT /branches/{id} — 改枝 */
export async function updateBranch(
  id: number | string,
  body: { title?: string; sortOrder?: number },
) {
  return request<API.BaseResponseBoolean>(`${BASE}/branches/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
}

/** DELETE /branches/{id} — 删空枝 */
export async function deleteBranch(id: number | string) {
  return request<API.BaseResponseBoolean>(`${BASE}/branches/${id}`, {
    method: 'DELETE',
  })
}

/** POST /branches/{sourceId}/merge — 合并枝 */
export async function mergeBranch(
  sourceId: number | string,
  body: { targetBranchId: number | string },
) {
  return request<API.BaseResponseBoolean>(`${BASE}/branches/${sourceId}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
}

/** POST /gate — AI 门闩 */
export async function postGate(body: GateRequest) {
  return request<API.BaseResponse<GateResponse>>(`${BASE}/gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
}

/** POST /leaves/attach — 挂叶 */
export async function attachLeaf(body: AttachRequest) {
  return request<API.BaseResponse<AttachResponse>>(`${BASE}/leaves/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
}

/** PUT /leaves/move — 移叶 */
export async function moveLeaf(body: {
  noteId: number | string
  targetBranchId: number | string
}) {
  return request<API.BaseResponseBoolean>(`${BASE}/leaves/move`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
}

/** DELETE /leaves/by-note/{noteId} — 取消挂载 */
export async function detachLeaf(noteId: number | string) {
  return request<API.BaseResponseBoolean>(`${BASE}/leaves/by-note/${noteId}`, {
    method: 'DELETE',
  })
}

/** GET /branches/{branchId}/leaves — 枝下笔记列表 */
export async function getLeaves(branchId: number | string) {
  return request<API.BaseResponse<LearningLeafVO[]>>(
    `${BASE}/branches/${branchId}/leaves`,
    { method: 'GET' },
  )
}

/** GET /domains/{domainId}/unattached-notes — 未挂树笔记 */
export async function getUnattachedNotes(
  domainId: number | string,
  pageNum = 1,
  pageSize = 20,
) {
  return request<API.BaseResponse<{ list: LearningLeafVO[]; total: number }>>(
    `${BASE}/domains/${domainId}/unattached-notes`,
    { method: 'GET', params: { pageNum, pageSize } },
  )
}

/** POST /leaves/batch-suggest — AI 批量挂枝建议 */
export async function batchSuggest(
  domainId: number | string,
  notes: { noteId: number | string; title: string; summary?: string }[],
) {
  return request<API.BaseResponse<{ suggestions: BatchSuggestItem[] }>>(
    `${BASE}/leaves/batch-suggest`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { domainId, notes },
    },
  )
}

/** GET /branches/{branchId}/review-quiz — 枝级复习自测（答案折叠） */
export async function getBranchReviewQuiz(branchId: number | string) {
  return request<API.BaseResponse<LearningReviewQuizVO>>(
    `${BASE}/branches/${branchId}/review-quiz`,
    { method: 'GET' },
  )
}

/** DELETE /material-cache — 强制刷新材料缓存（清 learning:material:*） */
export async function clearMaterialCache() {
  return request<API.BaseResponse<number>>(`${BASE}/material-cache`, {
    method: 'DELETE',
  })
}
