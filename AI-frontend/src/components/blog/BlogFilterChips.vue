<script setup lang="ts">
/**
 * BlogFilterChips 博客筛选标签条
 * 职责：以可移除的小胶囊（chip）形式展示当前已选的分类/标签筛选条件，
 * 点击 × 向父组件抛出 remove 事件由其负责移除对应条件。
 */
export type FilterChip = {
  key: string
  label: string
  kind: 'cat' | 'tag'
  id: number
}

defineProps<{
  chips: FilterChip[]
}>()

const emit = defineEmits<{
  remove: [chip: FilterChip]
}>()
</script>

<template>
  <!-- 已选筛选条件列表，每个 chip 可单独移除 -->
  <div class="filter-chips">
    <span
      v-for="chip in chips"
      :key="chip.key"
      class="filter-chip"
      :class="chip.kind"
    >
      <span>{{ chip.label }}</span>
      <button
        type="button"
        class="x"
        :aria-label="`移除 ${chip.label}`"
        @click="emit('remove', chip)"
      >
        ×
      </button>
    </span>
  </div>
</template>
