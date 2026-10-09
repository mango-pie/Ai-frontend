<script setup lang="ts">
/**
 * 手账房间外壳（Shell）
 * 包裹手账房间下的路由视图（/diary 主页与日记编辑等子页），提供房间级框架：
 * WorkspaceRail 侧栏、顶栏时钟、时段氛围与舞台装饰、随时钟联动的手账主题，
 * 以及水墨/背景模式调校（StationTweaks）与背景轮播；页面内容经默认插槽注入。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
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
// 舞台容器与舞台本体节点，交给 useHomeStageScale 做整体等比缩放，小视口下保证房间版式完整
const stageWrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
useHomeStageScale(stageWrapRef, stageRef)

// 手账房间主题：主题读写、自动开关与随时钟同步均收敛在该 composable 中
const { theme, autoTheme, setTheme, setAutoTheme, syncFromClock, applyTheme } = useDiaryRoomTheme()
const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

// 顶栏时钟状态：时:分:秒 的 HTML（冒号/秒数单独成 span 便于做动画）、中文日期行与秒级定时器句柄
const weekCN = ['日', '一', '二', '三', '四', '五', '六']
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
let clockTimer: ReturnType<typeof setInterval> | null = null

const pad = (n: number) => String(n).padStart(2, '0')

// 每秒刷新时钟，并让房间主题随时间同步（syncFromClock 内部处理自动模式）
const tick = () => {
  const d = new Date()
  clockHtml.value = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())} <span class="sec">${pad(d.getSeconds())}</span>`
  clockDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekCN[d.getDay()]}`
  syncFromClock()
}

// Escape 快捷键：处于手账子页时一键返回 /diary 主页
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (route.path === '/diary') return
  if (route.path.startsWith('/diary')) {
    router.push('/diary')
  }
}

// 挂载：启动秒级时钟并应用当前主题，加锁样式限制本房间页面滚动、启用时段背景
onMounted(() => {
  tick()
  applyTheme(theme.value)
  clockTimer = setInterval(tick, 1000)
  document.documentElement.classList.add('diary-room-lock')
  document.body.classList.add('diary-room-lock', 'period-page-bg')
  window.addEventListener('keydown', onKeydown)
})

// 卸载：清理定时器、全局锁样式与键盘监听，避免污染其它房间
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.documentElement.classList.remove('diary-room-lock')
  document.body.classList.remove('diary-room-lock', 'period-page-bg')
  window.removeEventListener('keydown', onKeydown)
})

// 顶栏便签文案：随当前时段主题变化（晨光/午间/暮色/星夜手账）
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
        <!-- 舞台角落装饰（星形/圆环 SVG），纯氛围 -->
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
        <!-- 手账页面内容（主页/编辑等路由视图），由父级经插槽注入 -->
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
