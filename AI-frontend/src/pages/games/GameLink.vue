<script setup lang="ts">
/**
 * 连连看机台：10×6 棋盘 15 种图标，点选两枚相同图标、路径转折不超过两次即可消除
 * - 路径走 BFS（含外圈空环），消除时闪现连线；无解自动洗牌（另有 3 次手动洗牌）
 * - 全清为通关，纪录取最快通关时间
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RefreshCw, Shuffle, Trophy } from 'lucide-vue-next'
import { LINK_ICONS } from './assets'
import { arcadeSound, fmtDur, useArcadeRecords } from './arcade'

const COLS = 10
const ROWS = 6
/** 图标种类数（每种 4 块 = 2 对），总对数 = 30 */
const TYPES = 15
const PAIRS = (COLS * ROWS) / 2

defineOptions({ name: 'GameLinkUp' })

const props = defineProps<{ active: boolean }>()

const ICONS = LINK_ICONS

interface Pt {
  r: number
  c: number
}

const tiles = ref<Array<number | null>>([])
const selected = ref<number | null>(null)
const cleared = ref(0)
const shufflesLeft = ref(3)
const state = ref<'idle' | 'run' | 'over'>('idle')
const now = ref(Date.now())
const startTs = ref(0)
const finalDur = ref(0)
const isRecord = ref(false)
const tilePx = ref(56)
const paneEl = ref<HTMLElement | null>(null)
const pathPts = ref<Pt[]>([])

let clock: number | null = null
let pathTimer: number | null = null
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const best = computed(() => bestOf('link')?.raw ?? null)
const elapsed = computed(() => (state.value === 'run' && startTs.value ? (now.value - startTs.value) / 1000 : finalDur.value))

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(300, pane.clientWidth - 48 - sideW)
  const availH = Math.max(280, pane.clientHeight - 56)
  tilePx.value = Math.max(40, Math.min(64, Math.floor((availH - 20) / ROWS) - 6, Math.floor(availW / COLS) - 6))
}

function tileAt(r: number, c: number): number | null {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null
  return tiles.value[r * COLS + c] ?? null
}

function deal() {
  const deck: number[] = []
  for (let icon = 0; icon < TYPES; icon++) deck.push(icon, icon, icon, icon)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  tiles.value = deck
  cleared.value = 0
  selected.value = null
  shufflesLeft.value = 3
  state.value = 'run'
  startTs.value = 0
  isRecord.value = false
  pathPts.value = []
  if (clock === null) clock = window.setInterval(() => (now.value = Date.now()), 500)
  window.setTimeout(() => {
    if (state.value === 'run' && !findAnyPair()) doShuffle()
  }, 300)
}

function shuffleValues() {
  const remaining = tiles.value.map((v, i) => ({ v, i })).filter((x) => x.v !== null)
  const values = remaining.map((x) => x.v as number)
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = values[i]!
    values[i] = values[j]!
    values[j] = tmp
  }
  remaining.forEach((x, k) => {
    tiles.value[x.i] = values[k] ?? null
  })
  selected.value = null
}

function doShuffle() {
  shuffleValues()
  arcadeSound.flip()
  if (!findAnyPair()) doShuffle()
}

function cellEmpty(r: number, c: number): boolean {
  return tileAt(r, c) === null
}

/** BFS：状态 (r,c,方向,转折数)，转折 ≤2；返回转角点列（供画线），直线/一折/两折全覆盖 */
function connect(a: Pt, b: Pt): Pt[] | null {
  const DIRS: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]
  const key = (r: number, c: number, d: number) => `${r},${c},${d}`
  const prev = new Map<string, { k: string; r: number; c: number }>()
  const queue: Array<{ r: number; c: number; d: number; turns: number }> = []
  for (let d = 0; d < 4; d++) {
    const [dr, dc] = DIRS[d]!
    const r = a.r + dr
    const c = a.c + dc
    if (r === b.r && c === b.c) return [a, b]
    if (cellEmpty(r, c)) {
      const k = key(r, c, d)
      prev.set(k, { k: '', r: a.r, c: a.c })
      queue.push({ r, c, d, turns: 0 })
    }
  }
  let best: { r: number; c: number; d: number; turns: number } | null = null
  while (queue.length) {
    const cur = queue.shift()!
    if (best && cur.turns > best.turns) break
    for (let d = 0; d < 4; d++) {
      const [dr, dc] = DIRS[d]!
      const r = cur.r + dr
      const c = cur.c + dc
      const turns = cur.turns + (d === cur.d ? 0 : 1)
      if (turns > 2) continue
      if (r === b.r && c === b.c) {
        prev.set(key(r, c, d), { k: key(cur.r, cur.c, cur.d), r: cur.r, c: cur.c })
        best = { r, c, d, turns }
        // 就近截断，取最先（转折最少）到达的路径
        queue.length = 0
        break
      }
      if (!cellEmpty(r, c)) continue
      const k = key(r, c, d)
      if (prev.has(k)) continue
      prev.set(k, { k: key(cur.r, cur.c, cur.d), r: cur.r, c: cur.c })
      queue.push({ r, c, d, turns })
    }
  }
  if (!best) return null
  // 回溯转角
  const pts: Pt[] = []
  let k: string | undefined = key(best.r, best.c, best.d)
  while (k) {
    const node = prev.get(k)
    if (!node) break
    pts.unshift({ r: node.r, c: node.c })
    k = node.k || undefined
  }
  pts.push({ r: b.r, c: b.c })
  return pts
}

function findPairPath(): { a: number; b: number; pts: Pt[] } | null {
  const byIcon = new Map<number, number[]>()
  tiles.value.forEach((v, i) => {
    if (v !== null) {
      const arr = byIcon.get(v) ?? []
      arr.push(i)
      byIcon.set(v, arr)
    }
  })
  for (const positions of byIcon.values()) {
    if (positions.length < 2) continue
    for (let x = 0; x < positions.length; x++) {
      for (let y = x + 1; y < positions.length; y++) {
        const a = rc(positions[x]!)
        const b = rc(positions[y]!)
        const pts = connect(a, b)
        if (pts) return { a: positions[x]!, b: positions[y]!, pts }
      }
    }
  }
  return null
}
function rc(i: number): Pt {
  return { r: Math.floor(i / COLS), c: i % COLS }
}
function findAnyPair(): boolean {
  return findPairPath() !== null
}

/** 棋盘几何（与 CSS 的 10px 内边距 / 6px 间隙保持一致） */
const PAD = 10
const GAP = 6
const boardW = computed(() => PAD * 2 + COLS * tilePx.value + (COLS - 1) * GAP)
const boardH = computed(() => PAD * 2 + ROWS * tilePx.value + (ROWS - 1) * GAP)
function ptX(p: Pt): number {
  return PAD + p.c * (tilePx.value + GAP) + tilePx.value / 2
}
function ptY(p: Pt): number {
  return PAD + p.r * (tilePx.value + GAP) + tilePx.value / 2
}

function clickTile(i: number) {
  if (state.value !== 'run') return
  const v = tiles.value[i]
  if (v === null) return
  if (!startTs.value) startTs.value = Date.now()
  if (selected.value === i) {
    selected.value = null
    return
  }
  if (selected.value === null) {
    selected.value = i
    arcadeSound.flip()
    return
  }
  const a = selected.value
  if (tiles.value[a] !== v) {
    selected.value = i
    arcadeSound.move()
    return
  }
  const pts = connect(rc(a), rc(i))
  if (!pts) {
    selected.value = i
    arcadeSound.move()
    return
  }
  // 消除
  tiles.value[a] = null
  tiles.value[i] = null
  selected.value = null
  cleared.value++
  pathPts.value = pts
  if (pathTimer !== null) window.clearTimeout(pathTimer)
  pathTimer = window.setTimeout(() => (pathPts.value = []), 480)
  arcadeSound.match()
  if (tiles.value.every((t) => t === null)) {
    winGame()
    return
  }
  if (!findAnyPair()) {
    doShuffle()
    arcadeSound.note(392, 0.2)
  }
}

function winGame() {
  state.value = 'over'
  finalDur.value = startTs.value ? (Date.now() - startTs.value) / 1000 : 0
  const prev = best.value
  isRecord.value = prev === null || finalDur.value < prev
  addRecord({ g: 'link', score: cleared.value, win: true, dur: Math.round(finalDur.value) })
  arcadeSound.win()
}

function restart() {
  clearClock()
  deal()
  arcadeSound.click()
}

function clearClock() {
  if (clock !== null) {
    window.clearInterval(clock)
    clock = null
  }
}

// 切走机台：暂停计时（冻结 now），回来按已玩时长续算；未开局不动计时
watch(
  () => props.active,
  (active) => {
    if (active) {
      if (state.value === 'run' && startTs.value) {
        startTs.value = Date.now() - (now.value - startTs.value)
        now.value = Date.now()
      }
      if (state.value === 'run' && clock === null) clock = window.setInterval(() => (now.value = Date.now()), 500)
    } else if (clock !== null) {
      window.clearInterval(clock)
      clock = null
    }
  },
)

onMounted(() => {
  deal()
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
})
onUnmounted(() => {
  clearClock()
  if (pathTimer !== null) window.clearTimeout(pathTimer)
  resizeOb?.disconnect()
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-plink">
    <div class="arc-gamecol">
      <div class="arc-linkboard" :style="{ '--ltile': tilePx + 'px' }">
        <div v-for="i in COLS * ROWS" :key="i" class="arc-linkcell">
          <button
            v-if="tiles[i - 1] !== null && tiles[i - 1] !== undefined"
            class="arc-linktile"
            :class="{ 'is-selected': selected === i - 1 }"
            :aria-label="'图标块 ' + i"
            @click="clickTile(i - 1)"
          >
            <img class="arc-linkimg" :src="ICONS[tiles[i - 1]!] ?? ICONS[0]" alt="">
          </button>
        </div>
        <!-- 连线路径 -->
        <svg
          v-if="pathPts.length > 1"
          class="arc-linkpath"
          :width="boardW"
          :height="boardH"
          :viewBox="`0 0 ${boardW} ${boardH}`"
        >
          <polyline
            :points="pathPts.map((p) => `${ptX(p)},${ptY(p)}`).join(' ')"
            fill="none"
            stroke="var(--room)"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <p class="arc-hint">点选两枚相同图标 · 转折不超过两次即可消除</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="restart(); arcadeSound.click()"><RefreshCw :size="14" /> 重新发牌</button>
        <button class="arc-btn" :disabled="state !== 'run' || shufflesLeft <= 0" @click="shufflesLeft--; doShuffle(); arcadeSound.click()">
          <Shuffle :size="14" /> 洗牌 ×{{ shufflesLeft }}
        </button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">已消对数</div>
        <div class="arc-scoreval">{{ cleared }}/{{ PAIRS }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">本局用时</div>
        <div class="arc-scoreval">{{ fmtDur(elapsed) }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">最快通关</div>
        <div class="arc-scoreval">{{ best == null ? '—' : fmtDur(best) }}</div>
      </div>
    </div>

    <div v-if="state === 'over'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-win"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">全部消除！</div>
        <div class="arc-oversub">{{ PAIRS }} 对图标被你一网打尽</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>通关用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="restart(); arcadeSound.click()"><RefreshCw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
