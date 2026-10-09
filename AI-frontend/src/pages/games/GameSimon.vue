<script setup lang="ts">
/**
 * 记忆节拍机台（Simon 式音序记忆）：跟着音阶复述，多过一关多一个音
 * - 四个音各配 WebAudio 合成音色；复述错一个音即结束，纪取最多连过关数
 * - 键盘 1–4 也可按拍
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Play, RotateCcw, Trophy } from 'lucide-vue-next'
import { arcadeSound, fmtDur, useArcadeRecords } from './arcade'

const PADS = [
  { freq: 261.63, color: '#f490ad' },
  { freq: 329.63, color: '#9b8ce8' },
  { freq: 392.0, color: '#5fc4a5' },
  { freq: 523.25, color: '#ffcf6e' },
]

defineOptions({ name: 'GameMemoryBeat' })

const props = defineProps<{ active: boolean }>()

const seq = ref<number[]>([])
const state = ref<'idle' | 'play' | 'input' | 'over'>('idle')
const activePad = ref(-1)
const inputIdx = ref(0)
const finalDur = ref(0)
const isRecord = ref(false)
const padPx = ref(140)
const paneEl = ref<HTMLElement | null>(null)

let startTs = 0
const timeouts = new Set<number>()
let roomActive = false
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

const best = computed(() => bestOf('simon')?.raw ?? 0)
/** 已连过的关数（复述完一轮 +1） */
const score = computed(() => Math.max(0, seq.value.length - 1))
const gap = computed(() => Math.max(420, 700 - seq.value.length * 25))

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(260, pane.clientHeight - 56)
  padPx.value = Math.max(96, Math.min(150, Math.floor((availH - 70) / 2) - 14, Math.floor(availW / 2) - 14))
}

function later(fn: () => void, ms: number) {
  const t = window.setTimeout(() => {
    timeouts.delete(t)
    fn()
  }, ms)
  timeouts.add(t)
}

function clearAllTimers() {
  timeouts.forEach((t) => window.clearTimeout(t))
  timeouts.clear()
  activePad.value = -1
}

function start() {
  clearAllTimers()
  seq.value = []
  state.value = 'play'
  inputIdx.value = 0
  isRecord.value = false
  startTs = Date.now()
  addStep()
}

function addStep() {
  seq.value.push(Math.floor(Math.random() * 4))
  playback()
}

function playback() {
  state.value = 'play'
  inputIdx.value = 0
  seq.value.forEach((pad, i) => {
    later(() => {
      activePad.value = pad
      arcadeSound.note(PADS[pad]!.freq)
    }, i * gap.value + 250)
    later(() => {
      if (activePad.value === pad) activePad.value = -1
    }, i * gap.value + 250 + gap.value * 0.6)
  })
  later(() => {
    state.value = 'input'
  }, seq.value.length * gap.value + 300)
}

function press(pad: number) {
  if (state.value !== 'input') return
  activePad.value = pad
  arcadeSound.note(PADS[pad]!.freq)
  later(() => {
    if (activePad.value === pad) activePad.value = -1
  }, 180)
  if (pad !== seq.value[inputIdx.value]!) {
    fail()
    return
  }
  inputIdx.value++
  if (inputIdx.value === seq.value.length) {
    state.value = 'play'
    arcadeSound.match()
    later(addStep, 650)
  }
}

function fail() {
  state.value = 'over'
  finalDur.value = startTs ? (Date.now() - startTs) / 1000 : 0
  const prev = best.value
  isRecord.value = score.value > 0 && score.value >= prev
  addRecord({ g: 'simon', score: score.value, dur: Math.round(finalDur.value) })
  arcadeSound.lose()
}

function onKey(e: KeyboardEvent) {
  if (!props.active || !roomActive) return
  const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 }
  const pad = map[e.key]
  if (pad !== undefined) press(pad)
}

// 房间切走时终止本轮回放，回到待开始状态
watch(
  () => props.active,
  (active) => {
    if (!active && state.value === 'play') {
      clearAllTimers()
      state.value = 'idle'
      seq.value = []
    }
  },
)

onMounted(() => {
  fit()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
  window.addEventListener('keydown', onKey)
  roomActive = true
})
onUnmounted(() => {
  clearAllTimers()
  resizeOb?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-psimon">
    <div class="arc-gamecol">
      <div class="arc-simongrid" :style="{ '--spad': padPx + 'px' }">
        <button
          v-for="(pad, i) in PADS"
          :key="i"
          class="arc-simonpad"
          :class="{ 'is-active': activePad === i, 'is-idle': state === 'idle' }"
          :style="{ '--padcolor': pad.color }"
          :aria-label="'音拍 ' + (i + 1)"
          @click="press(i)"
        >
          <span class="keyhint">{{ i + 1 }}</span>
        </button>
      </div>
      <p class="arc-hint">
        {{ state === 'play' ? '看仔细，记住闪灯的顺序…' : state === 'input' ? '该你复述了 · 键盘 1–4 也行' : '点击开始，或按键盘 1–4 试音' }}
      </p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn is-primary" @click="start(); arcadeSound.click()"><Play :size="14" /> {{ state === 'idle' || state === 'over' ? '开始挑战' : '重新开始' }}</button>
        <button class="arc-btn" v-if="state !== 'idle' && state !== 'over'" @click="start(); arcadeSound.click()"><RotateCcw :size="14" /> 重开</button>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">当前关卡</div>
        <div class="arc-scoreval">{{ seq.length }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">连过关数</div>
        <div class="arc-scoreval">{{ score }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ Math.max(best, score) }} 关</div>
      </div>
    </div>

    <div v-if="state === 'over'" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-lose"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">节拍断了</div>
        <div class="arc-oversub">连过了 {{ score }} 关 · 蛮不错的耳朵</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ score }}</b><span>连过关数</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="start(); arcadeSound.click()"><Play :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
