/**
 * 博客列表排版模式（卡片 / 时间轴）的本地偏好。
 * 每个调用方各自持有状态并写入 localStorage，供博客页顶部的排版切换按钮使用。
 */
import { ref } from 'vue'

/** 列表排版：card = 卡片网格；timeline = 时间轴 */
export type BlogLayoutMode = 'card' | 'timeline'

const STORAGE_KEY = 'blog-layout-mode'

/** 读取 localStorage 保存的排版；环境无 localStorage 或值非法时回退卡片模式 */
function readStoredMode(): BlogLayoutMode {
  if (typeof localStorage === 'undefined') return 'card'
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'timeline' ? 'timeline' : 'card'
}

/**
 * 博客排版模式 composable。
 * 返回 `layoutMode` 状态、显式设置与一键切换（卡片/时间轴互切）三个入口。
 */
export function useBlogLayoutMode() {
  const layoutMode = ref<BlogLayoutMode>(readStoredMode())

  function setLayoutMode(mode: BlogLayoutMode) {
    layoutMode.value = mode
    localStorage.setItem(STORAGE_KEY, mode)
  }

  function toggleLayoutMode() {
    setLayoutMode(layoutMode.value === 'card' ? 'timeline' : 'card')
  }

  return {
    layoutMode,
    setLayoutMode,
    toggleLayoutMode,
  }
}
