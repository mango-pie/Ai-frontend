<script setup lang="ts">
/**
 * 知识库房间外壳（Shell）
 * 包裹知识库房间下的路由视图：/knowledge 笔记列表、/knowledge/:kbId 笔记详情，
 * 以及详情下的 /chat 知识问答与上传弹层等子页。
 * 提供房间级框架（WorkspaceRail 侧栏、顶栏时钟、时段氛围层）、按小时自动切换的时段主题、
 * 水墨/背景模式调校（StationTweaks）与背景轮播；页面内容经默认插槽注入。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import '@/assets/styles/knowledge-v17.css'
import '@/assets/styles/station-bridge.css'
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
    noteLabel?: string
  }>(),
  { noteLabel: 'Knowledge · 馆藏书架' },
)

const router = useRouter()
const route = useRoute()
// 舞台容器与舞台本体节点，交给 useHomeStageScale 做整体等比缩放，小视口下保证房间版式完整
const stageWrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
useHomeStageScale(stageWrapRef, stageRef)

// 时段主题（晨/午/暮/夜）与“自动跟随时间切换”开关，供调校面板读写
const theme = ref<HomeTheme>(themeByHour(new Date().getHours()))
const autoTheme = ref(true)
const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

// 顶栏时钟状态：时:分:秒 的 HTML（冒号/秒数单独成 span 便于做动画）、中文日期行与秒级定时器句柄
const weekCN = ['日', '一', '二', '三', '四', '五', '六']
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
let clockTimer: ReturnType<typeof setInterval> | null = null

const pad = (n: number) => String(n).padStart(2, '0')

// 应用主题：写入 <html data-theme>，驱动整套房间 CSS 变量与氛围层切换
const applyTheme = (name: HomeTheme) => {
  theme.value = name
  document.documentElement.dataset.theme = name
}

const setTheme = (name: HomeTheme) => {
  applyTheme(name)
}

// 打开自动主题时立即校正到当前时段，关闭则维持用户手动选择
const setAutoTheme = (on: boolean) => {
  autoTheme.value = on
  if (on) applyTheme(themeByHour(new Date().getHours()))
}

// 每秒刷新时钟；自动主题模式下顺带按时段校正主题
const tick = () => {
  const d = new Date()
  clockHtml.value = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())} <span class="sec">${pad(d.getSeconds())}</span>`
  clockDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekCN[d.getDay()]}`
  if (autoTheme.value) applyTheme(themeByHour(d.getHours()))
}

// 当前所处子页形态（chat 问答 / list 列表 / detail 详情），供 CSS 按页面微调版式
const stagePage = computed(() => {
  if (route.path.endsWith('/chat')) return 'chat'
  if (route.path === '/knowledge') return 'list'
  return 'detail'
})

// Escape 逐级返回：问答页或上传弹层先回笔记详情，详情再回列表
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (route.path === '/knowledge') return
  if (route.path.startsWith('/knowledge')) {
    if (route.path.endsWith('/chat') || route.query.upload) {
      const id = route.params.kbId
      if (id) {
        router.push(`/knowledge/${id}`)
        return
      }
    }
    router.push('/knowledge')
  }
}

// 挂载：启动秒级时钟，并加锁样式限制本房间页面滚动、启用时段背景
onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
  applyTheme(theme.value)
  document.documentElement.classList.add('knowledge-room-lock')
  document.body.classList.add('knowledge-room-lock', 'period-page-bg')
  window.addEventListener('keydown', onKeydown)
})

// 卸载：清理定时器、全局锁样式与键盘监听，避免污染其它房间
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.documentElement.classList.remove('knowledge-room-lock')
  document.body.classList.remove('knowledge-room-lock', 'period-page-bg')
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="knowledge-room-root home-v3-root">
    <WorkspaceRail />
    <!-- 舞台层：#stage 由 useHomeStageScale 等比缩放，data-page 标识当前子页形态 -->
    <div id="stageWrap" ref="stageWrapRef">
      <div id="stage" ref="stageRef" :data-page="stagePage">
        <PeriodAtmosphere />
        <HomeTopbar brand-path="/knowledge" :clock-html="clockHtml" :clock-date="clockDate" />
        <div class="note-chip">{{ props.noteLabel }}</div>
        <!-- 知识库页面内容（列表/详情/问答等路由视图），由父级经插槽注入 -->
        <div class="knowledge-page">
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
