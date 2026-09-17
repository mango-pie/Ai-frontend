/**
 * 学习工作台 API — 对应后端 StudyWorkspaceController，接口前缀 /study/workspace
 * 用于初始化/汇总当前用户的学习工作台视图数据。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 初始化学习工作台 GET /study/workspace/init — 按用户与日期聚合工作台数据 */
export async function initWorkspace(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.initWorkspaceParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseStudyWorkspaceVO>('/study/workspace/init', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}
