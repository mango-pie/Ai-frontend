/**
 * 歌词滚动的交互逻辑：激活行自动跟随居中、用户滚动时暂停跟随并高亮「预览行」、
 * 点击任意行跳播。同时服务主舞台、全屏影院与抽屉三处歌词容器。
 * 用「用户滚动 / 程序滚动」两个标志 + 定时器区分滚动来源，避免自动跟随被误判为用户操作。
 */
import { nextTick, onUnmounted, ref, watch } from 'vue'
import type { PulsePlayerApi } from '@/pages/music/pulseApi'

/**
 * 歌词 UI composable。
 * @param p 播放器 API（读取当前歌词行、影院/抽屉开关，调用 seekLyric）
 * 返回三处容器的 ref 与事件处理器，模板直接绑定即可。
 */
export function usePulseLyricUi(p: PulsePlayerApi) {
  const lyricFlowRef = ref<HTMLElement | null>(null)
  const theaterFlowRef = ref<HTMLElement | null>(null)
  const drawerLyricRef = ref<HTMLElement | null>(null)
  const lyricPeekIndex = ref(-1)
  const lyricHoverIndex = ref(-1)
  let lyricUserScroll = false
  let lyricProgrammaticScroll = false
  let lyricUserScrollTimer: ReturnType<typeof setTimeout> | undefined
  let lyricProgrammaticTimer: ReturnType<typeof setTimeout> | undefined

  /** 找出离容器视口中心最近的一行，作为用户滚动时的「预览行」 */
  function updateLyricPeek(container: HTMLElement | null) {
    if (!container) {
      lyricPeekIndex.value = -1
      return
    }
    const lines = [...container.querySelectorAll<HTMLElement>('.lyric-line, .theater-lyric, .drawer-lyric-line')]
    if (!lines.length) {
      lyricPeekIndex.value = -1
      return
    }
    const cRect = container.getBoundingClientRect()
    const mid = cRect.top + cRect.height / 2
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    lines.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const dist = Math.abs(r.top + r.height / 2 - mid)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    lyricPeekIndex.value = best
  }

  /** 用户停止滚动 1.4s 后：退出预览态并恢复自动跟随 */
  function endLyricUserScroll() {
    lyricUserScroll = false
    lyricPeekIndex.value = -1
    void nextTick(() => syncLyricScroll(true))
  }

  /** 用户滚动时标记来源、刷新预览行，并重置 1.4s 的「恢复跟随」定时器 */
  function markLyricUserScroll(e?: Event) {
    if (lyricProgrammaticScroll) return
    lyricUserScroll = true
    const target = (e?.currentTarget as HTMLElement | null) ?? lyricFlowRef.value
    updateLyricPeek(target)
    if (lyricUserScrollTimer) clearTimeout(lyricUserScrollTimer)
    lyricUserScrollTimer = setTimeout(endLyricUserScroll, 1400)
  }

  /** 平滑滚动使激活行居中；程序滚动期间立标志，避免被当成用户滚动 */
  function scrollLyricIntoFocus(container: HTMLElement | null, activeSel: string) {
    if (!container) return
    const active = container.querySelector(activeSel) as HTMLElement | null
    if (!active) return
    const cRect = container.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    const delta = aRect.top + aRect.height / 2 - (cRect.top + cRect.height / 2)
    if (Math.abs(delta) < 6) return
    lyricProgrammaticScroll = true
    if (lyricProgrammaticTimer) clearTimeout(lyricProgrammaticTimer)
    container.scrollBy({ top: delta, behavior: 'smooth' })
    lyricProgrammaticTimer = setTimeout(() => {
      lyricProgrammaticScroll = false
    }, 480)
  }

  /** 同步三处歌词容器的滚动；用户正在浏览（非 force）时让位 */
  function syncLyricScroll(force = false) {
    if (lyricUserScroll && !force) return
    scrollLyricIntoFocus(lyricFlowRef.value, '.lyric-line.is-active')
    if (p.theaterOpen.value) {
      scrollLyricIntoFocus(theaterFlowRef.value, '.theater-lyric.is-active')
    }
    if (p.drawerOpen.value && p.drawerTab.value === 'lyrics') {
      scrollLyricIntoFocus(drawerLyricRef.value, '.drawer-lyric-line.is-active')
    }
  }

  /** 行样式：按与激活行的距离分活跃/邻近/中距/暗化，浏览时叠加预览/悬停高亮 */
  function lyricToneClass(index: number) {
    const active = p.lyricIndex.value
    const classes: string[] = []
    if (active >= 0) {
      const dist = Math.abs(index - active)
      if (dist === 0) classes.push('is-active')
      else if (dist === 1) classes.push('is-near')
      else if (dist === 2) classes.push('is-mid')
      else classes.push('is-dim')
    }
    if (index !== active) {
      if (lyricUserScroll && lyricPeekIndex.value === index) classes.push('is-peek')
      if (lyricHoverIndex.value === index) classes.push('is-hover')
    }
    return classes
  }

  function onLyricLineEnter(index: number) {
    lyricHoverIndex.value = index
  }

  function onLyricLineLeave() {
    lyricHoverIndex.value = -1
  }

  /** 点击歌词行：退出浏览态、跳播到该行并立即居中 */
  function onLyricLineClick(index: number) {
    lyricUserScroll = false
    lyricPeekIndex.value = -1
    lyricHoverIndex.value = -1
    if (lyricUserScrollTimer) clearTimeout(lyricUserScrollTimer)
    p.seekLyric(index)
    void nextTick(() => syncLyricScroll(true))
  }

  // 激活行/翻译开关/视图切换时跟随滚动；用户浏览中只刷新预览行
  watch(
    () => [p.lyricIndex.value, p.showLyricTranslation.value, p.view.value, p.theaterOpen.value] as const,
    async (curr, prev) => {
      await nextTick()
      const index = curr[0]
      const prevIndex = prev?.[0]
      if (!lyricUserScroll) {
        syncLyricScroll(true)
      } else if (index !== prevIndex) {
        updateLyricPeek(lyricFlowRef.value)
      }
    },
  )

  // 换歌时清空浏览/悬停状态并把歌词滚回顶部
  watch(
    () => p.currentId.value,
    async () => {
      lyricUserScroll = false
      lyricPeekIndex.value = -1
      lyricHoverIndex.value = -1
      if (lyricUserScrollTimer) clearTimeout(lyricUserScrollTimer)
      await nextTick()
      if (lyricFlowRef.value) lyricFlowRef.value.scrollTop = 0
      if (theaterFlowRef.value) theaterFlowRef.value.scrollTop = 0
      syncLyricScroll(true)
    },
  )

  // 卸载时清理两个滚动状态定时器
  onUnmounted(() => {
    if (lyricUserScrollTimer) clearTimeout(lyricUserScrollTimer)
    if (lyricProgrammaticTimer) clearTimeout(lyricProgrammaticTimer)
  })

  return {
    lyricFlowRef,
    theaterFlowRef,
    drawerLyricRef,
    lyricPeekIndex,
    lyricHoverIndex,
    lyricToneClass,
    onLyricLineEnter,
    onLyricLineLeave,
    onLyricLineClick,
    markLyricUserScroll,
    syncLyricScroll,
  }
}

