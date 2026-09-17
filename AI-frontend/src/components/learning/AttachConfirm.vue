<script setup lang="ts">
/**
 * 挂叶确认侧滑弹层：把一篇学习笔记挂载到知识树的某个枝上。
 * 支持两种模式：选择已有枝 / 新建枝（需指定父枝，仅可选 L1 或根级）。
 * 弹层由父组件控制 visible，确认后通过 confirm 事件把选择结果抛给父组件提交。
 */
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { Paperclip, X } from 'lucide-vue-next'
import type { LearningBranchTreeNode } from '@/api/learning.types'

type Props = {
  visible: boolean
  domainId: number | string
  noteId: number | string
  noteTitle: string
  noteSummary?: string
  branches: LearningBranchTreeNode[]
  suggestedBranchId?: number | string | null
  suggestedBranchTitle?: string | null
  submitting?: boolean
}

type Emits = {
  'update:visible': [visible: boolean]
  confirm: [
    payload:
      | { branchId: number | string }
      | { newBranchTitle: string; parentBranchId: number | string },
  ]
  cancel: []
}

const props = withDefaults(defineProps<Props>(), {
  suggestedBranchId: null,
  suggestedBranchTitle: null,
  submitting: false,
})

const emit = defineEmits<Emits>()

type AttachMode = 'existing' | 'new'
/** 当前挂载模式：选已有枝 / 新建枝 */
const mode = ref<AttachMode>('existing')
/** 新建枝模式下用户输入的枝标题 */
const newBranchTitle = ref('')
/** 已有枝模式下选中的挂载目标枝 id */
const selectedBranchId = ref<number | string | null>(null)
/** 新建枝的父枝 id，0 表示根级（成为 L1 枝） */
const newBranchParentId = ref<number | string>(0)

/** 只展示 L1 枝作为父枝候选，"根级 (L1)" 代表 parentBranchId=0 */
const parentBranchOptions = computed(() => {
  const rootOption = { value: 0 as number | string, label: '根级 (L1)' }
  const l1Options = props.branches
    .filter((b) => b.depth === 1)
    .map((b) => ({ value: b.id, label: b.path || b.title }))
  return [rootOption, ...l1Options]
})

/** 已有枝候选列表：展示全量枝，用完整路径（path）作标签便于区分同名枝 */
const branchOptions = computed(() =>
  props.branches.map((b) => ({
    value: b.id,
    label: b.path || b.title,
  })),
)

/** 每次弹层打开时重置表单：若有 AI 推荐枝则默认选中它，否则切到"新建枝"模式 */
watch(
  () => props.visible,
  (v) => {
    if (!v) return
    const hasSuggested = props.suggestedBranchId != null
    mode.value = hasSuggested ? 'existing' : 'new'
    selectedBranchId.value = props.suggestedBranchId ?? (props.branches[0]?.id ?? null)
    newBranchTitle.value = (props.suggestedBranchTitle as string) || ''
    newBranchParentId.value = 0
  },
  { immediate: true },
)

/** 点击遮罩关闭：提交中禁止误关，避免打断请求 */
function onOverlayClick() {
  if (!props.submitting) emit('cancel')
}

/** 确认挂载：按模式做参数校验后，把结果抛给父组件去调接口 */
function onConfirm() {
  if (props.submitting) return

  if (mode.value === 'new') {
    const title = newBranchTitle.value.trim()
    if (!title) {
      message.warning('请填写新建枝标题')
      return
    }
    emit('confirm', { newBranchTitle: title, parentBranchId: newBranchParentId.value })
    return
  }

  const bid = selectedBranchId.value
  if (bid == null) {
    message.warning('请选择挂载枝')
    return
  }
  emit('confirm', { branchId: bid })
}
</script>

<template>
  <!-- Teleport 到 body 避免被父级 overflow/层级裁剪，Transition 提供右侧滑入动画 -->
  <Teleport to="body">
    <Transition name="attach-slide">
      <div v-if="visible" class="attach-root">
        <!-- backdrop -->
        <div class="attach-backdrop" @click="onOverlayClick" />

        <!-- sheet -->
        <div class="attach-sheet" role="dialog" aria-modal="true">
          <div class="attach-sheet__header">
            <h3 class="attach-sheet__title">
              <Paperclip :size="18" class="attach-sheet__title-icon" />
              挂叶确认
            </h3>
            <button
              type="button"
              class="attach-sheet__close"
              :disabled="submitting"
              aria-label="关闭"
              @click="emit('cancel')"
            >
              <X :size="16" />
            </button>
          </div>

          <p class="attach-sheet__note">
            将 <strong>{{ noteTitle }}</strong> 挂载到知识树
          </p>

          <!-- 摘要折叠 -->
          <details v-if="noteSummary" class="attach-sheet__summary">
            <summary class="attach-sheet__summary-toggle">笔记摘要</summary>
            <p class="attach-sheet__summary-text">{{ noteSummary }}</p>
          </details>

          <!-- mode segmented -->
          <div class="attach-sheet__segments">
            <button
              type="button"
              class="attach-sheet__segment"
              :class="{ 'is-active': mode === 'existing' }"
              :disabled="submitting"
              @click="mode = 'existing'"
            >
              选已有枝
            </button>
            <button
              type="button"
              class="attach-sheet__segment"
              :class="{ 'is-active': mode === 'new' }"
              :disabled="submitting"
              @click="mode = 'new'"
            >
              新建枝
            </button>
          </div>

          <div class="attach-sheet__body">
            <!-- existing branch -->
            <div v-if="mode === 'existing'">
              <label class="attach-sheet__field-label">挂载枝</label>
              <a-select
                v-model:value="selectedBranchId"
                style="width: 100%"
                :options="branchOptions"
                placeholder="选择枝"
              />
            </div>

            <!-- new branch -->
            <div v-else>
              <label class="attach-sheet__field-label">新建枝标题</label>
              <a-input
                v-model:value="newBranchTitle"
                placeholder="例如：集合框架"
                :maxlength="128"
              />
              <label class="attach-sheet__field-label" style="margin-top: 12px">父枝</label>
              <a-select
                v-model:value="newBranchParentId"
                style="width: 100%"
                :options="parentBranchOptions"
              />
            </div>
          </div>

          <div class="attach-sheet__actions">
            <a-button :disabled="submitting" @click="emit('cancel')">取消</a-button>
            <a-button type="primary" :loading="submitting" @click="onConfirm">
              确认挂载
            </a-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.attach-root {
  position: fixed;
  inset: 0;
  z-index: var(--ld-z-attach-sheet, 250);
  display: flex;
  justify-content: flex-end;
}

.attach-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.attach-sheet {
  position: relative;
  width: min(440px, 90vw);
  height: 100%;
  background: var(--ld-color-bg-elevated, rgba(35, 28, 46, 0.96));
  border-left: 1px solid var(--ld-color-border, rgba(255, 255, 255, 0.08));
  box-shadow: var(--ld-shadow-overlay, 0 24px 64px rgba(0, 0, 0, 0.55));
  padding: var(--ld-space-7, 28px);
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-4, 16px);
  overflow-y: auto;
}

.attach-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.attach-sheet__title {
  margin: 0;
  font-size: var(--ld-font-size-md, 1.125rem);
  font-weight: var(--ld-font-weight-bold, 700);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.attach-sheet__title-icon {
  color: var(--ld-color-primary, #b8a4c9);
}

.attach-sheet__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ld-color-text-secondary, #c4b8d0);
  border-radius: var(--ld-radius-md, 8px);
  padding: 6px;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.attach-sheet__close:hover {
  color: var(--ld-color-text-primary, #f5f0f8);
  background: rgba(255, 255, 255, 0.06);
}

.attach-sheet__note {
  margin: 0;
  color: var(--ld-color-text-secondary, #c4b8d0);
  font-size: var(--ld-font-size-sm, 0.875rem);
  line-height: var(--ld-line-height-normal, 1.75);
}

.attach-sheet__summary {
  border: 1px solid var(--ld-color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--ld-radius-sm, 8px);
  padding: var(--ld-space-3, 12px);
  background: rgba(255, 255, 255, 0.02);
}

.attach-sheet__summary-toggle {
  font-size: var(--ld-font-size-xs, 0.75rem);
  font-weight: var(--ld-font-weight-semibold, 600);
  color: var(--ld-color-text-secondary, #c4b8d0);
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.attach-sheet__summary-toggle::-webkit-details-marker {
  display: none;
}

.attach-sheet__summary-text {
  margin: var(--ld-space-2, 8px) 0 0;
  font-size: var(--ld-font-size-xs, 0.75rem);
  color: var(--ld-color-text-tertiary, #8a7d9a);
  line-height: 1.7;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
}

.attach-sheet__segments {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--ld-radius-md, 8px);
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--ld-color-border, rgba(255, 255, 255, 0.08));
  align-self: flex-start;
}

.attach-sheet__segment {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--ld-color-text-secondary, #c4b8d0);
  padding: 6px 14px;
  border-radius: calc(var(--ld-radius-md, 8px) - 2px);
  font-size: var(--ld-font-size-sm, 0.875rem);
  font-weight: var(--ld-font-weight-semibold, 600);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}

.attach-sheet__segment:hover:not(:disabled) {
  color: var(--ld-color-text-primary, #f5f0f8);
}

.attach-sheet__segment.is-active {
  background: var(--ld-color-primary-subtle, rgba(184, 164, 201, 0.16));
  color: var(--ld-color-primary, #b8a4c9);
  box-shadow: inset 0 0 0 1px var(--ld-color-primary-muted, rgba(184, 164, 201, 0.28));
}

.attach-sheet__body {
  flex: 1;
  min-height: 0;
}

.attach-sheet__field-label {
  display: block;
  font-size: var(--ld-font-size-xs, 0.75rem);
  color: var(--ld-color-text-secondary, #c4b8d0);
  font-weight: var(--ld-font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: var(--ld-space-2, 8px);
}

.attach-sheet__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ld-space-3, 12px);
  padding-top: var(--ld-space-4, 16px);
  border-top: 1px solid var(--ld-color-border, rgba(255, 255, 255, 0.08));
}

/* transition */
.attach-slide-enter-active,
.attach-slide-leave-active {
  transition: opacity 0.25s ease;
}
.attach-slide-enter-active .attach-sheet,
.attach-slide-leave-active .attach-sheet {
  transition: transform 0.3s var(--ld-ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}
.attach-slide-enter-from,
.attach-slide-leave-to {
  opacity: 0;
}
.attach-slide-enter-from .attach-sheet,
.attach-slide-leave-to .attach-sheet {
  transform: translateX(100%);
}
</style>
