<script setup lang="ts">
/**
 * 全站背景图轮播层
 * - 由 A/B 两张图片叠放交叉淡入淡出实现轮播，避免切换时出现空白帧
 * - 仅在背景模式为 carousel 且站点配置了背景图时启用，其余模式自动停播并清理 body 类
 */
import { onMounted, onUnmounted, watch } from 'vue'
import { useBackgroundMode } from '@/composables/useBackgroundMode'
import { useBackgroundSlideshow } from '@/composables/useBackgroundSlideshow'

const { mode } = useBackgroundMode()
// autoRun: false → 交给下方的 apply 统一决定启停时机
const { layerA, layerB, activeLayer, hasImages, fadeDuration, start, stop } =
  useBackgroundSlideshow({ autoRun: false })

/** 根据背景模式与图片配置同步轮播启停，并在 body 上标记 carousel 态供全局 CSS 使用 */
const apply = () => {
  const on = hasImages && mode.value === 'carousel'
  document.body.classList.toggle('station-bg-carousel', on)
  if (on) start()
  else stop()
}

onMounted(apply)
// 用户在悬浮球切换背景模式时即时响应
watch(mode, apply)

onUnmounted(() => {
  stop()
  document.body.classList.remove('station-bg-carousel')
})
</script>

<template>
  <!-- 固定全屏、置于内容之下（z-index: -1）且不拦截任何鼠标事件 -->
  <div
    v-if="hasImages && mode === 'carousel'"
    class="station-bg-carousel-fx"
    :style="{ '--bg-fade-duration': fadeDuration }"
    aria-hidden="true"
  >
    <!-- A/B 双图层：activeLayer 指向谁谁淡入，另一张淡出，形成无缝交叉过渡 -->
    <img
      v-if="layerA"
      class="station-bg-carousel-fx__image"
      :class="{ 'is-active': activeLayer === 'a' }"
      :src="layerA"
      alt=""
    />
    <img
      v-if="layerB"
      class="station-bg-carousel-fx__image"
      :class="{ 'is-active': activeLayer === 'b' }"
      :src="layerB"
      alt=""
    />
  </div>
</template>

<style scoped>
/* 轮播容器铺满视口、置于最底层；淡入时长由 JS 侧注入的 CSS 变量控制 */
.station-bg-carousel-fx {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

.station-bg-carousel-fx__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--bg-fade-duration, 1.2s) ease;
}

.station-bg-carousel-fx__image.is-active {
  opacity: 1;
}
</style>
