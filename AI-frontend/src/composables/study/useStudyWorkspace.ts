/**
 * 学习工作区的基础状态：初始化（initWorkspace）、清单/今日统计/进行中专注会话的加载。
 * 是 useStudyContext 组装的底座，其余子 composable 依赖这里的刷新回调。
 */
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { initWorkspace } from '@/api/studyWorkspaceController'
import { getAllLists } from '@/api/studyListController'
import { getTodayStats } from '@/api/studyStatsController'
import { getActiveFocus } from '@/api/studyFocusController'

/**
 * 工作区状态 composable。
 * 返回加载/权限标记、收集箱 id、清单、今日统计、进行中的专注会话，
 * 以及各自的刷新函数与一次性 bootstrap。
 */
export function useStudyWorkspaceState() {
  const loading = ref(true)
  const forbidden = ref(false)
  const inboxListId = ref<number>()
  const lists = ref<API.StudyListVO[]>([])
  const todayStats = ref<API.StudyTodayStatsVO | null>(null)
  const activeFocus = ref<API.StudyFocusSessionVO | null>(null)
  const workspaceShowChecklist = ref<boolean | undefined>(undefined)

  /** 刷新清单列表；顺带识别收集箱（listType=1）并记下其 id */
  async function refreshLists() {
    const res = await getAllLists()
    if (res.data.code === 0 && res.data.data) {
      lists.value = res.data.data
      const inbox = res.data.data.find((l) => l.listType === 1)
      if (inbox?.id) inboxListId.value = inbox.id
    }
  }

  async function refreshTodayStats() {
    const res = await getTodayStats()
    if (res.data.code === 0 && res.data.data) {
      todayStats.value = res.data.data
    }
  }

  async function refreshActiveFocus() {
    const res = await getActiveFocus()
    if (res.data.code === 0) {
      activeFocus.value = res.data.data ?? null
    }
  }

  /**
   * 初始化工作区：后端建好默认清单/主题清单并返回聚合数据。
   * 40101 表示无权限（未登录/非学生），标记 forbidden 让页面显示引导；
   * 成功后再并行刷新清单/统计/专注会话拿最新数据。
   */
  async function bootstrap(createThemeLists = true) {
    loading.value = true
    forbidden.value = false
    try {
      const res = await initWorkspace({ createThemeLists })
      if (res.data.code === 40101) {
        forbidden.value = true
        return
      }
      if (res.data.code !== 0) {
        message.error(res.data.message || '初始化学习工作区失败')
        return
      }
      const data = res.data.data
      if (data) {
        inboxListId.value = data.inboxListId
        lists.value = data.lists ?? []
        todayStats.value = data.todayStats ?? null
        activeFocus.value = data.activeFocus ?? null
        workspaceShowChecklist.value =
          typeof data.showChecklist === 'boolean' ? data.showChecklist : undefined
      }
      await Promise.all([refreshLists(), refreshTodayStats(), refreshActiveFocus()])
    } catch {
      message.error('无法连接学习服务，请确认后端已启动')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    forbidden,
    inboxListId,
    lists,
    todayStats,
    activeFocus,
    workspaceShowChecklist,
    refreshLists,
    refreshTodayStats,
    refreshActiveFocus,
    bootstrap,
  }
}
