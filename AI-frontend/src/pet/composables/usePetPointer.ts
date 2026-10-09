/**
 * 桌宠指针交互 composable：把 Pointer 事件流翻译成
 * 点击 / 拖拽 / 注视三类语义回调。
 *
 * 判定规则：按住后位移超过阈值即升级为拖拽；抬起时若按下时长与位移
 * 均小于阈值则判为点击。hover 期间同步计算瞳孔注视偏移。
 * 拖拽一旦开始，move/up 事件改由 window 级监听接管，指针移出宠物仍有效。
 */
import { ref } from 'vue'
import {
  PET_CLICK_MAX_MOVE,
  PET_CLICK_MAX_MS,
  PET_LOOK_AT_MAX_OFFSET,
} from '../constants'
import type { PetPoint } from '../types'

/** 指针交互回调集：拖拽起止/移动、点击、注视更新与互动唤醒 */
export interface UsePetPointerOptions {
  petSize: number
  getPosition: () => PetPoint
  onDragStart: () => void
  onDragEnd: () => void
  onDragMove: (point: PetPoint) => void
  onClick: () => void
  onLookAt: (point: PetPoint | null) => void
  onInteraction: () => void
}

/** 把注视偏移钳制在最大值内，避免瞳孔移出眼眶 */
function clampLookAtOffset(value: number) {
  return Math.max(-PET_LOOK_AT_MAX_OFFSET, Math.min(PET_LOOK_AT_MAX_OFFSET, value))
}

export function usePetPointer(options: UsePetPointerOptions) {
  const {
    petSize,
    getPosition,
    onDragStart,
    onDragEnd,
    onDragMove,
    onClick,
    onLookAt,
    onInteraction,
  } = options

  const isDragging = ref(false)
  let pointerId: number | null = null
  let dragOffset = { x: 0, y: 0 }  // 按下点相对宠物左上角的偏移，保证拖拽不跳位
  let downAt = 0                    // 按下时刻，用于点击时长判定
  let downPoint = { x: 0, y: 0 }    // 按下坐标，用于位移判定

  /** 计算指针相对宠物中心的偏移（已钳制）并回调，驱动眼睛跟随 */
  function updateLookAt(clientX: number, clientY: number) {
    const pos = getPosition()
    const centerX = pos.x + petSize / 2
    const centerY = pos.y + petSize / 2
    onLookAt({
      x: clampLookAtOffset(clientX - centerX),
      y: clampLookAtOffset(clientY - centerY),
    })
  }

  /** 移除 window 级 pointer 监听（拖拽期间全局接管，抬起后必须回收） */
  function teardownPointerListeners() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }

  /** 按住移动：已在拖拽则让宠物跟随指针；否则位移超过阈值时升级为拖拽 */
  function onPointerMove(e: PointerEvent) {
    if (pointerId !== e.pointerId) return

    if (isDragging.value) {
      onDragMove({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      })
      return
    }

    const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y)
    if (moved > PET_CLICK_MAX_MOVE) {
      isDragging.value = true
      onDragStart()
      onDragMove({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      })
    }
  }

  /** 抬起：拖拽收尾；未拖拽且时长/位移都小于阈值则判定为一次点击 */
  function onPointerUp(e: PointerEvent) {
    if (pointerId !== e.pointerId) return

    const elapsed = performance.now() - downAt
    const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y)

    if (isDragging.value) {
      onDragEnd()
    } else if (elapsed < PET_CLICK_MAX_MS && moved < PET_CLICK_MAX_MOVE) {
      onInteraction()
      onClick()
    }

    isDragging.value = false
    pointerId = null
    teardownPointerListeners()
  }

  /**
   * 按下（仅主键）：记录按下时间/坐标与抓取偏移，
   * 并把 move/up 挂到 window 上，为可能的拖拽做准备。
   */
  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return

    pointerId = e.pointerId
    isDragging.value = false
    downAt = performance.now()
    downPoint = { x: e.clientX, y: e.clientY }

    const pos = getPosition()
    dragOffset = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    e.preventDefault()
  }

  /** hover 进入宠物区域：立即更新注视点 */
  function onPointerEnter(e: PointerEvent) {
    updateLookAt(e.clientX, e.clientY)
  }

  /** hover 在宠物区域内移动：持续更新注视点（拖拽中除外，此时由拖拽逻辑接管） */
  function onPointerMoveOver(e: PointerEvent) {
    if (isDragging.value) return
    updateLookAt(e.clientX, e.clientY)
  }

  /** 离开宠物区域：取消注视；拖拽中不取消，指针通常还会回来 */
  function onPointerLeave() {
    if (!isDragging.value) {
      onLookAt(null)
    }
  }

  function unmount() {
    teardownPointerListeners()
  }

  return {
    isDragging,
    onPointerDown,
    onPointerEnter,
    onPointerMoveOver,
    onPointerLeave,
    unmount,
  }
}
