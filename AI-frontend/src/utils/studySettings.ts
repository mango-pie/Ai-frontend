/**
 * 学习模块 UX 设置（站点设置 study 分组）：专注默认时长 / 休息时长、习惯提醒默认开关、
 * 统计默认时间窗、是否展示清单。读取后端配置并做会话级缓存，失败一律回落默认值。
 */
import { getSiteSettingValues } from '@/api/siteSettings'

/** study 分组设置的前端视图（后端 key 映射为强类型字段） */
export type StudyUxSettings = {
  focusDefaultMinutes: number
  focusBreakMinutes: number
  habitReminderDefault: boolean
  statsDefaultRangeDays: number
  showChecklist: boolean
}

const DEFAULTS: StudyUxSettings = {
  focusDefaultMinutes: 25,
  focusBreakMinutes: 5,
  habitReminderDefault: true,
  statsDefaultRangeDays: 7,
  showChecklist: true,
}

let cache: StudyUxSettings | null = null
let inflight: Promise<StudyUxSettings> | null = null

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
 * 读取 study 分组设置；会话内缓存，并发调用共享同一个在途请求。
 * @param force 为 true 时绕过缓存强制刷新
 * @returns 解析后的设置；接口失败或响应异常时返回默认值
 */
export async function loadStudySettings(force = false): Promise<StudyUxSettings> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    try {
      const res = await getSiteSettingValues('study')
      if (res.data.code !== 0 || !res.data.data?.values) {
        cache = { ...DEFAULTS }
        return cache
      }
      const values = res.data.data.values
      cache = {
        focusDefaultMinutes: toInt(values['focus.default_minutes'], DEFAULTS.focusDefaultMinutes),
        focusBreakMinutes: toInt(values['focus.break_minutes'], DEFAULTS.focusBreakMinutes),
        habitReminderDefault: toBool(
          values['habit.reminder_enabled_default'],
          DEFAULTS.habitReminderDefault,
        ),
        statsDefaultRangeDays: toInt(
          values['stats.default_range_days'],
          DEFAULTS.statsDefaultRangeDays,
        ),
        showChecklist: toBool(values['workspace.show_checklist'], DEFAULTS.showChecklist),
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
export function clearStudySettingsCache() {
  cache = null
  inflight = null
}

/** 专注预设：默认时长 + 休息时长 + 常用 45 */
export function buildFocusPresets(settings: StudyUxSettings): number[] {
  const set = new Set<number>([
    settings.focusDefaultMinutes,
    settings.focusBreakMinutes,
    45,
  ].filter((n) => n > 0))
  return Array.from(set).sort((a, b) => a - b)
}
