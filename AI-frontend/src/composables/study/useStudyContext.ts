/**
 * 学习模块上下文的组装中心：把工作区、任务、清单、清单子项、专注、习惯、统计
 * 各子 composable 拼装成一个 StudyContext，provide 给页面内所有子组件 inject 使用。
 * 子组件只依赖注入的上下文，不直接触碰各 API 控制器。
 */
import { computed, provide, ref } from 'vue'
import type { SmartViewKey } from '@/constants/study'
import {
  buildFocusPresets,
  loadStudySettings,
  type StudyUxSettings,
} from '@/utils/studySettings'
import { useStudyWorkspaceState } from './useStudyWorkspace'
import { useStudyListsActions } from './useStudyLists'
import { useStudyTasksState } from './useStudyTasks'
import { useStudyChecklistActions } from './useStudyChecklist'
import { useStudyFocusState } from './useStudyFocus'
import { useStudyHabitsState, useStudyStatsState } from './useStudyHabits'
import { studyContextKey, type StudyContext, type StudySelection } from './types'

/**
 * 创建学习上下文并 provide。
 * 返回同一份 ctx，页面自身（非子组件）可直接使用返回值。
 */
export function useStudyContext(): StudyContext {
  const workspace = useStudyWorkspaceState()
  const selection = ref<StudySelection>({ view: 'today' as SmartViewKey })
  const mobileTab = ref<'tasks' | 'focus' | 'habits' | 'stats'>('tasks')
  const studySettings = ref<StudyUxSettings>({
    focusDefaultMinutes: 25,
    focusBreakMinutes: 5,
    habitReminderDefault: true,
    statsDefaultRangeDays: 7,
    showChecklist: true,
  })
  const focusPresets = computed(() => buildFocusPresets(studySettings.value))
  // 是否展示清单子项：工作区级配置优先，未配置回退站点默认
  const showChecklist = computed(() => {
    if (typeof workspace.workspaceShowChecklist.value === 'boolean') {
      return workspace.workspaceShowChecklist.value
    }
    return studySettings.value.showChecklist
  })

  const tasksState = useStudyTasksState(
    selection,
    workspace.inboxListId,
    workspace.refreshTodayStats,
    workspace.refreshLists,
  )

  const listActions = useStudyListsActions(workspace.refreshLists)

  const checklistActions = useStudyChecklistActions(
    tasksState.selectedTask,
    tasksState.refreshTasks,
  )

  const focusState = useStudyFocusState(
    workspace.activeFocus,
    workspace.refreshActiveFocus,
    workspace.refreshTodayStats,
  )

  const habitsState = useStudyHabitsState(workspace.refreshTodayStats)
  const statsState = useStudyStatsState()

  /** 首次进入页面：加载站点设置 → 初始化工作区 → 依次拉取任务/习惯/专注历史/区间统计 */
  async function bootstrap(createThemeLists = true) {
    studySettings.value = await loadStudySettings()
    await workspace.bootstrap(createThemeLists)
    if (!workspace.forbidden.value) {
      focusState.syncRemainingFromSession(workspace.activeFocus.value)
      await tasksState.refreshTasks()
      await habitsState.refreshHabits()
      await focusState.refreshFocusHistory()
      await statsState.refreshRangeStats(studySettings.value.statsDefaultRangeDays)
    }
  }

  async function setSelection(sel: StudySelection) {
    tasksState.setSelection(sel)
    await tasksState.refreshTasks()
  }

  const ctx: StudyContext = {
    loading: workspace.loading,
    forbidden: workspace.forbidden,
    inboxListId: workspace.inboxListId,
    lists: workspace.lists,
    todayStats: workspace.todayStats,
    activeFocus: workspace.activeFocus,
    tasks: tasksState.tasks,
    tasksLoading: tasksState.tasksLoading,
    selection,
    selectedTask: tasksState.selectedTask,
    selectedTaskId: tasksState.selectedTaskId,
    habits: habitsState.habits,
    habitsLoading: habitsState.habitsLoading,
    rangeStats: statsState.rangeStats,
    focusHistory: focusState.focusHistory,
    remainingSeconds: focusState.remainingSeconds,
    mobileTab,
    studySettings,
    focusPresets,
    showChecklist,
    bootstrap,
    refreshLists: workspace.refreshLists,
    refreshTasks: tasksState.refreshTasks,
    refreshTodayStats: workspace.refreshTodayStats,
    refreshActiveFocus: workspace.refreshActiveFocus,
    refreshHabits: habitsState.refreshHabits,
    refreshRangeStats: statsState.refreshRangeStats,
    refreshFocusHistory: focusState.refreshFocusHistory,
    setSelection,
    openTaskDetail: tasksState.openTaskDetail,
    closeTaskDetail: tasksState.closeTaskDetail,
    addTaskQuick: tasksState.addTaskQuick,
    toggleTaskDone: tasksState.toggleTaskDone,
    deleteTaskById: tasksState.deleteTaskById,
    updateTaskFields: tasksState.updateTaskFields,
    syncBlogDrafts: tasksState.syncBlogDrafts,
    addList: listActions.addList,
    updateListFields: listActions.updateListFields,
    deleteListById: (id) => {
      // 补查清单类型传给动作层，用于拦截「收集箱不可删除」
      const list = workspace.lists.value.find((l) => l.id === id)
      return listActions.deleteListById(id, list?.listType)
    },
    addChecklistItem: checklistActions.addChecklistItem,
    toggleChecklistItem: checklistActions.toggleChecklistItem,
    deleteChecklistItem: checklistActions.deleteChecklistItem,
    startFocusSession: focusState.startFocusSession,
    pauseFocusSession: focusState.pauseFocusSession,
    resumeFocusSession: focusState.resumeFocusSession,
    completeFocusSession: focusState.completeFocusSession,
    abandonFocusSession: focusState.abandonFocusSession,
    addHabitItem: habitsState.addHabitItem,
    updateHabitFields: habitsState.updateHabitFields,
    deleteHabitById: habitsState.deleteHabitById,
    toggleHabitCheck: habitsState.toggleHabitCheck,
    getHabitCalendarDates: habitsState.getHabitCalendarDates,
    afterMutation: tasksState.afterMutation,
  }

  provide(studyContextKey, ctx)
  return ctx
}

export { studyContextKey } from './types'
