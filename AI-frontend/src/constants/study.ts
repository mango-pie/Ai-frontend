/**
 * 学习/任务模块（StudyView）的常量与展示辅助函数：
 * 智能视图定义、优先级样式映射、专注计时预设/状态、任务状态码等（状态码与后端契约一致）
 */
export type SmartViewKey = 'today' | 'week' | 'inbox' | 'completed' | 'list'

// 侧边栏智能视图：今天 / 本周 / 收集箱 / 已完成（'list' 表示自定义清单视图，不在常量列表中）
export const SMART_VIEWS: { key: SmartViewKey; label: string; icon?: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'inbox', label: '收集箱' },
  { key: 'completed', label: '已完成' },
]

// 任务优先级：数字 -> 标签与标记色
export const PRIORITY_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '无', color: 'transparent' },
  1: { label: '低', color: '#7c9ce0' },
  2: { label: '中', color: '#e8b84a' },
  3: { label: '高', color: '#e879a9' },
}

// 专注计时的常用时长预设（分钟）：番茄 / 深度 / 休息
export const FOCUS_PRESETS = [25, 45, 5] as const

// 专注会话状态码（与后端一致）
export const FOCUS_STATUS = {
  RUNNING: 0,
  COMPLETED: 1,
  ABANDONED: 2,
  PAUSED: 3,
} as const

// 「收集箱」清单的类型标识
export const LIST_TYPE_INBOX = 1

// 任务状态码（与后端一致）
export const TASK_STATUS = {
  TODO: 0,
  DONE: 1,
  ABANDONED: 2,
} as const

// 学习素材来源类型：博客文章
export const SOURCE_TYPE_BLOG = 1

/** 任务是否逾期：仅对未完成且有截止时间的任务判断 */
export function isTaskOverdue(task: API.StudyTaskVO): boolean {
  if (task.status !== TASK_STATUS.TODO || !task.dueDate) return false
  return new Date(task.dueDate).getTime() < Date.now()
}

export function formatStudyDate(str: string | undefined): string {
  if (!str) return ''
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return str
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  if (h === '00' && min === '00') return `${m}-${day}`
  return `${m}-${day} ${h}:${min}`
}

export function getViewTitle(view: SmartViewKey, listName?: string): string {
  if (view === 'list' && listName) return listName
  return SMART_VIEWS.find((v) => v.key === view)?.label ?? '任务'
}
