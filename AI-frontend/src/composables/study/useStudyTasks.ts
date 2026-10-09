/**
 * 任务模块状态：按当前选中视图（今日/收集箱/清单/已完成…）查询任务列表，
 * 以及任务的快捷添加、完成切换、编辑、删除与详情面板的打开/关闭。
 * 任何任务变更后统一走 afterMutation 并行刷新任务/统计/清单。
 */
import { ref, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  queryTaskView,
  addTask as addTaskApi,
  toggleTask as toggleTaskApi,
  updateTask as updateTaskApi,
  deleteTask as deleteTaskApi,
  getTaskVo,
  syncBlogDrafts as syncBlogDraftsApi,
} from '@/api/studyTaskController'
import type { SmartViewKey } from '@/constants/study'
import type { StudySelection } from './types'

/**
 * 任务状态与动作集。
 * @param selection 当前选中的视图/清单（查询条件来源）
 * @param inboxListId 收集箱 id，快捷添加没有明确目标时回退到这里
 * @param refreshTodayStats / refreshLists 变更后的联动刷新
 */
export function useStudyTasksState(
  selection: Ref<StudySelection>,
  inboxListId: Ref<number | undefined>,
  refreshTodayStats: () => Promise<void>,
  refreshLists: () => Promise<void>,
) {
  const tasks = ref<API.StudyTaskVO[]>([])
  const tasksLoading = ref(false)
  const selectedTask = ref<API.StudyTaskVO | null>(null)
  const selectedTaskId = ref<number>()

  /** 按选中视图查询任务：非「已完成」视图隐藏已完成项，清单视图带 listId */
  async function refreshTasks() {
    tasksLoading.value = true
    try {
      const { view, listId } = selection.value
      const request: API.StudyTaskViewQueryRequest = {
        view,
        pageNum: 1,
        pageSize: 100,
        hideCompleted: view !== 'completed',
        completedDays: 7,
      }
      if (view === 'list' && listId) {
        request.listId = listId
      }
      const res = await queryTaskView({ request })
      if (res.data.code === 0 && res.data.data) {
        tasks.value = res.data.data.records ?? []
      }
    } finally {
      tasksLoading.value = false
    }
  }

  /** 任何任务变更后的统一刷新：任务列表、今日统计与清单并行拉取 */
  async function afterMutation() {
    await Promise.all([refreshTasks(), refreshTodayStats(), refreshLists()])
  }

  /** 快捷添加：目标清单取当前清单，否则回退收集箱；「今日」视图下同时标记为今日任务 */
  async function addTaskQuick(title: string) {
    const { view, listId } = selection.value
    let targetListId = listId ?? inboxListId.value
    if (view === 'inbox' || !targetListId) {
      targetListId = inboxListId.value
    }
    const body: API.StudyTaskAddRequest = {
      title,
      listId: targetListId,
      isToday: view === 'today',
    }
    const res = await addTaskApi(body)
    if (res.data.code === 0) {
      await afterMutation()
      return true
    }
    message.error(res.data.message || '添加失败')
    return false
  }

  async function toggleTaskDone(task: API.StudyTaskVO, done: boolean) {
    if (!task.id) return false
    const res = await toggleTaskApi({ id: task.id, done })
    if (res.data.code === 0) {
      await afterMutation()
      if (selectedTask.value?.id === task.id) {
        selectedTask.value = { ...selectedTask.value, status: done ? 1 : 0 }
      }
      return true
    }
    message.error(res.data.message || '操作失败')
    return false
  }

  async function updateTaskFields(payload: API.StudyTaskUpdateRequest) {
    const res = await updateTaskApi(payload)
    if (res.data.code === 0) {
      await afterMutation()
      if (selectedTask.value?.id === payload.id) {
        const detail = await getTaskVo({ id: payload.id! })
        if (detail.data.code === 0 && detail.data.data) {
          selectedTask.value = detail.data.data
        }
      }
      return true
    }
    message.error(res.data.message || '保存失败')
    return false
  }

  async function deleteTaskById(id: number) {
    const res = await deleteTaskApi({ id })
    if (res.data.code === 0) {
      message.success('已删除')
      closeTaskDetail()
      await afterMutation()
      return true
    }
    message.error(res.data.message || '删除失败')
    return false
  }

  /** 同步博客草稿为任务（把博客写作接入任务管理），返回同步条数 */
  async function syncBlogDrafts() {
    const res = await syncBlogDraftsApi()
    if (res.data.code === 0) {
      const count = res.data.data?.syncedCount ?? 0
      message.success(`已同步 ${count} 条博客草稿任务`)
      await afterMutation()
      return count
    }
    message.error(res.data.message || '同步失败')
    return 0
  }

  /** 打开任务详情：拉取完整 VO（含清单子项等），失败时退回列表里的摘要数据 */
  async function openTaskDetail(task: API.StudyTaskVO) {
    if (!task.id) return
    selectedTaskId.value = task.id
    const res = await getTaskVo({ id: task.id })
    if (res.data.code === 0 && res.data.data) {
      selectedTask.value = res.data.data
    } else {
      selectedTask.value = task
    }
  }

  function closeTaskDetail() {
    selectedTask.value = null
    selectedTaskId.value = undefined
  }

  function setSelection(sel: StudySelection) {
    selection.value = sel
  }

  return {
    tasks,
    tasksLoading,
    selectedTask,
    selectedTaskId,
    refreshTasks,
    afterMutation,
    addTaskQuick,
    toggleTaskDone,
    updateTaskFields,
    deleteTaskById,
    syncBlogDrafts,
    openTaskDetail,
    closeTaskDetail,
    setSelection,
  }
}

/** 供其它模块标注任务状态 composable 的返回类型 */
export type StudyTasksState = ReturnType<typeof useStudyTasksState>
