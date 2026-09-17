/**
 * 学习清单 API — 对应后端 StudyChecklistController，接口前缀 /study/checklist
 * 管理任务下的检查项（子清单）增删改查。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 新增清单项 POST /study/checklist/add — 返回清单项 id */
export async function addChecklist(
  body: API.StudyChecklistAddRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseLong>('/study/checklist/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 删除清单项 POST /study/checklist/delete — 按 id 删除 */
export async function deleteChecklist(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/study/checklist/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 查询任务下的清单项列表 GET /study/checklist/list — 按 taskId 过滤 */
export async function listChecklist(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listChecklistParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseListStudyTaskChecklistVO>('/study/checklist/list', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 更新清单项 POST /study/checklist/update — 如勾选完成、改文案 */
export async function updateChecklist(
  body: API.StudyChecklistUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/study/checklist/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
