<script setup lang="ts">
/** 主页全屏分页指示点：点击圆点切换到对应分页（pageIndex 从 0 开始）。 */
defineProps<{
  pageIndex: number
  pageCount: number
}>()

defineEmits<{
  go: [number]
}>()
</script>

<template>
  <nav class="home-page-dots" aria-label="主页分页">
    <button
      v-for="i in pageCount"
      :key="i"
      type="button"
      class="home-page-dots__dot"
      :class="{ 'is-active': pageIndex === i - 1 }"
      :aria-label="`第 ${i} 页`"
      :aria-current="pageIndex === i - 1 ? 'page' : undefined"
      @click="$emit('go', i - 1)"
    />
  </nav>
</template>
