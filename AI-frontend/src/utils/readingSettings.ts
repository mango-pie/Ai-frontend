/**
 * 精读工作台 UX 设置（站点设置 reading 分组）：发布默认落草稿、发布后是否询问打开编辑器、
 * 重新蒸馏是否需二次确认。读取后端配置并做会话级缓存，失败一律回落默认值。
 */
import { getSiteSettingValues } from '@/api/siteSettings'

export type ReadingUxSettings = {
  /** 发布默认草稿（status=0） */
  defaultAsDraft: boolean
  /** 发布成功后是否弹「打开编辑器」 */
  askOpenEditor: boolean
  /** 重新蒸馏是否需二次确认 */
  redistillConfirmRequired: boolean
}

const DEFAULTS: ReadingUxSettings = {
  defaultAsDraft: true,
  askOpenEditor: true,
  redistillConfirmRequired: true,
}

let cache: ReadingUxSettings | null = null
let inflight: Promise<ReadingUxSettings> | null = null

/** 宽容解析布尔：兼容后端回传的 "true"/"1" 等字符串，非法值回落默认 */
function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value == null) return fallback
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return fallback
}

/** 读取精读工作台 UX 设置（会话内缓存） */
export async function loadReadingUxSettings(force = false): Promise<ReadingUxSettings> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    try {
      const res = await getSiteSettingValues('reading')
      if (res.data.code !== 0 || !res.data.data?.values) {
        cache = { ...DEFAULTS }
        return cache
      }
      const values = res.data.data.values
      cache = {
        defaultAsDraft: toBool(values['publish.default_as_draft'], DEFAULTS.defaultAsDraft),
        askOpenEditor: toBool(values['publish.ask_open_editor'], DEFAULTS.askOpenEditor),
        redistillConfirmRequired: toBool(
          values['redistill.confirm_required'],
          DEFAULTS.redistillConfirmRequired,
        ),
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
export function clearReadingUxSettingsCache() {
  cache = null
  inflight = null
}
