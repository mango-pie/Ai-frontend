<script setup lang="ts">
/**
 * 接水果机台：鼠标 / 触屏 / 方向键移动篮子，接住掉落的水果
 * - 掉落速度随得分渐增；漏掉三颗即结束；纪录取最高分
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { Heart, RefreshCw, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords } from './arcade'

defineOptions({ name: 'GameFruitCatch' })

const props = defineProps<{ active: boolean }>()

interface Fruit {
  x: number
  y: number
  v: number
  kind: number
}

const FRUITS = [
  { color: '#f490ad', r: 11 },
  { color: '#ffcf6e', r: 10 },
  { color: '#5fc4a5', r: 11 },
  { color: '#9b8ce8', r: 10 },
]

const score = ref(0)
const lives = ref(3)
const state = ref<'idle' | 'run' | 'over'>('idle')
const finalDur = ref(0)
const isRecord = ref(false)
const W = ref(560)
const H = ref(600)
const paneEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

let basketX = 280
let fruits: Fruit[] = []
let spawnAcc = 0
let raf = 0
let lastTs = 0
let startTs = 0
let roomActive = false
let resizeOb: ResizeObserver | null = null
const keys = { left: false, right: false }

const { addRecord, bestOf } = useArcadeRecords()

const BASKET_W = computed(() => Math.max(84, W.value * 0.16))
const basketY = computed(() => H.value - 44)
const best = computed(() => bestOf('catch')?.raw ?? 0)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  W.value = Math.max(360, Math.min(600, pane.clientWidth - 48 - sideW))
  H.value = Math.max(400, Math.min(680, pane.clientHeight - 56))
  basketX = Math.min(Math.max(basketX, BASKET_W.value / 2), W.value - BASKET_W.value / 2)
}

function build() {
  fruits = []
  spawnAcc = 0
  basketX = W.value / 2
  score.value = 0
  lives.value = 3
  state.value = 'idle'
  isRecord.value = false
  startTs = 0
  draw()
}

function launch() {
  if (state.value === 'run') return
  if (state.value === 'over') build()
  state.value = 'run'
  startTs = Date.now()
  arcadeSound.flip()
}

function die() {
  state.value = 'over'
  finalDur.value = startTs ? (Date.now() - startTs) / 1000 : 0
  const prev = bestOf('catch')?.raw ?? 0
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'catch', score: score.value, dur: Math.round(finalDur.value) })
  arcadeSound.lose()
}

function spawnFruit() {
  const kind = Math.floor(Math.random() * FRUITS.length)
  fruits.push({
    x: 20 + Math.random() * (W.value - 40),
    y: -14,
    v: 190 + score.value * 5 + Math.random() * 60,
    kind,
  })
}

function step(dt: number) {
  // 键盘移动篮子
  const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  if (move) {
    basketX = Math.min(Math.max(basketX + move * 480 * dt, BASKET_W.value / 2), W.value - BASKET_W.value / 2)
  }
  spawnAcc += dt
  const interval = Math.max(0.42, 0.95 - score.value * 0.012)
  if (spawnAcc >= interval) {
    spawnAcc = 0
    spawnFruit()
  }
  for (const f of fruits) {
    f.y += f.v * dt
    // 接住
    if (f.y + FRUITS[f.kind]!.r >= basketY.value && f.y < basketY.value + 26 && Math.abs(f.x - basketX) <= BASKET_W.value / 2 + 4) {
      f.y = H.value + 999
      score.value++
      arcadeSound.merge(score.value)
      continue
    }
    if (f.y - FRUITS[f.kind]!.r > H.value) {
      f.y = H.value + 999
      lives.value--
      arcadeSound.lose()
      if (lives.value <= 0) {
        die()
        return
      }
    }
  }
  fruits = fruits.filter((f) => f.y < H.value + 100)
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
  // 水果
  for (const f of fruits) {
    const info = FRUITS[f.kind]!
    ctx.fillStyle = info.color
    ctx.beginPath()
    ctx.arc(f.x, f.y, info.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(76, 85, 112, 0.5)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(f.x, f.y - info.r)
    ctx.quadraticCurveTo(f.x + 4, f.y - info.r - 5, f.x + 7, f.y - info.r - 4)
    ctx.stroke()
  }
  // 篮子
  const grad = ctx.createLinearGradient(basketX - BASKET_W.value / 2, 0, basketX + BASKET_W.value / 2, 0)
  grad.addColorStop(0, '#ffa45c')
  grad.addColorStop(1, '#f490ad')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(basketX - BASKET_W.value / 2, basketY.value, BASKET_W.value, 24, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(basketX - BASKET_W.value / 2, basketY.value + 4)
  ctx.lineTo(basketX + BASKET_W.value / 2, basketY.value + 4)
  ctx.stroke()
  // 待机提示
  if (state.value === 'idle') {
    ctx.fillStyle = 'rgba(76, 85, 112, 0.6)'
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('移动鼠标对准篮口 · 点击画面开始', W.value / 2, H.value * 0.3)
  }
}

function loop(ts: number) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.032, lastTs ? (ts - lastTs) / 1000 : 0.016)
  lastTs = ts
  if (state.value === 'run' && props.active && roomActive) step(dt)
  draw()
}

function onPointer(e: MouseEvent) {
  const rect = canvasEl.value?.getBoundingClientRect()
  if (!rect) return
  basketX = Math.min(Math.max(e.clientX - rect.left, BASKET_W.value / 2), W.value - BASKET_W.value / 2)
}
function onTouch(e: TouchEvent) {
  const rect = canvasEl.value?.getBoundingClientRect()
  const t = e.touches[0]
  if (!rect || !t) return
  basketX = Math.min(Math.max(t.clientX - rect.left, BASKET_W.value / 2), W.value - BASKET_W.value / 2)
}
function onTap() {
  launch()
}
function onKey(e: KeyboardEvent) {
  if (!props.active || !roomActive) return
  if (e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault()
    launch()
    return
  }
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = e.type === 'keydown'
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = e.type === 'keydown'
}

watch(
  () => props.active,
  (active) => {
    if (!active && state.value === 'run') die()
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
  <div ref="paneEl" class="arc-pane arc-pcatch">
    <div class="arc-gamecol">
      <canvas
        ref="canvasEl"
        class="arc-flycanvas"
        :style="{ width: W + 'px', height: H + 'px' }"
        @mousemove="onPointer"
        @touchmove.prevent="onTouch"
        @click="onTap"
      />
      <p class="arc-hint">移动鼠标 / 手指对准篮口 · 点击画面或空格开始 · 漏三颗结束</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="build(); arcadeSound.click()"><RefreshCw :size="14" /> 重开</button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">接住水果</div>
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

    <div v-if="state === 'over'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-lose"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">篮子漏了</div>
        <div class="arc-oversub">这一局接住了 {{ score }} 颗水果</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtInt(score) }}</b><span>得分</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="launch(); arcadeSound.click()"><RefreshCw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
