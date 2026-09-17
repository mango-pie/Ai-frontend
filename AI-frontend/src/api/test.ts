/**
 * 测试连通性 API — 对应后端 TestController，接口前缀 /test
 * 仅提供一个探测接口，常用于验证前后端链路是否可用。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 连通性测试 GET /test/ — 返回后端字符串，验证接口链路 */
export async function tests(options?: { [key: string]: any }) {
  return request<API.BaseResponseString>('/test/', {
    method: 'GET',
    ...(options || {}),
  })
}
