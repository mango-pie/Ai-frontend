<script setup lang="ts">
/**
 * 海战棋机台：10×10 双海域，五艘军舰（5/4/3/3/2）
 * - 布阵阶段：选舰 → 点格放置（R 转向 / 自动布阵）；开战后轮流开炮
 * - AI 三档：简单 = 随机扫射 · 普通 = 视差扫描 + 命中追击 · 困难 = 追击 + 方向锁定
 * - 胜负计连胜，纪录取最长连胜
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RotateCcw, Ship as ShipIcon, Trophy } from 'lucide-vue-next'
import ArcadeDiffSeg from './ArcadeDiffSeg.vue'
import { BATTLESHIP_ART } from './assets'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords, useArcadeSettings } from './arcade'

const N = 10
/** 与 games.css 的海战棋盘保持一致：32px 格 + 2px 间隙 + 8px 内边距 */
const BS_PAD = 8
const BS_GAP = 2
const BS_CELL = 32
const BS_STEP = BS_CELL + BS_GAP

defineOptions({ name: 'GameSeaBattle' })

defineProps<{ active: boolean }>()

const FLEET = [
  { name: '航空母舰', size: 5 },
  { name: '战列舰', size: 4 },
  { name: '巡洋舰', size: 3 },
  { name: '潜艇', size: 3 },
  { name: '驱逐舰', size: 2 },
]

interface Ship {
  name: string
  size: number
  cells: number[]
}

const myGrid = ref<number[]>(Array(N * N).fill(0)) // 舰船 id+1，0 空
const enemyGrid = ref<number[]>(Array(N * N).fill(0))
const myShot = ref<number[]>(Array(N * N).fill(0)) // 我方对敌开炮记录：1 miss 2 hit
const enemyShot = ref<number[]>(Array(N * N).fill(0)) // AI 对我方开炮记录
const myFleet = ref<Ship[]>([])
const enemyFleet = ref<Ship[]>([])

const state = ref<'placing' | 'battle' | 'over'>('placing')
const turn = ref<'P' | 'A'>('P')
const placingIdx = ref(0)
const placeVert = ref(false)
const hoverIdx = ref(-1)
const passHint = ref('')
const streak = ref(0)
const tally = ref({ win: 0, draw: 0, lose: 0 })
const finalDur = ref(0)
const isRecord = ref(false)
const roundStart = ref(0)
const result = ref<'win' | 'lose' | null>(null)

let aiTimer: number | null = null
let aiQueue: number[] = [] // 追击目标队列
let aiLastHits: number[] = []

const { addRecord, bestOf } = useArcadeRecords()
const { settings, update } = useArcadeSettings()

const best = computed(() => bestOf('battleship')?.raw ?? 0)
const statusText = computed(() => {
  if (state.value === 'placing') return `布阵中：正在摆放「${FLEET[placingIdx.value]?.name ?? '完成'}」 · R 转向`
  if (state.value === 'over') return passHint.value
  if (turn.value === 'A') return 'AI 瞄准中…'
  return passHint.value || '向敌方海域开炮'
})

/** 已沉舰的所有格（用于两侧棋盘标色） */
const mySunkCells = computed(() => {
  const s = new Set<number>()
  myFleet.value.forEach((f) => {
    if (f.cells.every((c) => enemyShot.value[c] === 2)) f.cells.forEach((c) => s.add(c))
  })
  return s
})
const enemySunkCells = computed(() => {
  const s = new Set<number>()
  enemyFleet.value.forEach((f) => {
    if (f.cells.every((c) => myShot.value[c] === 2)) f.cells.forEach((c) => s.add(c))
  })
  return s
})
/** 布阵预览：悬停格出发的舰体占格 */
const previewCells = computed(() => {
  if (state.value !== 'placing' || hoverIdx.value < 0 || placingIdx.value >= FLEET.length) return [] as number[]
  const f = FLEET[placingIdx.value]!
  if (!canPlace(myGrid.value, hoverIdx.value, f.size, placeVert.value)) return [] as number[]
  return placeCells(hoverIdx.value, f.size, placeVert.value)
})
const placeValid = computed(() => {
  if (state.value !== 'placing' || hoverIdx.value < 0 || placingIdx.value >= FLEET.length) return false
  return canPlace(myGrid.value, hoverIdx.value, FLEET[placingIdx.value]!.size, placeVert.value)
})

/** 舰船贴图定位：横向直接铺在占格上，竖向先横绘再旋转 90° */
function shipStyle(cells: number[]) {
  const rs = cells.map((c) => Math.floor(c / N))
  const cs = cells.map((c) => c % N)
  const rMin = Math.min(...rs)!
  const cMin = Math.min(...cs)!
  const vert = rMin !== Math.max(...rs)
  const w = (Math.max(...cs) - cMin + 1) * BS_STEP - BS_GAP
  const h = (Math.max(...rs) - rMin + 1) * BS_STEP - BS_GAP
  const left = BS_PAD + cMin * BS_STEP
  const top = BS_PAD + rMin * BS_STEP
  if (!vert) return { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' }
  return {
    left: left + w / 2 - h / 2 + 'px',
    top: top + h / 2 - w / 2 + 'px',
    width: h + 'px',
    height: w + 'px',
    transform: 'rotate(90deg)',
  }
}

/** 炮弹标记（水花 / 爆炸）定位到格中心 */
function markerStyle(i: number) {
  const { r, c } = rc(i)
  return {
    left: BS_PAD + c * BS_STEP + 7 + 'px',
    top: BS_PAD + r * BS_STEP + 7 + 'px',
  }
}

function rc(i: number) {
  return { r: Math.floor(i / N), c: i % N }
}

/** 摆放合法性：不出界、不重叠 */
function canPlace(grid: number[], start: number, size: number, vert: boolean): boolean {
  const { r, c } = rc(start)
  for (let k = 0; k < size; k++) {
    const rr = vert ? r + k : r
    const cc = vert ? c : c + k
    if (rr >= N || cc >= N) return false
    if (grid[rr * N + cc]) return false
  }
  return true
}

function placeCells(start: number, size: number, vert: boolean): number[] {
  const { r, c } = rc(start)
  const out: number[] = []
  for (let k = 0; k < size; k++) {
    out.push((vert ? r + k : r) * N + (vert ? c : c + k))
  }
  return out
}

function randomFleet(): Ship[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const grid = Array(N * N).fill(0)
    const fleet: Ship[] = []
    let ok = true
    for (const f of FLEET) {
      let placed = false
      for (let t = 0; t < 60 && !placed; t++) {
        const start = Math.floor(Math.random() * N * N)
        const vert = Math.random() < 0.5
        if (!canPlace(grid, start, f.size, vert)) continue
        const cells = placeCells(start, f.size, vert)
        cells.forEach((c) => (grid[c] = fleet.length + 1))
        fleet.push({ name: f.name, size: f.size, cells })
        placed = true
      }
      if (!placed) {
        ok = false
        break
      }
    }
    if (ok) return fleet
  }
  return []
}

function setup() {
  clearTimer()
  myFleet.value = randomFleet()
  enemyFleet.value = randomFleet()
  myGrid.value = Array(N * N).fill(0)
  enemyGrid.value = Array(N * N).fill(0)
  myFleet.value.forEach((s, idx) => s.cells.forEach((c) => (myGrid.value[c] = idx + 1)))
  enemyFleet.value.forEach((s, idx) => s.cells.forEach((c) => (enemyGrid.value[c] = idx + 1)))
  myShot.value = Array(N * N).fill(0)
  enemyShot.value = Array(N * N).fill(0)
  state.value = 'placing'
  placingIdx.value = 0
  placeVert.value = false
  turn.value = 'P'
  passHint.value = ''
  aiQueue = []
  aiLastHits = []
  roundStart.value = 0
  finalDur.value = 0
  isRecord.value = false
}

function autoPlace() {
  myFleet.value = randomFleet()
  myGrid.value = Array(N * N).fill(0)
  myFleet.value.forEach((s, idx) => s.cells.forEach((c) => (myGrid.value[c] = idx + 1)))
  placingIdx.value = FLEET.length
  arcadeSound.click()
  tryBeginBattle()
}

function tryBeginBattle() {
  if (placingIdx.value < FLEET.length) return
  state.value = 'battle'
  turn.value = 'P'
  roundStart.value = Date.now()
  passHint.value = '舰队就位，向敌海域开炮！'
  arcadeSound.win()
}

function placeAt(i: number) {
  if (state.value !== 'placing' || placingIdx.value >= FLEET.length) return
  const f = FLEET[placingIdx.value]!
  if (!canPlace(myGrid.value, i, f.size, placeVert.value)) {
    arcadeSound.move()
    return
  }
  const cells = placeCells(i, f.size, placeVert.value)
  cells.forEach((c) => (myGrid.value[c] = placingIdx.value + 1))
  myFleet.value.push({ name: f.name, size: f.size, cells })
  placingIdx.value++
  arcadeSound.flip()
  tryBeginBattle()
}

/** 开炮结算：返回 'miss' | 'hit' | 'sunk'（含击沉的舰） */
function resolveShot(grid: number[], shot: number[], fleet: Ship[], i: number): 'miss' | 'hit' | 'sunk' {
  const shipId = grid[i]!
  if (!shipId) {
    shot[i] = 1
    return 'miss'
  }
  shot[i] = 2
  const ship = fleet[shipId - 1]!
  const sunk = ship.cells.every((c) => shot[c] === 2)
  return sunk ? 'sunk' : 'hit'
}

function allSunk(fleet: Ship[], shot: number[]): boolean {
  return fleet.every((s) => s.cells.every((c) => shot[c] === 2))
}

function playerShoot(i: number) {
  if (state.value !== 'battle' || turn.value !== 'P' || myShot.value[i]) return
  if (!roundStart.value) roundStart.value = Date.now()
  const res = resolveShot(enemyGrid.value, myShot.value, enemyFleet.value, i)
  if (res === 'miss') arcadeSound.move()
  else if (res === 'hit') arcadeSound.merge(0)
  else arcadeSound.match()
  if (allSunk(enemyFleet.value, myShot.value)) {
    endRound(true)
    return
  }
  turn.value = 'A'
  aiTimer = window.setTimeout(aiShoot, 520)
}

/** AI 三档选点：简单随机 / 普通视差+追击 / 困难追击+方向锁定 */
function pickAiTarget(): number {
  const open: number[] = []
  for (let i = 0; i < N * N; i++) if (!enemyShotSafe(i)) open.push(i)
  const diff = settings.value.battleshipDiff
  const fromQueue = () => {
    while (aiQueue.length) {
      const t = aiQueue.shift()!
      if (!enemyShotSafe(t)) return t
    }
    return -1
  }
  if (diff !== 'easy') {
    const t = fromQueue()
    if (t >= 0) return t
  }
  // 视差扫描（普通/困难）：命中过的地方优先打同棋盘色
  const parity = open.filter((i) => (rc(i).r + rc(i).c) % 2 === 0)
  if (diff === 'easy') return open[Math.floor(Math.random() * open.length)]!
  return parity.length ? parity[Math.floor(Math.random() * parity.length)]! : open[Math.floor(Math.random() * open.length)]!
}
function enemyShotSafe(i: number): boolean {
  return !!enemyShot.value[i]
}

function aiShoot() {
  if (state.value !== 'battle') return
  const i = pickAiTarget()
  const res = resolveShot(myGrid.value, enemyShot.value, myFleet.value, i)
  if (res === 'miss') arcadeSound.move()
  else if (res === 'hit') arcadeSound.merge(0)
  else arcadeSound.match()
  // 追击逻辑：命中后把相邻未射击格入队；两连中则锁定方向延伸
  const diff = settings.value.battleshipDiff
  if (diff !== 'easy' && res !== 'miss') {
    const { r, c } = rc(i)
    const push = (rr: number, cc: number) => {
      const j = rr * N + cc
      if (rr >= 0 && cc >= 0 && rr < N && cc < N && !enemyShotSafe(j) && !aiQueue.includes(j)) aiQueue.push(j)
    }
    push(r - 1, c)
    push(r + 1, c)
    push(r, c - 1)
    push(r, c + 1)
    if (diff === 'hard') {
      // 方向锁定：两连中后沿该直线继续延伸
      const pair = aiLastHits.find((h) => {
        const p = rc(h)
        return Math.abs(p.r - r) + Math.abs(p.c - c) === 1
      })
      if (pair !== undefined) {
        const p = rc(pair)
        const dr = Math.sign(r - p.r)
        const dc = Math.sign(c - p.c)
        let rr = r + dr
        let cc = c + dc
        while (rr >= 0 && cc >= 0 && rr < N && cc < N) {
          const j = idx(rr, cc)
          if (enemyShot.value[j] === 2) {
            rr += dr
            cc += dc
            continue
          }
          if (!enemyShot.value[j]) aiQueue.unshift(j)
          break
        }
      }
    }
    if (res === 'sunk') {
      aiQueue = []
      aiLastHits = []
    } else {
      aiLastHits.push(i)
      if (aiLastHits.length > 6) aiLastHits = aiLastHits.slice(-4)
    }
  }
  if (allSunk(myFleet.value, enemyShot.value)) {
    endRound(false)
    return
  }
  turn.value = 'P'
}
function idx(r: number, c: number) {
  return r * N + c
}

function endRound(playerWon: boolean) {
  state.value = 'over'
  clearTimer()
  finalDur.value = roundStart.value ? (Date.now() - roundStart.value) / 1000 : 0
  if (playerWon) {
    result.value = 'win'
    streak.value++
    tally.value.win++
    isRecord.value = streak.value > 0 && streak.value >= best.value
    addRecord({ g: 'battleship', score: streak.value, win: true, dur: Math.round(finalDur.value) })
    arcadeSound.win()
    passHint.value = '敌方舰队全军覆没，你赢了！'
  } else {
    result.value = 'lose'
    streak.value = 0
    tally.value.lose++
    isRecord.value = false
    addRecord({ g: 'battleship', score: 0, win: false, dur: Math.round(finalDur.value) })
    arcadeSound.lose()
    passHint.value = '我方舰队沉没，这局归 AI'
  }
}

function newRound() {
  result.value = null
  setup()
  arcadeSound.click()
}

function clearTimer() {
  if (aiTimer !== null) {
    window.clearTimeout(aiTimer)
    aiTimer = null
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key.toLowerCase() === 'r' && state.value === 'placing') {
    placeVert.value = !placeVert.value
    arcadeSound.click()
  }
}

watch(
  () => settings.value.battleshipDiff,
  () => {
    arcadeSound.click()
  },
)

onMounted(() => {
  setup()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  clearTimer()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pbattleship">
    <div class="arc-bsboards">
      <!-- 敌方海域 -->
      <div class="arc-bswrap">
        <div class="arc-bslabel">敌方海域 <span class="en">ENEMY</span></div>
        <div class="arc-bsboard is-enemy">
          <button
            v-for="i in N * N"
            :key="'e' + i"
            class="arc-bscell"
            :class="{
              'is-miss': myShot[i - 1] === 1,
              'is-hit': myShot[i - 1] === 2 && !enemySunkCells.has(i - 1),
              'is-sunk': enemySunkCells.has(i - 1),
            }"
            :aria-label="'敌海域 ' + i"
            @click="playerShoot(i - 1)"
          />
          <!-- 击沉的敌舰揭示贴图 -->
          <img
            v-for="(s, idx) in enemyFleet.filter((f) => f.cells.every((c) => myShot[c] === 2))"
            :key="'es' + idx"
            class="arc-bsship"
            :class="{ 'is-wreck': true }"
            :src="BATTLESHIP_ART.ship"
            :style="shipStyle(s.cells)"
            alt=""
          >
          <!-- 我方炮弹落点 -->
          <img
            v-for="i in N * N"
            v-show="myShot[i - 1] === 1"
            :key="'espl' + i"
            class="arc-bssplash"
            :src="BATTLESHIP_ART.splash"
            :style="markerStyle(i - 1)"
            alt=""
          >
          <img
            v-for="i in N * N"
            v-show="myShot[i - 1] === 2"
            :key="'ebo' + i"
            class="arc-bsboom"
            :src="BATTLESHIP_ART.boom"
            :style="markerStyle(i - 1)"
            alt=""
          >
        </div>
      </div>
      <!-- 我方海域 -->
      <div class="arc-bswrap">
        <div class="arc-bslabel">我方海域 <span class="en">MINE</span></div>
        <div class="arc-bsboard is-mine">
          <button
            v-for="i in N * N"
            :key="'m' + i"
            class="arc-bscell"
            :class="{
              'is-ship': !!myGrid[i - 1],
              'is-miss': !myGrid[i - 1] && enemyShot[i - 1] === 1,
              'is-hit': !!myGrid[i - 1] && enemyShot[i - 1] === 2 && !mySunkCells.has(i - 1),
              'is-sunk': mySunkCells.has(i - 1),
              'is-place-ok': previewCells.includes(i - 1),
              'is-place-bad': hoverIdx === i - 1 && !placeValid && state === 'placing' && !myGrid[i - 1],
            }"
            :aria-label="'我海域 ' + i"
            @click="state === 'placing' ? placeAt(i - 1) : undefined"
            @mouseenter="hoverIdx = i - 1"
            @mouseleave="hoverIdx = -1"
          />
          <!-- 我方舰船贴图 -->
          <img
            v-for="(s, idx) in myFleet"
            :key="'ms' + idx"
            class="arc-bsship"
            :src="BATTLESHIP_ART.ship"
            :style="shipStyle(s.cells)"
            alt=""
          >
          <!-- AI 炮弹落点 -->
          <img
            v-for="i in N * N"
            v-show="enemyShot[i - 1] === 1"
            :key="'mspl' + i"
            class="arc-bssplash"
            :src="BATTLESHIP_ART.splash"
            :style="markerStyle(i - 1)"
            alt=""
          >
          <img
            v-for="i in N * N"
            v-show="enemyShot[i - 1] === 2"
            :key="'mbo' + i"
            class="arc-bsboom"
            :src="BATTLESHIP_ART.boom"
            :style="markerStyle(i - 1)"
            alt=""
          >
        </div>
      </div>
      <p class="arc-hint">{{ statusText }}</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="newRound(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
        <button v-if="state === 'placing'" class="arc-btn" @click="autoPlace(); arcadeSound.click()">
          <ShipIcon :size="14" /> 自动布阵
        </button>
        <ArcadeDiffSeg :model-value="settings.battleshipDiff" @update:model-value="(v) => update({ battleshipDiff: v })" />
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">舰队状态</div>
        <div class="arc-bsfleet">
          <div v-for="(f, idx) in FLEET" :key="f.name" class="row">
            <span class="nm">{{ f.name }}</span>
            <span class="st">
              <template v-if="state === 'placing'">
                {{ idx < placingIdx ? '✓ 已就位' : idx === placingIdx ? '▸ 摆放中' : '待摆放' }}
              </template>
              <template v-else>
                {{ (enemyFleet[idx]?.cells.every((c) => myShot[c] === 2)) ? '✗ 已击沉' : '航行中' }}
              </template>
            </span>
          </div>
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

    <div v-if="state === 'over'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico" :class="result === 'win' ? 'is-win' : 'is-lose'"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">{{ result === 'win' ? '敌方舰队全灭！' : '我方舰队沉没' }}</div>
        <div class="arc-oversub">{{ passHint }}</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ streak }}</b><span>连胜</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="newRound(); arcadeSound.click()"><RotateCcw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
