<script setup lang="ts">
/**
 * 首页舞台的四季飘落粒子层（canvas 覆盖层）
 * - 按当前季节渲染花瓣 / 雨 / 落叶 / 雪，鼠标横移会带起一阵"风"吹动粒子
 * - 纯装饰组件，由 HomePage 全屏轮播按季节启用
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { HOME_STAGE_H, HOME_STAGE_W } from '@/composables/useHomeStageScale'
import type { HomeSeason } from '@/composables/useHomeTheme'

/** season：当前季节主题；enabled：是否运行动画（false 时仅保留空白画布） */
const props = defineProps<{
  season: HomeSeason
  enabled: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

/** 各季节粒子配方：数量、形态（petal/leaf 共用花瓣画法）与随机色板 */
const SEASON_CFG = {
  spring: { count: 26, kind: 'petal' as const, palette: ['#ffc2d4', '#ffd9e4', '#ffabc5', '#ffe3ec'] },
  summer: {
    count: 64,
    kind: 'rain' as const,
    palette: ['rgba(150,200,235,.55)', 'rgba(170,215,240,.45)', 'rgba(190,225,245,.4)'],
  },
  autumn: { count: 22, kind: 'leaf' as const, palette: ['#f0a35e', '#e07a5f', '#d9a441', '#cd6f4a'] },
  winter: { count: 54, kind: 'snow' as const, palette: ['#ffffff', '#f4f9ff', '#e8f1fb'] },
}

/** 单个粒子：len 为雨丝长度，r 为花瓣/雪花半径，rot/vr 为旋转角与角速度 */
type Particle = {
  x: number
  y: number
  color: string
  sway: number
  len?: number
  vy: number
  vx: number
  r?: number
  vr?: number
  rot?: number
}

// 粒子池与风力：wind 由鼠标移动累积、每帧衰减，用于吹动花瓣和雪
let parts: Particle[] = []
let wind = 0
let lastMouseX: number | null = null
let rafId = 0
let ctx: CanvasRenderingContext2D | null = null

/**
 * 生成一个新粒子
 * @param anyY true 时在全屏任意高度生成（初始化铺满画面）；false 时从画面顶部外落下（越界重生）
 */
function spawn(cfg: (typeof SEASON_CFG)[HomeSeason], anyY: boolean): Particle {
  const base = {
    x: Math.random() * HOME_STAGE_W,
    y: anyY ? Math.random() * HOME_STAGE_H : -40,
    color: cfg.palette[Math.floor(Math.random() * cfg.palette.length)] ?? cfg.palette[0]!,
    sway: Math.random() * Math.PI * 2,
  }
  if (cfg.kind === 'rain') {
    // 雨丝：细长线段，落速快并整体向左倾斜
    return { ...base, len: 14 + Math.random() * 14, vy: 7 + Math.random() * 4, vx: -1.2 - Math.random() * 0.8 }
  }
  if (cfg.kind === 'snow') {
    // 雪花：小圆点，慢速下落、横向漂移小
    return {
      ...base,
      r: 1.8 + Math.random() * 2.8,
      vy: 0.4 + Math.random() * 0.7,
      vx: -0.2 + Math.random() * 0.4,
      vr: 0,
      rot: 0,
    }
  }
  // 花瓣 / 落叶：柳叶形，慢速飘落并带自转
  return {
    ...base,
    r: 6 + Math.random() * 8,
    vy: 0.5 + Math.random() * 1.1,
    vx: -0.3 + Math.random() * 0.6,
    rot: Math.random() * Math.PI * 2,
    vr: -0.02 + Math.random() * 0.04,
  }
}

/** 按当前季节重建整个粒子池（初始化与季节切换时调用） */
function rebuild() {
  const cfg = SEASON_CFG[props.season]
  parts = Array.from({ length: cfg.count }, () => spawn(cfg, true))
}

/**
 * requestAnimationFrame 主循环：清屏后逐帧更新并绘制全部粒子
 * - wind *= 0.94 让鼠标带起的风力逐帧自然衰减
 * - 越界（含被风吹出左右边界）的粒子从顶部外重生，维持总数恒定
 */
function draw() {
  if (!ctx) return
  ctx.clearRect(0, 0, HOME_STAGE_W, HOME_STAGE_H)
  if (props.enabled) {
    const cfg = SEASON_CFG[props.season]
    wind *= 0.94
    for (const [i, p] of parts.entries()) {
      p.sway += 0.02
      if (cfg.kind === 'rain') {
        p.x += p.vx
        p.y += p.vy
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * 1.8, p.y - (p.len || 14))
        ctx.stroke()
      } else if (cfg.kind === 'snow') {
        p.x += p.vx + Math.sin(p.sway) * 0.7 + wind * 0.5
        p.y += p.vy
        ctx.fillStyle = p.color
        ctx.globalAlpha = 0.92
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r || 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else {
        p.x += p.vx + Math.sin(p.sway) * 0.6 + wind
        p.y += p.vy
        p.rot = (p.rot || 0) + (p.vr || 0) + wind * 0.01
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.globalAlpha = 0.9
        const r = p.r || 6
        ctx.beginPath()
        ctx.moveTo(0, -r)
        ctx.quadraticCurveTo(r * 0.9, -r * 0.3, 0, r)
        ctx.quadraticCurveTo(-r * 0.9, -r * 0.3, 0, -r)
        ctx.fill()
        ctx.restore()
        ctx.globalAlpha = 1
      }
      // 越出画面就从屏幕上方外重新生成一个粒子补位
      if (p.y > HOME_STAGE_H + 40 || p.x < -60 || p.x > HOME_STAGE_W + 60) {
        parts[i] = spawn(cfg, false)
      }
    }
  }
  rafId = requestAnimationFrame(draw)
}

// 监听全局鼠标横移，把位移量折算成风力（限幅 ±3），制造"拂过花瓣"的互动感
const onMouseMove = (e: MouseEvent) => {
  if (lastMouseX !== null) wind += (e.clientX - lastMouseX) * 0.012
  lastMouseX = e.clientX
  wind = Math.max(-3, Math.min(3, wind))
}

onMounted(() => {
  // 画布尺寸固定为舞台逻辑尺寸，缩放适配由外层统一处理
  const cv = canvasRef.value
  if (!cv) return
  cv.width = HOME_STAGE_W
  cv.height = HOME_STAGE_H
  ctx = cv.getContext('2d')
  rebuild()
  rafId = requestAnimationFrame(draw)
  window.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('mousemove', onMouseMove)
})

// 季节切换时整套粒子按新配方重新生成
watch(
  () => props.season,
  () => rebuild(),
)
</script>

<template>
  <canvas id="petals" ref="canvasRef" />
</template>
