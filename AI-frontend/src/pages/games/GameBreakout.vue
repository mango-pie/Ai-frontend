<script setup lang="ts">
/**
 * 打砖块机台：鼠标 / 触屏移动挡板，方向键微调，空格或点击发球
 * - 砖块 8×5，分值自上而下 50→10；三颗心，弹丢即结束；全清为通关
 * - Canvas 尺寸随舞台自适应（ResizeObserver），砖块几何每帧按当前尺寸推导
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { Heart, Pause, Play, RefreshCw, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords } from './arcade'

defineOptions({ name: 'GameBrickBreaker' })

const props = defineProps<{ active: boolean }>()

const COLS = 8
const ROWS = 5
const ROW_COLORS = ['#f490ad', '#c79ae0', '#9b8ce8', '#6aaee8', '#5fc4a5']
const ROW_POINTS = [50, 40, 30, 20, 10]
const SPEED = 350

interface Brick {
  row: number
  col: number
  alive: boolean
}

const score = ref(0)
const lives = ref(3)
const state = ref<'idle' | 'run' | 'over' | 'win'>('idle')
const paused = ref(false)
const finalDur = ref(0)
const isRecord = ref(false)
const W = ref(720)
const H = ref(560)
const paneEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

let bricks: Brick[] = []
let paddleX = 360
let ball = { x: 360, y: 500, dx: 0, dy: 0, stuck: true }
const keys = { left: false, right: false }
let raf = 0
let lastTs = 0
let startTs = 0
let roomActive = false
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const paddleW = computed(() => Math.max(84, W.value * 0.13))
const paddleY = computed(() => H.value - 30)
const best = computed(() => bestOf('breakout')?.raw ?? 0)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  W.value = Math.max(420, Math.min(880, pane.clientWidth - 48 - sideW))
  H.value = Math.max(360, Math.min(660, pane.clientHeight - 56))
  paddleX = Math.min(Math.max(paddleX, paddleW.value / 2), W.value - paddleW.value / 2)
  draw()
}

function brickRect(row: number, col: number) {
  const m = 14
  const top = 48
  const gap = 6
  const bw = (W.value - 2 * m - (COLS - 1) * gap) / COLS
  const bh = 20
  return { x: m + col * (bw + gap), y: top + row * (bh + gap), w: bw, h: bh }
}

function build() {
  bricks = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) bricks.push({ row, col, alive: true })
  }
  paddleX = W.value / 2
  stickBall()
  score.value = 0
  lives.value = 3
  state.value = 'idle'
  paused.value = false
  isRecord.value = false
  startTs = 0
  draw()
}

function stickBall() {
  ball = { x: paddleX, y: paddleY.value - 9, dx: 0, dy: 0, stuck: true }
}

function launch() {
  if (state.value === 'over' || state.value === 'win') return
  if (!ball.stuck) return
  if (!startTs) startTs = Date.now()
  state.value = 'run'
  ball.stuck = false
  const angle = (Math.random() * 70 - 35) * (Math.PI / 180)
  ball.dx = SPEED * Math.sin(angle)
  ball.dy = -SPEED * Math.cos(angle)
  arcadeSound.flip()
}

function loseLife() {
  lives.value--
  arcadeSound.lose()
  if (lives.value <= 0) {
    state.value = 'over'
    finalDur.value = startTs ? (Date.now() - startTs) / 1000 : 0
    const prev = bestOf('breakout')?.raw ?? 0
    isRecord.value = score.value > 0 && score.value >= prev
    addRecord({ g: 'breakout', score: score.value, dur: Math.round(finalDur.value), win: false })
  } else {
    stickBall()
  }
}

function winGame() {
  state.value = 'win'
  finalDur.value = startTs ? (Date.now() - startTs) / 1000 : 0
  const prev = bestOf('breakout')?.raw ?? 0
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'breakout', score: score.value, dur: Math.round(finalDur.value), win: true })
  arcadeSound.win()
}

function step(dt: number) {
  // 键盘移动挡板
  const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  if (move) {
    paddleX = Math.min(Math.max(paddleX + move * 460 * dt, paddleW.value / 2), W.value - paddleW.value / 2)
  }
  if (ball.stuck) {
    ball.x = paddleX
    ball.y = paddleY.value - 9
    return
  }
  ball.x += ball.dx * dt
  ball.y += ball.dy * dt
  // 墙
  if (ball.x < 7) {
    ball.x = 7
    ball.dx = Math.abs(ball.dx)
    arcadeSound.move()
  }
  if (ball.x > W.value - 7) {
    ball.x = W.value - 7
    ball.dx = -Math.abs(ball.dx)
    arcadeSound.move()
  }
  if (ball.y < 7) {
    ball.y = 7
    ball.dy = Math.abs(ball.dy)
    arcadeSound.move()
  }
  // 落底
  if (ball.y - 7 > H.value) {
    loseLife()
    return
  }
  // 挡板
  if (ball.dy > 0 && ball.y + 7 >= paddleY.value && ball.y - 7 <= paddleY.value + 12 && ball.x >= paddleX - paddleW.value / 2 - 7 && ball.x <= paddleX + paddleW.value / 2 + 7) {
    ball.y = paddleY.value - 7
    const offset = Math.min(1, Math.max(-1, (ball.x - paddleX) / (paddleW.value / 2)))
    const angle = offset * (55 * (Math.PI / 180))
    ball.dx = SPEED * Math.sin(angle)
    ball.dy = -SPEED * Math.cos(angle)
    arcadeSound.flip()
  }
  // 砖块（每帧最多消一块）
  for (const b of bricks) {
    if (!b.alive) continue
    const r = brickRect(b.row, b.col)
    const nx = Math.min(Math.max(ball.x, r.x), r.x + r.w)
    const ny = Math.min(Math.max(ball.y, r.y), r.y + r.h)
    const ddx = ball.x - nx
    const ddy = ball.y - ny
    if (ddx * ddx + ddy * ddy <= 49) {
      b.alive = false
      score.value += ROW_POINTS[b.row] ?? 10
      arcadeSound.merge(score.value)
      if (ball.x < r.x || ball.x > r.x + r.w) ball.dx = -ball.dx
      else ball.dy = -ball.dy
      if (bricks.every((x) => !x.alive)) winGame()
      break
    }
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
  // 砖块
  for (const b of bricks) {
    if (!b.alive) continue
    const r = brickRect(b.row, b.col)
    ctx.fillStyle = ROW_COLORS[b.row] ?? '#9b8ce8'
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 5)
    ctx.fill()
  }
  // 挡板
  const grad = ctx.createLinearGradient(paddleX - paddleW.value / 2, 0, paddleX + paddleW.value / 2, 0)
  grad.addColorStop(0, '#ffa45c')
  grad.addColorStop(1, '#f490ad')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(paddleX - paddleW.value / 2, paddleY.value, paddleW.value, 12, 7)
  ctx.fill()
  // 球
  ctx.fillStyle = '#4c5570'
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2)
  ctx.fill()
  // 发球提示
  if (ball.stuck && state.value !== 'over' && state.value !== 'win') {
    ctx.fillStyle = 'rgba(76, 85, 112, 0.55)'
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('点击画面或按空格发球', W.value / 2, H.value - 64)
  }
}

function loop(ts: number) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.032, lastTs ? (ts - lastTs) / 1000 : 0.016)
  lastTs = ts
  const shouldRun = state.value === 'run' && !paused.value && props.active && roomActive
  if (shouldRun) step(dt)
  draw()
}

function togglePause() {
  if (state.value !== 'run') return
  paused.value = !paused.value
  arcadeSound.click()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = e.type === 'keydown'
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = e.type === 'keydown'
  if (e.type === 'keydown' && (e.key === ' ' || e.key === 'ArrowUp')) {
    e.preventDefault()
    launch()
  }
}

function onPointer(e: MouseEvent) {
  const rect = canvasEl.value?.getBoundingClientRect()
  if (!rect) return
  paddleX = Math.min(Math.max(e.clientX - rect.left, paddleW.value / 2), W.value - paddleW.value / 2)
}
function onTouch(e: TouchEvent) {
  const rect = canvasEl.value?.getBoundingClientRect()
  const t = e.touches[0]
  if (!rect || !t) return
  paddleX = Math.min(Math.max(t.clientX - rect.left, paddleW.value / 2), W.value - paddleW.value / 2)
}
function onTap() {
  launch()
}

watch(
  () => props.active,
  (active) => {
    if (!active && state.value === 'run') paused.value = true
  },
)

onMounted(() => {
  build()
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
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
  window.removeEventListener('keyup', onKey)
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pbreak">
    <div class="arc-gamecol">
      <canvas
        ref="canvasEl"
        class="arc-breakcanvas"
        :style="{ width: W + 'px', height: H + 'px' }"
        @mousemove="onPointer"
        @touchmove.prevent="onTouch"
        @click="onTap"
      />
      <p class="arc-hint">移动鼠标控制挡板 · 点击 / 空格发球 · 方向键微调</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="build(); arcadeSound.click()"><RefreshCw :size="14" /> 重开</button>
        <button class="arc-btn" :disabled="state !== 'run'" @click="togglePause()">
          <Pause v-if="!paused" :size="14" /><Play v-else :size="14" /> {{ paused ? '继续' : '暂停' }}
        </button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">当前得分</div>
        <div class="arc-scoreval">{{ fmtInt(score) }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">剩余生命</div>
        <div class="arc-scorehearts">
          <Heart
            v-for="i in 3"
            :key="i"
            :size="18"
            :class="i <= lives ? 'is-on' : 'is-off'"
            :fill="i <= lives ? '#e0567a' : 'none'"
          />
        </div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, score)) }}</div>
      </div>
    </div>

    <div v-if="state === 'over' || state === 'win'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico" :class="state === 'win' ? 'is-win' : 'is-lose'"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">{{ state === 'win' ? '砖块全清！' : '球掉光了…' }}</div>
        <div class="arc-oversub">{{ state === 'win' ? '整面砖墙为你让路' : '下一次把角度压得更低一点' }}</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtInt(score) }}</b><span>得分</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="build(); arcadeSound.click()"><RefreshCw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
