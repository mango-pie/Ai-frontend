<!--
  Sprite（雪碧图）渲染器：占位实现。
  帧循环渲染尚未完成（见模板内 TODO），当前无论是否配置了
  spriteUrl 都暂时回退到 CSS 渲染器，仅保留组件契约与配置读取。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { siteConfig } from '@/config/site'
import type { PetState, PetViewModel } from '../../types'
import PetRendererCss from './PetRendererCss.vue'

defineProps<{
  model: PetViewModel
  size: number
}>()

const emit = defineEmits<{
  animationComplete: [state: PetState]
}>()

/** 站点配置的雪碧图地址（当前仅用于存在性判断，尚未真正渲染帧） */
const spriteUrl = computed(() => siteConfig.effects.petDango.spriteUrl)
const hasSprite = computed(() => Boolean(spriteUrl.value))

function onAnimationComplete(state: PetState) {
  emit('animationComplete', state)
}
</script>

<template>
  <!-- 两个分支暂时都渲染 CSS 版：等帧循环实现后，hasSprite 分支应改为真正的雪碧图渲染 -->
  <!-- TODO: sprite frame loop — load atlas JSON and advance frames by PetState -->
  <PetRendererCss
    v-if="!hasSprite"
    :model="model"
    :size="size"
    @animation-complete="onAnimationComplete"
  />
  <PetRendererCss
    v-else
    :model="model"
    :size="size"
    @animation-complete="onAnimationComplete"
  />
</template>
