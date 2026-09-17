<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import '@/assets/styles/home-v3.css'
import '@/assets/styles/period-atmosphere.css'
import '@/assets/styles/blog-v6.css'
import { useHomeStageScale } from '@/composables/useHomeStageScale'
import { themeByHour, type HomeTheme } from '@/composables/useHomeTheme'
import { useInkMode } from '@/composables/useInkMode'
import { useBackgroundMode } from '@/composables/useBackgroundMode'
import WorkspaceRail from '@/components/workspace/WorkspaceRail.vue'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import PeriodAtmosphere from '@/components/shared/PeriodAtmosphere.vue'
import StationTweaks from '@/components/shared/StationTweaks.vue'
import BackgroundCarousel from '@/components/shared/BackgroundCarousel.vue'

const props = withDefaults(
  defineProps<{
    layoutMode?: 'card' | 'timeline'
  }>(),
  { layoutMode: 'card' },
)

const router = useRouter()
const route = useRoute()
const stageWrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
useHomeStageScale(stageWrapRef, stageRef)

const theme = ref<HomeTheme>(themeByHour(new Date().getHours()))
const autoTheme = ref(true)
const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

const weekCN = ['日', '一', '二', '三', '四', '五', '六']
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
let clockTimer: ReturnType<typeof setInterval> | null = null

const pad = (n: number) => String(n).padStart(2, '0')

const applyTheme = (name: HomeTheme) => {
  theme.value = name
  document.documentElement.dataset.theme = name
}

const setTheme = (name: HomeTheme) => {
  applyTheme(name)
}

const setAutoTheme = (on: boolean) => {
  autoTheme.value = on
  if (on) applyTheme(themeByHour(new Date().getHours()))
}

const tick = () => {
  const d = new Date()
  clockHtml.value = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())} <span class="sec">${pad(d.getSeconds())}</span>`
  clockDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekCN[d.getDay()]}`
  if (autoTheme.value) applyTheme(themeByHour(d.getHours()))
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (route.path === '/blog') return
  if (route.path.startsWith('/blog')) {
    router.push('/blog')
  }
}

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
  applyTheme(theme.value)
  document.documentElement.classList.add('blog-room-lock')
  document.body.classList.add('blog-room-lock', 'period-page-bg')
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.documentElement.classList.remove('blog-room-lock')
  document.body.classList.remove('blog-room-lock', 'period-page-bg')
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="blog-room-root home-v3-root">
    <WorkspaceRail />
    <div id="stageWrap" ref="stageWrapRef">
      <div id="stage" ref="stageRef" :data-layout="props.layoutMode">
        <PeriodAtmosphere />
        <HomeTopbar brand-path="/blog" :clock-html="clockHtml" :clock-date="clockDate" />
        <div class="blog-page">
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
