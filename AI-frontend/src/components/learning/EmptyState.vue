<script setup lang="ts">
/**
 * 暖色空状态组件 — 图标组合 + 标题 + 描述 + 主/次 CTA
 * 在 NoteList 和 GatePanel 中统一复用
 */
import type { Component } from 'vue'
import { BookOpen } from 'lucide-vue-next'
import IconAction from '@/components/ui/IconAction.vue'

withDefaults(
  defineProps<{
    icon?: Component
    iconSize?: number
    title: string
    description?: string
    primaryLabel?: string
    primaryIcon?: Component
    secondaryLabel?: string
    secondaryIcon?: Component
  }>(),
  {
    icon: undefined,
    iconSize: 48,
    description: '',
    primaryLabel: '',
    primaryIcon: undefined,
    secondaryLabel: '',
    secondaryIcon: undefined,
  },
)

defineEmits<{
  primary: []
  secondary: []
}>()
</script>

<template>
  <div class="ld-empty">
    <div class="ld-empty__illustration">
      <!-- 未传自定义 icon 时回退到默认的 BookOpen 书本图标 -->
      <BookOpen
        v-if="!icon"
        :size="iconSize"
        class="ld-empty__illustration-main"
        :stroke-width="1.5"
      />
      <component
        :is="icon"
        v-else
        :size="iconSize"
        class="ld-empty__illustration-main"
        :stroke-width="1.5"
      />
    </div>

    <h3 class="ld-empty__title">{{ title }}</h3>

    <p v-if="description" class="ld-empty__desc">{{ description }}</p>

    <!-- 主/次按钮按需渲染：只有传入对应 label 才显示，点击事件直接透传给父组件 -->
    <div class="ld-empty__actions">
      <IconAction
        v-if="primaryLabel"
        :icon="primaryIcon!"
        :label="primaryLabel"
        variant="primary"
        size="md"
        @click="$emit('primary')"
      />
      <IconAction
        v-if="secondaryLabel"
        :icon="secondaryIcon!"
        :label="secondaryLabel"
        variant="ghost"
        size="md"
        @click="$emit('secondary')"
      />
    </div>
  </div>
</template>

<style scoped>
.ld-empty {
  padding: var(--ld-space-9) var(--ld-space-5);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ld-space-4);
}

.ld-empty__illustration {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: var(--ld-color-primary-subtle);
  border: 1px solid var(--ld-color-primary-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--ld-space-2);
}

.ld-empty__illustration-main {
  color: var(--ld-color-primary);
  opacity: 0.85;
}

.ld-empty__title {
  margin: 0;
  font-size: var(--ld-font-size-base);
  font-weight: var(--ld-font-weight-semibold);
  line-height: var(--ld-line-height-tight);
}

.ld-empty__desc {
  margin: 0;
  color: var(--ld-color-text-secondary);
  font-size: var(--ld-font-size-sm);
  line-height: var(--ld-line-height-relaxed);
  max-width: 340px;
}

.ld-empty__actions {
  display: flex;
  align-items: center;
  gap: var(--ld-space-3);
  margin-top: var(--ld-space-2);
}
</style>
