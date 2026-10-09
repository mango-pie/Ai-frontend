/**
 * 学习模块（任务/专注/习惯/统计）的共享类型与 provide/inject 注入 key。
 * StudyContext 是页面向所有子组件下发的完整契约，子组件 inject 后即可读写状态与调用动作。
 */
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { SmartViewKey } from '@/constants/study'
import type { StudyUxSettings } from '@/utils/studySettings'

/** 当前选中的视图：智能视图（今日/收集箱/已完成等）或某个具体清单 */
export interface StudySelection {
  view: SmartViewKey
  listId?: number
  listName?: string
}

/** 学习上下文：状态 refs + 全部动作方法（任务/清单/清单子项/专注/习惯） */
export interface StudyContext {
  loading: Ref<boolean>
  forbidden: Ref<boolean>
  inboxListId: Ref<number | undefined>
  lists: Ref<API.StudyListVO[]>
  todayStats: Ref<API.StudyTodayStatsVO | null>
  activeFocus: Ref<API.StudyFocusSessionVO | null>
  tasks: Ref<API.StudyTaskVO[]>
  tasksLoading: Ref<boolean>
  selection: Ref<StudySelection>
  selectedTask: Ref<API.StudyTaskVO | null>
  selectedTaskId: Ref<number | undefined>
  habits: Ref<API.StudyHabitVO[]>
  habitsLoading: Ref<boolean>
  rangeStats: Ref<API.StudyRangeStatsVO | null>
  focusHistory: Ref<API.StudyFocusSessionVO[]>
  remainingSeconds: Ref<number>
  mobileTab: Ref<'tasks' | 'focus' | 'habits' | 'stats'>
  /** 站点设置驱动的学习默认值 */
  studySettings: Ref<StudyUxSettings>
  focusPresets: ComputedRef<number[]>
  showChecklist: ComputedRef<boolean>
  bootstrap: (createThemeLists?: boolean) => Promise<void>
  refreshLists: () => Promise<void>
  refreshTasks: () => Promise<void>
  refreshTodayStats: () => Promise<void>
  refreshActiveFocus: () => Promise<void>
  refreshHabits: () => Promise<void>
  refreshRangeStats: (days?: number) => Promise<void>
  refreshFocusHistory: () => Promise<void>
  setSelection: (sel: StudySelection) => void
  openTaskDetail: (task: API.StudyTaskVO) => Promise<void>
  closeTaskDetail: () => void
  addTaskQuick: (title: string) => Promise<boolean>
  toggleTaskDone: (task: API.StudyTaskVO, done: boolean) => Promise<boolean>
  deleteTaskById: (id: number) => Promise<boolean>
  updateTaskFields: (payload: API.StudyTaskUpdateRequest) => Promise<boolean>
  syncBlogDrafts: () => Promise<number>
  addList: (name: string, color?: string) => Promise<boolean>
  updateListFields: (payload: API.StudyListUpdateRequest) => Promise<boolean>
  deleteListById: (id: number) => Promise<boolean>
  addChecklistItem: (taskId: number, title: string) => Promise<boolean>
  toggleChecklistItem: (item: API.StudyTaskChecklistVO, done: boolean) => Promise<boolean>
  deleteChecklistItem: (id: number) => Promise<boolean>
  startFocusSession: (taskId?: number, plannedMinutes?: number) => Promise<boolean>
  pauseFocusSession: () => Promise<boolean>
  resumeFocusSession: () => Promise<boolean>
  completeFocusSession: () => Promise<boolean>
  abandonFocusSession: () => Promise<boolean>
  addHabitItem: (title: string, color?: string) => Promise<boolean>
  updateHabitFields: (payload: API.StudyHabitUpdateRequest) => Promise<boolean>
  deleteHabitById: (id: number) => Promise<boolean>
  toggleHabitCheck: (habit: API.StudyHabitVO) => Promise<boolean>
  getHabitCalendarDates: (habitId: number, year: number, month: number) => Promise<string[]>
  afterMutation: () => Promise<void>
}

/** provide/inject 的注入 key（Symbol 保证类型安全） */
export const studyContextKey: InjectionKey<StudyContext> = Symbol('studyContext')
