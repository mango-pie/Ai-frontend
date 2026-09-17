<script setup lang="ts">
/**
 * 音乐房间的页面外壳（Shell）组件
 * - 负责舞台缩放、时段氛围、顶栏时钟、主题切换悬浮球与背景轮播的统一挂载
 * - 通过 <slot /> 承载音乐房间的实际页面内容，保证各子页共用同一套舞台布局
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import '@/assets/styles/home-v3.css'
import '@/assets/styles/period-atmosphere.css'
import '@/assets/styles/music-pulse-v1.css'
import { useHomeStageScale } from '@/composables/useHomeStageScale'
import { themeByHour, type HomeTheme } from '@/composables/useHomeTheme'
import { useInkMode } from '@/composables/useInkMode'
import { useBackgroundMode } from '@/composables/useBackgroundMode'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import PeriodAtmosphere from '@/components/shared/PeriodAtmosphere.vue'
import StationTweaks from '@/components/shared/StationTweaks.vue'
import BackgroundCarousel from '@/components/shared/BackgroundCarousel.vue'

// 路由实例：Esc 退回音乐房首页时需要读取/修改当前路由
const router = useRouter()
const route = useRoute()
// 舞台容器/舞台本体的 DOM 引用，交给 useHomeStageScale 做等比缩放适配
const stageWrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
useHomeStageScale(stageWrapRef, stageRef)

// 时段主题：默认跟随一天中的时刻自动切换，用户可在悬浮球中手动锁定
const theme = ref<HomeTheme>(themeByHour(new Date().getHours()))
const autoTheme = ref(true)
const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

// 顶栏时钟：HTML 里内嵌 span 以便给冒号/秒位做独立动画
const weekCN = ['日', '一', '二', '三', '四', '五', '六']
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
let clockTimer: ReturnType<typeof setInterval> | null = null

const pad = (n: number) => String(n).padStart(2, '0')

/** 应用主题：写入响应式变量并同步到 <html data-theme>，驱动全局 CSS 变量换肤 */
const applyTheme = (name: HomeTheme) => {
  theme.value = name
  document.documentElement.dataset.theme = name
}

const setTheme = (name: HomeTheme) => {
  applyTheme(name)
}

/** 开关自动主题：重新打开时立即按当前小时恢复对应主题 */
const setAutoTheme = (on: boolean) => {
  autoTheme.value = on
  if (on) applyTheme(themeByHour(new Date().getHours()))
}

/** 每秒心跳：刷新时钟文案，并在自动模式下顺带校正时段主题 */
const tick = () => {
  const d = new Date()
  clockHtml.value = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())} <span class="sec">${pad(d.getSeconds())}</span>`
  clockDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekCN[d.getDay()]}`
  if (autoTheme.value) applyTheme(themeByHour(d.getHours()))
}

/** Esc 键从音乐房间的子页（播放/歌单等）逐级退回 /music 首页 */
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (route.path === '/music') return
  if (route.path.startsWith('/music')) {
    router.push('/music')
  }
}

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
  applyTheme(theme.value)
  // 挂载音乐房专属的 body/html 类：锁定背景滚动并应用氛围底色
  document.documentElement.classList.add('music-room-lock')
  document.body.classList.add('music-room-lock', 'period-page-bg')
  window.addEventListener('keydown', onKeydown)
})

// 卸载时清理定时器、全局类名与键盘监听，避免污染其它房间页面
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.documentElement.classList.remove('music-room-lock')
  document.body.classList.remove('music-room-lock', 'period-page-bg')
  window.removeEventListener('keydown', onKeydown)
})

/** 当前主题对应的角标文案，例如「Music · 星夜 Pulse」 */
const noteLabel = computed(() => {
  const map: Record<HomeTheme, string> = {
    morning: '晨间 Pulse',
    noon: '正午 Pulse',
    dusk: '暮色 Pulse',
    night: '星夜 Pulse',
  }
  return `Music · ${map[theme.value]}`
})
</script>

<template>
  <div class="music-room-root home-v3-root" data-stage="star-river">
    <!-- 舞台结构：stageWrap 负责整体缩放，stage 内依次渲染氛围层/顶栏/角标/页面内容 -->
    <div id="stageWrap" ref="stageWrapRef">
      <div id="stage" ref="stageRef">
        <PeriodAtmosphere />
        <HomeTopbar brand-path="/music" :clock-html="clockHtml" :clock-date="clockDate" />
        <!-- 当前时段主题角标 -->
        <div class="note-chip">{{ noteLabel }}</div>
        <!-- 音乐房间实际页面通过插槽注入 -->
        <div class="music-page">
          <slot />
        </div>
      </div>
    </div>
    <!-- 主题/水墨/背景模式切换悬浮球，以及全站背景轮播层 -->
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
