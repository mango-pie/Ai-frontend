/**
 * 专注学习会话 API — 对应后端 StudyFocusController，接口前缀 /study/focus
 * 管理一次专注（番茄钟）会话的完整生命周期：开始、暂停、恢复、完成、放弃及分页查询。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 放弃会话 POST /study/focus/abandon — 中途终止，本次不计入有效专注 */
export async function abandonFocus(
  body: API.StudyFocusIdRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseStudyFocusSessionVO>('/study/focus/abandon', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取进行中的会话 GET /study/focus/active — 刷新页面后恢复计时状态 */
export async function getActiveFocus(options?: { [key: string]: any }) {
  return request<API.BaseResponseStudyFocusSessionVO>('/study/focus/active', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 完成会话 POST /study/focus/complete — 结算并计入学习统计 */
export async function completeFocus(
  body: API.StudyFocusIdRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseStudyFocusSessionVO>('/study/focus/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 分页查询会话历史 GET /study/focus/list/page — 默认第 1 页、每页 20 条 */
export async function listFocusPage(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listFocusPageParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageStudyFocusSessionVO>('/study/focus/list/page', {
    method: 'GET',
    params: {
      // pageNum has a default value: 1
      pageNum: '1',
      // pageSize has a default value: 20
      pageSize: '20',

      ...params,
    },
    ...(options || {}),
  })
}

/** 暂停会话 POST /study/focus/pause — 记录暂停时点，便于精确计时 */
export async function pauseFocus(body: API.StudyFocusIdRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseStudyFocusSessionVO>('/study/focus/pause', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 恢复会话 POST /study/focus/resume — 从暂停中继续 */
export async function resumeFocus(body: API.StudyFocusIdRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseStudyFocusSessionVO>('/study/focus/resume', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 开始专注 POST /study/focus/start — 关联任务并创建会话 */
export async function startFocus(
  body: API.StudyFocusStartRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseStudyFocusSessionVO>('/study/focus/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
