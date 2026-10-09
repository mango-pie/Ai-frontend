<script setup lang="ts">
/**
 * 俄罗斯方块机台：←→ 移动 · ↑/X 旋转 · ↓ 软降 · 空格硬降 · P 暂停
 * - 7-bag 随机、简单踢墙（±1/±2）、消行闪烁动画、每 10 行提速一档
 * - 方块定位走 CSS 变量 --tcell，棋盘随舞台自适应；纪录取最高分
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { Pause, Play, RotateCcw, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords } from './arcade'

const COLS = 10
const ROWS = 20
/** 七种四格方块的基础矩阵，颜色按索引取 PIECE_COLORS */
const PIECES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
]
/** 方块配色见 games.css 的 .pc1–.pc7（索引 +1 即类名） */const LINE_POINTS = [0, 100, 300, 500, 800]

defineOptions({ name: 'GameFallingBlocks' })

const props = defineProps<{ active: boolean }>()

const board = ref<number[][]>(Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0)))
const cur = ref<{ id: number; m: number[][]; row: number; col: number } | null>(null)
const nextId = ref(0)
const score = ref(0)
const lines = ref(0)
const over = ref(false)
const paused = ref(false)
const clearing = ref<number[]>([])
const finalDur = ref(0)
const isRecord = ref(false)
const tcellPx = ref(32)
const paneEl = ref<HTMLElement | null>(null)

let bag: number[] = []
let timer: number | null = null
let startTs = 0
let roomActive = false
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const level = computed(() => Math.floor(lines.value / 10))
const speed = computed(() => Math.max(80, 800 - level.value * 70))
const best = computed(() => bestOf('tetris')?.raw ?? 0)
const boardW = computed(() => COLS * tcellPx.value)
const boardH = computed(() => ROWS * tcellPx.value)

interface RenderCell {
  r: number
  c: number
  v: number
  isCur: boolean
  clearing: boolean
}

const renderCells = computed<RenderCell[]>(() => {
  const out: RenderCell[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board.value[r]![c]!
      if (v) out.push({ r, c, v, isCur: false, clearing: clearing.value.includes(r) })
    }
  }
  const p = cur.value
  if (p) {
    p.m.forEach((row, dr) => {
      row.forEach((cell, dc) => {
        if (cell && p.row + dr >= 0) out.push({ r: p.row + dr, c: p.col + dc, v: p.id + 1, isCur: true, clearing: false })
      })
    })
  }
  return out
})

/** 下一块的预览格（归一化到左上角的小格坐标） */
const previewCells = computed(() => {
  const m = PIECES[nextId.value] ?? PIECES[0]!
  const out: Array<{ r: number; c: number }> = []
  m.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell) out.push({ r, c })
    })
  })
  return out
})

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const sideH = col ? 280 : 0
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(320, pane.clientHeight - 56 - sideH)
  tcellPx.value = Math.max(20, Math.min(36, Math.floor(availH / ROWS), Math.floor(availW / COLS)))
}

function drawFromBag(): number {
  if (!bag.length) {
    bag = [0, 1, 2, 3, 4, 5, 6]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = bag[i]!
      bag[i] = bag[j]!
      bag[j] = tmp
    }
  }
  return bag.pop()!
}

function collide(m: number[][], row: number, col: number): boolean {
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r]!.length; c++) {
      if (!m[r]![c]) continue
      const gr = row + r
      const gc = col + c
      if (gc < 0 || gc >= COLS || gr >= ROWS) return true
      if (gr >= 0 && board.value[gr]![gc]!) return true
    }
  }
  return false
}

function spawn() {
  const id = nextId.value
  nextId.value = drawFromBag()
  const m = PIECES[id]!.map((row) => [...row])
  const piece = { id, m, row: 0, col: Math.floor((COLS - m[0]!.length) / 2) }
  if (collide(piece.m, piece.row, piece.col)) {
    cur.value = null
    gameOver()
    return
  }
  cur.value = piece
}

function mergeCur() {
  const p = cur.value
  if (!p) return
  p.m.forEach((row, dr) => {
    row.forEach((cell, dc) => {
      const r = p.row + dr
      const c = p.col + dc
      if (cell && r >= 0 && r < ROWS && c >= 0 && c < COLS) board.value[r]![c] = p.id + 1
    })
  })
  cur.value = null
  const full: number[] = []
  for (let r = 0; r < ROWS; r++) {
    if (board.value[r]!.every((v) => v)) full.push(r)
  }
  if (full.length) {
    clearing.value = full
    arcadeSound.match()
    window.setTimeout(() => {
      full.forEach((r) => {
        const removed = board.value.splice(r, 1)[0]!
        board.value.unshift(Array<number>(COLS).fill(0))
        void removed
      })
      lines.value += full.length
      score.value += (LINE_POINTS[full.length] ?? 800) * (level.value + 1)
      clearing.value = []
      spawn()
      ensureLoop()
    }, 240)
    stopLoop()
  } else {
    spawn()
    ensureLoop()
  }
}

function moveDown(): boolean {
  const p = cur.value
  if (!p) return false
  if (!collide(p.m, p.row + 1, p.col)) {
    p.row++
    return true
  }
  return false
}

function shift(dx: number) {
  const p = cur.value
  if (!p || collide(p.m, p.row, p.col + dx)) return
  p.col += dx
  arcadeSound.move()
}

function rotate() {
  const p = cur.value
  if (!p) return
  const rm = p.m[0]!.map((_, c) => p.m.map((row) => row[c]!).reverse())
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collide(rm, p.row, p.col + kick)) {
      p.m = rm
      p.col += kick
      arcadeSound.flip()
      return
    }
  }
}

function softDrop() {
  if (moveDown()) {
    score.value++
    arcadeSound.move()
  } else {
    mergeCur()
  }
}

function hardDrop() {
  const p = cur.value
  if (!p) return
  let d = 0
  while (!collide(p.m, p.row + 1, p.col)) {
    p.row++
    d++
  }
  score.value += d * 2
  arcadeSound.flip()
  mergeCur()
}

function tick() {
  if (over.value || paused.value) return
  if (cur.value && !moveDown()) mergeCur()
  else ensureLoop()
}

function schedule() {
  stopLoop()
  timer = window.setTimeout(tick, speed.value)
}
function ensureLoop() {
  if (!over.value && !paused.value && props.active && roomActive && timer === null && !clearing.value.length) schedule()
}
function stopLoop() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

function restart() {
  stopLoop()
  board.value = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0))
  bag = []
  score.value = 0
  lines.value = 0
  over.value = false
  paused.value = false
  isRecord.value = false
  clearing.value = []
  startTs = Date.now()
  nextId.value = drawFromBag()
  spawn()
  ensureLoop()
}

function togglePause() {
  if (over.value) return
  paused.value = !paused.value
  arcadeSound.click()
  if (!paused.value) ensureLoop()
  else stopLoop()
}

function gameOver() {
  over.value = true
  stopLoop()
  finalDur.value = (Date.now() - startTs) / 1000
  const prev = best.value
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'tetris', score: score.value, lines: lines.value, dur: Math.round(finalDur.value) })
  arcadeSound.lose()
}

function onKey(e: KeyboardEvent) {
  if (!roomActive || !props.active || over.value || paused.value) return
  const k = e.key
  if (k === 'ArrowLeft') {
    e.preventDefault()
    shift(-1)
  } else if (k === 'ArrowRight') {
    e.preventDefault()
    shift(1)
  } else if (k === 'ArrowDown') {
    e.preventDefault()
    softDrop()
  } else if (k === 'ArrowUp' || k.toLowerCase() === 'x') {
    e.preventDefault()
    rotate()
  } else if (k === ' ') {
    e.preventDefault()
    hardDrop()
  } else if (k.toLowerCase() === 'p') {
    togglePause()
  }
}

// 房间 / 机台切走时暂停下落
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
  <div ref="paneEl" class="arc-pane arc-ptetris">
    <div class="arc-gamecol">
      <div
        class="arc-tetrisboard"
        :style="{ width: boardW + 'px', height: boardH + 'px', '--tcell': tcellPx + 'px' }"
      >
        <span
          v-for="(cell, i) in renderCells"
          :key="i"
          class="arc-tcell"
          :class="[{ 'is-cur': cell.isCur, 'is-clearing': cell.clearing }, 'pc' + cell.v]"
          :style="{ transform: `translate(${cell.c * tcellPx}px, ${cell.r * tcellPx}px)` }"
        />
      </div>
      <p class="arc-hint">←→ 移动 · ↑/X 旋转 · ↓ 软降 · 空格硬降 · P 暂停</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="restart(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
        <button class="arc-btn" :disabled="over" @click="togglePause()">
          <Pause v-if="!paused" :size="14" /><Play v-else :size="14" /> {{ paused ? '继续' : '暂停' }}
        </button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">下一块</div>
        <div class="arc-nextpreview" :style="{ '--mini': Math.max(10, Math.round(tcellPx * 0.42)) + 'px' }">
          <span
            v-for="(pc, i) in previewCells"
            :key="i"
            class="arc-minicell"
            :class="'pc' + (nextId + 1)"
            :style="{ transform: `translate(${pc.c * 13}px, ${pc.r * 13}px)` }"
          />
        </div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">分数 / 行数</div>
        <div class="arc-scoreval">{{ fmtInt(score) }}</div>
        <div class="arc-subval">{{ lines }} 行 · Lv.{{ level + 1 }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, score)) }}</div>
      </div>
    </div>

    <div v-if="over" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-lose"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">堆到顶了</div>
        <div class="arc-oversub">这一局消了 {{ lines }} 行</div>
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
