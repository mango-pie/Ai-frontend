/**
 * 学习清单分组 API — 对应后端 StudyListController，接口前缀 /study/list
 * 管理学习任务的清单分组（列表）及其排序。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 新增清单分组 POST /study/list/add — 返回分组 id */
export async function addList(body: API.StudyListAddRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseLong>('/study/list/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取全部分组 GET /study/list/all */
export async function getAllLists(options?: { [key: string]: any }) {
  return request<API.BaseResponseListStudyListVO>('/study/list/all', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 删除分组 POST /study/list/delete — 按 id 删除 */
export async function deleteList(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/study/list/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 分组排序 POST /study/list/sort — 保存拖拽后的顺序 */
export async function sortLists(body: API.StudyListSortRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/study/list/sort', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新分组 POST /study/list/update */
export async function updateList(
  body: API.StudyListUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/study/list/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
