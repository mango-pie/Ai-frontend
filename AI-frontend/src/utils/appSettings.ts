/**
 * 全站 UX 设置（站点设置 app 分组）：控制代码生成 / 部署入口在前端的可见性与默认行为。
 * 读取后端 /site-settings 并做会话级缓存；任何失败都回落 DEFAULTS，保证功能不被设置接口拖垮。
 */
import { getSiteSettingValues } from '@/api/siteSettings'

/** app 分组设置的前端视图（字段与后端 key 一一映射后转成强类型） */
export type AppUxSettings = {
  codegenEnabled: boolean
  defaultCodeGenType: string
  deployEnabled: boolean
  publicHostDisplay: string
}

const DEFAULTS: AppUxSettings = {
  codegenEnabled: true,
  defaultCodeGenType: 'html',
  deployEnabled: true,
  publicHostDisplay: '',
}

let cache: AppUxSettings | null = null
let inflight: Promise<AppUxSettings> | null = null

/** 宽容解析布尔：后端可能回传 "true"/"1" 等字符串，非法值回落默认 */
function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value == null) return fallback
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return fallback
}

/**
 * 读取 app 分组设置；会话内缓存，并发调用共享同一个在途请求。
 * @param force 为 true 时绕过缓存强制刷新
 * @returns 解析后的设置；接口失败或响应异常时返回默认值
 */
export async function loadAppSettings(force = false): Promise<AppUxSettings> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    try {
      const res = await getSiteSettingValues('app')
      if (res.data.code !== 0 || !res.data.data?.values) {
        cache = { ...DEFAULTS }
        return cache
      }
      const values = res.data.data.values
      const type = String(values['codegen.default_type'] ?? DEFAULTS.defaultCodeGenType).trim()
      cache = {
        codegenEnabled: toBool(values['codegen.enabled'], DEFAULTS.codegenEnabled),
        defaultCodeGenType: type || DEFAULTS.defaultCodeGenType,
        deployEnabled: toBool(values['deploy.enabled'], DEFAULTS.deployEnabled),
        publicHostDisplay: String(values['deploy.public_host_display'] ?? '').trim(),
      }
      return cache
    } catch {
      cache = { ...DEFAULTS }
      return cache
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** 清空缓存与在途请求（如管理端改完配置后），下次读取会重新拉取 */
export function clearAppSettingsCache() {
  cache = null
  inflight = null
}

/** 部署成功 URL：优先设置前缀，否则回落 env */
export function resolveDeployBaseUrl(settings: AppUxSettings, envFallback?: string): string {
  const host = settings.publicHostDisplay?.trim()
  if (host) return host.replace(/\/$/, '')
  return (envFallback || '').replace(/\/$/, '')
}
