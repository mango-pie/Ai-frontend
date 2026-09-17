/**
 * 日记 API — 对应后端 DiaryEntryController，接口前缀 /diary
 * 提供日记的保存、删除、按日期/月份查询、分页检索及上一篇/下一篇导航。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 删除日记 POST /diary/delete — 按 id 批量/单个删除 */
export async function deleteDiaryEntry(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/diary/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 按日期查询日记 GET /diary/get/by-date — 每日一篇 */
export async function getDiaryByDate(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getDiaryByDateParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseDiaryEntryVO>('/diary/get/by-date', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 按 id 获取日记详情 GET /diary/get/vo */
export async function getDiaryEntryVo(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getDiaryEntryVOParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseDiaryEntryVO>('/diary/get/vo', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 查询某月日记列表 GET /diary/list/month — 供日历视图标记有日记的日期 */
export async function listDiaryByMonth(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listDiaryByMonthParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseListDiaryEntryMonthItemVO>('/diary/list/month', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 分页检索日记 POST /diary/list/page — 支持关键词等条件查询 */
export async function queryDiaryPage(
  body: API.DiaryEntryQueryRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageDiaryEntryVO>('/diary/list/page', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 查询上一篇/下一篇日记 GET /diary/prev-next — 用于日记详情页导航 */
export async function getDiaryPrevNext(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getDiaryPrevNextParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseDiaryEntryPrevNextVO>('/diary/prev-next', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 保存日记 POST /diary/save — 新增或更新，返回日记 id */
export async function saveDiaryEntry(
  body: API.DiaryEntrySaveRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseLong>('/diary/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
