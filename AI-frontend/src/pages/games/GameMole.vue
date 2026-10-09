<script setup lang="ts">
/**
 * 打地鼠机台：30 秒限时，敲中地鼠 +10、金地鼠 +30
 * - 地鼠随机冒头（每 480ms 一波，停留 0.7–1.2s）；切走机台自动暂停，回来继续
 * - 纪录取最高分
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { Play, RefreshCw, Trophy } from 'lucide-vue-next'
import { MOLE_ART } from './assets'
import { arcadeSound, fmtInt, useArcadeRecords } from './arcade'

const HOLES = 9
const ROUND_SEC = 30

defineOptions({ name: 'GameMoleWhack' })

const props = defineProps<{ active: boolean }>()

interface Hole {
  up: boolean
  hit: boolean
  golden: boolean
}

const holes = ref<Hole[]>(Array.from({ length: HOLES }, () => ({ up: false, hit: false, golden: false })))
const score = ref(0)
const timeLeft = ref(ROUND_SEC)
const state = ref<'idle' | 'run' | 'paused' | 'over'>('idle')
const finalScore = ref(0)
const isRecord = ref(false)
const holePx = ref(104)
const paneEl = ref<HTMLElement | null>(null)

let spawner: number | null = null
let clock: number | null = null
const hideTimers = new Map<number, number>()
let roomActive = false
let resizeOb: ResizeObserver | null = null


const { addRecord, bestOf } = useArcadeRecords()

const best = computed(() => bestOf('mole')?.raw ?? 0)

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(260, pane.clientHeight - 56)
  holePx.value = Math.max(70, Math.min(118, Math.floor((availH - 80) / 3) - 14, Math.floor(availW / 3) - 14))
}

function clearHoleTimers() {
  hideTimers.forEach((t) => window.clearTimeout(t))
  hideTimers.clear()
  holes.value.forEach((h) => {
    h.up = false
    h.hit = false
  })
}

function spawn() {
  const down = holes.value.map((h, i) => ({ h, i })).filter((x) => !x.h.up)
  if (!down.length) return
  const picks = Math.random() < 0.3 ? 2 : 1
  for (let n = 0; n < picks; n++) {
    const pick = down.splice(Math.floor(Math.random() * down.length), 1)[0]
    if (!pick) return
    const hole = pick.h
    hole.up = true
    hole.hit = false
    hole.golden = Math.random() < 0.12
    hideTimers.set(
      pick.i,
      window.setTimeout(() => {
        hole.up = false
        hole.hit = false
        hideTimers.delete(pick.i)
      }, 700 + Math.random() * 500),
    )
  }
}

function whack(i: number) {
  if (state.value !== 'run') return
  const hole = holes.value[i]!
  if (!hole.up || hole.hit) return
  hole.hit = true
  hole.up = false
  const gain = hole.golden ? 30 : 10
  score.value += gain
  const t = hideTimers.get(i)
  if (t !== undefined) {
    window.clearTimeout(t)
    hideTimers.delete(i)
  }
  arcadeSound.merge(score.value)
}

function start() {
  clearHoleTimers()
  score.value = 0
  timeLeft.value = ROUND_SEC
  state.value = 'run'
  isRecord.value = false
  spawner = window.setInterval(spawn, 480)
  clock = window.setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) endRound()
  }, 1000)
}

function pauseRound() {
  if (state.value !== 'run') return
  state.value = 'paused'
  if (spawner !== null) window.clearInterval(spawner)
  if (clock !== null) window.clearInterval(clock)
  spawner = null
  clock = null
  clearHoleTimers()
}

function resumeRound() {
  if (state.value !== 'paused') return
  state.value = 'run'
  spawner = window.setInterval(spawn, 480)
  clock = window.setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) endRound()
  }, 1000)
}

function endRound() {
  clearHoleTimers()
  if (spawner !== null) window.clearInterval(spawner)
  if (clock !== null) window.clearInterval(clock)
  spawner = null
  clock = null
  finalScore.value = score.value
  const prev = bestOf('mole')?.raw ?? 0
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'mole', score: score.value, dur: ROUND_SEC })
  state.value = 'over'
  arcadeSound.win()
}

// 切走机台自动暂停，切回继续
watch(
  () => [props.active, roomActive] as const,
  ([active, roomOn]) => {
    if (active && roomOn && state.value === 'paused') resumeRound()
    if ((!active || !roomOn) && state.value === 'run') pauseRound()
  },
)

onMounted(() => {
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
  roomActive = true
})
onActivated(() => {
  roomActive = true
})
onDeactivated(() => {
  roomActive = false
})
onUnmounted(() => {
  clearHoleTimers()
  if (spawner !== null) window.clearInterval(spawner)
  if (clock !== null) window.clearInterval(clock)
  resizeOb?.disconnect()
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pmole">
    <div class="arc-gamecol">
      <div class="arc-molegrid" :style="{ '--mhole': holePx + 'px' }">
        <button
          v-for="(hole, i) in holes"
          :key="i"
          class="arc-molehole"
          :aria-label="'地鼠洞 ' + (i + 1)"
          @click="whack(i); arcadeSound.click()"
        >
          <span class="pit" />
          <span class="arc-molepop" :class="{ 'is-up': hole.up, 'is-hit': hole.hit, 'is-golden': hole.golden }">
            <img class="arc-moleimg" :src="MOLE_ART.mole" alt="">
          </span>
        </button>
      </div>
      <p class="arc-hint">地鼠冒头就点它 · 金地鼠 +30 · 切走会自动暂停</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button v-if="state !== 'run' && state !== 'paused'" class="arc-btn is-primary" @click="start(); arcadeSound.click()">
          <Play :size="14" /> 开始挑战
        </button>
        <button v-else class="arc-btn" @click="start(); arcadeSound.click()"><RefreshCw :size="14" /> 重新开始</button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">当前得分</div>
        <div class="arc-scoreval">{{ fmtInt(score) }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">剩余时间</div>
        <div class="arc-scoreval">{{ timeLeft }}s</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ fmtInt(Math.max(best, score)) }}</div>
      </div>
    </div>

    <div v-if="state === 'over'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-win"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">时间到！</div>
        <div class="arc-oversub">30 秒里敲中了 {{ Math.round(finalScore / 10) }} 只地鼠</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ fmtInt(finalScore) }}</b><span>得分</span></div>
          <div class="arc-gn"><b>30s</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="start(); arcadeSound.click()"><Play :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
