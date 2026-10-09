<!--
  GIF 渲染器：按当前模型从 gifAtlas 解析出的 URL 直接切换 <img>。
  额外处理三件事：
  1. 用户偏好“减少动态效果”时把一切状态钉死在 idle（拖拽除外）；
  2. 某状态的 GIF 加载失败时记入 failedStates，之后该状态回退到 fallback 状态；
  3. react 是一次性动画，GIF 没有结束事件，用定时器模拟播放完成回调。
  完全没有 GIF 素材时整体退回 CSS 渲染器。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { siteConfig } from '@/config/site'
import type { PetState, PetViewModel } from '../../types'
import { resolvePetGifAtlas, resolvePetGifUrl } from '../../gifAtlas'
import PetRendererCss from './PetRendererCss.vue'

const props = defineProps<{
  model: PetViewModel
  size: number
}>()

const emit = defineEmits<{
  animationComplete: [state: PetState]
}>()

/** 模块加载时解析一次的 GIF 素材表（文件名 -> 状态槽位） */
const atlas = resolvePetGifAtlas()
/** 加载出错的状态集合：命中后该状态改用 fallback 状态的图 */
const failedStates = new Set<PetState>()
/** 用户偏好减少动效：除拖拽外一律按 idle 静止展示 */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** react“动画完成”的模拟定时器句柄 */
let reactTimer = 0

/** 实际生效的模型：reduceMotion 或加载失败的状态会被改写成安全值 */
const effectiveModel = computed<PetViewModel>(() => {
  if (reduceMotion && props.model.state !== 'drag') {
    return {
      ...props.model,
      state: 'idle',
      overlay: null,
      walkPace: 'slow',
    }
  }
  if (failedStates.has(props.model.state)) {
    return {
      ...props.model,
      state: atlas.fallbackState,
      overlay: null,
    }
  }
  return props.model
})

const gifSrc = computed(() => resolvePetGifUrl(effectiveModel.value, atlas))

const hasGif = computed(() => Boolean(gifSrc.value))
const isFlipped = computed(() => props.model.facing === 'left')
const gifScale = computed(() => Math.max(1, siteConfig.effects.petDango.gif.renderScale ?? 1))

/** 图片变换：拖拽时轻微倾斜、朝向左时水平翻转，均叠加在配置的渲染缩放之上 */
const imageStyle = computed(() => {
  const scalePrefix = `scale(${gifScale.value})`
  if (props.model.state === 'drag') {
    return {
      transform: isFlipped.value
        ? `${scalePrefix} scaleX(-1) rotate(3deg)`
        : `${scalePrefix} rotate(-3deg)`,
    }
  }
  return {
    transform: isFlipped.value ? `${scalePrefix} scaleX(-1)` : scalePrefix,
  }
})

/** 清理 react 完成定时器 */
function clearReactTimer() {
  if (!reactTimer) return
  window.clearTimeout(reactTimer)
  reactTimer = 0
}

// 进入 react 状态后按配置时长补发 animationComplete，
// 让引擎能像 CSS 渲染器一样在“动画播完”时切回 idle
watch(
  () => props.model.state,
  (state) => {
    clearReactTimer()
    if (state !== 'react') return
    reactTimer = window.setTimeout(() => {
      emit('animationComplete', 'react')
      reactTimer = 0
    }, siteConfig.effects.petDango.gif.reactDurationMs ?? 800)
  },
  { immediate: true },
)

/** 图片加载失败：标记当前状态，下一帧渲染即回退到 fallback 状态 */
function onImageError() {
  failedStates.add(props.model.state)
}

onBeforeUnmount(() => {
  clearReactTimer()
})

onMounted(() => {
  // 开发期输出素材命中诊断，提示补齐命名或检查目录
  if (!import.meta.env.DEV) return
  if (atlas.loadedFiles.length === 0) {
    console.warn('[PetGif] 未发现 GIF 素材，请检查 src/assets/ams 目录。')
    return
  }
  if (!atlas.hasAllCoreStates) {
    console.warn('[PetGif] 核心状态未全部命中，已使用回退状态。')
  }
  if (!atlas.hasAllOverlayStates) {
    console.warn('[PetGif] 微行为状态未全部命中，已回退到核心状态。')
  }
  console.info(`[PetGif] 素材命中 ${atlas.matchedStateCount}/8`)
  if (atlas.unmatchedFiles.length > 0) {
    console.info('[PetGif] 未匹配状态的文件:', atlas.unmatchedFiles.join(', '))
  }
})
</script>

<template>
  <!-- 完全没有可用 GIF 时兜底为 CSS 渲染器 -->
  <PetRendererCss
    v-if="!hasGif"
    :model="model"
    :size="size"
    @animation-complete="(state) => emit('animationComplete', state)"
  />
  <!-- eager 加载保证状态切换瞬间就可见；加载失败交给 onImageError 回退 -->
  <div v-else class="pet-gif" :style="{ width: `${size}px`, height: `${size}px` }">
    <img
      class="pet-gif__image"
      :style="imageStyle"
      :src="gifSrc"
      alt=""
      loading="eager"
      decoding="async"
      @error="onImageError"
    >
  </div>
</template>

<style scoped>
/* 容器只定尺寸；变换作用于内部 img 的 transform-origin（底部中心） */
.pet-gif {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.pet-gif__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center bottom;
  user-select: none;
  pointer-events: none;
  image-rendering: auto;
}
</style>

