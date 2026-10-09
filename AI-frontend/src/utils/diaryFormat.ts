/**
 * 日记模块的展示格式化工具：情绪选项、日期文案、列表标题与纯文本摘要，
 * 全部为无副作用纯函数，供日记列表 / 详情 / 编辑复用。
 */
export const MOOD_OPTIONS = [
  { value: 'happy', label: '开心', emoji: '😊' },
  { value: 'calm', label: '平静', emoji: '😌' },
  { value: 'tired', label: '疲惫', emoji: '😴' },
  { value: 'sad', label: '低落', emoji: '😔' },
  { value: 'excited', label: '兴奋', emoji: '🤩' },
] as const

/** 'YYYY-MM-DD' → 中文长日期（含星期几）；拼 T00:00:00 保证按本地时区解析 */
export function formatDiaryDate(dateStr: string | undefined) {
  if (!dateStr) return ''
  const date = new Date(`${dateStr}T00:00:00`)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

/** 本地时区的今天，格式 'YYYY-MM-DD'（手工拼接避免 toISOString 的 UTC 偏移问题） */
export function todayDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 情绪 key → emoji；未知情绪返回空串 */
export function getMoodEmoji(mood: string | undefined) {
  if (!mood) return ''
  return MOOD_OPTIONS.find((item) => item.value === mood)?.emoji ?? ''
}

/** 列表展示标题：有自定义标题用标题，否则回落为日记日期文案 */
export function diaryDisplayTitle(entry: { diaryDate?: string; title?: string }) {
  if (entry.title?.trim()) return entry.title.trim()
  return formatDiaryDate(entry.diaryDate)
}

/** 剥掉 Markdown 记号后的纯文本摘要；超长截断加省略号，空内容给占位文案 */
export function contentExcerpt(content: string | undefined, maxLen = 80) {
  if (!content) return '（暂无内容）'
  const plain = content.replace(/[#>*`_\-\[\]()!]/g, '').replace(/\s+/g, ' ').trim()
  if (plain.length <= maxLen) return plain
  return `${plain.slice(0, maxLen)}…`
}
