<script setup lang="ts">
/**
 * 扫雷机台：三档难度（入门 9×9 / 进阶 12×12 / 大师 16×16）
 * - 左键翻开、右键 / 长按插旗，首次翻开除雷；未翻 / 已翻 / 插旗三态立体区分
 * - 棋盘按舞台可用空间自适应（ResizeObserver 写入 --mc）
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Bomb, Flag, RotateCcw, Timer, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, useArcadeRecords, type MineDiff } from './arcade'

interface MineCell {
  r: number
  c: number
  mine: boolean
  adj: number
  open: boolean
  flag: boolean
}

defineProps<{ active: boolean }>()

const DIFFS: Record<MineDiff, { size: number; mines: number; label: string }> = {
  easy: { size: 9, mines: 10, label: '入门 9×9' },
  hard: { size: 12, mines: 24, label: '进阶 12×12' },
  master: { size: 16, mines: 40, label: '大师 16×16' },
}
const DIFF_CN: Record<MineDiff, string> = { easy: '入门', hard: '进阶', master: '大师' }
const SIZE_CN: Record<MineDiff, string> = { easy: '9×9', hard: '12×12', master: '16×16' }

const diff = ref<MineDiff>('easy')
const cells = ref<MineCell[]>([])
const flags = ref(0)
const sec = ref(0)
const state = ref<'idle' | 'run' | 'win' | 'dead'>('idle')
const flagMode = ref(false)
const mcPx = ref(38)
const paneEl = ref<HTMLElement | null>(null)

const size = computed(() => DIFFS[diff.value].size)
const mines = computed(() => DIFFS[diff.value].mines)
const minesLeft = computed(() => Math.max(0, mines.value - flags.value))
const finalDur = ref(0)
const isRecord = ref(false)

let timer: number | null = null
let resizeOb: ResizeObserver | null = null
let pressT: number | null = null

const { addRecord, records } = useArcadeRecords()

/** 本难度（当前难度切换后纪录按难度区分展示）的历史最快通关 */
function fastestWin(): number | null {
  const wins = records.value.filter((r) => r.g === 'mine' && r.win && r.diff === diff.value)
  return wins.length ? Math.min(...wins.map((r) => r.dur)) : null
}

/** 棋盘按舞台可用宽高取最大格距；窄屏侧栏折行到下方时占满整幅宽 */
function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const sideH = col ? 280 : 0
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(260, pane.clientHeight - 56 - sideH)
  const n = size.value
  const cap = n <= 9 ? 64 : n <= 12 ? 52 : 42
  mcPx.value = Math.max(
    26,
    Math.min(cap, Math.floor((availH - 46 - 16) / n) - 4, Math.floor((availW - 16) / n) - 4),
  )
}

function build() {
  const n = size.value
  cells.value = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      cells.value.push({ r, c, mine: false, adj: 0, open: false, flag: false })
    }
  }
  flags.value = 0
  sec.value = 0
  state.value = 'idle'
  isRecord.value = false
  stopTimer()
  fit()
}

function stopTimer() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

function startTimer() {
  stopTimer()
  timer = window.setInterval(() => {
    sec.value++
  }, 1000)
}

function cellAt(r: number, c: number): MineCell | undefined {
  return cells.value.find((x) => x.r === r && x.c === c)
}

function neighbors(cell: MineCell): MineCell[] {
  const out: MineCell[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const n = cellAt(cell.r + dr, cell.c + dc)
      if (n) out.push(n)
    }
  }
  return out
}

/** 首次翻开除雷：在安全区（点击格及邻格）之外布雷 */
function genMines(safe: MineCell) {
  const pool = cells.value.filter((x) => Math.abs(x.r - safe.r) > 1 || Math.abs(x.c - safe.c) > 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
  }
  pool.slice(0, mines.value).forEach((x) => {
    x.mine = true
  })
  cells.value.forEach((x) => {
    x.adj = neighbors(x).filter((n) => n.mine).length
  })
}

function reveal(cell: MineCell) {
  if (state.value === 'win' || state.value === 'dead') return
  if (cell.flag || cell.open) return
  if (state.value === 'idle') {
    genMines(cell)
    state.value = 'run'
    startTimer()
  }
  if (cell.mine) return burst()
  const queue = [cell]
  while (queue.length) {
    const cur = queue.pop()!
    if (cur.open || cur.flag) continue
    cur.open = true
    if (cur.adj) continue
    for (const n of neighbors(cur)) {
      if (!n.open && !n.mine) queue.push(n)
    }
  }
  arcadeSound.move()
  const opened = cells.value.filter((x) => x.open).length
  if (opened === size.value * size.value - mines.value) finish(true)
}

function burst() {
  state.value = 'dead'
  stopTimer()
  cells.value.forEach((x) => {
    if (x.mine) x.open = true
  })
  arcadeSound.lose()
  finish(false)
}

function toggleFlag(cell: MineCell) {
  if (cell.open || state.value === 'win' || state.value === 'dead') return
  cell.flag = !cell.flag
  flags.value += cell.flag ? 1 : -1
  arcadeSound.flip()
}

function finish(win: boolean) {
  state.value = win ? 'win' : 'dead'
  stopTimer()
  finalDur.value = sec.value
  if (win) {
    const fastest = fastestWin()
    isRecord.value = fastest === null || sec.value <= fastest
    addRecord({ g: 'mine', diff: diff.value, win: true, dur: sec.value })
    arcadeSound.win()
  } else {
    addRecord({ g: 'mine', diff: diff.value, win: false, dur: sec.value })
  }
}

function cellFromEvent(e: Event): MineCell | undefined {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.arc-mcell')
  if (!el) return undefined
  return cells.value.find((x) => x.r === Number(el.dataset.r) && x.c === Number(el.dataset.c))
}
function onCellClick(e: MouseEvent) {
  const cell = cellFromEvent(e)
  if (!cell) return
  if (flagMode.value) toggleFlag(cell)
  else reveal(cell)
}
function onCellContext(e: MouseEvent) {
  e.preventDefault()
  const cell = cellFromEvent(e)
  if (cell) toggleFlag(cell)
}
function onTouchStart(e: TouchEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.arc-mcell')
  if (!el) return
  const r = Number(el.dataset.r)
  const c = Number(el.dataset.c)
  pressT = window.setTimeout(() => {
    pressT = null
    const cell = cellAt(r, c)
    if (cell) toggleFlag(cell)
  }, 420)
}
function onTouchEnd() {
  if (pressT !== null) {
    window.clearTimeout(pressT)
    pressT = null
  }
}

function statusText() {
  if (state.value === 'win') return '全部排除！'
  if (state.value === 'dead') return '踩到雷了…'
  return state.value === 'run' ? '排除进行中' : '等待第一铲'
}

watch(diff, () => {
  build()
  arcadeSound.click()
})

onMounted(() => {
  build()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
})
onUnmounted(() => {
  resizeOb?.disconnect()
  stopTimer()
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pmine">
    <div class="arc-gamecol">
      <div
        class="arc-mboard"
        :style="{ gridTemplateColumns: `repeat(${size}, var(--mc))`, '--mc': mcPx + 'px' }"
        @click="onCellClick"
        @contextmenu="onCellContext"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
        @touchmove.passive="onTouchEnd"
      >
        <div
          v-for="cell in cells"
          :key="cell.r + '-' + cell.c"
          class="arc-mcell"
          :class="{
            'is-open': cell.open,
            'is-flag': cell.flag,
            'is-mine': cell.open && cell.mine,
            ['n' + cell.adj]: cell.open && cell.adj > 0,
          }"
          :data-r="cell.r"
          :data-c="cell.c"
        >
          <template v-if="cell.open && cell.mine"><Bomb :size="15" /></template>
          <template v-else-if="cell.flag"><span class="arc-flagico"><Flag :size="14" /></span></template>
          <template v-else-if="cell.open && cell.adj > 0">{{ cell.adj }}</template>
        </div>
      </div>
      <p class="arc-hint">左键翻开 · 右键 / 长按插旗</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="build(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
        <button
          class="arc-btn"
          :class="{ 'is-toggled': flagMode }"
          title="插旗模式（适合触屏）"
          @click="flagMode = !flagMode; arcadeSound.click()"
        >
          <Flag :size="14" /> 插旗模式
        </button>
      </div>
      <div class="arc-seg is-kids">
        <span
          v-for="(cfg, key) in DIFFS"
          :key="key"
          :class="{ 'is-active': diff === key }"
          tabindex="0"
          @click="diff = key as MineDiff"
          @keydown.enter="diff = key as MineDiff"
        >{{ cfg.label }}</span>
      </div>
      <div class="arc-counter"><Bomb :size="15" /><span>{{ minesLeft }}</span></div>
      <div class="arc-counter" :class="{ 'is-win': state === 'win', 'is-dead': state === 'dead' }">
        <Timer :size="15" /><span>{{ sec }}s</span>
      </div>
      <div class="arc-status" :class="{ 'is-win': state === 'win', 'is-dead': state === 'dead' }">
        <span class="dot" /><span>{{ statusText() }}</span>
      </div>
    </div>

    <div v-if="state === 'win' || state === 'dead'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico" :class="state === 'win' ? 'is-win' : 'is-lose'"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">{{ state === 'win' ? '全部排除！' : '砰——踩到雷了' }}</div>
        <div class="arc-oversub">{{ state === 'win' ? '雷区清点完毕，干得漂亮' : '数字会说话，下一局更稳' }}</div>
        <div v-if="state === 'win' && isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
          <div class="arc-gn"><b>{{ SIZE_CN[diff] }}</b><span>{{ DIFF_CN[diff] }}难度</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="build(); arcadeSound.click()"><RotateCcw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
