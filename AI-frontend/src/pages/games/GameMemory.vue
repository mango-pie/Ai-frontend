<script setup lang="ts">
/**
 * 记忆翻牌机台：4×4·16 张 / 6×4·24 张两种规格（游戏舱偏好），翻出所有成对卡牌
 * - 卡面使用 lucide 图标（12 种），卡背为站点粉紫渐变 + 手柄
 * - 卡片按舞台可用空间自适应（ResizeObserver 写入 --mcard）
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Gamepad2, RotateCcw, Trophy } from 'lucide-vue-next'
import { MEMORY_FACES } from './assets'
import { arcadeSound, fmtDur, useArcadeRecords, useArcadeSettings } from './arcade'

interface MemCard {
  id: number
  face: number
  flipped: boolean
  matched: boolean
}

defineProps<{ active: boolean }>()

const FACES = MEMORY_FACES

const { settings, update } = useArcadeSettings()
const cols = computed(() => settings.value.memCols)
const pairs = computed(() => (cols.value === 4 ? 8 : 12))

const cards = ref<MemCard[]>([])
const moves = ref(0)
const matched = ref(0)
const over = ref(false)
const finalDur = ref(0)
const isRecord = ref(false)
const mcardPx = ref(74)
const paneEl = ref<HTMLElement | null>(null)

let first: MemCard | null = null
let lock = false
let uid = 1
let startTs = 0
let resizeOb: ResizeObserver | null = null

const { addRecord, bestOf } = useArcadeRecords()

function fit() {
  const pane = paneEl.value
  if (!pane || !pane.clientWidth) return
  const col = getComputedStyle(pane).flexDirection === 'column'
  const sideW = col ? 0 : 176 + 24
  const availW = Math.max(240, pane.clientWidth - 48 - sideW)
  const availH = Math.max(260, pane.clientHeight - 56)
  mcardPx.value = Math.max(
    56,
    Math.min(132, Math.floor((availH - 46) / 4) - 11, Math.floor(availW / cols.value) - 11),
  )
}

function build() {
  const deck: number[] = []
  for (let i = 0; i < pairs.value; i++) deck.push(i, i)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  cards.value = deck.map((face) => ({ id: uid++, face, flipped: false, matched: false }))
  first = null
  lock = false
  moves.value = 0
  matched.value = 0
  over.value = false
  isRecord.value = false
  startTs = 0
  fit()
}

function flip(card: MemCard) {
  if (lock || card.flipped || card.matched || over.value) return
  if (!startTs) startTs = Date.now()
  card.flipped = true
  arcadeSound.flip()
  if (!first) {
    first = card
    return
  }
  const a = first
  const b = card
  first = null
  moves.value++
  if (a.face === b.face) {
    a.matched = true
    b.matched = true
    matched.value++
    arcadeSound.match()
    if (matched.value === pairs.value) finish()
  } else {
    lock = true
    window.setTimeout(() => {
      a.flipped = false
      b.flipped = false
      lock = false
    }, 720)
  }
}

function finish() {
  over.value = true
  finalDur.value = (Date.now() - startTs) / 1000
  const prev = bestOf('mem')?.raw ?? null
  isRecord.value = prev === null || moves.value < prev
  addRecord({ g: 'mem', moves: moves.value, dur: Math.round(finalDur.value), win: true, cols: cols.value })
  arcadeSound.win()
}

watch(
  () => settings.value.memCols,
  () => {
    build()
    arcadeSound.click()
  },
)

onMounted(() => {
  build()
  resizeOb = new ResizeObserver(() => fit())
  if (paneEl.value) resizeOb.observe(paneEl.value)
})
onUnmounted(() => {
  resizeOb?.disconnect()
})
</script>

<template>
  <div ref="paneEl" class="arc-pane arc-pmem">
    <div class="arc-gamecol">
      <div class="arc-mgrid" :style="{ gridTemplateColumns: `repeat(${cols}, var(--mcard))`, '--mcard': mcardPx + 'px' }">
        <button
          v-for="card in cards"
          :key="card.id"
          class="arc-mcard"
          :class="{ 'is-flipped': card.flipped, 'is-matched': card.matched }"
          :aria-label="'卡牌 ' + (card.id + 1)"
          @click="flip(card)"
        >
          <span class="arc-minner">
            <span class="arc-mface is-back"><Gamepad2 :size="26" /></span>
            <span class="arc-mface is-front">
              <img class="arc-mfaceimg" :src="FACES[card.face] ?? FACES[0]" alt="">
            </span>
          </span>
        </button>
      </div>
      <p class="arc-hint">连续翻到两张相同卡牌即配对成功</p>
    </div>

    <div class="arc-side">
      <div class="arc-toolbar">
        <button class="arc-btn" @click="build(); arcadeSound.click()"><RotateCcw :size="14" /> 洗牌重来</button>
      </div>
      <div class="arc-seg is-kids">
        <span :class="{ 'is-active': cols === 4 }" tabindex="0" @click="update({ memCols: 4 })">4×4 · 16 张</span>
        <span :class="{ 'is-active': cols === 6 }" tabindex="0" @click="update({ memCols: 6 })">6×4 · 24 张</span>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">已翻步数</div>
        <div class="arc-scoreval">{{ moves }}</div>
      </div>
      <div class="arc-scorecard">
        <div class="arc-scorelab">已配对</div>
        <div class="arc-scoreval">{{ matched }}/{{ pairs }}</div>
      </div>
      <div class="arc-scorecard is-room">
        <div class="arc-scorelab">舱内纪录</div>
        <div class="arc-scoreval">{{ bestOf('mem') ? bestOf('mem')!.raw + ' 步' : '—' }}</div>
      </div>
    </div>

    <div v-if="over" class="arc-over">
      <div class="arc-overcard">
        <div class="arc-overico is-win"><Trophy :size="26" :stroke-width="1.8" /></div>
        <div class="arc-overtitle">全部配对！</div>
        <div class="arc-oversub">卡牌都找到了自己的搭档</div>
        <div v-if="isRecord" class="arc-record"><Trophy :size="12" /> 舱内新纪录！</div>
        <div class="arc-overnums">
          <div class="arc-gn"><b>{{ moves }}</b><span>步数</span></div>
          <div class="arc-gn"><b>{{ fmtDur(finalDur) }}</b><span>用时</span></div>
        </div>
        <div class="arc-overfoot">
          <button class="arc-btn is-primary" @click="build(); arcadeSound.click()"><RotateCcw :size="14" /> 再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>
