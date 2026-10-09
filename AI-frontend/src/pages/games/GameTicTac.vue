<script setup lang="ts">
/**
 * 井字棋机台：玩家执 ✗ 先手，AI 执 ○ 应战
 * - AI 以极小概率走出次优解（不然永远赢不了）；胜利会累计连胜，落败清零
 * - 纪录取最长连胜
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Circle, RotateCcw, X } from 'lucide-vue-next'
import ArcadeDiffSeg from './ArcadeDiffSeg.vue'
import { arcadeSound, fmtInt, useArcadeRecords, useArcadeSettings } from './arcade'

type Cell = 'X' | 'O' | ''
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

defineOptions({ name: 'GameTicTacAI' })

defineProps<{ active: boolean }>()

const board = ref<Cell[]>(Array(9).fill('') as Cell[])
const turn = ref<'X' | 'O'>('X')
const roundOver = ref(false)
const winLine = ref<number[]>([])
const streak = ref(0)
const tally = ref({ win: 0, draw: 0, lose: 0 })
const thinking = ref(false)
const cellPx = ref(110)
const paneEl = ref<HTMLElement | null>(null)

let resizeOb: ResizeObserver | null = null
let aiTimer: number | null = null

const { addRecord, bestOf } = useArcadeRecords()
const { settings, update } = useArcadeSettings()

const best = computed(() => bestOf('tictac')?.raw ?? 0)
const resultText = computed(() => {
  if (!roundOver.value) return turn.value === 'X' ? '轮到你落子' : 'AI 思考中…'
  if (winLine.value.length && board.value[winLine.value[0]!] === 'X') return '你赢了！'
  if (winLine.value.length && board.value[winLine.value[0]!] === 'O') return 'AI 赢了这局'
  return '握手言和'
})

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(260, pane.clientHeight - 56)
  cellPx.value = Math.max(76, Math.min(128, Math.floor((availH - 70) / 3) - 10, Math.floor(availW / 3) - 10))
}

function linesOf(b: Cell[], who: Cell): number[] | null {
  for (const line of LINES) {
    if (line.every((i) => b[i] === who)) return line
  }
  return null
}

function empties(b: Cell[]): number[] {
  return b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
}

/** 极小极大：返回当前局面的最好评分（O 即 AI 视角，1 胜 -1 负 0 平） */
function minimax(b: Cell[], isAI: boolean): number {
  const aiWin = linesOf(b, 'O')
  const xWin = linesOf(b, 'X')
  if (aiWin) return 1
  if (xWin) return -1
  const options = empties(b)
  if (!options.length) return 0
  const scores = options.map((i) => {
    b[i] = isAI ? 'O' : 'X'
    const s = minimax(b, !isAI)
    b[i] = ''
    return s
  })
  return isAI ? Math.max(...scores) : Math.min(...scores)
}

function aiMove() {
  const options = empties(board.value)
  if (!options.length) return
  // 难度：简单 55% 随手走 · 普通 15% · 困难全最优
  const rnd = settings.value.tictacDiff === 'easy' ? 0.55 : settings.value.tictacDiff === 'normal' ? 0.15 : 0
  let pick: number
  if (Math.random() < rnd) {
    pick = options[Math.floor(Math.random() * options.length)]!
  } else {
    let bestScore = -Infinity
    let picks: number[] = []
    for (const i of options) {
      board.value[i] = 'O'
      const s = minimax(board.value, false)
      board.value[i] = ''
      if (s > bestScore) {
        bestScore = s
        picks = [i]
      } else if (s === bestScore) {
        picks.push(i)
      }
    }
    pick = picks[Math.floor(Math.random() * picks.length)]!
  }
  board.value[pick] = 'O'
  arcadeSound.move()
  judge()
}

function judge() {
  const oLine = linesOf(board.value, 'O')
  const xLine = linesOf(board.value, 'X')
  if (xLine) {
    winLine.value = xLine
    roundOver.value = true
    streak.value++
    tally.value.win++
    arcadeSound.win()
    addRecord({ g: 'tictac', score: streak.value, win: true, dur: 0 })
    return true
  }
  if (oLine) {
    winLine.value = oLine
    roundOver.value = true
    streak.value = 0
    tally.value.lose++
    arcadeSound.lose()
    addRecord({ g: 'tictac', score: 0, win: false, dur: 0 })
    return true
  }
  if (!empties(board.value).length) {
    roundOver.value = true
    tally.value.draw++
    arcadeSound.match()
    // 平局不带 win 字段，与落败区分
    addRecord({ g: 'tictac', score: streak.value, dur: 0 })
    return true
  }
  return false
}

function play(i: number) {
  if (roundOver.value || thinking.value || board.value[i] || turn.value !== 'X') return
  board.value[i] = 'X'
  arcadeSound.flip()
  if (judge()) return
  turn.value = 'O'
  thinking.value = true
  aiTimer = window.setTimeout(() => {
    aiMove()
    thinking.value = false
    if (!roundOver.value) turn.value = 'X'
  }, 420)
}

function newRound() {
  clearTimer()
  board.value = Array(9).fill('') as Cell[]
  turn.value = 'X'
  roundOver.value = false
  winLine.value = []
  thinking.value = false
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
  <div ref="paneEl" class="arc-pane arc-ptictac">
    <div class="arc-gamecol">
      <div class="arc-tictacboard" :style="{ '--xcell': cellPx + 'px' }">
        <button
          v-for="(cell, i) in board"
          :key="i"
          class="arc-tttcell"
          :class="{ 'is-win': winLine.includes(i) }"
          :aria-label="'格子 ' + (i + 1)"
          @click="play(i)"
        >
          <X v-if="cell === 'X'" :size="cellPx * 0.42" :stroke-width="3" class="mark-x" />
          <Circle v-else-if="cell === 'O'" :size="cellPx * 0.4" :stroke-width="3" class="mark-o" />
        </button>
      </div>
      <p class="arc-hint" :class="{ 'is-thinking': thinking }">{{ resultText }}</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="newRound(); arcadeSound.click()"><RotateCcw :size="14" /> 新一局</button>
        <ArcadeDiffSeg :model-value="settings.tictacDiff" @update:model-value="(v) => update({ tictacDiff: v })" />
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
      <p class="arc-hint">AI 偶尔会走神，抓住机会三连</p>
    </div>
  </div>
</template>
