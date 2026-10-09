<script setup lang="ts">
/**
 * 数字华容道机台（15 Puzzle）：点按或方向键把滑块滑回 1–15 的秩序
 * - 打乱方式为从复原态出发做 160 次随机合法滑动，必然有解
 * - 滑块定位走 CSS 变量 --pcell，棋盘随舞台自适应；纪录取最少步数
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RotateCcw, Shuffle, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, useArcadeRecords } from './arcade'

defineProps<{ active: boolean }>()
defineOptions({ name: 'GameSlidePuzzle' })

const N = 4
const SOLVED = Array.from({ length: N * N }, (_, i) => (i + 1) % (N * N))
const TILE_COLORS = ['#ffeed0', '#ffd9e4', '#f490ad', '#c79ae0', '#9b8ce8', '#6aaee8', '#5fc4a5', '#ffa45c']

const cells = ref<number[]>([...SOLVED])
const moves = ref(0)
const over = ref(false)
const finalDur = ref(0)
const isRecord = ref(false)
const pcellPx = ref(88)
const paneEl = ref<HTMLElement | null>(null)

let startTs = 0
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const emptyIndex = computed(() => cells.value.indexOf(0))
const bestMoves = computed(() => bestOf('puzzle')?.raw ?? null)
/** 滑块数字 → 当前所在格索引（key 按数字绑定，位置变化时 CSS transition 产生滑动动画） */
const positions = computed(() => {
  const m = new Map<number, number>()
  cells.value.forEach((v, i) => {
    if (v !== 0) m.set(v, i)
  })
  return m
})
function posOf(v: number): number {
  return positions.value.get(v) ?? 0
}

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(260, pane.clientHeight - 56)
  pcellPx.value = Math.max(56, Math.min(126, Math.floor((availH - 46) / N) - 10, Math.floor(availW / N) - 10))
}

function isSolved() {
  return cells.value.every((v, i) => v === SOLVED[i])
}

/** 从复原态做随机合法滑动打乱（不回退上一步），保证必有解 */
function shuffle() {
  cells.value = [...SOLVED]
  let empty = cells.value.indexOf(0)
  let prevEmpty = -1
  for (let k = 0; k < 160; k++) {
    const er = Math.floor(empty / N)
    const ec = empty % N
    const options: number[] = []
    if (er > 0) options.push(empty - N)
    if (er < N - 1) options.push(empty + N)
    if (ec > 0) options.push(empty - 1)
    if (ec < N - 1) options.push(empty + 1)
    const picks = options.filter((o) => o !== prevEmpty)
    const pick = (picks.length ? picks : options)[Math.floor(Math.random() * (picks.length ? picks.length : options.length))]!
    cells.value[empty] = cells.value[pick]!
    cells.value[pick] = 0
    prevEmpty = empty
    empty = pick
  }
  moves.value = 0
  over.value = false
  isRecord.value = false
  startTs = 0
  fit()
}

function tryMove(index: number) {
  if (over.value || index === emptyIndex.value) return
  const er = Math.floor(emptyIndex.value / N)
  const ec = emptyIndex.value % N
  const tr = Math.floor(index / N)
  const tc = index % N
  if (Math.abs(er - tr) + Math.abs(ec - tc) !== 1) return
  cells.value[emptyIndex.value] = cells.value[index]!
  cells.value[index] = 0
  if (!startTs) startTs = Date.now()
  moves.value++
  arcadeSound.move()
  if (isSolved()) finish()
}

/** 方向键：把空格相应方向上的滑块滑进来（ArrowLeft = 左侧滑块向右滑） */
function onKey(e: KeyboardEvent) {
  const er = Math.floor(emptyIndex.value / N)
  const ec = emptyIndex.value % N
  let target = -1
  if (e.key === 'ArrowLeft' && ec < N - 1) target = er * N + ec + 1
  if (e.key === 'ArrowRight' && ec > 0) target = er * N + ec - 1
  if (e.key === 'ArrowUp' && er < N - 1) target = (er + 1) * N + ec
  if (e.key === 'ArrowDown' && er > 0) target = (er - 1) * N + ec
  if (target < 0) return
  e.preventDefault()
  tryMove(target)
}

function finish() {
  over.value = true
  finalDur.value = startTs ? (Date.now() - startTs) / 1000 : 0
  const prev = bestMoves.value
  isRecord.value = prev === null || moves.value < prev
  addRecord({ g: 'puzzle', moves: moves.value, dur: Math.round(finalDur.value), win: true })
  arcadeSound.win()
}

onMounted(() => {
  shuffle()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  resizeOb?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-ppuzzle">
    <div class="arc-gamecol">
      <div class="arc-puzzleboard" :style="{ '--pcell': pcellPx + 'px' }">
        <button
          v-for="v in 15"
          :key="v"
          class="arc-ptile"
          :style="{
            transform: `translate(${(posOf(v) % N) * (pcellPx + 9)}px, ${Math.floor(posOf(v) / N) * (pcellPx + 9)}px)`,
            background: TILE_COLORS[(v - 1) % TILE_COLORS.length],
            color: (v - 1) % TILE_COLORS.length < 2 ? '#8a6a3f' : '#fff',
          }"
          :aria-label="'滑块 ' + v"
          @click="tryMove(posOf(v))"
        >
          {{ v }}
        </button>
      </div>
      <p class="arc-hint">点按滑块或用方向键 · 滑回 1–15 即复原</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="shuffle(); arcadeSound.click()"><Shuffle :size="14" /> 重新打乱</button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">已滑步数</div>
        <div class="arc-scoreval">{{ moves }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">本局用时</div>
        <div class="arc-scoreval">{{ startTs ? fmtDur((Date.now() - startTs) / 1000) : '—' }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ bestMoves == null ? '—' : bestMoves + ' 步' }}</div>
      </div>
    </div>

    <div v-if="over" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-win"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">秩序回归！</div>
        <div class="arc-oversub">1–15 各归其位</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ moves }}</b><span>步数</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="shuffle(); arcadeSound.click()"><RotateCcw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
