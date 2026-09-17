<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import '@/assets/styles/home-v3.css'
import '@/assets/styles/period-atmosphere.css'
import '@/assets/styles/diary-v8.css'
import { useHomeStageScale } from '@/composables/useHomeStageScale'
import type { HomeTheme } from '@/composables/useHomeTheme'
import { useDiaryRoomTheme } from '@/composables/useDiaryRoomTheme'
import { useInkMode } from '@/composables/useInkMode'
import { useBackgroundMode } from '@/composables/useBackgroundMode'
import WorkspaceRail from '@/components/workspace/WorkspaceRail.vue'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import PeriodAtmosphere from '@/components/shared/PeriodAtmosphere.vue'
import StationTweaks from '@/components/shared/StationTweaks.vue'
import BackgroundCarousel from '@/components/shared/BackgroundCarousel.vue'

const router = useRouter()
const route = useRoute()
const stageWrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
useHomeStageScale(stageWrapRef, stageRef)

const { theme, autoTheme, setTheme, setAutoTheme, syncFromClock, applyTheme } = useDiaryRoomTheme()
const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

const weekCN = ['日', '一', '二', '三', '四', '五', '六']
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
let clockTimer: ReturnType<typeof setInterval> | null = null

const pad = (n: number) => String(n).padStart(2, '0')

const tick = () => {
  const d = new Date()
  clockHtml.value = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())} <span class="sec">${pad(d.getSeconds())}</span>`
  clockDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekCN[d.getDay()]}`
  syncFromClock()
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (route.path === '/diary') return
  if (route.path.startsWith('/diary')) {
    router.push('/diary')
  }
}

onMounted(() => {
  tick()
  applyTheme(theme.value)
  clockTimer = setInterval(tick, 1000)
  document.documentElement.classList.add('diary-room-lock')
  document.body.classList.add('diary-room-lock', 'period-page-bg')
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.documentElement.classList.remove('diary-room-lock')
  document.body.classList.remove('diary-room-lock', 'period-page-bg')
  window.removeEventListener('keydown', onKeydown)
})

const noteLabel = computed(() => {
  const map: Record<HomeTheme, string> = {
    morning: '晨光手账',
    noon: '午间手账',
    dusk: '暮色手账',
    night: '星夜手账',
  }
  return `Diary · ${map[theme.value]}`
})
</script>

<template>
  <div class="diary-room-root home-v3-root">
    <WorkspaceRail />
    <div id="stageWrap" ref="stageWrapRef">
      <div id="stage" ref="stageRef">
        <PeriodAtmosphere />
        <div class="deco stage-deco-a" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div class="deco stage-deco-b" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="3" opacity=".55" />
          </svg>
        </div>
        <HomeTopbar brand-path="/diary" :clock-html="clockHtml" :clock-date="clockDate" />
        <div class="note-chip">{{ noteLabel }}</div>
        <div class="diary-page">
          <slot />
        </div>
      </div>
    </div>
    <StationTweaks
      :theme="theme"
      :auto-theme="autoTheme"
      :ink-mode="inkMode"
      :bg-mode="bgMode"
      @set-theme="setTheme"
      @set-auto-theme="setAutoTheme"
      @set-ink-mode="setInkMode"
      @set-bg-mode="setBgMode"
    />
    <BackgroundCarousel />
  </div>
</template>
