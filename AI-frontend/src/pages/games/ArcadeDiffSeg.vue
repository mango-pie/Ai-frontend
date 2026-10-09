<script setup lang="ts">
/**
 * 对战难度切换段控件（简单 / 普通 / 困难），四款人机棋类共用
 */
import type { VsDiff } from './arcade'

defineOptions({ name: 'ArcadeDiffSeg' })

const props = defineProps<{ modelValue: VsDiff }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: VsDiff): void }>()

const OPTIONS: Array<{ v: VsDiff; label: string }> = [
  { v: 'easy', label: '简单' },
  { v: 'normal', label: '普通' },
  { v: 'hard', label: '困难' },
]

function pick(v: VsDiff) {
  if (v === props.modelValue) return
  emit('update:modelValue', v)
}
</script>

<template>
  <div class="arc-seg is-kids">
    <span
      v-for="o in OPTIONS"
      :key="o.v"
      :class="{ 'is-active': modelValue === o.v }"
      tabindex="0"
      @click="pick(o.v)"
      @keydown.enter="pick(o.v)"
    >{{ o.label }}</span>
  </div>
</template>
