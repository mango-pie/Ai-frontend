<script setup lang="ts">
/**
 * 斗兽棋机台：7×9 棋盘，玩家执暖红方（下方）先手，进入对方兽穴或吃光对方棋子获胜
 * - 完整规则：兽阶捕食（鼠可胜象、象不食鼠）、鼠入河（水中只受鼠攻击、出水不吃子）、
 *   狮虎跃河（河中有鼠阻挡）、陷阱弱化（入对方陷阱兽阶归零）、不可自入兽穴、
 *   无子可动判负、60 步无吃子判和
 * - AI 难度：简单 = 贪心加扰动 / 普通 = 3 层 α-β / 困难 = 迭代加深 2–6 层 α-β（节点/时限兜底）
 * - 棋子素材为白色剪影 SVG，经 CSS mask 按阵营染色（见 assets.ts JUNGLE_ART 与 ASSETS.md）
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Popover } from 'ant-design-vue'
import { CircleHelp, RotateCcw } from 'lucide-vue-next'
import ArcadeDiffSeg from './ArcadeDiffSeg.vue'
import { JUNGLE_ART } from './assets'
import { arcadeSound, fmtInt, useArcadeRecords, useArcadeSettings } from './arcade'

defineOptions({ name: 'GameJungleDuel' })

defineProps<{ active: boolean }>()

const COLS = 7
const ROWS = 9
const N = COLS * ROWS

type Side = 1 | -1 // 1 玩家（暖红，下方）/ -1 AI（蓝紫，上方）
/** 棋盘数值：±1..±8，符号为阵营、绝对值为兽阶；AI 搜索用 Int8Array，界面用响应式数组 */
type Board = Int8Array

/** 兽阶 → 名称 / 素材（索引即兽阶，0 位弃用） */
const RANK_NAME = ['', '鼠', '猫', '狗', '狼', '豹', '虎', '狮', '象'] as const
const RANK_ART: Record<number, keyof typeof JUNGLE_ART> = {
  1: 'mouse',
  2: 'cat',
  3: 'dog',
  4: 'wolf',
  5: 'leopard',
  6: 'tiger',
  7: 'lion',
  8: 'elephant',
}
/** 兽阶价值（AI 估子）：鼠因能克制象而高于猫狗 */
const RANK_VAL = [0, 450, 200, 300, 400, 550, 750, 850, 950]
const MATE = 100000

const idxOf = (r: number, c: number) => r * COLS + c
const rowOf = (i: number) => Math.floor(i / COLS)
const colOf = (i: number) => i % COLS

/** 地形：0 平地 / 1 河 / 2 AI 兽穴（上） / 3 玩家兽穴（下） / 4 上侧陷阱 / 5 下侧陷阱 */
const TERRAIN = (() => {
  const t = new Uint8Array(N)
  for (let r = 3; r <= 5; r++) for (const c of [1, 2, 4, 5]) t[idxOf(r, c)] = 1
  t[idxOf(0, 3)] = 2
  t[idxOf(8, 3)] = 3
  for (const c of [2, 4]) {
    t[idxOf(0, c)] = 4
    t[idxOf(8, c)] = 5
  }
  t[idxOf(1, 3)] = 4
  t[idxOf(7, 3)] = 5
  return t
})()

/** 兽穴归属（1 玩家 / -1 AI / 0 非穴） */
function denOf(i: number): Side | 0 {
  const t = TERRAIN[i]!
  if (t === 2) return -1
  if (t === 3) return 1
  return 0
}
/** 陷阱归属：上侧属 AI、下侧属玩家（0 非陷阱） */
function trapOwner(i: number): Side | 0 {
  const t = TERRAIN[i]!
  if (t === 4) return -1
  if (t === 5) return 1
  return 0
}
const isWater = (i: number) => TERRAIN[i] === 1

function sideOf(v: number): Side | 0 {
  return v === 0 ? 0 : v > 0 ? 1 : -1
}

/** 开局布阵（上下镜像对称） */
function startBoard(): Board {
  const b = new Int8Array(N)
  const put = (r: number, c: number, rank: number, side: Side) => {
    b[idxOf(r, c)] = side * rank
  }
  put(0, 0, 7, -1)
  put(0, 6, 6, -1)
  put(1, 1, 3, -1)
  put(1, 5, 2, -1)
  put(2, 0, 1, -1)
  put(2, 2, 5, -1)
  put(2, 4, 4, -1)
  put(2, 6, 8, -1)
  put(8, 0, 6, 1)
  put(8, 6, 7, 1)
  put(7, 1, 2, 1)
  put(7, 5, 3, 1)
  put(6, 0, 8, 1)
  put(6, 2, 4, 1)
  put(6, 4, 5, 1)
  put(6, 6, 1, 1)
  return b
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

interface JMove {
  from: number
  to: number
  capture: 0 | 1
}

/** 守方在格 i 的有效兽阶：陷入攻方陷阱则归零 */
function effRank(b: Board, i: number, attacker: Side): number {
  const k = Math.abs(b[i]!)
  if (k === 0) return 0
  if (trapOwner(i) === attacker) return 0
  return k
}

/** 捕食判定（defenderRank 已折算陷阱归零） */
function canCapture(attackerRank: number, defenderRank: number): boolean {
  if (defenderRank === 0) return true
  if (attackerRank === 1 && defenderRank === 8) return true // 鼠胜象
  if (attackerRank === 8 && defenderRank === 1) return false // 象不食鼠
  return attackerRank >= defenderRank
}

function genMoves(b: Board, side: Side): JMove[] {
  const out: JMove[] = []
  for (let i = 0; i < N; i++) {
    const v = b[i]!
    if (sideOf(v) !== side) continue
    const k = Math.abs(v)
    const r = rowOf(i)
    const c = colOf(i)
    for (const [dr, dc] of DIRS) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
      const ni = idxOf(nr, nc)
      if (denOf(ni) === side) continue // 不可自入兽穴
      // 狮虎从岸上跃河：跨过连续水格，河中有鼠（任何一方）阻挡
      if ((k === 6 || k === 7) && isWater(ni)) {
        let jr = nr
        let jc = nc
        let blocked = false
        while (jr >= 0 && jr < ROWS && jc >= 0 && jc < COLS && isWater(idxOf(jr, jc))) {
          if (b[idxOf(jr, jc)] !== 0) blocked = true
          jr += dr
          jc += dc
        }
        if (blocked || jr < 0 || jr >= ROWS || jc < 0 || jc >= COLS) continue
        const li = idxOf(jr, jc)
        if (denOf(li) === side) continue
        const tv = b[li]!
        if (tv === 0) out.push({ from: i, to: li, capture: 0 })
        else if (sideOf(tv) !== side && canCapture(k, effRank(b, li, side))) out.push({ from: i, to: li, capture: 1 })
        continue
      }
      const tv = b[ni]!
      if (isWater(ni)) {
        if (k !== 1) continue // 只有鼠能入水
        if (tv === 0) out.push({ from: i, to: ni, capture: 0 })
        else if (sideOf(tv) !== side) out.push({ from: i, to: ni, capture: 1 }) // 水中只可能是鼠
        continue
      }
      if (isWater(i)) {
        // 鼠从水中上岸：只可走空格，不得吃岸上棋子
        if (tv === 0) out.push({ from: i, to: ni, capture: 0 })
        continue
      }
      if (tv === 0) out.push({ from: i, to: ni, capture: 0 })
      else if (sideOf(tv) !== side && canCapture(k, effRank(b, ni, side))) out.push({ from: i, to: ni, capture: 1 })
    }
  }
  return out
}

/** 走子排序：吃大子优先，其次向对方兽穴推进 */
function orderMoves(b: Board, moves: JMove[]): void {
  const score = (m: JMove) => {
    const tv = b[m.to]!
    if (tv !== 0) return 1000 + RANK_VAL[Math.abs(tv)]! * 2 - Math.abs(b[m.from]!)
    const adv = sideOf(b[m.from]!) === 1 ? 8 - rowOf(m.to) : rowOf(m.to)
    return adv
  }
  moves.sort((a, z) => score(z) - score(a))
}

/** 静态评估（side 视角）：子力 + 推进 + 逼穴 + 陷阱惩罚 */
function evaluate(b: Board, side: Side): number {
  let total = 0
  for (let i = 0; i < N; i++) {
    const v = b[i]!
    if (v === 0) continue
    const ps = sideOf(v) as Side
    const k = Math.abs(v)
    let score = RANK_VAL[k]!
    const adv = ps === 1 ? 8 - rowOf(i) : rowOf(i)
    score += adv * 5
    const denI = ps === 1 ? idxOf(0, 3) : idxOf(8, 3)
    const man = Math.abs(rowOf(i) - rowOf(denI)) + Math.abs(colOf(i) - colOf(denI))
    score += Math.max(0, 14 - man) * 7
    if (trapOwner(i) === -ps) score -= 300 // 陷入对方陷阱
    if (isWater(i)) score += 10
    total += ps === side ? score : -score
  }
  return total
}

let nodeBudget = 0
let searchDeadline = 0

/** 负极大值 + α-β 剪枝 */
function negamax(b: Board, side: Side, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth <= 0) return evaluate(b, side)
  nodeBudget--
  if (nodeBudget <= 0 || Date.now() > searchDeadline) return evaluate(b, side)
  const moves = genMoves(b, side)
  if (!moves.length) return -MATE + ply // 无子可动判负
  orderMoves(b, moves)
  let best = -Infinity
  for (const m of moves) {
    const cap = b[m.to]!
    b[m.to] = b[m.from]!
    b[m.from] = 0
    let score: number
    if (denOf(m.to) === -side) score = MATE - ply
    else score = -negamax(b, (-side) as Side, depth - 1, -beta, -alpha, ply + 1)
    b[m.from] = b[m.to]!
    b[m.to] = cap
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/* ================= 对局状态 ================= */

const board = ref<number[]>(Array<number>(N).fill(0))
const turn = ref<'P' | 'A'>('P')
const roundOver = ref(false)
const result = ref<'win' | 'lose' | 'draw' | ''>('')
const selected = ref(-1)
const targetMap = ref<Map<number, 0 | 1>>(new Map())
const lastMove = ref<{ from: number; to: number } | null>(null)
const streak = ref(0)
const tally = ref({ win: 0, draw: 0, lose: 0 })
const thinking = ref(false)
const finalDur = ref(0)
const cellPx = ref(50)
const paneEl = ref<HTMLElement | null>(null)

let aiTimer: number | null = null
let resizeOb: ResizeObserver | null = null
let roundStart = 0
let quietPlies = 0
let lastAiFrom = -1
let lastAiTo = -1

const { addRecord, bestOf } = useArcadeRecords()
const { settings, update } = useArcadeSettings()

const best = computed(() => bestOf('jungle')?.raw ?? 0)
const myAlive = computed(() => board.value.filter((v) => v > 0).length)
const aiAlive = computed(() => board.value.filter((v) => v < 0).length)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(320, pane.clientHeight - 56)
  cellPx.value = Math.max(34, Math.min(54, Math.floor((availH - 40) / ROWS), Math.floor(availW / COLS)))
}

function toInt8(): Board {
  return Int8Array.from(board.value)
}
function syncBoard(b: Board) {
  for (let i = 0; i < N; i++) board.value[i] = b[i]!
}

/** 选中己方棋子后的可走格 */
function targetsFor(from: number): Map<number, 0 | 1> {
  const map = new Map<number, 0 | 1>()
  const b = toInt8()
  for (const m of genMoves(b, 1)) if (m.from === from) map.set(m.to, m.capture)
  return map
}

function selectPiece(i: number) {
  selected.value = i
  targetMap.value = targetsFor(i)
  arcadeSound.click()
}

function clearSelect() {
  selected.value = -1
  targetMap.value = new Map()
}

function onCell(i: number) {
  if (roundOver.value || thinking.value || turn.value !== 'P') return
  const targets = targetMap.value
  if (selected.value >= 0 && targets.has(i)) {
    doPlayerMove(selected.value, i)
    return
  }
  const v = board.value[i] ?? 0
  if (v > 0) {
    if (selected.value === i) clearSelect()
    else selectPiece(i)
  } else {
    clearSelect()
  }
}

function applyMove(b: Board, from: number, to: number) {
  b[to] = b[from]!
  b[from] = 0
}

/** 记一局终局（胜/负/和），与其它机台一致走战绩仓库 */
function endRound(res: 'win' | 'lose' | 'draw') {
  roundOver.value = true
  result.value = res
  finalDur.value = roundStart ? (Date.now() - roundStart) / 1000 : 0
  const dur = Math.round(finalDur.value)
  if (res === 'win') {
    streak.value++
    tally.value.win++
    addRecord({ g: 'jungle', score: streak.value, win: true, dur })
    arcadeSound.win()
  } else if (res === 'lose') {
    streak.value = 0
    tally.value.lose++
    addRecord({ g: 'jungle', score: 0, win: false, dur })
    arcadeSound.lose()
  } else {
    tally.value.draw++
    addRecord({ g: 'jungle', score: streak.value, dur })
    arcadeSound.match()
  }
  clearSelect()
}

/** 走完一步后的公共检查：进穴 / 吃光 / 60 步无吃子 */
function checkAfterMove(mover: Side, to: number): 'win' | 'lose' | 'draw' | '' {
  if (denOf(to) === -mover) return mover === 1 ? 'win' : 'lose'
  const enemyAlive = mover === 1 ? aiAlive.value : myAlive.value
  if (enemyAlive === 0) return mover === 1 ? 'win' : 'lose'
  if (quietPlies >= 60) return 'draw'
  return ''
}

function doPlayerMove(from: number, to: number) {
  const capture = (board.value[to] ?? 0) !== 0
  const b = toInt8()
  applyMove(b, from, to)
  syncBoard(b)
  lastMove.value = { from, to }
  quietPlies = capture ? 0 : quietPlies + 1
  if (capture) arcadeSound.match()
  else arcadeSound.move()
  clearSelect()
  const res = checkAfterMove(1, to)
  if (res) {
    endRound(res)
    return
  }
  turn.value = 'A'
  thinking.value = true
  aiTimer = window.setTimeout(aiTurn, 420)
}

function aiTurn() {
  aiTimer = null
  thinking.value = true
  const b = toInt8()
  const moves = genMoves(b, -1)
  if (!moves.length) {
    thinking.value = false
    endRound('win') // AI 无子可动
    return
  }
  const pick = aiPick(b, moves)
  if (!pick) {
    thinking.value = false
    endRound('win')
    return
  }
  const capture = b[pick.to] !== 0
  applyMove(b, pick.from, pick.to)
  syncBoard(b)
  lastAiFrom = pick.from
  lastAiTo = pick.to
  lastMove.value = { from: pick.from, to: pick.to }
  quietPlies = capture ? 0 : quietPlies + 1
  if (capture) arcadeSound.match()
  else arcadeSound.move()
  thinking.value = false
  const res = checkAfterMove(-1, pick.to)
  if (res) {
    endRound(res)
    return
  }
  // 玩家无子可动则判负
  const pb = toInt8()
  if (!genMoves(pb, 1).length) {
    endRound('lose')
    return
  }
  turn.value = 'P'
}

/** AI 选点：简单 = 贪心扰动；普通 = 3 层；困难 = 迭代加深至 6 层（带节点/时限兜底） */
function aiPick(b: Board, moves: JMove[]): JMove | null {
  const diff = settings.value.jungleDiff
  if (diff === 'easy') {
    if (Math.random() < 0.25) return moves[Math.floor(Math.random() * moves.length)]!
    orderMoves(b, moves)
    let bestScore = -Infinity
    const pool: JMove[] = []
    for (const m of moves) {
      const cap = b[m.to]!
      b[m.to] = b[m.from]!
      b[m.from] = 0
      const s = denOf(m.to) === 1 ? MATE : evaluate(b, -1)
      b[m.from] = b[m.to]!
      b[m.to] = cap
      if (s > bestScore) {
        bestScore = s
        pool.length = 0
        pool.push(m)
      } else if (s > bestScore - 120) pool.push(m)
    }
    return pool[Math.floor(Math.random() * pool.length)] ?? moves[0]!
  }
  nodeBudget = diff === 'hard' ? 160000 : 60000
  searchDeadline = Date.now() + (diff === 'hard' ? 400 : 250)
  const maxDepth = diff === 'hard' ? 6 : 3
  orderMoves(b, moves)
  let bestMove = moves[0]!
  let haveBest = false
  for (let d = 2; d <= maxDepth; d++) {
    let alpha = -Infinity
    let localBest = moves[0]!
    let localScore = -Infinity
    let aborted = false
    for (const m of moves) {
      const cap = b[m.to]!
      b[m.to] = b[m.from]!
      b[m.from] = 0
      let s: number
      if (denOf(m.to) === 1) s = MATE
      else s = -negamax(b, 1, d - 1, -Infinity, -alpha, 1)
      b[m.from] = b[m.to]!
      b[m.to] = cap
      if (lastAiFrom >= 0 && m.from === lastAiTo && m.to === lastAiFrom) s -= 24 // 抑制来回拉锯
      s += Math.random() * 6
      if (s > localScore) {
        localScore = s
        localBest = m
      }
      if (s > alpha) alpha = s
      if (Date.now() > searchDeadline || nodeBudget <= 0) {
        aborted = true
        break
      }
    }
    if (!haveBest || localScore > -Infinity) {
      // 更深层的结果基于上一层最优排前，直接采纳
      bestMove = localBest
      haveBest = true
    }
    moves.sort((a, z) => (z === bestMove ? 1 : 0) - (a === bestMove ? 1 : 0))
    if (aborted || localScore > MATE / 2) break
  }
  return bestMove
}

function newRound() {
  clearTimer()
  board.value = Array.from(startBoard())
  turn.value = 'P'
  roundOver.value = false
  result.value = ''
  lastMove.value = null
  thinking.value = false
  quietPlies = 0
  lastAiFrom = -1
  lastAiTo = -1
  roundStart = 0
  finalDur.value = 0
  clearSelect()
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
  () => settings.value.jungleDiff,
  () => newRound(),
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

/* ================= 模板辅助 ================= */

function terrainClass(i: number): Record<string, boolean> {
  const t = TERRAIN[i]!
  return {
    'is-water': t === 1,
    'is-den': t === 2 || t === 3,
    'is-den-top': t === 2,
    'is-den-bottom': t === 3,
    'is-trap': t === 4 || t === 5,
    'is-trap-top': t === 4,
    'is-trap-bottom': t === 5,
  }
}

function faceStyle(v: number): Record<string, string> {
  const key = RANK_ART[Math.abs(v)] ?? 'mouse'
  // url() 必须加引号：Vite 会把小 SVG 内联成含单引号的 data URI，裸 url() 解析会失败
  return { '--face': `url("${JUNGLE_ART[key]}")` }
}

function pieceTitle(i: number): string {
  const v = board.value[i] ?? 0
  const k = Math.abs(v)
  const side = v > 0 ? '暖红方' : '蓝紫方'
  return `${RANK_NAME[k]} · ${side} · 兽阶 ${k}`
}

const resultText = computed(() => {
  if (result.value === 'win') return '你赢了！直捣兽穴，鼠辈也能撼大象'
  if (result.value === 'lose') return 'AI 获胜，别灰心，再战一局？'
  if (result.value === 'draw') return '60 步无吃子，握手言和'
  return ''
})

const hint = computed(() => {
  if (roundOver.value) return resultText.value
  if (thinking.value) return 'AI 思考中…'
  if (turn.value === 'A') return ''
  return selected.value >= 0 ? '点目标格走棋 · 绿点为可行，红圈为可吃' : '轮到你 · 点选己方棋子'
})

const RULES = [
  '兽阶：象8 ＞ 狮7 ＞ 虎6 ＞ 豹5 ＞ 狼4 ＞ 狗3 ＞ 猫2 ＞ 鼠1，高阶吃低阶，同级互吃。',
  '鼠可以胜象，但象不能吃鼠。',
  '只有鼠能下河；水中的鼠只能被对方鼠攻击，从水里上岸那一步不能吃子。',
  '狮、虎可一步跃河（横竖皆可），河中有鼠挡路则不可跃。',
  '棋子走进对方陷阱后兽阶归零，任何对方棋子都可捕食。',
  '任何棋子不可走进自己的兽穴；先进对方兽穴者胜。',
  '吃光对方棋子获胜；无子可动判负；60 步无吃子判和。',
]
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pjungle">
    <div class="arc-gamecol">
      <div class="arc-jboard" :style="{ '--jcell': cellPx + 'px' }">
        <button
          v-for="i in N"
          :key="i"
          class="arc-jcell"
          :class="[terrainClass(i - 1), {
            'is-target': targetMap.get(i - 1) === 0,
            'is-capture': targetMap.get(i - 1) === 1,
            'is-last': lastMove ? lastMove.to === i - 1 || lastMove.from === i - 1 : false,
          }]"
          :aria-label="'棋格 ' + i"
          @click="onCell(i - 1)"
        >
          <span
            v-if="board[i - 1]"
            class="arc-jgpc"
            :class="[board[i - 1]! > 0 ? 'is-me' : 'is-ai', { 'is-sel': selected === i - 1 }]"
            :title="pieceTitle(i - 1)"
          >
            <i class="arc-jgface" :style="faceStyle(board[i - 1]!)" />
            <em class="arc-jgrank">{{ Math.abs(board[i - 1]!) }}</em>
          </span>
          <span v-else-if="targetMap.get(i - 1) === 0" class="arc-jhint" />
        </button>
      </div>
      <p class="arc-hint">{{ hint }}</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="newRound"><RotateCcw :size="14" /> 新一局</button>
        <ArcadeDiffSeg :model-value="settings.jungleDiff" @update:model-value="(v) => update({ jungleDiff: v })" />
        <Popover placement="left" trigger="click" overlay-class-name="arc-pop">
          <template #content>
            <ul class="arc-jrules">
              <li v-for="r in RULES" :key="r">{{ r }}</li>
            </ul>
          </template>
          <button class="arc-btn"><CircleHelp :size="14" /> 玩法</button>
        </Popover>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">存活比</div>
        <div class="arc-scoreval arc-tally">{{ myAlive }}<em>:</em>{{ aiAlive }}</div>
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
