/**
 * 业务域入口门闸：路径 ↔ GET /app/modules 的 module key。
 * 纯函数，不依赖 Pinia / Axios，供导航过滤、路由守卫、40100 拦截器共用。
 */

/** 能力判断入参（避免直接依赖 store，防循环引用） */
export interface CapabilityGate {
  loaded: boolean
  enabled: (name: string) => boolean
}

/** 模块是否应隐藏：仅在能力已加载且明确关闭时隐藏（未加载时不隐藏，避免首屏误伤） */
export function isModuleHidden(requireModule: string | undefined, caps?: CapabilityGate): boolean {
  if (!requireModule || !caps) return false
  return caps.loaded && !caps.enabled(requireModule)
}

/** 路径前缀 → 模块 key（最长前缀优先） */
export const PATH_REQUIRE_MODULE: Array<{ prefix: string; requireModule: string }> = [
  { prefix: '/admin/blogManage', requireModule: 'blog' },
  { prefix: '/admin/knowledge', requireModule: 'knowledge' },
  { prefix: '/admin/ops', requireModule: 'ops' },
  { prefix: '/administrator/study', requireModule: 'study' },
  { prefix: '/blog', requireModule: 'blog' },
  { prefix: '/category/', requireModule: 'blog' },
  { prefix: '/tag/', requireModule: 'blog' },
  { prefix: '/diary', requireModule: 'diary' },
  { prefix: '/worklog', requireModule: 'worklog' },
  { prefix: '/knowledge', requireModule: 'knowledge' },
]

const MODULE_UNAVAILABLE_PATH = '/module-unavailable'

export function isModuleUnavailablePath(pathname: string): boolean {
  return pathname === MODULE_UNAVAILABLE_PATH || pathname.startsWith(`${MODULE_UNAVAILABLE_PATH}/`)
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (prefix.endsWith('/')) return path.startsWith(prefix)
  return path === prefix || path.startsWith(`${prefix}/`)
}

/** 根据当前 URL 解析依赖的业务模块；平台常驻路径返回 undefined */
export function moduleForPath(pathname: string): string | undefined {
  const path = (pathname.split('?')[0] || pathname).trim() || '/'
  let matched: { prefix: string; requireModule: string } | undefined
  for (const item of PATH_REQUIRE_MODULE) {
    if (!pathMatchesPrefix(path, item.prefix)) continue
    if (!matched || item.prefix.length > matched.prefix.length) {
      matched = item
    }
  }
  return matched?.requireModule
}

export function isGatedEntryVisible(
  requireModule: string | undefined,
  caps?: CapabilityGate,
): boolean {
  return !isModuleHidden(requireModule, caps)
}

export function filterGatedEntries<T extends object>(
  items: readonly T[],
  caps?: CapabilityGate,
): T[] {
  return items.filter((item) => {
    const rec = item as T & { requireModule?: string; path?: string }
    const requireModule = rec.requireModule ?? (rec.path ? moduleForPath(rec.path) : undefined)
    return isGatedEntryVisible(requireModule, caps)
  })
}

export type UnauthorizedAction = 'login' | 'unavailable' | 'ignore'

/**
 * 40100 未登录：已关模块优先于登录跳转。
 * - 登录探测 / 已在登录页：忽略
 * - 目标路径所属模块已关（或能力尚未加载完）：不可抢跳登录
 */
export function decide40100Action(opts: {
  pathname: string
  responseUrl?: string
  loaded: boolean
  enabled: (name: string) => boolean
}): UnauthorizedAction {
  const pathname = (opts.pathname.split('?')[0] || opts.pathname).trim() || '/'
  const responseUrl = opts.responseUrl ?? ''
  if (responseUrl.includes('user/get/login')) return 'ignore'
  if (responseUrl.includes('/app/modules')) return 'ignore'
  if (pathname.includes('/user/login')) return 'ignore'
  if (isModuleUnavailablePath(pathname)) return 'ignore'

  const requireModule = moduleForPath(pathname)
  if (requireModule) {
    if (!opts.loaded) return 'ignore'
    if (!opts.enabled(requireModule)) return 'unavailable'
  }
  return 'login'
}

export function moduleUnavailableLocation(fromPath: string, requireModule?: string) {
  const params = new URLSearchParams()
  if (fromPath) params.set('from', fromPath)
  if (requireModule) params.set('module', requireModule)
  const q = params.toString()
  return q ? `${MODULE_UNAVAILABLE_PATH}?${q}` : MODULE_UNAVAILABLE_PATH
}
