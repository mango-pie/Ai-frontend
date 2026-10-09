/**
 * 桌宠模块的公共类型定义。
 *
 * 集中描述桌宠状态机（PetState / PetOverlayState）、渲染器统一输入
 * （PetViewModel），以及 CSS / Sprite / GIF 三种渲染方案各自的素材映射类型，
 * 供状态引擎、渲染组件与站点配置层共同依赖。
 */

/** 桌宠基础状态机：待机 / 行走 / 点击反应 / 睡眠 / 被拖拽 */
export type PetState = 'idle' | 'walk' | 'react' | 'sleep' | 'drag'
/** 交互动画：jump / happy / sigh */
export type PetOverlayState = 'jump' | 'happy' | 'sigh'
/** 行走速度档位：影响移动倍率与 GIF 选材（fly / move） */
export type PetWalkPace = 'slow' | 'fast'
/** 朝向：控制渲染器是否水平翻转 */
export type PetFacing = 'left' | 'right'
/** 渲染器实现方案：纯 CSS 绘制 / 雪碧图帧动画 / GIF 图 */
export type PetRendererKind = 'css' | 'sprite' | 'gif'
/** 启用模式：false 关闭 / 'static' 仅静态展示 / 'full' 完整行为 */
export type PetEnableMode = false | 'static' | 'full'

/** 平面坐标点（视口内左上角像素坐标） */
export interface PetPoint {
  x: number
  y: number
}

/** 渲染器唯一输入 — CSS 与 Sprite 共用 */
export interface PetViewModel {
  state: PetState
  overlay: PetOverlayState | null
  walkPace: PetWalkPace
  musicPlaying: boolean
  facing: PetFacing
  /** 相对宠物中心的指针偏移，用于眼睛跟随；null 表示无 hover */
  lookAt: PetPoint | null
}

/** 矩形区域：用于描述躲避区（如悬浮球菜单展开范围）等禁入区域 */
export interface PetRect {
  x: number
  y: number
  width: number
  height: number
}

/** 路由切换反应：进入特定路由时桌宠说的台词与触发的状态 */
export interface PetRouteReaction {
  line?: string
  state?: PetState
}

/** Sprite 阶段：单段动画描述 */
export interface PetSpriteClip {
  row: number
  frameCount: number
  fps: number
  loop: boolean
}

/** Sprite 方案：状态 -> 单段动画的完整映射表 */
export type PetSpriteAtlas = Record<PetState, PetSpriteClip>

/** GIF 方案：核心状态 -> 素材文件名提示（精确匹配优先） */
export type PetGifStateMap = Partial<Record<PetState, string>>

/** GIF 方案：核心状态 -> 别名列表，用于按文件名模糊匹配素材 */
export type PetGifAliasMap = Partial<Record<PetState, string[]>>

/** GIF 方案：交互动画状态 -> 素材文件名提示 */
export type PetGifOverlayMap = Partial<Record<PetOverlayState, string>>

/** GIF 方案：交互动画状态 -> 别名列表 */
export type PetGifOverlayAliasMap = Partial<Record<PetOverlayState, string[]>>

/** 8 张 GIF 素材键名 */
export type PetGifAssetKey =
  | 'click'
  | 'default'
  | 'fly'
  | 'move'
  | 'music'
  | 'jump'
  | 'happy'
  | 'sigh'

/** GIF 方案：素材键 -> 素材文件名提示的映射 */
export type PetGifAssetMap = Partial<Record<PetGifAssetKey, string>>
