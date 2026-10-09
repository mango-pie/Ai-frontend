<script setup lang="ts">
/**
 * 像素飞行机台（Flappy 式）：点击 / 空格振翅，穿过管道缝隙
 * - 重力 + 振翅冲量，每过一根管道 +1 分；撞地 / 撞管道即结束
 * - Canvas 尺寸随舞台自适应；纪取最高分
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { RotateCcw, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords } from './arcade'

defineOptions({ name: 'GamePixelFlight' })

const props = defineProps<{ active: boolean }>()

const GAP = 158
const PIPE_W = 64
const SPACING = 235
const GRAVITY = 1450
const FLAP = -400
const SPEED = 155

const score = ref(0)
const state = ref<'idle' | 'run' | 'over'>('idle')
const finalDur = ref(0)
const isRecord = ref(false)
const W = ref(520)
const H = ref(600)
const paneEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

interface Pipe {
  x: number
  gapY: number
  passed: boolean
}

let bird = { y: 260, vy: 0 }
let pipes: Pipe[] = []
let raf = 0
let lastTs = 0
let startTs = 0
let roomActive = false
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const best = computed(() => bestOf('flappy')?.raw ?? 0)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  W.value = Math.max(360, Math.min(560, pane.clientWidth - 48 - sideW))
  H.value = Math.max(400, Math.min(680, pane.clientHeight - 56))
}

function build() {
  bird = { y: H.value * 0.42, vy: 0 }
  pipes = []
  for (let i = 0; i < 3; i++) {
    pipes.push({ x: W.value + i * SPACING, gapY: 120 + Math.random() * (H.value - GAP - 260), passed: false })
  }
  score.value = 0
  state.value = 'idle'
  isRecord.value = false
  startTs = 0
  draw()
}

function flap() {
  if (over()) return
  if (state.value === 'idle') {
    state.value = 'run'
    startTs = Date.now()
  }
  bird.vy = FLAP
  arcadeSound.flip()
}

function over(): boolean {
  return state.value === 'over'
}

function die() {
  state.value = 'over'
  finalDur.value = startTs ? (Date.now() - startTs) / 1000 : 0
  const prev = bestOf('flappy')?.raw ?? 0
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'flappy', score: score.value, dur: Math.round(finalDur.value) })
  arcadeSound.lose()
}

function step(dt: number) {
  bird.vy += GRAVITY * dt
  bird.y += bird.vy * dt
  const ground = H.value - 26
  if (bird.y > ground - 12 || bird.y < 8) {
    bird.y = Math.min(Math.max(bird.y, 8), ground - 12)
    die()
    return
  }
  for (const p of pipes) {
    p.x -= SPEED * dt
    if (!p.passed && p.x + PIPE_W < 90) {
      p.passed = true
      score.value++
      arcadeSound.match()
    }
    // 撞管道
    const inPipeX = 90 + 12 > p.x && 90 - 12 < p.x + PIPE_W
    if (inPipeX && (bird.y - 12 < p.gapY || bird.y + 12 > p.gapY + GAP)) {
      die()
      return
    }
  }
  if (pipes[0] && pipes[0]!.x + PIPE_W < -10) pipes.shift()
  const last = pipes[pipes.length - 1]
  if (last && last.x < W.value - SPACING) {
    pipes.push({ x: W.value, gapY: 120 + Math.random() * (H.value - GAP - 260), passed: false })
  }
}

function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== W.value * dpr || canvas.height !== H.value * dpr) {
    canvas.width = W.value * dpr
    canvas.height = H.value * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W.value, H.value)
  // 地面
  ctx.fillStyle = 'color-mix(in srgb, #5fc4a5 45%, transparent)'
  ctx.fillRect(0, H.value - 26, W.value, 26)
  // 管道
  for (const p of pipes) {
    ctx.fillStyle = 'rgba(95, 196, 165, 0.75)'
    ctx.beginPath()
    ctx.roundRect(p.x, 0, PIPE_W, p.gapY, 6)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(p.x, p.gapY + GAP, PIPE_W, H.value - 26 - (p.gapY + GAP), 6)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 233, 184, 0.9)'
    ctx.fillRect(p.x - 4, p.gapY - 14, PIPE_W + 8, 14)
    ctx.fillRect(p.x - 4, p.gapY + GAP, PIPE_W + 8, 14)
  }
  // 小鸟：暖黄圆 + 翅膀 + 眼睛
  const bx = 90
  ctx.save()
  ctx.translate(bx, bird.y)
  ctx.rotate(Math.min(0.5, Math.max(-0.6, bird.vy / 700)))
  ctx.fillStyle = '#ffcf6e'
  ctx.beginPath()
  ctx.arc(0, 0, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f490ad'
  ctx.beginPath()
  ctx.ellipse(-4, 3, 7, 5, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(5, -4, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4c5570'
  ctx.beginPath()
  ctx.arc(6, -4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffa45c'
  ctx.beginPath()
  ctx.moveTo(12, 0)
  ctx.lineTo(19, 2)
  ctx.lineTo(12, 5)
  ctx.fill()
  ctx.restore()
  // 待机提示
  if (state.value === 'idle') {
    ctx.fillStyle = 'rgba(76, 85, 112, 0.6)'
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('点击画面或按空格起飞', W.value / 2, H.value * 0.24)
  }
}

function loop(ts: number) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.03, lastTs ? (ts - lastTs) / 1000 : 0.016)
  lastTs = ts
  if (state.value === 'run' && props.active && roomActive) step(dt)
  draw()
}

function onKey(e: KeyboardEvent) {
  if (!props.active || !roomActive) return
  if (e.key === ' ' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (state.value === 'over') restart()
    else flap()
  }
}

function restart() {
  build()
  state.value = 'idle'
  arcadeSound.click()
}

watch(
  () => props.active,
  (active) => {
    if (!active && state.value === 'run') {
      // 切走机台：直接结算本局，回来重新起飞
      die()
    }
  },
)

onMounted(() => {
  build()
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
  window.addEventListener('keydown', onKey)
  roomActive = true
  raf = requestAnimationFrame(loop)
})
onActivated(() => {
  roomActive = true
})
onDeactivated(() => {
  roomActive = false
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  resizeOb?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pflappy">
    <div class="arc-gamecol">
      <canvas
        ref="canvasEl"
        class="arc-flycanvas"
        :style="{ width: W + 'px', height: H + 'px' }"
        @click="state === 'over' ? restart() : flap()"
        @touchstart.prevent="state === 'over' ? restart() : flap()"
      />
      <p class="arc-hint">点击 / 空格振翅 · 撞上管道或地面就结束</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="restart(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">穿过管道</div>
        <div class="arc-scoreval">{{ fmtInt(score) }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, score)) }}</div>
      </div>
    </div>

    <div v-if="state === 'over'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-lose"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">翅膀累了</div>
        <div class="arc-oversub">这一程穿过了 {{ score }} 根管道</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtInt(score) }}</b><span>得分</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="restart(); arcadeSound.click()"><RotateCcw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
