<script setup lang="ts">
/**
 * 知识库状态徽章
 * 统一渲染笔记的三类状态文案与配色：来源类型（source）、博客发布状态（publish）、
 * 知识库索引状态（index）；文案与颜色映射收敛在 knowledgeNoteStatus 工具中。
 */
import { computed } from 'vue'
import {
  indexStatusColor,
  indexStatusLabel,
  publishStatusColor,
  publishStatusLabel,
  sourceTypeLabel,
} from '@/utils/knowledgeNoteStatus'

const props = defineProps<{
  type: 'publish' | 'index' | 'source'
  status?: string
  /** source 类型不带色点，展示为中性标签 */
}>()

// 按 type 选取对应的状态文案映射
const label = computed(() => {
  if (props.type === 'publish') return publishStatusLabel(props.status)
  if (props.type === 'index') return indexStatusLabel(props.status)
  return sourceTypeLabel(props.status)
})

/** 归一化到 status-chip 的语义修饰 */
const variant = computed(() => {
  if (props.type === 'source') return 'default'
  const c = props.type === 'publish' ? publishStatusColor(props.status) : indexStatusColor(props.status)
  switch (c) {
    case 'success':
      return 'success'
    case 'error':
      return 'error'
    case 'warning':
      return 'warning'
    case 'processing':
      return 'processing'
    default:
      return 'default'
  }
})
</script>

<template>
  <span class="status-chip" :class="`status-chip--${variant}`">
    <span v-if="type !== 'source'" class="status-chip__dot" />
    {{ label }}
  </span>
</template>
