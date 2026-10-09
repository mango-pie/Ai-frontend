/**
 * 水墨模式（日间/夜间书写风格）的全局共享状态。
 * 模块级单例 + localStorage 持久化，页面加载时提前应用到 html 的 data-ink 避免闪白。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'

/** 墨色模式：day = 日间；night = 夜间 */
export type InkMode = 'day' | 'night'

const STORAGE_KEY = 'station-ink-mode'
const inkMode = ref<InkMode>('day')
// 当前挂载的组件引用计数（标记该状态仍被使用）
let wired = 0

/** 读取 localStorage 中的模式，非法值或存储不可用时回退 day */
function readStored(): InkMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'day' || v === 'night') return v
  } catch {
    /* ignore */
  }
  return 'day'
}

/** 把墨色模式写到 html 的 data-ink，供全局样式按模式取色 */
function applyInkToDom(mode: InkMode) {
  document.documentElement.dataset.ink = mode
}

// hydrate early to avoid flash
if (typeof document !== 'undefined') {
  inkMode.value = readStored()
  applyInkToDom(inkMode.value)
}

/**
 * 墨色模式 composable。
 * 返回共享的 `inkMode` 与 `setInkMode`（同步 DOM + localStorage），供站点外壳切换昼夜书写风格。
 */
export function useInkMode() {
  const setInkMode = (mode: InkMode) => {
    inkMode.value = mode
    applyInkToDom(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  onMounted(() => {
    // 挂载即计数并重放一次当前模式，确保 SPA 内切页后 DOM 标记仍在
    wired += 1
    applyInkToDom(inkMode.value)
  })

  onUnmounted(() => {
    wired = Math.max(0, wired - 1)
  })

  // 任一处 setInkMode 后，其它使用方依赖此 watch 同步 DOM
  watch(inkMode, (m) => applyInkToDom(m))

  return {
    inkMode,
    setInkMode,
  }
}
