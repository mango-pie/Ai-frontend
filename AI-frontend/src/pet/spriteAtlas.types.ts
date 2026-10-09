/**
 * Sprite（雪碧图）渲染方案的类型契约与默认帧表。
 *
 * 本阶段只定义规范（帧尺寸、图片地址、各状态的行号/帧数/帧率），
 * 具体的帧循环渲染待 PetRendererSprite 实现，见其模板内 TODO。
 */
import type { PetSpriteAtlas, PetState } from './types'

/**
 * 未来 Sprite 资源规范（本阶段仅类型契约）：
 *
 * 1. 雪碧图 PNG/WebP，透明背景，单帧 64×64（或 128×128 @2x）
 * 2. 按 row 分行排列各状态动画帧
 * 3. 可选 JSON atlas：
 *
 * @example
 * {
 *   "frameWidth": 64,
 *   "frameHeight": 64,
 *   "imageUrl": "/assets/pet/dango-sprite.png",
 *   "clips": {
 *     "idle":  { "row": 0, "frameCount": 4, "fps": 6,  "loop": true },
 *     "walk":  { "row": 1, "frameCount": 6, "fps": 10, "loop": true },
 *     "react": { "row": 2, "frameCount": 8, "fps": 12, "loop": false },
 *     "sleep": { "row": 3, "frameCount": 2, "fps": 2,  "loop": true },
 *     "drag":  { "row": 4, "frameCount": 1, "fps": 0,  "loop": false }
 *   }
 * }
 */
/** 外部 JSON atlas 的结构：帧尺寸 + 图片地址 + 各状态的动画片段 */
export interface PetSpriteAtlasJson {
  /** 单帧宽度（像素） */
  frameWidth: number
  /** 单帧高度（像素） */
  frameHeight: number
  /** 雪碧图图片地址 */
  imageUrl: string
  /** 状态 -> 动画片段（所在行 / 帧数 / 帧率 / 是否循环） */
  clips: Partial<Record<PetState, {
    row: number
    frameCount: number
    fps: number
    loop: boolean
  }>>
}

/** 默认 atlas 映射，供 PetRendererSprite 未来实现参考 */
export const DEFAULT_SPRITE_ATLAS: PetSpriteAtlas = {
  idle: { row: 0, frameCount: 4, fps: 6, loop: true },
  walk: { row: 1, frameCount: 6, fps: 10, loop: true },
  react: { row: 2, frameCount: 8, fps: 12, loop: false },
  sleep: { row: 3, frameCount: 2, fps: 2, loop: true },
  drag: { row: 4, frameCount: 1, fps: 0, loop: false },
}
