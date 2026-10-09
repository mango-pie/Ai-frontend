/**
 * 全站背景图轮播：A/B 双层交叉淡入，实现无白屏切换。
 * 公开壳（自动轮换）与轮播图模式组件（手动 start/stop）共用此 composable。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { siteConfig } from '@/config/site'

// 构建期打包全部背景图（eager 直接拿到 URL），首屏即可展示、切换无需请求
const backgroundModules = import.meta.glob<string>(
  '@/assets/backgrounds/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, import: 'default' },
)

const backgroundUrls = Object.values(backgroundModules)

/** 是否至少有一张背景图（供设置面板禁用「轮播」选项） */
export const hasBackgroundImages = backgroundUrls.length > 0

/** 随机挑一张背景图下标；exclude 传入当前下标时重抽，避免连续两次出现同一张 */
function pickRandomIndex(exclude?: number): number {
  if (backgroundUrls.length === 0) return -1
  if (backgroundUrls.length === 1) return 0

  let index = Math.floor(Math.random() * backgroundUrls.length)
  while (index === exclude) {
    index = Math.floor(Math.random() * backgroundUrls.length)
  }
  return index
}

/** 提前拉取图片进浏览器缓存，避免正式切换时才加载导致闪白 */
function preloadImage(url: string) {
  const img = new Image()
  img.src = url
}

export interface BackgroundSlideshowOptions {
  /** 挂载后是否立即开始轮换，默认 true（公开壳沿用旧行为）；轮播图模式组件传 false 手动 start/stop */
  autoRun?: boolean
}

/**
 * 背景轮播 composable。
 * 返回 A/B 两个图层 URL、当前激活图层、运行状态与 start/stop 控制；
 * 组件用 `layerA`/`layerB` 渲染两层图片，靠 `activeLayer` 的 class 切换做交叉淡入。
 */
export function useBackgroundSlideshow(options: BackgroundSlideshowOptions = {}) {
  const { autoRun = true } = options
  const { intervalMs, fadeMs, enabled } = siteConfig.backgroundSlideshow
  const hasImages = backgroundUrls.length > 0
  const canRotate = enabled && backgroundUrls.length > 1

  const currentIndex = ref(pickRandomIndex())
  const activeLayer = ref<'a' | 'b'>('a')
  const layerA = ref(hasImages && currentIndex.value >= 0 ? backgroundUrls[currentIndex.value] : '')
  const layerB = ref('')
  const running = ref(false)

  let timer: ReturnType<typeof setInterval> | null = null

  const fadeDuration = computed(() => `${fadeMs}ms`)

  /** 轮换到下一张：新图写入非激活层，再切换 activeLayer 触发 CSS 交叉淡入 */
  const switchToNext = () => {
    if (!canRotate || currentIndex.value < 0) return

    const nextIndex = pickRandomIndex(currentIndex.value)
    const nextUrl = backgroundUrls[nextIndex]
    if (!nextUrl) return

    preloadImage(nextUrl)

    if (activeLayer.value === 'a') {
      layerB.value = nextUrl
      activeLayer.value = 'b'
    } else {
      layerA.value = nextUrl
      activeLayer.value = 'a'
    }
    currentIndex.value = nextIndex
  }

  const start = () => {
    if (!canRotate || running.value) return

    // 预热下一张，随后按配置间隔轮换
    const nextIndex = pickRandomIndex(currentIndex.value)
    const nextUrl = backgroundUrls[nextIndex]
    if (nextUrl) preloadImage(nextUrl)

    running.value = true
    timer = setInterval(switchToNext, intervalMs)
  }

  /** 停止轮换并清理定时器，避免组件卸载后仍持有回调 */
  const stop = () => {
    running.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onMounted(() => {
    if (!hasImages) return
    if (autoRun && canRotate) start()
  })

  onUnmounted(stop)

  return {
    layerA,
    layerB,
    activeLayer,
    hasImages,
    running,
    start,
    stop,
    fadeDuration,
  }
}
