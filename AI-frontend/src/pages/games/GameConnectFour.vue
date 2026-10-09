<script setup lang="ts">
/**
 * 四子棋机台：7×6 重力棋盘，玩家执粉子先手，四连成线即胜
 * - AI 用 α-β 剪枝极小极大，难度即搜索深度（简单 1 + 45% 随手 / 普通 3 / 困难 5）
 * - 胜负计连胜，纪录取最长连胜
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import ArcadeDiffSeg from './ArcadeDiffSeg.vue'
import { arcadeSound, fmtInt, useArcadeRecords, useArcadeSettings, type VsDiff } from './arcade'

const COLS = 7
const ROWS = 6

defineOptions({ name: 'GameConnectFour' })

defineProps<{ active: boolean }>()

type Disc = 0 | 1 | 2

const board = ref<Disc[]>(Array(COLS * ROWS).fill(0) as Disc[])
const turn = ref<'P' | 'A'>('P')
const roundOver = ref(false)
const winLine = ref<number[]>([])
const streak = ref(0)
const tally = ref({ win: 0, draw: 0, lose: 0 })
const thinking = ref(false)
const hoverCol = ref(-1)
const cellPx = ref(56)
const paneEl = ref<HTMLElement | null>(null)

let aiTimer: number | null = null
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()
const { settings, update } = useArcadeSettings()

const best = computed(() => bestOf('connect')?.raw ?? 0)
const resultText = computed(() => {
  if (thinking.value) return 'AI 思考中…'
  if (!roundOver.value) return turn.value === 'P' ? '轮到你落子' : ''
  if (winLine.value.length) return board.value[winLine.value[0]!] === 1 ? '四连达成，你赢了！' : 'AI 四连，这局归它'
  return '棋盘满了，握手言和'
})

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(300, pane.clientHeight - 56)
  cellPx.value = Math.max(40, Math.min(62, Math.floor((availH - 40) / ROWS), Math.floor(availW / COLS)))
}

function colOf(i: number) {
  return (i - 1) % COLS
}
function dropRow(b: Disc[], c: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!b[r * COLS + c]) return r
  }
  return -1
}

const LINES4: ReadonlyArray<readonly [number, number, number, number]> = (() => {
  const out: Array<[number, number, number, number]> = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) out.push([r, c, r, c + 3])
      if (r + 3 < ROWS) out.push([r, c, r + 3, c])
      if (c + 3 < COLS && r + 3 < ROWS) out.push([r, c, r + 3, c + 3])
      if (c + 3 < COLS && r - 3 >= 0) out.push([r, c, r - 3, c + 3])
    }
  }
  return out
})()

/** 返回四连线（检查 who 在 b 上），并校验连线实际连续 */
function findWin(b: Disc[], who: Disc): number[] | null {
  for (const [r1, c1, r4, c4] of LINES4) {
    const dr = Math.sign(r4 - r1)
    const dc = Math.sign(c4 - c1)
    const line: number[] = []
    let ok = true
    for (let k = 0; k < 4; k++) {
      const r = r1 + dr * k
      const c = c1 + dc * k
      if (b[r * COLS + c] !== who) {
        ok = false
        break
      }
      line.push(r * COLS + c)
    }
    if (ok) return line
  }
  return null
}

function applyDrop(b: Disc[], c: number, who: Disc): number {
  const r = dropRow(b, c)
  if (r >= 0) b[r * COLS + c] = who
  return r
}

function judge(): boolean {
  const pWin = findWin(board.value, 1)
  const aWin = findWin(board.value, 2)
  if (pWin) {
    winLine.value = pWin
    roundOver.value = true
    streak.value++
    tally.value.win++
    arcadeSound.win()
    addRecord({ g: 'connect', score: streak.value, win: true, dur: 0 })
    return true
  }
  if (aWin) {
    winLine.value = aWin
    roundOver.value = true
    streak.value = 0
    tally.value.lose++
    arcadeSound.lose()
    addRecord({ g: 'connect', score: 0, win: false, dur: 0 })
    return true
  }
  if (board.value.every((v) => v)) {
    roundOver.value = true
    tally.value.draw++
    arcadeSound.match()
    addRecord({ g: 'connect', score: streak.value, dur: 0 })
    return true
  }
  return false
}

/** 局面评估：所有四连窗口打分（正为 AI 优势） */
function evalBoard(b: Disc[]): number {
  let s = 0
  for (const [r1, c1, r4, c4] of LINES4) {
    const dr = Math.sign(r4 - r1)
    const dc = Math.sign(c4 - c1)
    let ai = 0
    let me = 0
    for (let k = 0; k < 4; k++) {
      const v = b[(r1 + dr * k) * COLS + (c1 + dc * k)]!
      if (v === 2) ai++
      else if (v === 1) me++
    }
    if (ai && me) continue
    if (ai === 4) s += 100000
    else if (ai === 3) s += 120
    else if (ai === 2) s += 12
    if (me === 4) s -= 90000
    else if (me === 3) s -= 140
    else if (me === 2) s -= 14
  }
  // 中列偏好
  for (let r = 0; r < ROWS; r++) {
    if (b[r * COLS + 3] === 2) s += 6
    else if (b[r * COLS + 3] === 1) s -= 6
  }
  return s
}

function validCols(b: Disc[]): number[] {
  const out: number[] = []
  for (let c = 0; c < COLS; c++) if (dropRow(b, c) >= 0) out.push(c)
  return out
}

function minimax(b: Disc[], depth: number, alpha: number, beta: number, aiTurn: boolean): number {
  if (findWin(b, 2)) return 100000 - (5 - depth) * 100
  if (findWin(b, 1)) return -100000 + (5 - depth) * 100
  const cols = validCols(b)
  if (!cols.length || depth === 0) return evalBoard(b)
  if (aiTurn) {
    let value = -Infinity
    for (const c of cols) {
      const r = dropRow(b, c)
      b[r * COLS + c] = 2
      value = Math.max(value, minimax(b, depth - 1, alpha, beta, false))
      b[r * COLS + c] = 0
      alpha = Math.max(alpha, value)
      if (alpha >= beta) break
    }
    return value
  }
  let value = Infinity
  for (const c of cols) {
    const r = dropRow(b, c)
    b[r * COLS + c] = 1
    value = Math.min(value, minimax(b, depth - 1, alpha, beta, true))
    b[r * COLS + c] = 0
    beta = Math.min(beta, value)
    if (alpha >= beta) break
  }
  return value
}

const DEPTH: Record<VsDiff, number> = { easy: 1, normal: 3, hard: 5 }
const RANDOM_CHANCE: Record<VsDiff, number> = { easy: 0.45, normal: 0.08, hard: 0 }

function aiMove() {
  const cols = validCols(board.value)
  if (!cols.length) return
  let pick: number
  if (Math.random() < RANDOM_CHANCE[settings.value.connectDiff]) {
    pick = cols[Math.floor(Math.random() * cols.length)]!
  } else {
    let bestScore = -Infinity
    let picks: number[] = []
    for (const c of cols) {
      const r = dropRow(board.value, c)
      board.value[r * COLS + c] = 2
      const s = minimax(board.value, DEPTH[settings.value.connectDiff] - 1, -Infinity, Infinity, false)
      board.value[r * COLS + c] = 0
      if (s > bestScore) {
        bestScore = s
        picks = [c]
      } else if (s === bestScore) {
        picks.push(c)
      }
    }
    pick = picks[Math.floor(Math.random() * picks.length)]!
  }
  applyDrop(board.value, pick, 2)
  arcadeSound.move()
  if (judge()) return
  turn.value = 'P'
}

function dropIn(c: number) {
  if (roundOver.value || thinking.value || turn.value !== 'P') return
  const r = applyDrop(board.value, c, 1)
  if (r < 0) return
  arcadeSound.flip()
  if (judge()) return
  turn.value = 'A'
  thinking.value = true
  aiTimer = window.setTimeout(() => {
    aiMove()
    thinking.value = false
  }, 380)
}

function newRound() {
  clearTimer()
  board.value = Array(COLS * ROWS).fill(0) as Disc[]
  turn.value = 'P'
  roundOver.value = false
  winLine.value = []
  thinking.value = false
  hoverCol.value = -1
  arcadeSound.click()
  fit()
}

function clearTimer() {
  if (aiTimer !== null) {
    window.clearTimeout(aiTimer)
    aiTimer = null
    thinking.value = false
  }
}

watch(
  () => settings.value.connectDiff,
  () => {
    newRound()
  },
)

onMounted(() => {
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
})
onUnmounted(() => {
  clearTimer()
  resizeOb?.disconnect()
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pconnect">
    <div class="arc-gamecol">
      <div class="arc-connectboard" :style="{ '--ccell': cellPx + 'px' }">
        <button
          v-for="i in COLS * ROWS"
          :key="i"
          class="arc-ccell"
          :class="{
            'is-win': winLine.includes(i - 1),
            'is-hover': hoverCol === colOf(i),
          }"
          :aria-label="'第 ' + (colOf(i) + 1) + ' 列'"
          @click="dropIn(colOf(i))"
          @mouseenter="hoverCol = colOf(i)"
          @mouseleave="hoverCol = -1"
        >
          <span
            v-if="board[i - 1]"
            class="arc-cdisc"
            :class="board[i - 1] === 1 ? 'is-me' : 'is-ai'"
          />
          <span v-else-if="turn === 'P' && !roundOver" class="arc-chint" />
        </button>
      </div>
      <p class="arc-hint" :class="{ 'is-thinking': thinking }">{{ resultText }}</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="newRound(); arcadeSound.click()"><RotateCcw :size="14" /> 新一局</button>
        <ArcadeDiffSeg :model-value="settings.connectDiff" @update:model-value="(v) => update({ connectDiff: v })" />
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">当前连胜</div>
        <div class="arc-scoreval">{{ streak }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">胜 / 平 / 负</div>
        <div class="arc-scoreval arc-tally">{{ tally.win }}<em>/</em>{{ tally.draw }}<em>/</em>{{ tally.lose }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">最长连胜</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, streak)) }}</div>
      </div>
    </div>
  </div>
</template>
