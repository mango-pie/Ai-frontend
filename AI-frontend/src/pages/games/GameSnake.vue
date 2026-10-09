<script setup lang="ts">
/**
 * 贪吃蛇机台：方向键 / WASD / 触屏滑动 / 屏幕方向键
 * - 吃到食物变长加速（160ms 起步，每颗 -3ms，下限 70ms）；撞墙或咬到自己结束
 * - 蛇身与食物定位走 CSS 变量 --scell，棋盘随舞台自适应
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw, Trophy } from 'lucide-vue-next'
import { SNAKE_ART } from './assets'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords } from './arcade'

type Dir = 'up' | 'down' | 'left' | 'right'
const DIR_V: Record<Dir, { r: number; c: number }> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
}
const OPPO: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

const N = 17

const props = defineProps<{ active: boolean }>()
defineOptions({ name: 'GameSnakeRun' })

const snake = ref<Array<{ r: number; c: number }>>([])
const food = ref<{ r: number; c: number } | null>(null)
const score = ref(0)
const best = ref(0)
const over = ref(false)
const finalDur = ref(0)
const isRecord = ref(false)
const scellPx = ref(36)
const paneEl = ref<HTMLElement | null>(null)
const boardEl = ref<HTMLElement | null>(null)

let dir: Dir = 'right'
let pending: Dir | null = null
/** 蛇头朝向（素材贴图随方向旋转） */
const headDir = ref<Dir>('right')
let timer: number | null = null
let startTs = 0
let roomActive = false
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const boardPx = computed(() => scellPx.value * N)
const speed = computed(() => Math.max(70, 160 - score.value * 3))

/** 蛇头贴图旋转角（Twemoji 蛇头朝左） */
const rotDeg = computed(() => ({ left: 0, up: 90, down: -90, right: 180 })[headDir.value])

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const sideH = col ? 280 : 0
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(260, pane.clientHeight - 56 - sideH)
  scellPx.value = Math.max(18, Math.min(44, Math.floor(Math.min(availW, availH) / N) - 1))
}

function freeCells(): Array<{ r: number; c: number }> {
  const taken = new Set(snake.value.map((s) => s.r * N + s.c))
  const out: Array<{ r: number; c: number }> = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!taken.has(r * N + c)) out.push({ r, c })
    }
  }
  return out
}

function spawnFood() {
  const free = freeCells()
  if (!free.length) {
    food.value = null
    return false
  }
  food.value = free[Math.floor(Math.random() * free.length)]!
  return true
}

function restart() {
  stopLoop()
  snake.value = [
    { r: Math.floor(N / 2), c: Math.floor(N / 2) },
    { r: Math.floor(N / 2), c: Math.floor(N / 2) - 1 },
    { r: Math.floor(N / 2), c: Math.floor(N / 2) - 2 },
  ]
  dir = 'right'
  pending = null
  score.value = 0
  over.value = false
  isRecord.value = false
  startTs = Date.now()
  best.value = bestOf('snake')?.raw ?? 0
  spawnFood()
  ensureLoop()
}

function schedule() {
  stopLoop()
  timer = window.setTimeout(tick, speed.value)
}

/** 只有机台处于当前视图且房间激活时才让蛇跑起来 */
function ensureLoop() {
  if (!over.value && props.active && roomActive && timer === null) schedule()
}

function stopLoop() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

function tick() {
  if (over.value) return
  if (pending) {
    if (pending !== OPPO[dir]) dir = pending
    pending = null
  }
  headDir.value = dir
  const v = DIR_V[dir]
  const head = snake.value[0]!
  const nr = head.r + v.r
  const nc = head.c + v.c
  // 撞墙 / 咬到自己（尾巴即将移走时仍视为碰撞，保守判定）
  if (nr < 0 || nc < 0 || nr >= N || nc >= N || snake.value.some((s, i) => i < snake.value.length - 1 && s.r === nr && s.c === nc)) {
    die()
    return
  }
  snake.value.unshift({ r: nr, c: nc })
  if (food.value && food.value.r === nr && food.value.c === nc) {
    score.value++
    arcadeSound.match()
    if (!spawnFood()) {
      // 蛇填满整个棋盘：通关
      win()
      return
    }
  } else {
    snake.value.pop()
  }
  ensureLoop()
}

function die() {
  over.value = true
  stopLoop()
  finalDur.value = (Date.now() - startTs) / 1000
  const prev = bestOf('snake')?.raw ?? 0
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'snake', score: score.value, dur: Math.round(finalDur.value) })
  arcadeSound.lose()
}

function win() {
  over.value = true
  stopLoop()
  finalDur.value = (Date.now() - startTs) / 1000
  isRecord.value = true
  addRecord({ g: 'snake', score: score.value, dur: Math.round(finalDur.value), win: true })
  arcadeSound.win()
}

function turn(d: Dir) {
  if (over.value) return
  pending = d
}

function onKey(e: KeyboardEvent) {
  const map: Record<string, Dir> = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right',
  }
  const d = map[e.key.toLowerCase()]
  if (!d) return
  e.preventDefault()
  turn(d)
}

let touchX = 0
let touchY = 0
function onTouchStart(e: TouchEvent) {
  touchX = e.touches[0]!.clientX
  touchY = e.touches[0]!.clientY
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0]!.clientX - touchX
  const dy = e.changedTouches[0]!.clientY - touchY
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
  turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
}

// 房间 / 机台切走时暂停蛇的移动，回来继续（首次切到本机台才开始起跑）
watch(
  () => [props.active, roomActive] as const,
  ([active, roomOn]) => {
    if (active && roomOn) ensureLoop()
    else stopLoop()
  },
)

onMounted(() => {
  restart()
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
  window.addEventListener('keydown', onKey)
  roomActive = true
})
onActivated(() => {
  roomActive = true
})
onDeactivated(() => {
  roomActive = false
})
onUnmounted(() => {
  resizeOb?.disconnect()
  stopLoop()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-psnake">
    <div class="arc-gamecol">
      <div
        ref="boardEl"
        class="arc-snakeboard"
        :style="{ width: boardPx + 'px', height: boardPx + 'px', '--scell': scellPx + 'px' }"
        @touchstart.passive="onTouchStart"
        @touchend="onTouchEnd"
      >
        <span
          v-for="(s, i) in snake"
          :key="'s' + i"
          class="arc-snakeseg"
          :class="{ 'is-head': i === 0 }"
          :style="{ transform: `translate(${s.c * scellPx}px, ${s.r * scellPx}px) ${i === 0 ? `rotate(${rotDeg}deg)` : ''}` }"
        >
          <img v-if="i === 0" class="arc-snakehead" :src="SNAKE_ART.head" alt="">
        </span>
        <span
          v-if="food"
          class="arc-snakefood"
          :style="{ transform: `translate(${food.c * scellPx}px, ${food.r * scellPx}px)` }"
        >
          <img :src="SNAKE_ART.food" alt="">
        </span>
      </div>
      <p class="arc-hint">方向键 / WASD / 滑动 · 吃到食物会加速</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="restart(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">当前长度 / 得分</div>
        <div class="arc-scoreval">{{ fmtInt(score) }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, score)) }}</div>
      </div>
      <div class="arc-dpad">
        <span />
        <button aria-label="上" @click="turn('up')"><ChevronUp :size="17" /></button>
        <span />
        <button aria-label="左" @click="turn('left')"><ChevronLeft :size="17" /></button>
        <button aria-label="下" @click="turn('down')"><ChevronDown :size="17" /></button>
        <button aria-label="右" @click="turn('right')"><ChevronRight :size="17" /></button>
      </div>
    </div>

    <div v-if="over" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico" :class="score >= best && score > 0 ? 'is-win' : 'is-lose'"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">{{ score >= best && score > 0 ? '蛇行满了整片原野！' : '这一程到此为止' }}</div>
        <div class="arc-oversub">{{ finalDur > 0 ? '蛇行了 ' + fmtDur(finalDur) : '' }}</div>
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
