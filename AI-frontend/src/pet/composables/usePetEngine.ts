/**
 * 桌宠行为引擎：驱动状态机（idle / walk / react / sleep / drag）
 * 与覆盖动画（jump / happy / sigh）的核心 composable。
 *
 * 职责：位置持久化与边界钳制、闲逛目标的选取与插值移动、
 * 空闲计时与随机微行为、长时间无互动后入睡、路由切换问候、
 * 指针悬停打招呼，并把全部可渲染状态聚合为 PetViewModel 供渲染器消费。
 */
import { onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { siteConfig } from '@/config/site'
import { usePulsePlayer } from '@/composables/usePulsePlayer'
import {
  PET_ARRIVAL_THRESHOLD,
  PET_STORAGE_KEY,
} from '../constants'
import { getRouteReaction } from '../routeReactions'
import {
  clampPointToWanderBounds,
  getViewportMoveMetrics,
  getWanderBounds,
  pickWanderTarget,
} from './usePetAvoidance'
import type {
  PetEnableMode,
  PetFacing,
  PetOverlayState,
  PetPoint,
  PetState,
  PetViewModel,
  PetWalkPace,
} from '../types'

/** localStorage 中持久化的位置快照 */
interface SavedPetState {
  x: number
  y: number
}

/** 引擎选项：宠物尺寸、运行模式取值函数、路由台词回调 */
export interface UsePetEngineOptions {
  petSize: number
  getMode: () => PetEnableMode
  onRouteLine?: (line: string) => void
}

/** 线性插值：按比例 t 从 a 向 b 逼近，用于平滑移动 */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** 两点欧氏距离 */
function distance(a: PetPoint, b: PetPoint) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** 初始位置：优先用站点配置坐标，否则落到活动区左上角附近、垂直方向贴底 */
function getDefaultPosition(petSize: number): PetPoint {
  const cfg = siteConfig.effects.petDango.defaultPosition
  const bounds = getWanderBounds({ w: window.innerWidth, h: window.innerHeight }, petSize)
  return {
    x: cfg.x ?? bounds.minX + 32,
    y: cfg.y ?? bounds.maxY,
  }
}

export function usePetEngine(options: UsePetEngineOptions) {
  const route = useRoute()
  const { petSize, getMode, onRouteLine } = options
  const cfg = siteConfig.effects.petDango
  const p = usePulsePlayer()

  const position = ref<PetPoint>(getDefaultPosition(petSize))
  const wanderTarget = ref<PetPoint | null>(null)
  const state = ref<PetState>('idle')
  const overlayState = ref<PetOverlayState | null>(null)
  const walkPace = ref<PetWalkPace>('slow')
  const facing = ref<PetFacing>('right')
  const lookAt = ref<PetPoint | null>(null)

  // ---- 引擎内部计时器/标记（不参与渲染，无需响应式） ----
  let rafId = 0
  let lastTs = 0
  let idleTimer = 0        // 空闲已累计的毫秒数，达到 idleDuration 触发一次闲逛
  let idleDuration = 0     // 本轮空闲的目标时长（随机生成，避免节奏机械）
  let lastInteractionAt = performance.now()  // 最近互动时刻，超过 sleepAfterMs 即入睡
  let lastOverlayAt = 0    // 上次覆盖动画触发时刻，用于冷却判定
  let overlayUntil = 0     // 当前覆盖动画的结束时刻
  let hoverStartAt = 0     // 指针开始悬停的时刻，用于悬停打招呼计时
  let hoverGreeted = false // 本次悬停是否已打过招呼
  let pendingRouteGreet = false  // 路由问候挂起：等 react 播完再触发 happy
  let routeInitialized = false   // 路由 watch 的首次触发标记（初始导航不问候）

  /** 渲染器唯一输入：浅层引用，只在状态变化时整体替换以触发更新 */
  const viewModel = shallowRef<PetViewModel>({
    state: 'idle',
    overlay: null,
    walkPace: 'slow',
    musicPlaying: false,
    facing: 'right',
    lookAt: null,
  })

  /** 把内部各状态快照进 viewModel（整体替换，触发浅层更新） */
  function syncViewModel() {
    viewModel.value = {
      state: state.value,
      overlay: overlayState.value,
      walkPace: walkPace.value,
      musicPlaying: p.isPlaying.value,
      facing: facing.value,
      lookAt: lookAt.value,
    }
  }

  /** 立即清除当前覆盖动画 */
  function clearOverlay() {
    if (!overlayState.value) return
    overlayState.value = null
    overlayUntil = 0
  }

  /** 覆盖动画持续时长：按类型取配置，缺省 700ms */
  function resolveOverlayDuration(overlay: PetOverlayState) {
    return cfg.gif.overlayDurationMs[overlay] ?? 700
  }

  /**
   * 尝试触发一次覆盖动画（jump / happy / sigh）。
   * 仅在 idle 状态且冷却已过时生效；bypassCooldown 用于打招呼等必定要播的场景。
   * 返回是否触发成功，供调用方决定“已打招呼”等标记。
   */
  function triggerOverlay(
    overlay: PetOverlayState,
    options?: {
      bypassCooldown?: boolean
    },
  ) {
    if (!cfg.gif.overlayEnabled) return false
    if (state.value !== 'idle') return false
    const now = performance.now()
    if (!options?.bypassCooldown && now - lastOverlayAt < cfg.gif.overlayCooldownMs) return false
    overlayState.value = overlay
    overlayUntil = now + resolveOverlayDuration(overlay)
    lastOverlayAt = now
    syncViewModel()
    return true
  }

  /** 从 localStorage 恢复位置；无记录、解析失败或越界时回到默认位置并钳入活动区 */
  function loadPosition() {
    try {
      const raw = localStorage.getItem(PET_STORAGE_KEY)
      if (!raw) {
        position.value = clampPointToWanderBounds(getDefaultPosition(petSize), petSize)
        return
      }
      const saved = JSON.parse(raw) as SavedPetState
      position.value = clampPointToWanderBounds(saved, petSize)
    } catch {
      position.value = clampPointToWanderBounds(getDefaultPosition(petSize), petSize)
    }
  }

  /** 把当前位置写入 localStorage（拖拽结束、视口变化等时机调用） */
  function savePosition() {
    localStorage.setItem(
      PET_STORAGE_KEY,
      JSON.stringify({
        x: position.value.x,
        y: position.value.y,
      }),
    )
  }

  /** 在配置区间内随机取本轮空闲时长，让闲逛节奏不固定 */
  function pickIdleDuration() {
    idleDuration = cfg.idleMinMs + Math.random() * (cfg.idleMaxMs - cfg.idleMinMs)
  }

  /**
   * 选取下一个闲逛目标并切入 walk 状态。
   * 按视口短边换算最大步长，并依据路程远近决定 slow / fast
   * （影响移动倍率与 GIF 选材 fly / move）。
   */
  function scheduleWander() {
    if (getMode() !== 'full') return
    const metrics = getViewportMoveMetrics(undefined, {
      maxStep: cfg.wanderMaxStepRatio,
      slowDistance: cfg.gif.walkSlowDistanceRatio,
    })
    const target = pickWanderTarget(petSize, 8, {
      current: position.value,
      maxStep: metrics.maxWanderStep,
    })
    if (!target) return
    clearOverlay()
    const travelDistance = distance(position.value, target)
    walkPace.value = travelDistance < metrics.walkSlowThreshold ? 'slow' : 'fast'
    wanderTarget.value = target
    state.value = 'walk'
    syncViewModel()
  }

  /** 记录一次互动（点击/拖拽/悬停），并唤醒睡眠中的桌宠重置空闲计时 */
  function touchInteraction() {
    lastInteractionAt = performance.now()
    if (state.value === 'sleep') {
      state.value = 'idle'
      pickIdleDuration()
      idleTimer = 0
      syncViewModel()
    }
  }

  /** 切入 react 状态（点击反应 / 路由反应），打断闲逛与覆盖动画 */
  function setReact() {
    touchInteraction()
    clearOverlay()
    state.value = 'react'
    wanderTarget.value = null
    syncViewModel()
  }

  /**
   * 渲染器回调：react 这类一次性动画播完后回到 idle，
   * 并按上下文接一个覆盖动画——路由问候待处理时播 happy，否则播 jump。
   */
  function onAnimationComplete(completedState: PetState) {
    if (completedState !== 'react') return
    if (state.value !== 'react') return
    state.value = 'idle'
    pickIdleDuration()
    idleTimer = 0
    if (pendingRouteGreet) {
      pendingRouteGreet = false
      triggerOverlay('happy', { bypassCooldown: true })
    } else {
      triggerOverlay('jump', { bypassCooldown: true })
    }
    syncViewModel()
  }

  /**
   * 拖拽开始/结束：开始时清空覆盖动画、定格为 drag（快走姿态）；
   * 结束时回到 idle 重新计时，并把最终位置持久化。
   */
  function setDrag(active: boolean) {
    touchInteraction()
    if (active) {
      clearOverlay()
      walkPace.value = 'fast'
      state.value = 'drag'
      wanderTarget.value = null
    } else {
      state.value = 'idle'
      walkPace.value = 'slow'
      pickIdleDuration()
      idleTimer = 0
      savePosition()
    }
    syncViewModel()
  }

  /** 外部（拖拽中）设置位置，始终钳制在当前视口的活动区内 */
  function setPosition(point: PetPoint) {
    position.value = clampPointToWanderBounds(point, petSize)
  }

  /**
   * 更新指针注视点（眼睛跟随）；指针在宠物上悬停满 320ms
   * 会触发一次 happy 打招呼，离开后重置悬停计时。
   */
  function setLookAt(point: PetPoint | null) {
    const now = performance.now()
    if (point) {
      if (!hoverStartAt) {
        hoverStartAt = now
        hoverGreeted = false
      }
      if (!hoverGreeted && now - hoverStartAt >= 320) {
        hoverGreeted = triggerOverlay('happy')
      }
    } else {
      hoverStartAt = 0
      hoverGreeted = false
    }
    lookAt.value = point
    syncViewModel()
  }

  /**
   * rAF 主循环（仅 full 模式运行），每帧推进：
   * 1. 覆盖动画到期清除；2. walk 状态下的插值移动与到达判定；
   * 3. idle 状态下的闲逛调度、随机微行为掷骰与睡眠转换。
   */
  function tick(ts: number) {
    if (getMode() !== 'full') return

    // 帧间隔换算为秒，并钳制上限，防止后台切回时的大 dt 造成瞬移
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0
    lastTs = ts
    const now = performance.now()

    if (overlayState.value && now >= overlayUntil) {
      overlayState.value = null
      overlayUntil = 0
      syncViewModel()
    }

    if (state.value === 'walk' && wanderTarget.value) {
      // 朝目标点做插值逼近；快走带 1.35 倍速率
      const target = wanderTarget.value
      const paceMultiplier = walkPace.value === 'fast' ? 1.35 : 1
      const next = {
        x: lerp(position.value.x, target.x, cfg.wanderSpeed * paceMultiplier * dt * 3),
        y: lerp(position.value.y, target.y, cfg.wanderSpeed * paceMultiplier * dt * 3),
      }
      // 只有水平方向有位移时才更新朝向，避免原地时抖动翻转
      if (target.x - position.value.x !== 0) {
        facing.value = target.x >= position.value.x ? 'right' : 'left'
      }
      position.value = next

      // 到达目标点：吸附到目标并回到 idle，重新开始空闲计时
      if (distance(position.value, target) < PET_ARRIVAL_THRESHOLD) {
        position.value = target
        wanderTarget.value = null
        state.value = 'idle'
        walkPace.value = 'slow'
        pickIdleDuration()
        idleTimer = 0
      }
      syncViewModel()
    } else if (state.value === 'idle') {
      // 空闲累计到时长后挑一个新目标去散步
      idleTimer += dt * 1000
      if (idleTimer >= idleDuration) {
        scheduleWander()
      }

      // 空闲期间的随机微行为：按冷却与概率掷骰，多数播叹气、少数跳跃
      if (
        cfg.gif.overlayEnabled &&
        !overlayState.value &&
        now - lastOverlayAt >= cfg.gif.overlayCooldownMs
      ) {
        const roll = Math.random()
        const threshold = cfg.gif.overlayChance * dt * 2
        if (roll < threshold) {
          triggerOverlay(Math.random() < 0.6 ? 'sigh' : 'jump')
        }
      }

      // 长时间无互动：收起覆盖动画并入睡
      if (now - lastInteractionAt >= cfg.sleepAfterMs) {
        clearOverlay()
        state.value = 'sleep'
        syncViewModel()
      }
    }

    rafId = requestAnimationFrame(tick)
  }

  /** 启动 rAF 循环；重启前重置时间基准，避免首帧 dt 异常 */
  function startLoop() {
    if (getMode() !== 'full') return
    cancelAnimationFrame(rafId)
    lastTs = 0
    rafId = requestAnimationFrame(tick)
  }

  /** 停止 rAF 循环并复位计时 */
  function stopLoop() {
    cancelAnimationFrame(rafId)
    rafId = 0
    lastTs = 0
  }

  /** 页面切到后台时停循环省电，回到前台恢复 */
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      stopLoop()
    } else {
      startLoop()
    }
  }

  /** 视口尺寸变化后把位置钳回活动区并保存，防止宠物留在屏幕外 */
  function onResize() {
    position.value = clampPointToWanderBounds(position.value, petSize)
    savePosition()
  }

  // 路由变化问候：跳过首次导航；命中反应配置时先播 react（结束后接 happy），
  // 未配状态则直接 happy，同时把台词交给气泡回调
  watch(
    () => route.path,
    (path) => {
      if (!routeInitialized) {
        routeInitialized = true
        return
      }
      const reaction = getRouteReaction(path)
      if (!reaction) return
      if (reaction.state) {
        pendingRouteGreet = true
        setReact()
      } else {
        touchInteraction()
        triggerOverlay('happy', { bypassCooldown: true })
      }
      if (reaction.line && onRouteLine) {
        onRouteLine(reaction.line)
      }
    },
  )

  // 音乐播放状态变化时同步 viewModel：idle/sleep 下的 GIF 需要切到 music 素材
  watch(
    () => p.isPlaying.value,
    () => {
      if (state.value === 'idle' || state.value === 'sleep') {
        syncViewModel()
      }
    },
  )

  /** 挂载：恢复位置、初始化空闲时长；full 模式下注册窗口事件并启动主循环 */
  function mount() {
    loadPosition()
    pickIdleDuration()
    syncViewModel()

    if (getMode() === 'full') {
      window.addEventListener('resize', onResize)
      document.addEventListener('visibilitychange', onVisibilityChange)
      startLoop()
    }
  }

  /** 卸载：停循环并移除窗口事件监听 */
  function unmount() {
    stopLoop()
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  onUnmounted(unmount)

  return {
    position,
    viewModel,
    state,
    facing,
    lookAt,
    mount,
    unmount,
    setReact,
    setDrag,
    setPosition,
    setLookAt,
    touchInteraction,
    onAnimationComplete,
    savePosition,
  }
}
