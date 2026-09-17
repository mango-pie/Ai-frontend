/**
 * 首页全屏分页器：滚轮 / 键盘 / 编程式翻页，配合纵向轨道 translateY 整页切换。
 * 仅供首页视图使用；页高固定 1080（设计稿尺寸）。
 */
import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'

/** 默认页数（可按模块开关传响应式数量动态增减） */
export const HOME_PAGE_COUNT = 4
/** 单页高度（px），即轨道每次 translateY 的距离 */
export const HOME_PAGE_H = 1080

/**
 * Discrete full-page pager: wheel / keyboard / programmatic.
 * pageCount 支持响应式（如按模块开关增减 tour 页）。
 */
export function useHomePager(pageCount: number | Ref<number> = HOME_PAGE_COUNT) {
  const pageCountRef = computed(() => (typeof pageCount === 'number' ? pageCount : pageCount.value))
  const pageIndex = ref(0)
  const animating = ref(false)
  // 一次滚动手势（含触控板惯性）只翻一页：冷却 820ms，略长于 700ms 翻页动画
  let wheelLock = false
  let wheelTimer: ReturnType<typeof setTimeout> | null = null

  const pageLabel = computed(() => `${String(pageIndex.value + 1).padStart(2, '0')} / ${String(pageCountRef.value).padStart(2, '0')}`)
  const trackStyle = computed(() => ({
    transform: `translate3d(0, ${-pageIndex.value * HOME_PAGE_H}px, 0)`,
  }))

  /** 跳到指定页（越界自动收敛）；700ms 与 CSS 过渡时长对齐后复位 animating */
  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(pageCountRef.value - 1, index))
    if (next === pageIndex.value) return
    pageIndex.value = next
    animating.value = true
    window.setTimeout(() => {
      animating.value = false
    }, 700)
  }

  const goNext = () => goTo(pageIndex.value + 1)
  const goPrev = () => goTo(pageIndex.value - 1)

  // 滚轮翻页：输入框内滚动不拦截；12px 阈值过滤触控板微小抖动
  const onWheel = (e: WheelEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    if (wheelLock || animating.value) return
    const dy = e.deltaY
    if (Math.abs(dy) < 12) return
    wheelLock = true
    if (dy > 0) goNext()
    else goPrev()
    if (wheelTimer) clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => {
      wheelLock = false
    }, 820)
  }

  // 键盘翻页：方向键 / PageUp·Down / 空格 / Home·End；焦点在输入框时不接管
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault()
      goNext()
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault()
      goPrev()
    } else if (e.key === 'Home') {
      e.preventDefault()
      goTo(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      goTo(pageCountRef.value - 1)
    }
  }

  /** 挂载时绑定滚轮（需 preventDefault，故 non-passive）与全局键盘，卸载时统一解绑并清理定时器 */
  const bind = (el: Ref<HTMLElement | null>) => {
    onMounted(() => {
      const node = el.value
      node?.addEventListener('wheel', onWheel, { passive: false })
      window.addEventListener('keydown', onKey)
    })
    onUnmounted(() => {
      const node = el.value
      node?.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      if (wheelTimer) clearTimeout(wheelTimer)
    })
  }

  return {
    pageIndex,
    pageLabel,
    trackStyle,
    animating,
    goTo,
    goNext,
    goPrev,
    bind,
  }
}
