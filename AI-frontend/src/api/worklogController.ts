/**
 * 工作日志 API — 对应后端 WorkLogController，接口前缀 /worklog
 * 所有请求 silent404：模块未启用（Controller 未注册）时静默降级，不弹全局提示
 */
import request from '@/request'

/**
 * 工作日志条目（对应后端 WorkLog 记录）
 * 兼容新旧两套字段命名：读取时优先取新字段，缺失则回退旧字段
 */
export type WorkLogApiEntry = {
  id?: number
  userId?: number
  // 日期双命名：新接口返回 workDate，旧接口/旧数据返回 date
  workDate?: string
  date?: string
  title?: string
  done?: string
  problem?: string
  summary?: string
  plan?: string
  tags?: string[]
  // 时间双命名：createdTime/updatedTime 为字符串时间（旧），createdAt/updatedAt 为毫秒时间戳（新）
  createdTime?: string
  updatedTime?: string
  createdAt?: number
  updatedAt?: number
}

/** GET /worklog/list — 拉取最近 limit 条日志 */
export async function listWorkLogs(limit = 200) {
  return request<{ code?: number; data?: WorkLogApiEntry[]; message?: string }>('/worklog/list', {
    method: 'GET',
    params: { limit },
    silent404: true,
  })
}

/** GET /worklog/by-date — 按日期查询单条日志 */
export async function getWorkLogByDate(date: string) {
  return request<{ code?: number; data?: WorkLogApiEntry | null; message?: string }>('/worklog/by-date', {
    method: 'GET',
    params: { date },
    silent404: true,
  })
}

/** POST /worklog/save — 保存指定日期的日志（不存在则新增） */
export async function saveWorkLog(body: {
  workDate: string
  title?: string
  done?: string
  problem?: string
  summary?: string
  plan?: string
  tags?: string[]
}) {
  return request<{ code?: number; data?: number; message?: string }>('/worklog/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    silent404: true,
  })
}

/** POST /worklog/delete — 按日期删除单条日志 */
export async function deleteWorkLog(date: string) {
  return request<{ code?: number; data?: boolean; message?: string }>('/worklog/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { date },
    silent404: true,
  })
}

/** POST /worklog/import — 批量导入日志，overwrite 控制是否覆盖同日期已有记录 */
export async function importWorkLogs(entries: Array<{
  workDate: string
  title?: string
  done?: string
  problem?: string
  summary?: string
  plan?: string
  tags?: string[]
}>, overwrite = true) {
  return request<{ code?: number; data?: { imported?: number; skipped?: number }; message?: string }>('/worklog/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { overwrite, entries },
    silent404: true,
  })
}
