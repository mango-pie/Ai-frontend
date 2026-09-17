<script setup lang="ts">
/**
 * 阶段进度条 — 采集网页 → AI精读 → 索引构建
 * 活跃阶段呼吸动效，已完成阶段显示勾号
 */
import { computed } from 'vue'
import { Check, Globe, Brain, Database } from 'lucide-vue-next'

type Phase = 'idle' | 'preview' | 'ingest' | 'job'

const props = withDefaults(
  defineProps<{
    phase: Phase
    progress?: number
  }>(),
  {
    progress: 0,
  },
)

/** 三段固定流水线：采集 → AI 精读 → 生成笔记 */
const STEPS = [
  { key: 'collect', label: '采集网页', icon: Globe },
  { key: 'distill', label: 'AI 精读', icon: Brain },
  { key: 'index', label: '生成笔记', icon: Database },
] as const

/** 由外部 phase + 百分比进度推断当前激活到哪一步（-1 表示尚未开始） */
const activeIndex = computed(() => {
  if (props.phase === 'preview' || props.phase === 'idle') return -1
  if (props.phase === 'ingest') return 0
  // job — 正在精读
  if (props.progress >= 80) return 2
  return 1
})

/** 底部状态文案：按阶段给用户不同的等待提示 */
const statusText = computed(() => {
  if (props.phase === 'ingest') return '正在提交网页进行采集…'
  if (props.phase === 'job') return 'AI 正在精读内容，预计需要 20-40 秒…'
  return ''
})
</script>

<template>
  <!-- 空闲/预览阶段不渲染进度条，只在正式采集与生成流程中显示 -->
  <div v-if="phase !== 'idle' && phase !== 'preview'" class="ld-progress">
    <!-- 节点间用横条连接；已完成节点换成勾号图标，激活节点带呼吸动效 -->
    <div class="ld-progress__steps" role="progressbar" :aria-valuenow="activeIndex + 1" :aria-valuemax="STEPS.length">
      <template v-for="(step, i) in STEPS" :key="step.key">
        <div
          class="ld-progress__node"
          :class="{
            'is-active': i === activeIndex,
            'is-done': i < activeIndex,
          }"
        >
          <span class="ld-progress__node-dot">
            <Check v-if="i < activeIndex" :size="14" :stroke-width="2.5" />
            <component :is="step.icon" v-else :size="14" :stroke-width="2" />
          </span>
          <span class="ld-progress__node-label">{{ step.label }}</span>
        </div>
        <span
          v-if="i < STEPS.length - 1"
          class="ld-progress__bar"
          :class="{ 'is-done': i < activeIndex }"
        />
      </template>
    </div>
    <p class="ld-progress__status">{{ statusText }}</p>
  </div>
</template>

<style scoped>
.ld-progress {
  margin-bottom: var(--ld-space-4);
}

.ld-progress__steps {
  display: flex;
  align-items: center;
  gap: 0;
}

.ld-progress__node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ld-progress__node-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ld-color-bg-muted);
  border: 1.5px solid var(--ld-color-border);
  color: var(--ld-color-text-tertiary);
  transition:
    background var(--ld-duration-normal) var(--ld-ease-out),
    border-color var(--ld-duration-normal) var(--ld-ease-out),
    color var(--ld-duration-normal) var(--ld-ease-out);
}

.ld-progress__node.is-active .ld-progress__node-dot {
  background: var(--ld-color-ai-subtle);
  border-color: var(--ld-color-ai);
  color: var(--ld-color-ai);
  animation: ld-progress-pulse 2s ease-in-out infinite;
}

.ld-progress__node.is-done .ld-progress__node-dot {
  background: var(--ld-color-gate-leaf-bg);
  border-color: var(--ld-color-gate-leaf);
  color: var(--ld-color-gate-leaf);
}

.ld-progress__node-label {
  font-size: var(--ld-font-size-xs);
  color: var(--ld-color-text-tertiary);
  white-space: nowrap;
}

.ld-progress__node.is-active .ld-progress__node-label {
  color: var(--ld-color-ai);
}

.ld-progress__node.is-done .ld-progress__node-label {
  color: var(--ld-color-gate-leaf);
}

.ld-progress__bar {
  flex: 1;
  height: 1.5px;
  min-width: 20px;
  background: var(--ld-color-border);
  margin: 0 4px;
  margin-bottom: 20px;
  transition: background var(--ld-duration-normal) var(--ld-ease-out);
}

.ld-progress__bar.is-done {
  background: var(--ld-color-gate-leaf);
  opacity: 0.5;
}

.ld-progress__status {
  margin: var(--ld-space-3) 0 0;
  font-size: var(--ld-font-size-sm);
  color: var(--ld-color-text-secondary);
  text-align: center;
}

@keyframes ld-progress-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 156, 224, 0.35); }
  50% { box-shadow: 0 0 0 6px rgba(124, 156, 224, 0); }
}
</style>
