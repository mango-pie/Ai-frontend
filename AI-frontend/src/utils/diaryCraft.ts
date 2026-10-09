/**
 * 手帐/日记页的装饰素材与小工具：情绪与色调、时段文案、季节短语、
 * CSS 动效重放、连续打卡天数计算等，供日记首页与编辑页共同使用。
 */
import type { HomeTheme } from '@/composables/useHomeTheme'
import { themeByHour } from '@/composables/useHomeTheme'

/** 情绪 → 能量刻度（0–100），用于换算点亮的圆点数 */
export const MOOD_LEVEL: Record<string, number> = {
  happy: 72,
  calm: 40,
  tired: 22,
  sad: 18,
  excited: 88,
}

export const MOOD_HEX: Record<string, string> = {
  happy: '#ffcf6e',
  calm: '#5fc4a5',
  tired: '#6aaee8',
  sad: '#9b8ce8',
  excited: '#f490ad',
}

export const DIARY_PERIOD: Record<HomeTheme, { name: string; hint: string; quote: string }> = {
  morning: { name: '晨光', hint: '薄雾与樱粉', quote: '清晨的纸页还带着一点凉意。' },
  noon: { name: '午间', hint: '阳光与薄荷', quote: '光线最亮的时候，适合写短短几句。' },
  dusk: { name: '暮色', hint: '橘霞与藕紫', quote: '黄昏把颜色揉进火漆里。' },
  night: { name: '星夜', hint: '靛蓝与星点', quote: '夜里的字，只写给自己看。' },
}

export const SEASON_LINE = ['春风过页', '夏至留白', '秋色压花', '冬夜落笔'] as const
export const MO_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

/** JS month 0–11 → season index 0春 1夏 2秋 3冬 */
export function seasonOfMonth(monthIndex: number) {
  return Math.floor(monthIndex / 3) % 4
}

/** 当前时段的手帐文案：优先读 <html data-theme>，无则按当前小时推断 */
export function currentDiaryPeriod() {
  const t = (document.documentElement.dataset.theme as HomeTheme) || themeByHour(new Date().getHours())
  return DIARY_PERIOD[t] ?? DIARY_PERIOD.morning
}

/** 情绪对应点亮的圆点数（1–5）；未知情绪不点亮 */
export function moodLitDots(mood: string | undefined) {
  if (!mood || MOOD_LEVEL[mood] == null) return 0
  return Math.max(1, Math.round(MOOD_LEVEL[mood] / 20))
}

/** 重放一次性 CSS 动画：先移除类并强制 reflow（void offsetWidth），再加回类；超时后清理 */
export function popCraftAnim(el: HTMLElement | null, cls: string, ms = 500) {
  if (!el) return
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
  window.setTimeout(() => el.classList.remove(cls), ms)
}

/** Best-effort streak from a set of YYYY-MM-DD dates, walking back from today. */
export function diaryStreakFromDates(dates: Iterable<string>, today: string) {
  const set = new Set(dates)
  let n = 0
  const cur = new Date(`${today}T12:00:00`)
  while (true) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    if (!set.has(key)) break
    n += 1
    cur.setDate(cur.getDate() - 1)
  }
  return n
}
