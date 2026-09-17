<script setup lang="ts">
/**
 * 精读工作台（阅读房）的页面外壳
 * - 组合左侧工作台导航栏、时段氛围、顶栏时钟、二级导航与内容插槽
 * - 提供数字键 1–5 快速换页、Esc 逐级返回等键盘交互，以及工艺化 toast 提示
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import '@/assets/styles/home-v3.css'
import '@/assets/styles/period-atmosphere.css'
import '@/assets/styles/reading-room-v1.css'
import '@/assets/styles/station-bridge.css'
import { themeByHour, type HomeTheme } from '@/composables/useHomeTheme'
import { useInkMode } from '@/composables/useInkMode'
import { useBackgroundMode } from '@/composables/useBackgroundMode'
import { useReadingRoomCraft } from '@/composables/useReadingRoomCraft'
import WorkspaceRail from '@/components/workspace/WorkspaceRail.vue'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import PeriodAtmosphere from '@/components/shared/PeriodAtmosphere.vue'
import StationTweaks from '@/components/shared/StationTweaks.vue'
import BackgroundCarousel from '@/components/shared/BackgroundCarousel.vue'
import ReadingRoomNav from '@/components/reading/ReadingRoomNav.vue'

// 路由与根节点引用：rootRef 交给 useReadingRoomCraft 做入场工艺动画
const router = useRouter()
const route = useRoute()
const rootRef = ref<HTMLElement | null>(null)

// 时段主题（默认按小时自动切换）与水墨/背景模式的全局设置
const theme = ref<HomeTheme>(themeByHour(new Date().getHours()))
const autoTheme = ref(true)
const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

// 顶栏时钟状态：HTML 内嵌 span 以便对冒号/秒位单独做动画
const weekCN = ['日', '一', '二', '三', '四', '五', '六']
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
let clockTimer: ReturnType<typeof setInterval> | null = null

// 轻提示 toast：由工艺动画回调触发，1.6s 后自动消失
const toastMsg = ref('')
const toastShow = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

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

/** 根据路由推断当前子页标识，供提示语切换与「审阅」态判断 */
const activeKey = computed(() => {
  const p = route.path
  if (p.includes('/learning')) return 'learning'
  if (/\/notes\/\d+/.test(p)) return 'detail'
  if (p.includes('/notes')) return 'notes'
  if (p.includes('/jobs')) return 'jobs'
  return 'ingest'
})

/** 当前子页的操作提示语，展示在二级导航右侧 */
const noteLabel = computed(() => {
  const map: Record<string, string> = {
    ingest: '搜索 → 勾选 → 生成一篇 Markdown',
    jobs: '合蒸任务可离页跟踪',
    notes: '筛选 · 打开 · 再蒸馏',
    detail: '左编辑 / 右预览 · Ctrl+S 保存',
    learning: '门闩 → 搜文 → 挂叶',
  }
  return map[activeKey.value] ?? '精读工作台'
})

// 数字键快捷换页映射（4 号键在 onKeydown 里单独处理跳转逻辑）
const PAGE_BY_KEY: Record<string, string> = {
  '1': '/admin/knowledge/ingest',
  '2': '/admin/knowledge/notes',
  '3': '/admin/knowledge/notes',
  '5': '/admin/knowledge/learning',
}

/** 展示 toast：覆盖上一次提示并重置计时，避免多条提示互相打断 */
const showToast = (msg: string) => {
  toastMsg.value = msg
  toastShow.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastShow.value = false
  }, 1600)
}

// 挂载阅读房的工艺动画（入场/交互细节），完成时通过 toast 反馈
useReadingRoomCraft(rootRef, showToast)

/**
 * 全局键盘快捷键：
 * - Esc：从精读房的任意子页逐级退回采集页
 * - 数字 4：未在文章详情时跳转到文章列表（与 PAGE_BY_KEY 中缺席的 4 呼应）
 * - 其余数字键按映射表换页
 * 输入框/文本域/可编辑元素聚焦时全部让路，避免劫持正常输入
 */
const onKeydown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if ((e.target as HTMLElement | null)?.isContentEditable) return

  if (e.key === 'Escape') {
    if (route.path === '/admin/knowledge/ingest') return
    if (route.path.startsWith('/admin/knowledge')) {
      router.push('/admin/knowledge/ingest')
    }
    return
  }

  if (e.key === '4') {
    if (!/\/notes\/\d+/.test(route.path)) {
      router.push('/admin/knowledge/notes')
    }
    return
  }

  const path = PAGE_BY_KEY[e.key]
  if (path && route.path !== path) router.push(path)
}

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
  applyTheme(theme.value)
  // 挂载阅读房专属的 body/html 类：锁定页面滚动与氛围底色
  document.body.classList.add('period-page-bg', 'reading-workbench-lock')
  document.documentElement.classList.add('reading-workbench-lock')
  window.addEventListener('keydown', onKeydown)
})

// 卸载时清理定时器、全局类名与键盘监听，避免污染其它房间页面
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (toastTimer) clearTimeout(toastTimer)
  document.body.classList.remove('period-page-bg', 'reading-workbench-lock')
  document.documentElement.classList.remove('reading-workbench-lock')
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootRef" class="reading-room-root home-v3-root reading-room-elastic reading-workbench">
    <!-- 左侧工作台导航栏 + 时段氛围层 -->
    <WorkspaceRail />
    <PeriodAtmosphere />
    <!-- 顶栏：品牌与实时时钟 -->
    <header class="elastic-topbar">
      <HomeTopbar
        brand-path="/admin/knowledge/ingest"
        :clock-html="clockHtml"
        :clock-date="clockDate"
      />
    </header>
    <!-- 二级导航（采集/文章/学习/审阅）与当前页操作提示 -->
    <div class="reading-chrome">
      <ReadingRoomNav />
      <span class="reading-hint">{{ noteLabel }} · 1–5 换页 · Esc 回采集</span>
    </div>
    <!-- 精读房实际页面内容插槽 -->
    <div class="reading-page reading-page-elastic">
      <slot />
    </div>
    <!-- 工艺动画反馈 toast（aria-live 保证读屏可感知） -->
    <div class="toast" :class="{ show: toastShow }" role="status" aria-live="polite">{{ toastMsg }}</div>
    <!-- 主题/水墨/背景切换悬浮球，以及全站背景轮播层 -->
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
