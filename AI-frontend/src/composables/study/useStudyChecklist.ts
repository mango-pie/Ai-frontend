/**
 * 任务详情里的清单（checklist）子项操作：新增、勾选/取消、删除。
 * 每次变更后重拉当前任务详情，保证详情面板里的子项与后端同步。
 */
import { message } from 'ant-design-vue'
import {
  addChecklist as addChecklistApi,
  updateChecklist as updateChecklistApi,
  deleteChecklist as deleteChecklistApi,
} from '@/api/studyChecklistController'
import { getTaskVo } from '@/api/studyTaskController'

/**
 * 清单子项动作集。
 * @param selectedTask 当前打开的任务详情（可变 ref，子项变化直接写回）
 * @param refreshTasks 任务列表刷新回调，新增子项后联动列表
 */
export function useStudyChecklistActions(
  selectedTask: { value: API.StudyTaskVO | null },
  refreshTasks: () => Promise<void>,
) {
  /** 重新拉取当前任务详情，覆盖 selectedTask 里的旧子项 */
  async function reloadSelectedTask() {
    const id = selectedTask.value?.id
    if (!id) return
    const res = await getTaskVo({ id })
    if (res.data.code === 0 && res.data.data) {
      selectedTask.value = res.data.data
    }
  }

  async function addChecklistItem(taskId: number, title: string) {
    const res = await addChecklistApi({ taskId, title })
    if (res.data.code === 0) {
      await reloadSelectedTask()
      await refreshTasks()
      return true
    }
    message.error(res.data.message || '添加失败')
    return false
  }

  async function toggleChecklistItem(item: API.StudyTaskChecklistVO, done: boolean) {
    if (!item.id) return false
    const res = await updateChecklistApi({ id: item.id, done: done ? 1 : 0 })
    if (res.data.code === 0) {
      await reloadSelectedTask()
      return true
    }
    message.error(res.data.message || '操作失败')
    return false
  }

  async function deleteChecklistItem(id: number) {
    const res = await deleteChecklistApi({ id })
    if (res.data.code === 0) {
      await reloadSelectedTask()
      return true
    }
    message.error(res.data.message || '删除失败')
    return false
  }

  return { addChecklistItem, toggleChecklistItem, deleteChecklistItem }
}
