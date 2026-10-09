/**
 * 日记模块 UX 设置（站点设置 diary 分组）：新建日记默认是否私密、导出入口是否开放、
 * 列表分页默认值。读取后端配置并做会话级缓存，失败一律回落默认值。
 */
import { getSiteSettingValues } from '@/api/siteSettings'

/** diary 分组设置的前端视图（后端 key 映射为强类型字段） */
export type DiaryUxSettings = {
  defaultPrivate: boolean
  exportEnabled: boolean
  pageSizeDefault: number
}

const DEFAULTS: DiaryUxSettings = {
  defaultPrivate: true,
  exportEnabled: false,
  pageSizeDefault: 20,
}

let cache: DiaryUxSettings | null = null
let inflight: Promise<DiaryUxSettings> | null = null

/** 宽容解析布尔：兼容后端回传的 "true"/"1" 等字符串，非法值回落默认 */
function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value == null) return fallback
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return fallback
}

/** 宽容解析整数：非有限数回落默认，取整不四舍五入 */
function toInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/**
 * 读取 diary 分组设置；会话内缓存，并发调用共享同一个在途请求。
 * @param force 为 true 时绕过缓存强制刷新
 * @returns 解析后的设置；接口失败或响应异常时返回默认值
 */
export async function loadDiarySettings(force = false): Promise<DiaryUxSettings> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    try {
      const res = await getSiteSettingValues('diary')
      if (res.data.code !== 0 || !res.data.data?.values) {
        cache = { ...DEFAULTS }
        return cache
      }
      const values = res.data.data.values
      cache = {
        defaultPrivate: toBool(values['privacy.default_private'], DEFAULTS.defaultPrivate),
        exportEnabled: toBool(values['export.enabled'], DEFAULTS.exportEnabled),
        pageSizeDefault: toInt(values['list.page_size_default'], DEFAULTS.pageSizeDefault),
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
export function clearDiarySettingsCache() {
  cache = null
  inflight = null
}

/** 私密→草稿(0)，否则完成(1) */
export function diaryDefaultStatus(settings: DiaryUxSettings): number {
  return settings.defaultPrivate ? 0 : 1
}
