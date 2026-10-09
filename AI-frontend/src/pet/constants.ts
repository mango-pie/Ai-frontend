/**
 * 桌宠模块的共享常量。
 *
 * 覆盖悬浮层级、localStorage 键名、活动边界与交互判定阈值，
 * 供行为引擎、指针交互与躲避区计算共同引用。
 */

/** 桌宠悬浮层 z-index：高于普通页面内容，但留给遮罩类 UI 之下 */
export const PET_Z_INDEX = 850
/** 桌宠位置的 localStorage 持久化键 */
export const PET_STORAGE_KEY = 'pet_dango_state_v1'
/** 悬浮球菜单位置的 localStorage 键（躲避区计算需读取它以避开悬浮球） */
export const BUBBLE_MENU_STORAGE_KEY = 'bubble_menu_position_v2'

/** 与 FloatingBubbleMenu 保持一致 */
export const BUBBLE_MENU_SIZE = 56
/** 躲避区按菜单展开后的尺寸计算，确保桌宠不会停进展开的菜单范围 */
export const BUBBLE_MENU_ZONE_EXPANDED = 320

/** 桌宠活动区距视口各边缘的安全边距（像素） */
export const PET_VIEWPORT_MARGIN = 16
/** 行走判定“已到达目标点”的距离阈值（像素） */
export const PET_ARRIVAL_THRESHOLD = 4
/** 0 = 全屏可活动（仅保留边距） */
export const PET_WANDER_ZONE_START_RATIO = 0

/** 按下到抬起的时长小于该值才视为点击（毫秒），超出视为长按/拖拽 */
export const PET_CLICK_MAX_MS = 200
/** 按下期间位移小于该值才视为点击（像素），超出则升级为拖拽 */
export const PET_CLICK_MAX_MOVE = 6

/** 瞳孔跟随指针的最大偏移（像素），防止瞳孔移出眼眶 */
export const PET_LOOK_AT_MAX_OFFSET = 3
