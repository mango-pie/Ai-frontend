/**
 * 日记小屋的主题色系：复用首页的时段主题（morning/noon/dusk/night），
 * 并映射到日记手账的时段贴纸文案。状态放在模块级，多个组件共享同一主题。
 */
import { computed, ref } from 'vue'
import { themeByHour, type HomeTheme } from '@/composables/useHomeTheme'
import { DIARY_PERIOD } from '@/utils/diaryCraft'

// 模块级共享：当前主题 + 是否跟随时钟自动切换
const theme = ref<HomeTheme>(themeByHour(new Date().getHours()))
const autoTheme = ref(true)

/**
 * 日记小屋主题 composable。
 * 返回主题状态、自动开关、对应手账时段文案，以及手动/自动/整点校时三种设置入口。
 */
export function useDiaryRoomTheme() {
  /** 由主题映射到手账时段（贴纸/文案），缺省回退 morning */
  const period = computed(() => DIARY_PERIOD[theme.value] ?? DIARY_PERIOD.morning)

  /** 应用主题：更新共享状态并写入 html 的 data-theme 供 CSS 变量消费 */
  const applyTheme = (name: HomeTheme) => {
    theme.value = name
    document.documentElement.dataset.theme = name
  }

  const setTheme = (name: HomeTheme) => {
    applyTheme(name)
  }

  /** 打开自动主题时立刻按当前时间校准一次 */
  const setAutoTheme = (on: boolean) => {
    autoTheme.value = on
    if (on) applyTheme(themeByHour(new Date().getHours()))
  }

  /** 供外部时钟整点触发：仅自动模式下按当前小时同步主题 */
  const syncFromClock = () => {
    if (autoTheme.value) applyTheme(themeByHour(new Date().getHours()))
  }

  return {
    theme,
    autoTheme,
    period,
    setTheme,
    setAutoTheme,
    syncFromClock,
    applyTheme,
  }
}
