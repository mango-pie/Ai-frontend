/**
 * 站点背景模式的全局共享状态：「按时段固定背景」还是「多图轮播」。
 * 状态提升到模块级单例，设置面板与背景组件在多处调用时保持同步，并写入 localStorage 持久化。
 */
import { ref } from 'vue'

/** 背景模式：period = 按时段切换的固定背景；carousel = 背景图轮播 */
export type StationBgMode = 'period' | 'carousel'

const STORAGE_KEY = 'station-bg-mode'

/** 读取 localStorage 中保存的模式；值非法或存储不可用时回退默认 period */
function readStored(): StationBgMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'period' || v === 'carousel') return v
  } catch {
    /* ignore */
  }
  return 'period'
}

/** 全局共享的模式状态（模块级单例，所有调用方拿到同一个 ref） */
const mode = ref<StationBgMode>(readStored())

/**
 * 获取/修改站点背景模式。
 * 返回共享的 `mode` 与写回 localStorage 的 `setMode`，供设置面板切换背景形态。
 */
export function useBackgroundMode() {
  const setMode = (next: StationBgMode) => {
    mode.value = next
    // 持久化失败（隐私模式等）不影响本次切换
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  return {
    mode,
    setMode,
  }
}
