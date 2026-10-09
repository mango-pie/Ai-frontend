<script setup lang="ts">
/**
 * 飞行棋机台：经典十字棋盘（15×15），玩家执红 vs 绿/黄/蓝三个 AI，率先四机抵终者胜
 * - 完整规则：掷 6 起飞并奖励再掷（连续三个 6 封顶）、同色格跳 4、
 *   第 16 格飞行虚线越空 +12（落地再跳 4）、落点撞机（敌机全数回机场）、
 *   终点跑道需点数恰好进帐，超出反弹
 * - AI 难度：简单 = 半随机 / 普通 = 优先级收益 / 困难 = 收益 + 落点风险评估
 * - 棋子素材：game-icons.net 客机剪影（CC BY 3.0），CSS mask 四色染色；棋盘为纯 SVG 绘制
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Popover } from 'ant-design-vue'
import { CircleHelp, Dices, RotateCcw } from 'lucide-vue-next'
import ArcadeDiffSeg from './ArcadeDiffSeg.vue'
import { PLANE_ART } from './assets'
import { arcadeSound, fmtInt, useArcadeRecords, useArcadeSettings } from './arcade'

defineOptions({ name: 'GameAeroplaneRide' })

defineProps<{ active: boolean }>()

const CELL = 36
const SIZE = CELL * 15
const FINISH = 56 // 终点（pos 0..50 外圈 / 51..55 终点跑道 / 56 抵达）
const FLY_POS = 16 // 自己相对第 16 格为飞行格（+12）

/** 外圈 52 格（行,列），顺时针自红方起飞格起 */
const RING: ReadonlyArray<readonly [number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
]

/** 四方：0 红（玩家，左）1 绿（AI，上）2 黄（AI，右）3 蓝（AI，下） */
const SIDE_NAMES = ['红方', '绿方', '黄方', '蓝方'] as const
const START = [0, 13, 26, 39]
/** 各方终点跑道（前 5 格为 pos 51..55，末位为终点格 pos 56） */
const HOME: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
]
/** 机场停机坪（像素坐标，四个圆位） */
const PADS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[62, 62], [114, 62], [62, 114], [114, 114]],
  [[478, 62], [426, 62], [478, 114], [426, 114]],
  [[478, 478], [426, 478], [478, 426], [426, 426]],
  [[62, 478], [114, 478], [62, 426], [114, 426]],
]
/** 机场底板（像素坐标，左上角 + 140px 见方） */
const AP_RECT = [
  { x: 10, y: 10 },
  { x: 390, y: 10 },
  { x: 390, y: 390 },
  { x: 10, y: 390 },
]
/** 斜切角大三角（机场与十字臂之间的经典装饰位，颜色随本角机场） */
const CHAMFER = [
  '216,100 100,216 216,216', // 左上（红）
  '324,100 440,216 324,216', // 右上（绿）
  '324,440 440,324 324,324', // 右下（黄）
  '216,440 100,324 216,324', // 左下（蓝）
]

const SIDE_COLORS = [
  { key: 'red', main: '#ef5f8e', soft: '#ffddec', dark: '#c94a76', light: '#ff9d7e' },
  { key: 'green', main: '#3fae83', soft: '#d5f1e3', dark: '#2e8a67', light: '#7ed8a0' },
  { key: 'yellow', main: '#eda23c', soft: '#ffedcb', dark: '#c07f1d', light: '#ffd76e' },
  { key: 'blue', main: '#6a8fe0', soft: '#dce6fb', dark: '#4a6fc2', light: '#9db8f0' },
]

const ringIdx = (side: number, pos: number) => (START[side]! + pos) % 52
/** 外圈落点是否为己方同色格（各家起飞格色序对齐后，等价于 pos ≡ 0 mod 4） */
const isOwnCell = (pos: number) => pos % 4 === 0 && pos <= 50

interface ApSide {
  planes: number[] // -1 机场 / 0..50 外圈 / 51..55 跑道 / 56 抵终
}

function freshSides(): ApSide[] {
  return [0, 1, 2, 3].map(() => ({ planes: [-1, -1, -1, -1] }))
}

/* ================= 对局状态 ================= */

const sides = ref<ApSide[]>(freshSides())
const current = ref(0)
const dice = ref(0)
const diceFace = ref(6)
const phase = ref<'roll' | 'anim' | 'move' | 'over'>('roll')
const movable = ref<number[]>([])
const events = ref('')
const streak = ref(0)
const roundOver = ref(false)
const roundStart = ref(0)
const finalDur = ref(0)
const boardPx = ref(440)
const paneEl = ref<HTMLElement | null>(null)

let timers: number[] = []
let roundToken = 0
let rollChain = 0
let lastMovedKey = ''
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()
const { settings, update } = useArcadeSettings()

const best = computed(() => bestOf('aeroplane')?.raw ?? 0)
const curColor = computed(() => SIDE_COLORS[current.value]!)

function schedule(fn: () => void, ms: number) {
  const token = roundToken
  const t = window.setTimeout(() => {
    if (token === roundToken) fn()
  }, ms)
  timers.push(t)
}

function clearTimers() {
  timers.forEach((t) => window.clearTimeout(t))
  timers = []
}

/* ================= 规则结算 ================= */

interface LandingPlan {
  stages: Array<{ pos: number; label: string }>
  final: number
  bounced: boolean
}

/** 计算一次走子的落点阶梯（掷骰推进 → 跳格 → 飞行 → 再跳格；超点反弹） */
function planLanding(from: number, d: number): LandingPlan {
  const stages: LandingPlan['stages'] = []
  let pos = from === -1 ? 0 : from + d
  let bounced = false
  if (from !== -1 && pos > FINISH) {
    pos = FINISH * 2 - pos
    bounced = true
  }
  stages.push({ pos, label: from === -1 ? '起飞' : bounced ? '反弹' : '' })
  if (pos <= 50 && isOwnCell(pos)) {
    if (pos === FLY_POS) {
      pos = 28
      stages.push({ pos, label: '飞行 +12' })
      if (pos + 4 <= 50) {
        pos += 4
        stages.push({ pos, label: '跳格 +4' })
      }
    } else if (pos + 4 <= 50) {
      pos += 4
      stages.push({ pos, label: '跳格 +4' })
      if (pos === FLY_POS) {
        pos = 28
        stages.push({ pos, label: '飞行 +12' })
        if (pos + 4 <= 50) {
          pos += 4
          stages.push({ pos, label: '跳格 +4' })
        }
      }
    }
  }
  return { stages, final: pos, bounced }
}

/** 掷出 d 后可动的飞机（机位编号） */
function movableList(side: ApSide, d: number): number[] {
  const out: number[] = []
  side.planes.forEach((p, i) => {
    if (p === -1) {
      if (d === 6) out.push(i)
    } else if (p < FINISH) {
      out.push(i)
    }
  })
  return out
}

/** 落点是否有敌机可撞（返回被撞回的数量） */
function captureAt(side: number, pos: number): number {
  if (pos < 0 || pos > 50) return 0
  const myIdx = ringIdx(side, pos)
  let hit = 0
  sides.value.forEach((sd, si) => {
    if (si === side) return
    sd.planes.forEach((p, pi) => {
      if (p >= 0 && p <= 50 && ringIdx(si, p) === myIdx) {
        sd.planes[pi] = -1
        hit++
      }
    })
  })
  return hit
}

/* ================= 回合引擎 ================= */

/** 走子（含阶梯动画与结算），结束后决定连掷或换人 */
function doMove(side: number, plane: number) {
  const sd = sides.value[side]!
  const d = dice.value
  const from = sd.planes[plane]!
  const plan = planLanding(from, d)
  phase.value = 'anim'
  movable.value = []
  lastMovedKey = `${side}:${plane}`
  let step = 0
  const runStage = () => {
    const st = plan.stages[step]!
    sd.planes[plane] = st.pos
    if (st.label === '起飞') arcadeSound.flip()
    else if (st.label.startsWith('飞行')) arcadeSound.match()
    else if (st.label.startsWith('跳格')) arcadeSound.merge(4)
    else arcadeSound.move()
    events.value = st.label ? `${SIDE_NAMES[side]}${st.label}` : ''
    step++
    if (step < plan.stages.length) {
      schedule(runStage, 480)
      return
    }
    // 终段结算
    const hits = captureAt(side, plan.final)
    if (hits > 0) {
      arcadeSound.lose()
      events.value = `撞机！${SIDE_NAMES[side]}撞回对方 ${hits} 架`
    }
    if (plan.final === FINISH) arcadeSound.flip()
    const done = sd.planes.filter((p) => p === FINISH).length
    if (done === 4) {
      endRound(side)
      return
    }
    schedule(() => nextTurn(d), 520)
  }
  runStage()
}

/** 决定连掷（掷 6）或轮到下一未完成方 */
function nextTurn(lastDice: number) {
  if (roundOver.value) return
  if (lastDice === 6 && rollChain < 2) {
    rollChain++
    startRollPhase()
    if (current.value !== 0) schedule(aiTurn, 700)
    return
  }
  rollChain = 0
  let n = current.value
  for (let i = 0; i < 4; i++) {
    n = (n + 1) % 4
    const done = sides.value[n]!.planes.filter((p) => p === FINISH).length
    if (done < 4) break
  }
  if (n === current.value) {
    // 四方都完成（不可能同时，兜底）
    endRound(sides.value[0]!.planes.every((p) => p === FINISH) ? 0 : 1)
    return
  }
  current.value = n
  startRollPhase()
  if (n !== 0) schedule(aiTurn, 700)
}

function startRollPhase() {
  dice.value = 0
  phase.value = 'roll'
  movable.value = []
}

/** 掷骰动画 + 落定评估 */
function rollDice() {
  if (phase.value !== 'roll' || roundOver.value) return
  phase.value = 'anim'
  arcadeSound.click()
  if (!roundStart.value) roundStart.value = Date.now()
  let flick = 0
  const flicker = () => {
    diceFace.value = 1 + Math.floor(Math.random() * 6)
    flick++
    if (flick < 7) schedule(flicker, 70)
    else settleRoll()
  }
  flicker()
}

function settleRoll() {
  const d = 1 + Math.floor(Math.random() * 6)
  dice.value = d
  diceFace.value = d
  const sd = sides.value[current.value]!
  const list = movableList(sd, d)
  if (!list.length) {
    events.value = `${SIDE_NAMES[current.value]}掷出 ${d}，无可行动`
    schedule(() => nextTurn(d), 850)
    return
  }
  if (current.value === 0) {
    phase.value = 'move'
    movable.value = list
    events.value = d === 6 ? `掷出 6！点选要起飞或移动的飞机` : `掷出 ${d}，点选要移动的飞机`
  } else {
    schedule(() => aiChoose(d, list), 520)
  }
}

/* ================= AI ================= */

/** 敌机落点威胁数：落点外圈格后方 1..6 格内的敌机数 */
function threatsAt(side: number, pos: number): number {
  if (pos < 0 || pos > 50) return 0
  const myIdx = ringIdx(side, pos)
  let t = 0
  sides.value.forEach((sd, si) => {
    if (si === side) return
    sd.planes.forEach((p) => {
      if (p >= 0 && p <= 50) {
        const dist = (myIdx - ringIdx(si, p) + 52) % 52
        if (dist >= 1 && dist <= 6) t++
      }
    })
  })
  return t
}

function aiChoose(d: number, list: number[]) {
  const side = current.value
  const sd = sides.value[side]!
  const diff = settings.value.aeroplaneDiff
  if (diff === 'easy' && Math.random() < 0.45) {
    doMove(side, list[Math.floor(Math.random() * list.length)]!)
    return
  }
  const dangerW = diff === 'hard' ? 320 : diff === 'normal' ? 110 : 0
  const jitter = diff === 'hard' ? 8 : 34
  let bestPlane = list[0]!
  let bestScore = -Infinity
  for (const plane of list) {
    const from = sd.planes[plane]!
    const plan = planLanding(from, d)
    let s = plan.final * 6
    if (plan.final === FINISH) s += 1000
    if (plan.bounced) s -= 150
    if (from === -1) s += 550
    const labels = plan.stages.map((st) => st.label).join('')
    if (labels.includes('飞行')) s += 450
    else if (labels.includes('跳格')) s += 220
    // 撞机预估
    if (plan.final <= 50) {
      const myIdx = ringIdx(side, plan.final)
      sides.value.forEach((osd, osi) => {
        if (osi === side) return
        osd.planes.forEach((p) => {
          if (p >= 0 && p <= 50 && ringIdx(osi, p) === myIdx) s += 800
        })
      })
      s -= dangerW * threatsAt(side, plan.final)
    }
    s += Math.random() * jitter
    if (s > bestScore) {
      bestScore = s
      bestPlane = plane
    }
  }
  doMove(side, bestPlane)
}

function aiTurn() {
  if (roundOver.value || phase.value !== 'roll') return
  rollDice()
}

/* ================= 终局与流程 ================= */

function endRound(winner: number) {
  roundOver.value = true
  phase.value = 'over'
  finalDur.value = roundStart.value ? (Date.now() - roundStart.value) / 1000 : 0
  const dur = Math.round(finalDur.value)
  if (winner === 0) {
    streak.value++
    events.value = '你赢了！四机编队率先抵达终点'
    addRecord({ g: 'aeroplane', score: streak.value, win: true, dur })
    arcadeSound.win()
  } else {
    streak.value = 0
    events.value = `${SIDE_NAMES[winner]}率先完成，再接再厉！`
    addRecord({ g: 'aeroplane', score: 0, win: false, dur })
    arcadeSound.lose()
  }
}

function newRound() {
  clearTimers()
  roundToken++
  sides.value = freshSides()
  current.value = 0
  rollChain = 0
  lastMovedKey = ''
  roundOver.value = false
  roundStart.value = 0
  finalDur.value = 0
  events.value = ''
  startRollPhase()
  arcadeSound.click()
  fit()
}

watch(
  () => settings.value.aeroplaneDiff,
  () => newRound(),
)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(280, pane.clientWidth - 40 - sideW)
  const availH = Math.max(340, pane.clientHeight - 10)
  boardPx.value = Math.max(320, Math.min(640, availW, availH))
}

onMounted(() => {
  newRound()
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
})
onUnmounted(() => {
  clearTimers()
  resizeOb?.disconnect()
})

/* ================= 渲染辅助 ================= */

function cellFill(i: number): { fill: string; stroke: string } {
  const c = SIDE_COLORS[i % 4]!
  const isStart = START.includes(i)
  const isFly = START.some((st) => (st + FLY_POS) % 52 === i)
  if (isStart || isFly) return { fill: c.main, stroke: c.dark }
  return { fill: c.soft, stroke: c.main }
}

/** 格位是否为起飞格 / 飞行格（用于叠画标记环） */
function cellFlags(i: number): { isStart: boolean; isFly: boolean } {
  return {
    isStart: START.includes(i),
    isFly: START.some((st) => (st + FLY_POS) % 52 === i),
  }
}

/** 飞行虚线几何（起点=飞行格，终点=落地格，含箭头三角） */
function flyGeom(s: number) {
  const a = RING[(START[s]! + FLY_POS) % 52]!
  const b = RING[(START[s]! + 28) % 52]!
  const x1 = a[1] * CELL + CELL / 2
  const y1 = a[0] * CELL + CELL / 2
  const x2 = b[1] * CELL + CELL / 2
  const y2 = b[0] * CELL + CELL / 2
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const tipX = x2 - ux * 5
  const tipY = y2 - uy * 5
  const baseX = x2 - ux * 18
  const baseY = y2 - uy * 18
  const px = -uy
  const py = ux
  return {
    x1,
    y1,
    baseX,
    baseY,
    arrow: `${tipX},${tipY} ${baseX + px * 6.5},${baseY + py * 6.5} ${baseX - px * 6.5},${baseY - py * 6.5}`,
  }
}

function pct(v: number): number {
  return (v / SIZE) * 100
}

function cellCenter(cell: readonly [number, number]): { left: number; top: number } {
  return { left: pct(cell[1] * CELL + CELL / 2), top: pct(cell[0] * CELL + CELL / 2) }
}

function planePos(side: number, plane: number): { left: number; top: number } {
  const p = sides.value[side]!.planes[plane]!
  if (p === -1) {
    const pad = PADS[side]![plane]!
    return { left: pct(pad[0]), top: pct(pad[1]) }
  }
  if (p <= 50) return cellCenter(RING[ringIdx(side, p)]!)
  return cellCenter(HOME[side]![Math.min(p - 51, 5)]!)
}

interface PlaneView {
  key: string
  side: number
  plane: number
  left: number
  top: number
  color: (typeof SIDE_COLORS)[number]
  movable: boolean
  last: boolean
  title: string
}

const planeViews = computed<PlaneView[]>(() => {
  // 同格多机时横向错开
  const groups = new Map<string, number[]>()
  sides.value.forEach((sd, si) => {
    sd.planes.forEach((p, pi) => {
      const key = p === -1 ? `pad${si}${pi}` : p <= 50 ? `r${ringIdx(si, p)}` : `h${si}:${p}`
      const arr = groups.get(key) ?? []
      arr.push(si * 4 + pi)
      groups.set(key, arr)
    })
  })
  const out: PlaneView[] = []
  sides.value.forEach((sd, si) => {
    sd.planes.forEach((p, pi) => {
      const key = p === -1 ? `pad${si}${pi}` : p <= 50 ? `r${ringIdx(si, p)}` : `h${si}:${p}`
      const grp = groups.get(key) ?? [si * 4 + pi]
      const j = grp.indexOf(si * 4 + pi)
      const off = (j - (grp.length - 1) / 2) * 2.4
      const pos = planePos(si, pi)
      const canMove = phase.value === 'move' && current.value === 0 && si === 0 && movable.value.includes(pi)
      const state = p === -1 ? '机场' : p === FINISH ? '抵达' : p > 50 ? '终点跑道' : `外圈 ${p + 1}/51`
      out.push({
        key: `${si}:${pi}`,
        side: si,
        plane: pi,
        left: pos.left + off,
        top: pos.top,
        color: SIDE_COLORS[si]!,
        movable: canMove,
        last: lastMovedKey === `${si}:${pi}`,
        title: `${SIDE_NAMES[si]} ${pi + 1} 号机 · ${state}`,
      })
    })
  })
  return out
})

function onPlaneClick(pl: PlaneView) {
  if (!pl.movable || phase.value !== 'move') return
  doMove(0, pl.plane)
}

const faceUrl = computed(() => `url("${PLANE_ART.plane}")`)

const canRoll = computed(() => phase.value === 'roll' && current.value === 0 && !roundOver.value)

const turnLabel = computed(() => {
  if (roundOver.value) return '对局结束'
  if (phase.value === 'roll') return current.value === 0 ? '轮到你掷骰子' : `${SIDE_NAMES[current.value]}行动中`
  if (phase.value === 'move') return '点选飞机移动'
  return '飞行中…'
})

const progressOf = (si: number) => sides.value[si]!.planes.filter((p) => p === FINISH).length

const RULES = [
  '掷出 6 点才能起飞，掷 6 后可再掷一次（连续三个 6 封顶）。',
  '飞机沿外圈顺时针前进；落在自己颜色的格子上，可向前跳 4 格到下一个同色格。',
  '落在自己颜色的「飞行格」（起飞后第 17 格）可沿虚线飞越 +12，落地后还能再跳 4 格。',
  '最终落点若有对方飞机，将其全部撞回机场；终点跑道内安全。',
  '进入终点跑道后需点数恰好抵达终点，超出的点数反弹退回。',
  '率先让 4 架飞机全部抵达终点的一方获胜。',
]
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-paplane">
    <div class="arc-gamecol">
      <div class="arc-apboard" :style="{ width: boardPx + 'px', height: boardPx + 'px' }">
        <svg class="arc-apsvg" viewBox="0 0 540 540" aria-hidden="true">
          <!-- 奶油底板 -->
          <rect x="4" y="4" width="532" height="532" rx="26" fill="#fdf6e2" stroke="#ead9b5" stroke-width="2" />
          <!-- 斜切角大三角（经典版式装饰） -->
          <polygon v-for="s in 4" :key="'ch' + s" :points="CHAMFER[s - 1]" :fill="SIDE_COLORS[s - 1]!.main" fill-opacity="0.92" />
          <!-- 机场角区 -->
          <g v-for="s in 4" :key="'ap' + s">
            <rect
              :x="AP_RECT[s - 1]!.x" :y="AP_RECT[s - 1]!.y" width="140" height="140" rx="20"
              :fill="SIDE_COLORS[s - 1]!.soft" :stroke="SIDE_COLORS[s - 1]!.main" stroke-width="2.5" stroke-opacity="0.55"
            />
            <circle
              v-for="(pad, pi) in PADS[s - 1]" :key="'pad' + s + pi"
              :cx="pad[0]" :cy="pad[1]" r="17"
              fill="#fff" fill-opacity="0.9"
              :stroke="SIDE_COLORS[s - 1]!.main" stroke-opacity="0.7" stroke-width="2"
            />
          </g>
          <!-- 外圈 52 格（经典圆点格位） -->
          <g v-for="(cell, i) in RING" :key="'c' + i">
            <rect
              :x="cell[1] * CELL + 1.5" :y="cell[0] * CELL + 1.5" width="33" height="33" rx="7"
              :fill="cellFill(i).fill" :stroke="cellFill(i).stroke" stroke-width="1.5"
            />
            <circle :cx="cell[1] * CELL + CELL / 2" :cy="cell[0] * CELL + CELL / 2" r="10" fill="#fff" fill-opacity="0.95" />
            <circle
              v-if="cellFlags(i).isStart" :cx="cell[1] * CELL + CELL / 2" :cy="cell[0] * CELL + CELL / 2" r="14.5"
              fill="none" :stroke="cellFill(i).stroke" stroke-width="2.5"
            />
            <circle
              v-else-if="cellFlags(i).isFly" :cx="cell[1] * CELL + CELL / 2" :cy="cell[0] * CELL + CELL / 2" r="14.5"
              fill="none" :stroke="cellFill(i).stroke" stroke-width="2" stroke-dasharray="4 3"
            />
          </g>
          <!-- 飞行虚线（加油站 → 对侧落地格） -->
          <g v-for="s in 4" :key="'fly' + s">
            <line
              :x1="flyGeom(s - 1).x1" :y1="flyGeom(s - 1).y1"
              :x2="flyGeom(s - 1).baseX" :y2="flyGeom(s - 1).baseY"
              :stroke="SIDE_COLORS[s - 1]!.main" stroke-width="2.5" stroke-dasharray="6 5" stroke-opacity="0.8"
            />
            <polygon :points="flyGeom(s - 1).arrow" :fill="SIDE_COLORS[s - 1]!.main" fill-opacity="0.9" />
          </g>
          <!-- 终点跑道 -->
          <g v-for="s in 4" :key="'hm' + s">
            <g v-for="(cell, i) in HOME[s - 1]" :key="'hc' + s + i">
              <rect
                :x="cell[1] * CELL + 1.5" :y="cell[0] * CELL + 1.5" width="33" height="33" rx="7"
                :fill="i === 5 ? SIDE_COLORS[s - 1]!.main : SIDE_COLORS[s - 1]!.soft"
                :stroke="SIDE_COLORS[s - 1]!.main" stroke-width="1.5"
              />
              <circle :cx="cell[1] * CELL + CELL / 2" :cy="cell[0] * CELL + CELL / 2" r="10" fill="#fff" fill-opacity="0.95" />
            </g>
          </g>
          <!-- 中心终点：白色圆 + 红点（与斜切三角留白分离） -->
          <circle cx="270" cy="270" r="44" fill="#fff" opacity="0.97" />
          <circle cx="270" cy="270" r="11" :fill="SIDE_COLORS[0]!.main" />
        </svg>

        <!-- 飞机（HTML 覆盖层，随格位百分比定位） -->
        <button
          v-for="pl in planeViews" :key="pl.key"
          class="arc-applane"
          :class="{ 'is-movable': pl.movable, 'is-last': pl.last }"
          :style="{ left: pl.left + '%', top: pl.top + '%', background: `linear-gradient(145deg, ${pl.color.light}, ${pl.color.main})` }"
          :title="pl.title"
          :disabled="!pl.movable"
          @click.stop="onPlaneClick(pl)"
        >
          <i class="arc-apface" :style="{ '--face': faceUrl }" />
        </button>
      </div>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn is-primary" :disabled="!canRoll" @click="rollDice"><Dices :size="15" /> 掷骰子</button>
        <div class="arc-apdierow">
          <div class="arc-apdie" :class="'d' + diceFace"><i v-for="d in 9" :key="d" /></div>
          <div class="arc-apturn" :style="{ background: curColor.soft, color: curColor.dark, borderColor: curColor.main }">{{ turnLabel }}</div>
        </div>
        <div class="arc-apevent">{{ events || '掷出 6 才能起飞，加油！' }}</div>
        <ArcadeDiffSeg :model-value="settings.aeroplaneDiff" @update:model-value="(v) => update({ aeroplaneDiff: v })" />
        <button class="arc-btn" @click="newRound"><RotateCcw :size="14" /> 新一局</button>
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
        <div class="arc-scorelab">航程进度</div>
        <div class="arc-approg">
          <span v-for="s in 4" :key="'pg' + s" class="arc-appg" :style="{ color: SIDE_COLORS[s - 1]!.dark }">
            <i class="dot" :style="{ background: SIDE_COLORS[s - 1]!.main }" />{{ progressOf(s - 1) }}/4
          </span>
        </div>
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
