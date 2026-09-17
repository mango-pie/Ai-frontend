/**
 * 学习习惯打卡 API — 对应后端 StudyHabitController，接口前缀 /study/habit
 * 管理学习习惯的定义、每日打卡/取消打卡与打卡日历查询。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 新增习惯 POST /study/habit/add — 返回习惯 id */
export async function addHabit(body: API.StudyHabitAddRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseLong>('/study/habit/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 打卡 POST /study/habit/check — 记录当日完成 */
export async function checkHabit(
  body: API.StudyHabitCheckRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/study/habit/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 查询打卡日历 GET /study/habit/check/calendar — 返回已打卡日期字符串列表 */
export async function getCheckCalendar(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getCheckCalendarParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseListString>('/study/habit/check/calendar', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 删除习惯 POST /study/habit/delete — 按 id 删除 */
export async function deleteHabit(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/study/habit/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取全部习惯 GET /study/habit/list/all */
export async function listAllHabits(options?: { [key: string]: any }) {
  return request<API.BaseResponseListStudyHabitVO>('/study/habit/list/all', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 取消打卡 POST /study/habit/uncheck — 撤销当日记录 */
export async function uncheckHabit(
  body: API.StudyHabitCheckRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/study/habit/uncheck', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新习惯 POST /study/habit/update */
export async function updateHabit(
  body: API.StudyHabitUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/study/habit/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
