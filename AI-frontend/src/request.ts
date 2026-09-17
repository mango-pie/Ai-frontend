/**
 * 全局 HTTP 客户端（Axios）
 * - baseURL 指向后端 API 根路径，withCredentials 携带 Cookie（Session 登录）
 * - transformResponse：在 JSON.parse 前将超出 JS 安全整数范围的大数字转为字符串，
 *   避免雪花 ID（18位）精度丢失
 * - 响应拦截器：当后端返回 code === 40100（未登录）时跳转登录页
 */
import axios from 'axios'
import { message } from 'ant-design-vue'
import { parseSafeJson } from '@/utils/safeJson'
import { capabilitySnapshot, snapshotEnabled } from '@/utils/capabilitySnapshot'
import { decide40100Action, moduleForPath, moduleUnavailableLocation } from '@/utils/moduleGate'

/**
 * 将 JSON 字符串中超过 15 位的纯整数字面量替换为字符串形式，
 * 防止 JSON.parse 时雪花 ID 等大整数精度丢失
 */
function parseSafeJsonForAxios(raw: string): unknown {
  return parseSafeJson(raw)
}

// 全局唯一的 axios 实例：60s 超时、携带 Cookie、响应体用安全 JSON 解析
const myAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 60000,
  withCredentials: true,
  transformResponse: [
    (data) => {
      if (typeof data === 'string') {
        try {
          return parseSafeJsonForAxios(data)
        } catch {
          return data
        }
      }
      return data
    },
  ],
})

myAxios.interceptors.request.use(
  function (config) {
    return config
  },
  function (error) {
    return Promise.reject(error)
  },
)

myAxios.interceptors.response.use(
  function (response) {
    const { data } = response
    // 40100 = 未登录：结合能力快照判定应跳“模块不可用”还是“登录页”
    // （模块关闭导致接口未注册时也可能是 40100，需先区分场景再跳转）
    if (data.code === 40100) {
      const pathname = window.location.pathname
      const responseUrl = String(response.request?.responseURL || '')
      const action = decide40100Action({
        pathname,
        responseUrl,
        loaded: capabilitySnapshot.loaded,
        enabled: snapshotEnabled,
      })
      if (action === 'unavailable') {
        if (!pathname.includes('/module-unavailable')) {
          window.location.replace(moduleUnavailableLocation(pathname, moduleForPath(pathname)))
        }
      } else if (action === 'login') {
        if (!responseUrl.includes('user/get/login') && !pathname.includes('/user/login')) {
          message.warning('请先登录')
          window.location.href = `/user/login?redirect=${window.location.href}`
        }
      }
    }
    // 40301 = 系统维护中（只读模式）：提示后正常放行响应，由页面自行处理
    if (data.code === 40301) {
      message.warning(data.message || '系统维护中，暂不可操作')
    }
    return response
  },
  function (error) {
    // 模块关闭后其 Controller 不注册，API 直接 404：给友好提示。
    // 跳过能力探测等首屏探测接口；调用方可传 silent404 对可选云端能力静默降级。
    const url = String(error.config?.url || error.response?.config?.url || '')
    const isProbe = url.includes('/app/modules')
    const silent404 = Boolean((error.config as { silent404?: boolean } | undefined)?.silent404)
    if (error.response?.status === 404 && !isProbe && !silent404) {
      message.warning('该功能未启用或不存在')
    }
    return Promise.reject(error)
  },
)

export default myAxios
