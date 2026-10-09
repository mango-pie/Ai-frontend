/**
 * 音乐房间运行时基础设施：网易云 API 地址解析、登录 cookie 存取与请求封装。
 * 同时兼容浏览器与 Tauri 桌面端两种运行环境（后者可绕过 CORS、直连本地服务）。
 */
// 部署时通过 VITE_NETEASE_API_BASE 指定网易云 API 地址（去掉末尾斜杠）
const configuredBase = (import.meta.env.VITE_NETEASE_API_BASE as string | undefined)?.replace(/\/$/, '')

// 登录 cookie 在 localStorage 中的键名
export const NETEASE_COOKIE_KEY = 'netease_music_cookie'

/** 是否运行在 Tauri 桌面壳内（由全局注入的内部对象判断） */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 网易云 API 基地址：显式配置 > Tauri 直连本地服务 > 浏览器走同源代理 */
export function getNeteaseApiBase(): string {
  if (configuredBase) return configuredBase
  if (isTauriRuntime()) return 'http://127.0.0.1:3000'
  return '/netease-api'
}

export function getNeteaseCookie(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(NETEASE_COOKIE_KEY) || ''
}

export function setNeteaseCookie(cookieStr: string) {
  if (!cookieStr || typeof localStorage === 'undefined') return
  localStorage.setItem(NETEASE_COOKIE_KEY, cookieStr)
}

export function clearNeteaseCookie() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(NETEASE_COOKIE_KEY)
}

/**
 * api-enhanced 从 query.cookie 读取登录态。浏览器禁止 fetch 设置 Cookie 头。
 */
export function withNeteaseCookie(path: string): string {
  const cookie = getNeteaseCookie()
  if (!cookie) return path
  const qIndex = path.indexOf('?')
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path
  const search = qIndex >= 0 ? path.slice(qIndex + 1) : ''
  const params = new URLSearchParams(search)
  if (!params.has('cookie')) params.set('cookie', cookie)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * Tauri 的 HTTP 插件可绕过 WebView CORS；普通网页继续使用浏览器 fetch。
 */
export async function musicRuntimeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  if (isTauriRuntime()) {
    const { fetch } = await import('@tauri-apps/plugin-http')
    return fetch(input, init)
  }
  return globalThis.fetch(input, init)
}

/** 网易云 API：cookie 走查询参数；Tauri 额外带 Cookie 头。 */
export async function neteaseFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${getNeteaseApiBase()}${withNeteaseCookie(path)}`
  const headers = new Headers(init?.headers || {})
  if (isTauriRuntime()) {
    const cookie = getNeteaseCookie()
    if (cookie && !headers.has('Cookie')) headers.set('Cookie', cookie)
  }
  return musicRuntimeFetch(url, { ...init, headers })
}
