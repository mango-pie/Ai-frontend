/**
 * 专注会话（番茄钟式）状态：本地秒级倒计时 + 会话的开始/暂停/继续/完成/放弃。
 * 剩余时间以服务端会话为准推算（开始时间 + 暂停累计），本地 setInterval 仅做逐秒递减，
 * 页面切后台再回来时用 visibilitychange 重新校准，避免计时漂移。
 */
import { ref, onUnmounted, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  startFocus,
  pauseFocus,
  resumeFocus,
  completeFocus,
  abandonFocus,
  listFocusPage,
} from '@/api/studyFocusController'
import { FOCUS_STATUS } from '@/constants/study'

/**
 * 专注会话状态 composable。
 * @param activeFocus 当前进行中的会话（由工作区状态持有并刷新）
 * @param refreshActiveFocus / refreshTodayStats 会话变更后的联动刷新
 * 返回剩余秒数、专注历史与全部会话动作。
 */
export function useStudyFocusState(
  activeFocus: Ref<API.StudyFocusSessionVO | null>,
  refreshActiveFocus: () => Promise<void>,
  refreshTodayStats: () => Promise<void>,
) {
  const remainingSeconds = ref(0)
  const focusHistory = ref<API.StudyFocusSessionVO[]>([])
  let timer: ReturnType<typeof setInterval> | undefined

  /** 清掉本地逐秒计时器 */
  function clearTimer() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  /**
   * 由会话数据推算剩余秒数：计划时长 - （现在 - 开始时间 - 暂停累计）。
   * 暂停态沿用本地剩余值（服务端不推进暂停中的计时）。
   */
  function computeRemaining(session: API.StudyFocusSessionVO): number {
    const planned = (session.plannedMinutes ?? 25) * 60
    if (session.status === FOCUS_STATUS.PAUSED) {
      return Math.max(0, remainingSeconds.value)
    }
    if (!session.startedTime) return planned
    const started = new Date(session.startedTime).getTime()
    const pauseSec = session.pauseTotalSeconds ?? 0
    const elapsed = Math.floor((Date.now() - started) / 1000) - pauseSec
    return Math.max(0, planned - elapsed)
  }

  /** 用某个会话同步倒计时：进行中且未到点才启动本地计时，否则清掉 */
  function syncRemainingFromSession(session: API.StudyFocusSessionVO | null) {
    if (!session) {
      remainingSeconds.value = 0
      clearTimer()
      return
    }
    remainingSeconds.value = computeRemaining(session)
    if (
      session.status === FOCUS_STATUS.RUNNING &&
      remainingSeconds.value > 0
    ) {
      startLocalTimer()
    } else {
      clearTimer()
    }
  }

  /** 本地 1 秒一跳的倒计时；到 0 自动停表 */
  function startLocalTimer() {
    clearTimer()
    timer = setInterval(() => {
      if (remainingSeconds.value > 0) {
        remainingSeconds.value -= 1
      } else {
        clearTimer()
      }
    }, 1000)
  }

  /** 页面从后台切回前台：用服务端时间重新校准剩余秒数（后台时本地计时可能被节流） */
  function onVisibilityChange() {
    if (document.hidden || !activeFocus.value) return
    remainingSeconds.value = computeRemaining(activeFocus.value)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  // 卸载时清理本地计时器与可见性监听
  onUnmounted(() => {
    clearTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  async function refreshFocusHistory() {
    const res = await listFocusPage({ pageNum: 1, pageSize: 10 })
    if (res.data.code === 0 && res.data.data) {
      focusHistory.value = res.data.data.records ?? []
    }
  }

  /** 会话动作后的统一收尾：更新活动会话、同步倒计时并刷新今日统计与历史 */
  async function afterFocusMutation(session: API.StudyFocusSessionVO | null | undefined) {
    if (session) activeFocus.value = session
    else await refreshActiveFocus()
    syncRemainingFromSession(activeFocus.value)
    await refreshTodayStats()
    await refreshFocusHistory()
  }

  async function startFocusSession(taskId?: number, plannedMinutes?: number) {
    const minutes = plannedMinutes ?? 25
    const res = await startFocus({ taskId, plannedMinutes: minutes, focusType: 0 })
    if (res.data.code === 50004) {
      message.warning(res.data.message || '已有进行中的专注会话')
      await refreshActiveFocus()
      syncRemainingFromSession(activeFocus.value)
      return false
    }
    if (res.data.code === 0 && res.data.data) {
      await afterFocusMutation(res.data.data)
      message.success('专注已开始')
      return true
    }
    message.error(res.data.message || '无法开始专注')
    return false
  }

  async function pauseFocusSession() {
    const id = activeFocus.value?.id
    if (!id) return false
    const res = await pauseFocus({ id })
    if (res.data.code === 0 && res.data.data) {
      clearTimer()
      await afterFocusMutation(res.data.data)
      return true
    }
    message.error(res.data.message || '暂停失败')
    return false
  }

  async function resumeFocusSession() {
    const id = activeFocus.value?.id
    if (!id) return false
    const res = await resumeFocus({ id })
    if (res.data.code === 0 && res.data.data) {
      await afterFocusMutation(res.data.data)
      return true
    }
    message.error(res.data.message || '继续失败')
    return false
  }

  async function completeFocusSession() {
    const id = activeFocus.value?.id
    if (!id) return false
    const res = await completeFocus({ id })
    if (res.data.code === 0) {
      activeFocus.value = null
      remainingSeconds.value = 0
      clearTimer()
      await refreshTodayStats()
      await refreshFocusHistory()
      message.success('专注完成')
      return true
    }
    message.error(res.data.message || '完成失败')
    return false
  }

  async function abandonFocusSession() {
    const id = activeFocus.value?.id
    if (!id) return false
    const res = await abandonFocus({ id })
    if (res.data.code === 0) {
      activeFocus.value = null
      remainingSeconds.value = 0
      clearTimer()
      await refreshFocusHistory()
      return true
    }
    message.error(res.data.message || '操作失败')
    return false
  }

  return {
    remainingSeconds,
    focusHistory,
    syncRemainingFromSession,
    refreshFocusHistory,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    completeFocusSession,
    abandonFocusSession,
  }
}
