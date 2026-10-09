/**
 * 桌宠躲避区与活动范围计算。
 *
 * “躲避区”是闲逛目标不允许落入的矩形：悬浮球菜单的展开范围，
 * 以及业务方通过 registerAvoidanceZone 注册的区域。
 * 本模块同时提供活动边界（wander bounds）、边界钳制、
 * 闲逛步长度量与目标点采样，是引擎移动行为的几何基础。
 */
import { ref } from 'vue'
import type { PetPoint, PetRect } from '../types'
import {
  BUBBLE_MENU_SIZE,
  BUBBLE_MENU_STORAGE_KEY,
  BUBBLE_MENU_ZONE_EXPANDED,
  PET_VIEWPORT_MARGIN,
  PET_WANDER_ZONE_START_RATIO,
} from '../constants'

/** 业务方动态注册的额外躲避区（模块级单例，跨组件共享） */
const extraZones = ref<PetRect[]>([])

/** 两矩形是否相交（AABB 判定） */
function rectsOverlap(a: PetRect, b: PetRect): boolean {
  return (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  )
}

/** 点是否在矩形内（含边界） */
function pointInRect(point: PetPoint, rect: PetRect): boolean {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  )
}

/** 读取悬浮球菜单的存储位置，换算成以其为中心、按展开态尺寸的正方形躲避区 */
function readBubbleMenuZone(): PetRect | null {
  try {
    const raw = localStorage.getItem(BUBBLE_MENU_STORAGE_KEY)
    if (!raw) return null

    const saved = JSON.parse(raw) as { x: number; y: number }
    const half = BUBBLE_MENU_ZONE_EXPANDED / 2
    const centerX = saved.x + BUBBLE_MENU_SIZE / 2
    const centerY = saved.y + BUBBLE_MENU_SIZE / 2

    return {
      x: centerX - half,
      y: centerY - half,
      width: BUBBLE_MENU_ZONE_EXPANDED,
      height: BUBBLE_MENU_ZONE_EXPANDED,
    }
  } catch {
    return null
  }
}

/** 注册一个躲避区（如悬浮菜单展开范围），闲逛目标选取时会避开它 */
export function registerAvoidanceZone(rect: PetRect) {
  extraZones.value.push(rect)
}

/** 按矩形值移除一个已注册的躲避区 */
export function unregisterAvoidanceZone(rect: PetRect) {
  extraZones.value = extraZones.value.filter(
    (zone) =>
      zone.x !== rect.x
      || zone.y !== rect.y
      || zone.width !== rect.width
      || zone.height !== rect.height,
  )
}

/** 当前全部躲避区 = 动态注册区 + 悬浮球菜单展开区 */
export function getAvoidanceZones(): PetRect[] {
  const zones: PetRect[] = [...extraZones.value]
  const bubbleZone = readBubbleMenuZone()
  if (bubbleZone) {
    zones.push(bubbleZone)
  }
  return zones
}

/** 以 point 为左上角、petSize 为边长的宠物方块，是否与任一躲避区相交 */
export function isPointInAvoidanceZone(point: PetPoint, petSize: number): boolean {
  const rect: PetRect = { x: point.x, y: point.y, width: petSize, height: petSize }
  return getAvoidanceZones().some((zone) => rectsOverlap(rect, zone))
}

/** 计算视口内的活动边界：四周留安全边距，顶部按配置比例预留（0 即全屏可活动） */
export function getWanderBounds(viewport: { w: number; h: number }, petSize: number) {
  const margin = PET_VIEWPORT_MARGIN
  const minY = viewport.h * PET_WANDER_ZONE_START_RATIO
  return {
    minX: margin,
    maxX: viewport.w - petSize - margin,
    minY: minY > 0 ? minY : margin,
    maxY: viewport.h - petSize - margin,
  }
}

/** 把任意点钳制进当前视口的活动边界（恢复存档、拖拽、窗口变化时使用） */
export function clampPointToWanderBounds(point: PetPoint, petSize: number): PetPoint {
  const bounds = getWanderBounds({ w: window.innerWidth, h: window.innerHeight }, petSize)
  return {
    x: Math.min(Math.max(point.x, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(point.y, bounds.minY), bounds.maxY),
  }
}

/** 闲逛度量值：随视口缩放的移动参数 */
export interface ViewportMoveMetrics {
  /** 单次闲逛的最大直线距离 */
  maxWanderStep: number
  /** 路程低于该值判为“慢走” */
  walkSlowThreshold: number
}

/**
 * 以视口短边为基准换算移动度量：单次最大步长与慢走阈值，
 * 让桌宠在大屏小屏上的活动幅度保持相近比例。
 */
export function getViewportMoveMetrics(
  viewport: { w: number; h: number } = { w: window.innerWidth, h: window.innerHeight },
  ratios: { maxStep?: number; slowDistance?: number } = {},
): ViewportMoveMetrics {
  const ref = Math.min(viewport.w, viewport.h)
  const maxStepRatio = ratios.maxStep ?? 0.5
  const slowRatio = ratios.slowDistance ?? 0.25
  return {
    maxWanderStep: ref * maxStepRatio,
    walkSlowThreshold: ref * slowRatio,
  }
}

/** 目标点选取参数：当前位置与单次最大步长 */
export interface PickWanderTargetOptions {
  current: PetPoint
  maxStep: number
}

/** 在当前位置附近按随机角度与距离取点，并钳制在活动边界内 */
function pickNearbyPoint(
  current: PetPoint,
  maxStep: number,
  bounds: ReturnType<typeof getWanderBounds>,
): PetPoint {
  const angle = Math.random() * Math.PI * 2
  const dist = Math.random() * maxStep
  return {
    x: Math.min(Math.max(current.x + Math.cos(angle) * dist, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(current.y + Math.sin(angle) * dist, bounds.minY), bounds.maxY),
  }
}

/**
 * 随机采样最多 maxAttempts 次寻找不在躲避区内的闲逛目标；
 * 全部落在躲避区时退回最后一次采样，保证桌宠总能继续走动。
 */
export function pickWanderTarget(
  petSize: number,
  maxAttempts = 8,
  options: PickWanderTargetOptions,
): PetPoint | null {
  const bounds = getWanderBounds({ w: window.innerWidth, h: window.innerHeight }, petSize)

  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = pickNearbyPoint(options.current, options.maxStep, bounds)

    if (!isPointInAvoidanceZone(candidate, petSize)) {
      return candidate
    }
  }

  return pickNearbyPoint(options.current, options.maxStep, bounds)
}

/** 判断点是否落在指定矩形区域内 */
export function isPointInZone(point: PetPoint, zone: PetRect): boolean {
  return pointInRect(point, zone)
}
