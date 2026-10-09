<script setup lang="ts">
/**
 * 黑白棋机台：8×8 棋盘，玩家执粉子先手，夹住对方棋子即翻转
 * - AI 难度：简单 = 随机偏贪吃 / 普通 = 位置权重贪吃 / 困难 = 两步搜索（位置 + 行动力）
 * - 双方无子可走时终局，子多者胜；胜负计连胜，平局不计胜负
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import ArcadeDiffSeg from './ArcadeDiffSeg.vue'
import { arcadeSound, fmtInt, useArcadeRecords, useArcadeSettings } from './arcade'

const N = 8

defineOptions({ name: 'GameReversiDuel' })

defineProps<{ active: boolean }>()

type Disc = 0 | 1 | 2 // 0 空 1 玩家(粉) 2 AI(蓝)

const board = ref<Disc[]>(Array(N * N).fill(0) as Disc[])
const turn = ref<'P' | 'A'>('P')
const roundOver = ref(false)
const lastMove = ref(-1)
const streak = ref(0)
const tally = ref({ win: 0, draw: 0, lose: 0 })
const thinking = ref(false)
const passHint = ref('')
const finalDur = ref(0)
const cellPx = ref(56)
const paneEl = ref<HTMLElement | null>(null)

let aiTimer: number | null = null
let resizeOb: ResizeObserver | null = null
let roundStart = 0

const { addRecord, bestOf } = useArcadeRecords()
const { settings, update } = useArcadeSettings()

const best = computed(() => bestOf('reversi')?.raw ?? 0)
const myCount = computed(() => board.value.filter((v) => v === 1).length)
const aiCount = computed(() => board.value.filter((v) => v === 2).length)

/** 位置权重表：角最贵，角旁负分 */
const WEIGHTS = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -40, -2, -2, -2, -2, -40, -20,
  10, -2, 6, 1, 1, 6, -2, 10,
  5, -2, 1, 3, 3, 1, -2, 5,
  5, -2, 1, 3, 3, 1, -2, 5,
  10, -2, 6, 1, 1, 6, -2, 10,
  -20, -40, -2, -2, -2, -2, -40, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
]

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(300, pane.clientHeight - 56)
  cellPx.value = Math.max(38, Math.min(58, Math.floor((availH - 40) / N), Math.floor(availW / N)))
}

function at(r: number, c: number): Disc {
  if (r < 0 || c < 0 || r >= N || c >= N) return -1 as unknown as Disc
  return board.value[r * N + c]!
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

/** 在 i 落子（who）能翻转的子列表；非法返回空 */
function flipsFor(b: Disc[], i: number, who: Disc): number[] {
  if (b[i]) return []
  const opp: Disc = who === 1 ? 2 : 1
  const r0 = Math.floor(i / N)
  const c0 = i % N
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const line: number[] = []
    let r = r0 + dr
    let c = c0 + dc
    while (at(r, c) === opp) {
      line.push(r * N + c)
      r += dr
      c += dc
    }
    if (line.length && at(r, c) === who) out.push(...line)
  }
  return out
}

function validMoves(b: Disc[], who: Disc): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (let i = 0; i < N * N; i++) {
    const flips = flipsFor(b, i, who)
    if (flips.length) map.set(i, flips)
  }
  return map
}

function applyMove(b: Disc[], i: number, who: Disc) {
  for (const f of flipsFor(b, i, who)) b[f] = who
  b[i] = who
}

function judgeEnd() {
  const p = board.value.filter((v) => v === 1).length
  const a = board.value.filter((v) => v === 2).length
  roundOver.value = true
  finalDur.value = roundStart ? (Date.now() - roundStart) / 1000 : 0
  if (p > a) {
    streak.value++
    tally.value.win++
    addRecord({ g: 'reversi', score: streak.value, win: true, dur: Math.round(finalDur.value) })
    arcadeSound.win()
  } else if (a > p) {
    streak.value = 0
    tally.value.lose++
    addRecord({ g: 'reversi', score: 0, win: false, dur: Math.round(finalDur.value) })
    arcadeSound.lose()
  } else {
    tally.value.draw++
    addRecord({ g: 'reversi', score: streak.value, dur: Math.round(finalDur.value) })
    arcadeSound.match()
  }
}

/** 推进回合：处理无子可走的跳过与终局；返回是否继续 */
function advance() {
  if (roundOver.value) return false
  const who: Disc = turn.value === 'P' ? 1 : 2
  const moves = validMoves(board.value, who)
  if (moves.size) return true
  const opp: 'P' | 'A' = turn.value === 'P' ? 'A' : 'P'
  const oppMoves = validMoves(board.value, opp === 'P' ? 1 : 2)
  if (!oppMoves.size) {
    judgeEnd()
    return false
  }
  passHint.value = `${turn.value === 'P' ? 'AI' : '你'}无子可走，跳过`
  turn.value = opp
  window.setTimeout(() => (passHint.value = ''), 1500)
  return advance()
}

function afterPlayer() {
  turn.value = 'A'
  thinking.value = true
  aiTimer = window.setTimeout(() => {
    aiMove()
    thinking.value = false
    if (roundOver.value) return
    if (advance()) turn.value = 'P'
  }, 420)
}

function play(i: number) {
  if (roundOver.value || thinking.value || turn.value !== 'P') return
  const flips = flipsFor(board.value, i, 1)
  if (!flips.length) return
  if (!roundStart) roundStart = Date.now()
  applyMove(board.value, i, 1)
  lastMove.value = i
  arcadeSound.flip()
  if (advance()) afterPlayer()
}

function aiMove() {
  const moves = validMoves(board.value, 2)
  if (!moves.size) return
  const entries = [...moves.entries()]
  const diff = settings.value.reversiDiff
  let pick: number
  if (diff === 'easy') {
    // 简单：纯贪吃翻转数，40% 随机
    pick = Math.random() < 0.4 ? entries[Math.floor(Math.random() * entries.length)]![0] : entries.reduce((a, b) => (b[1].length > a[1].length ? b : a))[0]
  } else if (diff === 'normal') {
    // 普通：位置权重 + 翻转数
    pick = entries.reduce((a, b) => (WEIGHTS[b[0]]! + b[1].length > WEIGHTS[a[0]]! + a[1].length ? b : a))[0]
  } else {
    // 困难：两步搜索——我下之后，对手最强回应的净收益最小者
    let bestScore = -Infinity
    let picks: number[] = []
    for (const [i, flips] of entries) {
      const copy = [...board.value] as Disc[]
      applyMove(copy, i, 2)
      const oppMoves = validMoves(copy, 1)
      let oppBest = 0
      for (const [, of] of oppMoves) oppBest = Math.max(oppBest, of.length)
      const s = WEIGHTS[i]! + flips.length - oppBest * 3
      if (s > bestScore) {
        bestScore = s
        picks = [i]
      } else if (s === bestScore) {
        picks.push(i)
      }
    }
    pick = picks[Math.floor(Math.random() * picks.length)]!
  }
  applyMove(board.value, pick, 2)
  lastMove.value = pick
  arcadeSound.move()
}

function newRound() {
  clearTimer()
  board.value = Array(N * N).fill(0) as Disc[]
  board.value[27] = 1
  board.value[28] = 2
  board.value[35] = 2
  board.value[36] = 1
  turn.value = 'P'
  roundOver.value = false
  lastMove.value = -1
  thinking.value = false
  passHint.value = ''
  roundStart = 0
  finalDur.value = 0
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
  () => settings.value.reversiDiff,
  () => {
    newRound()
  },
)

onMounted(() => {
  newRound()
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
  <div ref="paneEl" class="arc-pane arc-preversi">
    <div class="arc-gamecol">
      <div class="arc-reversiboard" :style="{ '--rcell': cellPx + 'px' }">
        <button
          v-for="i in N * N"
          :key="i"
          class="arc-rvccell"
          :class="{
            'is-last': lastMove === i - 1,
            'is-playable': !roundOver && turn === 'P' && !!flipsFor(board, i - 1, 1).length,
          }"
          :aria-label="'棋格 ' + i"
          @click="play(i - 1)"
        >
          <span v-if="board[i - 1]" class="arc-rvdisc" :class="board[i - 1] === 1 ? 'is-me' : 'is-ai'" />
          <span v-else-if="turn === 'P' && !roundOver && flipsFor(board, i - 1, 1).length" class="arc-rvhint" />
        </button>
      </div>
      <p class="arc-hint">
        {{ passHint || (roundOver ? `终局 ${myCount} : ${aiCount}` : thinking ? 'AI 思考中…' : turn === 'P' ? '轮到你落子 · 亮点为可落子处' : '') }}
      </p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="newRound(); arcadeSound.click()"><RotateCcw :size="14" /> 新一局</button>
        <ArcadeDiffSeg :model-value="settings.reversiDiff" @update:model-value="(v) => update({ reversiDiff: v })" />
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">子数比</div>
        <div class="arc-scoreval arc-tally">{{ myCount }}<em>:</em>{{ aiCount }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">当前连胜</div>
        <div class="arc-scoreval">{{ streak }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">最长连胜</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, streak)) }}</div>
      </div>
    </div>
  </div>
</template>
