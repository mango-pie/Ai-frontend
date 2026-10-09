<script setup lang="ts">
/** 分页内页的迷你顶栏：左侧站点名（点击回首页），右侧当前分页标签。 */
import { siteConfig } from '@/config/site'

defineProps<{
  pageLabel: string
}>()

defineEmits<{
  home: []
}>()
</script>

<template>
  <header class="home-mini-bar">
    <button type="button" class="home-mini-bar__brand font-display" @click="$emit('home')">
      {{ siteConfig.siteName }}
    </button>
    <span class="home-mini-bar__page">{{ pageLabel }}</span>
  </header>
</template>
