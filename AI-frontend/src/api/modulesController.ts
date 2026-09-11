import type { AxiosRequestConfig } from 'axios'
import request from '@/request'

/** GET /app/modules — 业务模块开关（无需登录，供菜单/路由门控） */
export function getAppModules(options?: AxiosRequestConfig) {
  return request<API.BaseResponseModuleCapabilitiesVO>('/app/modules', {
    method: 'GET',
    ...options,
  })
}
