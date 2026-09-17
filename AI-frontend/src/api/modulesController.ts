/**
 * 应用模块能力 API — 对应后端 AppModulesController，接口前缀 /app
 * 负责查询后端各业务模块的启用/可见状态，供前端菜单渲染与路由门控使用。
 */
import type { AxiosRequestConfig } from 'axios'
import request from '@/request'

/** GET /app/modules — 业务模块开关（无需登录，供菜单/路由门控） */
export function getAppModules(options?: AxiosRequestConfig) {
  return request<API.BaseResponseModuleCapabilitiesVO>('/app/modules', {
    method: 'GET',
    ...options,
  })
}
