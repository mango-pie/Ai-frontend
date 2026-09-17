/**
 * 运维可观测 API — 接口前缀 /admin/ops
 * 提供调用量统计（汇总/月度）、调用日志、审计日志、业务统计与访问日志的分页查询，
 * 供运维中心各看板使用。
 */
import request from '@/request'

/** GET /admin/ops/usage/summary — 用量汇总（总调用、Token 消耗等） */
export async function getOpsUsageSummary(
  params?: API.OpsUsageSummaryQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseOpsUsageSummaryVO>('/admin/ops/usage/summary', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/ops/usage/monthly — 月度视图（按天序列 + 场景/模型聚合） */
export async function getOpsUsageMonthly(
  params?: API.OpsUsageMonthlyQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseOpsUsageMonthlyVO>('/admin/ops/usage/monthly', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/ops/usage/logs — 分页查询 AI 调用明细日志 */
export async function pageOpsUsageLogs(
  params?: API.OpsUsageLogQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageOpsUsageLogVO>('/admin/ops/usage/logs', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/ops/audit — 分页查询审计日志（敏感操作留痕） */
export async function pageOpsAuditLogs(
  params?: API.OpsAuditLogQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageOpsAuditLogVO>('/admin/ops/audit', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/ops/stats/overview — 业务统计总览（各业务线核心指标） */
export async function getOpsBizStatsOverview(
  params?: API.OpsBizStatsQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseOpsBizStatsOverviewVO>('/admin/ops/stats/overview', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/ops/stats/series — 业务统计时间序列（趋势图数据点） */
export async function getOpsBizStatsSeries(
  params: API.OpsBizStatsSeriesQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseListOpsBizStatsPointVO>('/admin/ops/stats/series', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/ops/access-logs — 分页查询 HTTP 访问日志 */
export async function pageOpsAccessLogs(
  params?: API.OpsAccessLogQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageOpsAccessLogVO>('/admin/ops/access-logs', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}
