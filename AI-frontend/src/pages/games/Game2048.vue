<script setup lang="ts">
/**
 * 2048 机台：方向键 / WASD / 触屏滑动 / 屏幕方向键，合并得分冲向 2048
 * - 方块定位走 CSS 变量（--cell/--gap），棋盘尺寸变化时重算步长自动重排
 * - 撤销辅助可在游戏舱偏好中开启（U 键 / 工具栏按钮），最多回溯 24 步
 */
import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RotateCcw,
  Trophy,
  Undo2,
} from 'lucide-vue-next'
import { arcadeSound, fmtDur, fmtInt, useArcadeRecords, useArcadeSettings } from './arcade'

interface Tile {
  id: number
  r: number
  c: number
  v: number
  isNew: boolean
  pop: boolean
  eaten: boolean
}
type Dir = 'up' | 'down' | 'left' | 'right'

defineProps<{ active: boolean }>()

// 文件名中的数字不算单词，显式命名以满足 multi-word 规则
defineOptions({ name: 'GameBoard2048' })

const tiles = ref<Tile[]>([])
const score = ref(0)
const best = ref(0)
const over = ref(false)
const won = ref(false)
const finalDur = ref(0)
const isRecord = ref(false)
const canUndo = ref(false)
const boardEl = ref<HTMLElement | null>(null)
/** 当前格距 = --cell + --gap，随棋盘 CSS 变量动态测量 */
const stridePx = ref(84)

let uid = 1
let hist: Array<{ tiles: Array<Pick<Tile, 'r' | 'c' | 'v'>>; score: number }> = []
let startTs = Date.now()
let roomActive = false
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()
const { settings } = useArcadeSettings()

function measure() {
  const el = boardEl.value
  if (!el) return
  const cs = getComputedStyle(el)
  const cell = parseFloat(cs.getPropertyValue('--cell'))
  const gap = parseFloat(cs.getPropertyValue('--gap'))
  if (cell > 0 && gap >= 0) stridePx.value = cell + gap
}

function spawn() {
  const taken = new Set(tiles.value.filter((t) => !t.eaten).map((t) => t.r * 4 + t.c))
  const empty: Array<[number, number]> = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!taken.has(r * 4 + c)) empty.push([r, c])
    }
  }
  if (!empty.length) return
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]!
  tiles.value.push({ id: uid++, r, c, v: Math.random() < 0.9 ? 2 : 4, isNew: true, pop: false, eaten: false })
}

function gridOf(): Array<Array<Tile | null>> {
  const g: Array<Array<Tile | null>> = [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ]
  for (const t of tiles.value) {
    if (!t.eaten) g[t.r]![t.c] = t
  }
  return g
}

function snapshot() {
  return {
    tiles: tiles.value.filter((t) => !t.eaten).map((t) => ({ r: t.r, c: t.c, v: t.v })),
    score: score.value,
  }
}

function restart() {
  tiles.value = []
  hist = []
  score.value = 0
  over.value = false
  won.value = false
  isRecord.value = false
  startTs = Date.now()
  best.value = bestOf('g2048')?.raw ?? 0
  spawn()
  spawn()
  syncUndo()
}

function syncUndo() {
  canUndo.value = hist.length > 0
}

function move(dir: Dir) {
  if (over.value) return
  const snap = snapshot()
  const g = gridOf()
  const rowsAxis = dir === 'left' || dir === 'right'
  let moved = false
  let gain = 0
  const eatenPairs: Array<{ e: Tile; to: Tile }> = []
  const merged: Tile[] = []
  for (let i = 0; i < 4; i++) {
    const line: Tile[] = []
    for (let j = 0; j < 4; j++) {
      const r = rowsAxis ? i : dir === 'up' ? j : 3 - j
      const c = rowsAxis ? (dir === 'left' ? j : 3 - j) : i
      const t = g[r]![c]
      if (t) line.push(t)
    }
    const out: Tile[] = []
    for (let k = 0; k < line.length; k++) {
      const t = line[k]!
      if (k + 1 < line.length && line[k + 1]!.v === t.v) {
        const other = line[k + 1]!
        k++
        t.v *= 2
        gain += t.v
        merged.push(t)
        other.eaten = true
        eatenPairs.push({ e: other, to: t })
        if (t.v >= 2048) won.value = true
      }
      out.push(t)
    }
    out.forEach((t, idx) => {
      const r = rowsAxis ? i : dir === 'up' ? idx : 3 - idx
      const c = rowsAxis ? (dir === 'left' ? idx : 3 - idx) : i
      if (t.r !== r || t.c !== c) moved = true
      t.r = r
      t.c = c
    })
  }
  if (!moved) return
  hist.push(snap)
  if (hist.length > 24) hist.shift()
  syncUndo()
  arcadeSound.move()
  // 被吃方块滑到幸存块位置，动画结束再移除并让幸存块弹出
  for (const { e, to } of eatenPairs) {
    e.r = to.r
    e.c = to.c
  }
  score.value += gain
  window.setTimeout(() => {
    tiles.value = tiles.value.filter((t) => !t.eaten)
    for (const m of merged) {
      m.pop = true
      arcadeSound.merge(m.v)
    }
    spawn()
    if (!movesAvailable()) endGame()
    window.setTimeout(() => {
      for (const m of merged) m.pop = false
    }, 200)
  }, 115)
}

function movesAvailable(): boolean {
  if (tiles.value.filter((t) => !t.eaten).length < 16) return true
  const g = gridOf()
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const t = g[r]![c]!
      if (c < 3 && g[r]![c + 1]!.v === t.v) return true
      if (r < 3 && g[r + 1]![c]!.v === t.v) return true
    }
  }
  return false
}

function endGame() {
  over.value = true
  finalDur.value = (Date.now() - startTs) / 1000
  const prevBest = bestOf('g2048')?.raw ?? 0
  isRecord.value = score.value > 0 && score.value >= prevBest
  addRecord({ g: 'g2048', score: score.value, dur: Math.round(finalDur.value), win: won.value })
  if (won.value) arcadeSound.win()
  else arcadeSound.lose()
}

function undo() {
  const snap = hist.pop()
  if (!snap) return
  tiles.value = snap.tiles.map((p) => ({ id: uid++, r: p.r, c: p.c, v: p.v, isNew: false, pop: false, eaten: false }))
  score.value = snap.score
  over.value = false
  won.value = false
  syncUndo()
  arcadeSound.flip()
}

function onKey(e: KeyboardEvent) {
  if (!roomActive || over.value) return
  const key = e.key.toLowerCase()
  if (key === 'r' && !e.metaKey && !e.ctrlKey) {
    restart()
    arcadeSound.click()
    return
  }
  if (key === 'u' && settings.value.undo2048 && !e.metaKey && !e.ctrlKey) {
    undo()
    arcadeSound.click()
    return
  }
  const map: Record<string, Dir> = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right',
  }
  const dir = map[key]
  if (dir) {
    e.preventDefault()
    move(dir)
  }
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
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left')
  else move(dy > 0 ? 'down' : 'up')
}

onMounted(() => {
  restart()
  measure()
  resizeOb = new ResizeObserver(() => measure())
  if (boardEl.value) resizeOb.observe(boardEl.value)
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
  window.removeEventListener('keydown', onKey)
})

function tileClass(t: Tile) {
  return { 'is-eat': t.eaten, 'is-new': t.isNew, 'is-pop': t.pop }
}
function tileFont(t: Tile) {
  const len = String(t.v).length
  return len <= 2 ? '30px' : len === 3 ? '25px' : '20px'
}
</script>

<template>
  <div class="arc-pane arc-p2048">
    <div class="arc-gamecol">
      <div ref="boardEl" class="arc-board2048" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
        <div
          v-for="i in 16"
          :key="'bg' + i"
          class="arc-cellbg"
          :style="{ '--r': Math.floor((i - 1) / 4), '--c': (i - 1) % 4 }"
        />
        <div
          v-for="t in tiles"
          :key="t.id"
          class="arc-tile"
          :class="tileClass(t)"
          :style="{ transform: `translate(${t.c * stridePx}px, ${t.r * stridePx}px)` }"
        >
          <div class="arc-tin" :class="t.v > 2048 ? 'vbig' : 'v' + t.v" :style="{ fontSize: tileFont(t) }">
            {{ t.v }}
          </div>
        </div>
      </div>
      <p class="arc-hint">
        方向键 / WASD / 滑动 · R 重开<template v-if="settings.undo2048"> · U 撤销</template>
      </p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="restart(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
        <button v-if="settings.undo2048" class="arc-btn" :disabled="!canUndo" @click="undo(); arcadeSound.click()">
          <Undo2 :size="14" /> 撤销一步
        </button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">当前分数</div>
        <div class="arc-scoreval">{{ fmtInt(score) }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, score)) }}</div>
      </div>
      <div class="arc-dpad">
        <span />
        <button aria-label="上" @click="move('up')"><ChevronUp :size="17" /></button>
        <span />
        <button aria-label="左" @click="move('left')"><ChevronLeft :size="17" /></button>
        <button aria-label="下" @click="move('down')"><ChevronDown :size="17" /></button>
        <button aria-label="右" @click="move('right')"><ChevronRight :size="17" /></button>
      </div>
    </div>

    <div v-if="over" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico" :class="won ? 'is-win' : 'is-lose'"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">{{ won ? '达成 2048！' : '棋盘满了' }}</div>
        <div class="arc-oversub">{{ won ? '数字列车全速通过车站' : '再多滑几步试试，棋盘还会腾出来的' }}</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtInt(score) }}</b><span>本局分数</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>本局用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="restart(); arcadeSound.click()">
            <RotateCcw :size="14" /> 再来一局
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
