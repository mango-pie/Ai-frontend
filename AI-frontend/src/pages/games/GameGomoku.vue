<script setup lang="ts">
/**
 * 五子棋机台：11 路棋盘，玩家执粉子先手，AI 执蓝子应战
 * - AI 启发式评分分三档难度：简单只看眼前且有噪声 / 正常攻防兼顾 / 困难多算一层对手回应
 * - 胜负计连胜，纪录取最长连胜
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import ArcadeDiffSeg from './ArcadeDiffSeg.vue'
import { arcadeSound, fmtInt, useArcadeRecords, useArcadeSettings } from './arcade'

const N = 11

defineOptions({ name: 'GameGomokuBoard' })

const props = defineProps<{ active: boolean }>()

type Stone = 0 | 1 | 2 // 0 空 1 玩家(粉) 2 AI(蓝)

const board = ref<Stone[]>(Array(N * N).fill(0) as Stone[])
const roundOver = ref(false)
const winStones = ref<number[]>([])
const result = ref<'win' | 'lose' | 'draw' | null>(null)
const streak = ref(0)
const tally = ref({ win: 0, draw: 0, lose: 0 })
const thinking = ref(false)
const lastMove = ref(-1)
const roundStart = ref(0)
const finalDur = ref(0)
const isRecord = ref(false)
const cellPx = ref(44)
const paneEl = ref<HTMLElement | null>(null)

let aiTimer: number | null = null
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()
const { settings, update } = useArcadeSettings()

const best = computed(() => bestOf('gomoku')?.raw ?? 0)
const stoneCount = computed(() => board.value.filter((v) => v).length)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(300, pane.clientHeight - 56)
  cellPx.value = Math.max(30, Math.min(46, Math.floor((availH - 40) / N), Math.floor(availW / N)))
}

function rc(i: number) {
  return { r: Math.floor(i / N), c: i % N }
}
function idx(r: number, c: number) {
  return r * N + c
}
function get(r: number, c: number): Stone {
  if (r < 0 || c < 0 || r >= N || c >= N) return -1 as unknown as Stone
  return board.value[idx(r, c)]!
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

/** 从 (r,c) 出发某方向连续同色棋子数 */
function lineLen(r: number, c: number, dr: number, dc: number, who: Stone): number {
  let n = 0
  let rr = r + dr
  let cc = c + dc
  while (get(rr, cc) === who) {
    n++
    rr += dr
    cc += dc
  }
  return n
}

function winLineAt(i: number, who: Stone): number[] | null {
  const { r, c } = rc(i)
  for (const [dr, dc] of DIRS) {
    const line = [i]
    for (const sign of [1, -1]) {
      let rr = r + dr * sign
      let cc = c + dc * sign
      while (get(rr, cc) === who) {
        line.push(idx(rr, cc))
        rr += dr * sign
        cc += dc * sign
      }
    }
    if (line.length >= 5) return line
  }
  return null
}

/** 启发式打分：成五 > 活四/冲四 > 活三，攻防兼顾 */
function scoreCell(i: number, who: Stone): number {
  const { r, c } = rc(i)
  let total = 0
  for (const [dr, dc] of DIRS) {
    const a = lineLen(r, c, dr, dc, who)
    const b = lineLen(r, c, -dr, -dc, who)
    const n = a + b + 1
    if (n >= 5) total += 100000
    else if (n === 4) total += a > 0 && b > 0 ? 12000 : 4200
    else if (n === 3) total += a > 0 && b > 0 ? 2400 : 700
    else if (n === 2) total += a > 0 && b > 0 ? 320 : 90
    else total += 12
  }
  return total
}

function candidates(): number[] {
  const out: number[] = []
  for (let i = 0; i < N * N; i++) {
    if (board.value[i]) continue
    const { r, c } = rc(i)
    let near = false
    for (let dr = -2; dr <= 2 && !near; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (get(r + dr, c + dc)) {
          near = true
          break
        }
      }
    }
    if (near) out.push(i)
  }
  return out
}

function aiMove() {
  const cands = candidates()
  if (!cands.length) return
  const diff = settings.value.gomokuDiff
  let pick = cands[0]!
  let bestScore = -1
  for (const i of cands) {
    const attack = scoreCell(i, 2)
    const defend = scoreCell(i, 1)
    let s: number
    if (diff === 'easy') {
      // 简单：威胁感知减半，且带随机噪声，偶尔漏堵
      s = Math.max(attack * 0.6, defend * 0.55) + Math.random() * 1400
    } else if (diff === 'hard') {
      // 困难：多算一层——落子后对手的最强回应
      let oppBest = 0
      board.value[i] = 2
      for (const j of candidates()) {
        oppBest = Math.max(oppBest, scoreCell(j, 1) * 0.85 + scoreCell(j, 2) * 0.15)
      }
      board.value[i] = 0
      s = Math.max(attack, defend) - oppBest
    } else {
      s = Math.max(attack, defend * 0.92)
    }
    if (s > bestScore) {
      bestScore = s
      pick = i
    }
  }
  board.value[pick] = 2
  lastMove.value = pick
  arcadeSound.move()
  const line = winLineAt(pick, 2)
  if (line) endRound(false, line)
}

function play(i: number) {
  if (roundOver.value || thinking.value || board.value[i]) return
  if (!roundStart.value) roundStart.value = Date.now()
  board.value[i] = 1
  lastMove.value = i
  arcadeSound.flip()
  const line = winLineAt(i, 1)
  if (line) {
    endRound(true, line)
    return
  }
  if (stoneCount.value >= N * N) {
    endRound(null, [])
    return
  }
  thinking.value = true
  aiTimer = window.setTimeout(() => {
    aiMove()
    thinking.value = false
  }, 380)
}

function endRound(playerWon: boolean | null, line: number[]) {
  roundOver.value = true
  winStones.value = line
  finalDur.value = roundStart.value ? (Date.now() - roundStart.value) / 1000 : 0
  if (playerWon === true) {
    result.value = 'win'
    streak.value++
    tally.value.win++
    isRecord.value = streak.value > 0 && streak.value >= best.value
    addRecord({ g: 'gomoku', score: streak.value, win: true, dur: Math.round(finalDur.value) })
    arcadeSound.win()
  } else if (playerWon === false) {
    result.value = 'lose'
    streak.value = 0
    tally.value.lose++
    isRecord.value = false
    addRecord({ g: 'gomoku', score: 0, win: false, dur: Math.round(finalDur.value) })
    arcadeSound.lose()
  } else {
    result.value = 'draw'
    tally.value.draw++
    isRecord.value = false
    addRecord({ g: 'gomoku', score: streak.value, dur: Math.round(finalDur.value) })
    arcadeSound.match()
  }
}

function newRound() {
  clearTimer()
  board.value = Array(N * N).fill(0) as Stone[]
  roundOver.value = false
  winStones.value = []
  result.value = null
  thinking.value = false
  lastMove.value = -1
  roundStart.value = 0
  finalDur.value = 0
  isRecord.value = false
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

const statusText = computed(() => {
  if (thinking.value) return 'AI 思考中…'
  if (roundOver.value) {
    if (result.value === 'win') return '五连达成，你赢了！' + (isRecord.value ? ' · 舱内新纪录！' : '')
    if (result.value === 'lose') return 'AI 五连，这局归它'
    return '棋盘满了，握手言和'
  }
  return roundStart.value ? '轮到你落子' : '点击任意交叉点开局'
})

watch(
  () => props.active,
  (active) => {
    if (!active) clearTimer()
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
  <div ref="paneEl" class="arc-pane arc-pgomoku">
    <div class="arc-gamecol">
      <div class="arc-gomokuboard" :style="{ '--gcell': cellPx + 'px' }">
        <button
          v-for="i in N * N"
          :key="i"
          class="arc-gcell"
          :class="{
            'is-last': lastMove === i - 1,
            'is-win': winStones.includes(i - 1),
          }"
          :aria-label="'交叉点 ' + i"
          @click="play(i - 1)"
        >
          <span
            v-if="board[i - 1]"
            class="arc-stone"
            :class="board[i - 1] === 1 ? 'is-me' : 'is-ai'"
          />
        </button>
      </div>
      <p class="arc-hint">{{ statusText }}</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="newRound(); arcadeSound.click()"><RotateCcw :size="14" /> 新一局</button>
        <ArcadeDiffSeg :model-value="settings.gomokuDiff" @update:model-value="(v) => update({ gomokuDiff: v })" />
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
      <p class="arc-hint">你执粉子先手 · AI 会堵你的活三，记得做双威胁</p>
    </div>
  </div>
</template>
