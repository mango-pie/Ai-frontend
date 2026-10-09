<script setup lang="ts">
/**
 * 叠塔方块机台（Stack）：滑块左右往返，点击 / 空格落下
 * - 对齐部分保留宽度，完全错位即结束；严丝合缝有奖励分并小幅回宽
 * - 视角随塔高下移；纪取最高层数
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { RotateCcw, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords } from './arcade'

defineOptions({ name: 'GameTowerStack' })

const props = defineProps<{ active: boolean }>()

const BLOCK_H = 22
const COLORS = ['#f490ad', '#c79ae0', '#9b8ce8', '#6aaee8', '#5fc4a5', '#ffcf6e', '#ffa45c', '#e0699b']

const score = ref(0)
const state = ref<'idle' | 'run' | 'over'>('idle')
const finalDur = ref(0)
const isRecord = ref(false)
const W = ref(420)
const H = ref(560)
const paneEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

interface Layer {
  x: number
  w: number
  color: string
}

let layers: Layer[] = []
let cur: Layer = { x: 0, w: 0, color: '' }
let dir = 1
let raf = 0
let lastTs = 0
let startTs = 0
let roomActive = false
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const BASE_W = computed(() => Math.min(200, W.value * 0.46))
const speed = computed(() => 190 + score.value * 7)
const best = computed(() => bestOf('stack')?.raw ?? 0)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  W.value = Math.max(320, Math.min(460, pane.clientWidth - 48 - sideW))
  H.value = Math.max(400, Math.min(640, pane.clientHeight - 56))
}

function build() {
  layers = [{ x: (W.value - BASE_W.value) / 2, w: BASE_W.value, color: COLORS[0]! }]
  cur = { x: 10, w: BASE_W.value, color: COLORS[1]! }
  dir = 1
  score.value = 0
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

function drop() {
  if (state.value !== 'run') return
  const below = layers[layers.length - 1]!
  const left = Math.max(cur.x, below.x)
  const right = Math.min(cur.x + cur.w, below.x + below.w)
  const overlap = right - left
  if (overlap <= 0) {
    die()
    return
  }
  const perfect = Math.abs(overlap - below.w) < 3 && Math.abs(cur.x - below.x) < 3
  const placed: Layer = { x: left, w: overlap, color: COLORS[score.value % COLORS.length]! }
  layers.push(placed)
  score.value++
  if (perfect) {
    // 严丝合缝：奖励分并对齐回弹满宽（最多回到初始宽）
    placed.w = Math.min(below.w + 6, BASE_W.value)
    placed.x = below.x - (placed.w - below.w) / 2
    score.value += 5
    arcadeSound.match()
  } else {
    arcadeSound.merge(score.value)
  }
  cur = { x: dir > 0 ? 0 : W.value - placed.w, w: placed.w, color: COLORS[(score.value + 1) % COLORS.length]! }
}

function die() {
  state.value = 'over'
  finalDur.value = startTs ? (Date.now() - startTs) / 1000 : 0
  const prev = bestOf('stack')?.raw ?? 0
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'stack', score: score.value, dur: Math.round(finalDur.value) })
  arcadeSound.lose()
}

function step(dt: number) {
  cur.x += dir * speed.value * dt
  if (cur.x < 0) {
    cur.x = 0
    dir = 1
  }
  if (cur.x + cur.w > W.value) {
    cur.x = W.value - cur.w
    dir = -1
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
  // 视角：塔顶保持在画布中部，塔高了整体下移
  const towerH = layers.length * BLOCK_H
  const topY = Math.max(80, H.value - 60 - towerH)
  const baseY = topY + towerH
  layers.forEach((l, i) => {
    ctx.fillStyle = l.color
    ctx.beginPath()
    ctx.roundRect(l.x, baseY - (i + 1) * BLOCK_H, l.w, BLOCK_H - 2, 5)
    ctx.fill()
  })
  if (state.value !== 'over') {
    const curY = baseY - (layers.length + 1) * BLOCK_H
    ctx.fillStyle = cur.color
    ctx.globalAlpha = 0.92
    ctx.beginPath()
    ctx.roundRect(cur.x, curY, cur.w, BLOCK_H - 2, 5)
    ctx.fill()
    ctx.globalAlpha = 1
    // 底部对齐参考虚线
    const below = layers[layers.length - 1]!
    ctx.strokeStyle = 'rgba(76, 85, 112, 0.25)'
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(below.x, baseY + 6)
    ctx.lineTo(below.x + below.w, baseY + 6)
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (state.value === 'idle') {
    ctx.fillStyle = 'rgba(76, 85, 112, 0.6)'
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('点击画面或按空格放块', W.value / 2, H.value * 0.18)
  }
}

function loop(ts: number) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.032, lastTs ? (ts - lastTs) / 1000 : 0.016)
  lastTs = ts
  if (state.value === 'run' && props.active && roomActive) step(dt)
  draw()
}

function tap() {
  if (state.value === 'over') {
    build()
    launch()
    return
  }
  if (state.value === 'idle') launch()
  else drop()
}
function onKey(e: KeyboardEvent) {
  if (!props.active || !roomActive) return
  if (e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault()
    tap()
  }
}

// 切走机台直接结算
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
  <div ref="paneEl" class="arc-pane arc-pstack">
    <div class="arc-gamecol">
      <canvas
        ref="canvasEl"
        class="arc-flycanvas"
        :style="{ width: W + 'px', height: H + 'px' }"
        @click="tap"
        @touchstart.prevent="tap"
      />
      <p class="arc-hint">点击 / 空格放块 · 严丝合缝 +5 并回弹宽度</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="build(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">塔高层数</div>
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
        <div class="arc-overtitle">歪出去啦</div>
        <div class="arc-oversub">塔停在了 {{ score }} 层</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtInt(score) }}</b><span>层数</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="build(); launch(); arcadeSound.click()"><RotateCcw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
