/**
 * 学习统计 API — 对应后端 StudyStatsController，接口前缀 /study/stats
 * 提供今日与自定义时间区间两个维度的学习数据统计。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 查询区间统计 GET /study/stats/range — 按起止日期聚合学习时长/任务等指标 */
export async function getRangeStats(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getRangeStatsParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseStudyRangeStatsVO>('/study/stats/range', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 查询今日统计 GET /study/stats/today — 返回当天学习概览数据 */
export async function getTodayStats(options?: { [key: string]: any }) {
  return request<API.BaseResponseStudyTodayStatsVO>('/study/stats/today', {
    method: 'GET',
    ...(options || {}),
  })
}
