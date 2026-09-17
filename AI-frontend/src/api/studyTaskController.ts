/**
 * 学习任务 API — 对应后端 StudyTaskController，接口前缀 /study/task
 * 管理学习任务的增删改查、排序、跨清单移动、完成状态切换及博客草稿同步。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 新增任务 POST /study/task/add — 返回任务 id */
export async function addTask(body: API.StudyTaskAddRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseLong>('/study/task/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 删除任务 POST /study/task/delete — 按 id 删除 */
export async function deleteTask(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/study/task/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取任务详情 GET /study/task/get/vo */
export async function getTaskVo(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getTaskVOParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseStudyTaskVO>('/study/task/get/vo', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 分页查询任务视图 GET /study/task/list/view — 展开嵌套查询对象到平铺参数 */
export async function queryTaskView(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.queryTaskViewParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageStudyTaskVO>('/study/task/list/view', {
    method: 'GET',
    params: {
      ...params,
      request: undefined,
      ...params['request'],
    },
    ...(options || {}),
  })
}

/** 跨清单移动任务 POST /study/task/move — 变更所属分组 */
export async function moveTasks(body: API.StudyTaskMoveRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/study/task/move', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 任务排序 POST /study/task/sort — 保存拖拽后的顺序 */
export async function sortTasks(body: API.StudyTaskSortRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/study/task/sort', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 同步博客草稿到学习任务 POST /study/task/sync/blog/drafts — 返回同步结果摘要 */
export async function syncBlogDrafts(options?: { [key: string]: any }) {
  return request<API.BaseResponseStudyBlogSyncVO>('/study/task/sync/blog/drafts', {
    method: 'POST',
    ...(options || {}),
  })
}

/** 切换任务完成状态 POST /study/task/toggle */
export async function toggleTask(
  body: API.StudyTaskToggleRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/study/task/toggle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新任务 POST /study/task/update */
export async function updateTask(
  body: API.StudyTaskUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/study/task/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
