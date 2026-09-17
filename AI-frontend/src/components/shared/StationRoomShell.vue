<script setup lang="ts">
/**
 * 车站房间系通用页面外壳（工作日志/实验室/对话/管理台等房间的统一骨架）
 * - 组合左侧 WorkspaceRail、舞台等比缩放、时段氛围、顶栏时钟与背景轮播
 * - room 属性决定房间主题色等样式差异，fill 属性决定内容滚动方式
 * - 被 keep-alive 缓存复用，故需在 onActivated/onDeactivated 中同步/清理全局锁类
 */
import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import '@/assets/styles/home-v3.css'
import '@/assets/styles/period-atmosphere.css'
import '@/assets/styles/station-room.css'
import { useHomeStageScale } from '@/composables/useHomeStageScale'
import { themeByHour, type HomeTheme } from '@/composables/useHomeTheme'
import { useInkMode } from '@/composables/useInkMode'
import { useBackgroundMode } from '@/composables/useBackgroundMode'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import WorkspaceRail from '@/components/workspace/WorkspaceRail.vue'
import PeriodAtmosphere from '@/components/shared/PeriodAtmosphere.vue'
import StationTweaks from '@/components/shared/StationTweaks.vue'
import BackgroundCarousel from '@/components/shared/BackgroundCarousel.vue'

const props = withDefaults(
  defineProps<{
    brandPath: string
    noteLabel?: string
    room:
      | 'worklog'
      | 'lab'
      | 'chat'
      | 'auth'
      | 'settings'
      | 'about'
      | 'library'
      | 'admin'
      | 'study'
      | 'profile'
    /** Escape 回到的路径；默认 brandPath */
    escapeTo?: string
    /** scroll：内容在舞台内滚动；frame：铺满舞台、内部自己滚（对话） */
    fill?: 'scroll' | 'frame'
  }>(),
  { fill: 'scroll' },
)

// 路由与舞台 DOM 引用：交给 useHomeStageScale 做等比缩放
const router = useRouter()
const route = useRoute()
const stageWrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
useHomeStageScale(stageWrapRef, stageRef)

// 时段主题（默认按小时自动切换）与水墨/背景模式
const theme = ref<HomeTheme>(themeByHour(new Date().getHours()))
const autoTheme = ref(true)
const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

// 顶栏时钟状态：HTML 内嵌 span 以便对冒号/秒位单独做动画
const weekCN = ['日', '一', '二', '三', '四', '五', '六']
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
let clockTimer: ReturnType<typeof setInterval> | null = null

const pad = (n: number) => String(n).padStart(2, '0')

/** 应用主题：写入响应式变量并同步 <html data-theme>，驱动全局换肤 */
const applyTheme = (name: HomeTheme) => {
  theme.value = name
  document.documentElement.dataset.theme = name
}

const setTheme = (name: HomeTheme) => {
  applyTheme(name)
}

/** 开关自动主题：重新开启时立即按当前小时恢复主题 */
const setAutoTheme = (on: boolean) => {
  autoTheme.value = on
  if (on) applyTheme(themeByHour(new Date().getHours()))
}

/** 每秒心跳：刷新时钟文案，并在自动模式下校正时段主题 */
const tick = () => {
  const d = new Date()
  clockHtml.value = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())} <span class="sec">${pad(d.getSeconds())}</span>`
  clockDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekCN[d.getDay()]}`
  if (autoTheme.value) applyTheme(themeByHour(d.getHours()))
}

/** Esc 返回的目标路径：优先用 escapeTo，否则退回品牌入口路径 */
const homePath = () => props.escapeTo || props.brandPath

/** Esc 快捷返回：从当前房间（含 /app、/user 子路径）退回房间首页 */
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  const target = homePath()
  if (route.path === target) return
  if (route.path.startsWith(target) || route.path.startsWith('/app/') || route.path.startsWith('/user/')) {
    router.push(target)
  }
}

/** 挂载房间级全局类：锁定背景滚动并应用氛围底色 */
const applyLock = () => {
  document.documentElement.classList.add('station-room-lock')
  document.body.classList.add('station-room-lock', 'period-page-bg')
}

const clearLock = () => {
  document.documentElement.classList.remove('station-room-lock')
  document.body.classList.remove('station-room-lock', 'period-page-bg')
}

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
  applyTheme(theme.value)
  applyLock()
  window.addEventListener('keydown', onKeydown)
})

// keep-alive 复用：重新激活时恢复主题与全局锁类（切走时可能被其它房间改掉）
onActivated(() => {
  applyTheme(theme.value)
  applyLock()
})

// 被缓存挂起时释放全局锁类，把页面还给下一个房间
onDeactivated(() => {
  clearLock()
})

// 真正销毁时清理定时器、全局类名与键盘监听
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  clearLock()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- data-room/data-fill 供 CSS 按房间与滚动模式应用差异化样式 -->
  <div class="station-room-root home-v3-root" :data-room="props.room" :data-fill="props.fill">
    <WorkspaceRail />
    <!-- 舞台结构：stageWrap 负责整体缩放，stage 内依次渲染氛围层/顶栏/角标/页面内容 -->
    <div id="stageWrap" ref="stageWrapRef">
      <div id="stage" ref="stageRef">
        <PeriodAtmosphere />
        <HomeTopbar :brand-path="props.brandPath" :clock-html="clockHtml" :clock-date="clockDate" />
        <!-- 可选的房间角标文案 -->
        <div v-if="props.noteLabel" class="note-chip">{{ props.noteLabel }}</div>
        <!-- 房间实际页面内容插槽 -->
        <div class="station-page">
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
