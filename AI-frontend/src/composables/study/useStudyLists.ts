/**
 * 任务清单（列表）的增删改动作。删除时保护内置的「收集箱」不可删。
 * 每次成功变更后刷新清单列表。
 */
import { message } from 'ant-design-vue'
import {
  addList as addListApi,
  updateList as updateListApi,
  deleteList as deleteListApi,
} from '@/api/studyListController'
import { LIST_TYPE_INBOX } from '@/constants/study'

/**
 * 清单动作集。
 * @param refreshLists 变更成功后刷新清单列表的回调
 */
export function useStudyListsActions(refreshLists: () => Promise<void>) {
  async function addList(name: string, color?: string) {
    const res = await addListApi({ name, color: color || '#7c9ce0' })
    if (res.data.code === 0) {
      message.success('清单已创建')
      await refreshLists()
      return true
    }
    message.error(res.data.message || '创建失败')
    return false
  }

  async function updateListFields(payload: API.StudyListUpdateRequest) {
    const res = await updateListApi(payload)
    if (res.data.code === 0) {
      message.success('已保存')
      await refreshLists()
      return true
    }
    message.error(res.data.message || '保存失败')
    return false
  }

  /** 删除清单；收集箱（LIST_TYPE_INBOX）是系统内置，直接拒绝 */
  async function deleteListById(id: number, listType?: number) {
    if (listType === LIST_TYPE_INBOX) {
      message.warning('收集箱不可删除')
      return false
    }
    const res = await deleteListApi({ id })
    if (res.data.code === 0) {
      message.success('已删除')
      await refreshLists()
      return true
    }
    message.error(res.data.message || '删除失败')
    return false
  }

  return { addList, updateListFields, deleteListById }
}
