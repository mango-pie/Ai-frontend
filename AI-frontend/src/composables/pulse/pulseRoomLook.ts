/**
 * 脉冲房间外观工具：强调色（预设 / 自定义十六进制）解析、模糊与纱幕参数收敛，
 * 由 roomCssVars 汇成 CSS 变量供房间模板绑定；被房间组件与设置面板共用。
 */
import type { PulseAccentPreset, PulseRoomMode } from '@/composables/pulse/pulseTypes'

/** 内置强调色预设：昼夜两套色值（房间分 night/day 模式），label 供设置面板展示 */
export const ACCENT_PRESETS: Record<
  Exclude<PulseAccentPreset, 'custom'>,
  { night: string; day: string; label: string }
> = {
  iris: { night: '#C9A6FF', day: '#6E4CB8', label: '虹膜紫' },
  amber: { night: '#F0A36A', day: '#C47A3A', label: '窗灯琥珀' },
  rose: { night: '#E8A0B8', day: '#A85A78', label: '夜樱' },
  mint: { night: '#7EC8C0', day: '#3A8A82', label: '青磁' },
}

/** 背景「模糊 / 纱幕」滑杆的合法范围：blur 单位 px，veil 为不透明度上限 */
export const ROOM_BLUR_MIN = 0
export const ROOM_BLUR_MAX = 40
export const ROOM_VEIL_MIN = 0
export const ROOM_VEIL_MAX = 0.85

/** 模糊值收敛到 [0,40] 并取整 */
export function clampRoomBlur(n: number) {
  return Math.min(ROOM_BLUR_MAX, Math.max(ROOM_BLUR_MIN, Math.round(n)))
}

/** 纱幕不透明度收敛到 [0,0.85] 并保留两位小数 */
export function clampRoomVeil(n: number) {
  return Math.min(ROOM_VEIL_MAX, Math.max(ROOM_VEIL_MIN, Math.round(n * 100) / 100))
}

/** 规范化为 #RRGGBB 大写（支持 3 位缩写展开）；非法输入返回空串 */
export function normalizeHex(input: string) {
  const raw = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`
  return ''
}

/** '#RRGGBB' → [r, g, b]；非法色值返回 null */
export function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const n = normalized.slice(1)
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}

/** 转为 "r g b" 空格分隔 token，供 rgb(var(--accent-rgb) / a) 这类写法使用 */
function rgbToken(hex: string) {
  const rgb = hexToRgb(hex)
  return rgb ? `${rgb[0]} ${rgb[1]} ${rgb[2]}` : '201 166 255'
}

/**
 * 按背景色亮度选播放器前景色：亮底配深字、暗底配浅字。
 * 亮度采用 WCAG 相对亮度公式（sRGB 线性化），阈值 0.45 取视觉中点偏亮。
 */
function playFgFor(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#0A0814'
  const [r = 0, g = 0, b = 0] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#0A0814' : '#F7F2FC'
}

/** 解析当前模式应使用的强调色：预设直接查表；custom 用传入 hex（非法回退 iris） */
export function resolveAccent(preset: PulseAccentPreset, hex: string, mode: PulseRoomMode) {
  if (preset !== 'custom') {
    const swatch = ACCENT_PRESETS[preset][mode]
    return { hex: swatch, rgb: rgbToken(swatch), playFg: playFgFor(swatch) }
  }
  const custom = normalizeHex(hex) || ACCENT_PRESETS.iris[mode]
  return { hex: custom, rgb: rgbToken(custom), playFg: playFgFor(custom) }
}

/**
 * 把外观参数汇总成 CSS 变量对象（v-bind 到房间根元素）。
 * --mint / --magenta 等历史变量同样指向强调色，兼容房间旧样式；
 * --scale 随模糊度轻微放大背景，抵消 blur 边缘露出的透明。
 */
export function roomCssVars(opts: {
  mode: PulseRoomMode
  preset: PulseAccentPreset
  hex: string
  blur: number
  veil: number
}): Record<string, string> {
  const blur = clampRoomBlur(opts.blur)
  const veil = clampRoomVeil(opts.veil)
  const accent = resolveAccent(opts.preset, opts.hex, opts.mode)
  return {
    '--accent': accent.hex,
    '--accent-rgb': accent.rgb,
    '--petal-rgb': accent.rgb,
    '--mint': accent.hex,
    '--mint-rgb': accent.rgb,
    '--magenta': accent.hex,
    '--magenta-rgb': accent.rgb,
    '--yellow': accent.hex,
    '--play-fg': accent.playFg,
    '--blur': `${blur}px`,
    '--scale': String(1 + blur / 250),
    '--veil': String(veil),
    '--tint': `rgb(${accent.rgb} / 0.14)`,
  }
}
