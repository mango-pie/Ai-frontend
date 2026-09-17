<script setup lang="ts">
/**
 * 树图全屏浮层 — 包裹 DomainTreeViz
 * 点节点同步左树选中 · 点空白 / 遮罩 / Esc 关闭
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { message } from 'ant-design-vue'
import type { LearningBranchTreeNode } from '@/api/learning.types'
import DomainTreeViz from './DomainTreeViz.vue'

const props = defineProps<{
  open: boolean
  domainName: string
  branches: LearningBranchTreeNode[]
  selectedBranchId: number | string | null
}>()

const emit = defineEmits<{
  close: []
  'update:selected-branch-id': [branchId: number | string | null]
  'learn-empty': [payload: { branchId: number | string; branchTitle: string }]
}>()

/** 缩放比例（限制在 0.6 ~ 1.5 之间），作用于整个树图舞台 */
const scale = ref(1)
/** 面板 DOM 引用：打开浮层后聚焦它，保证 Esc 能被正确接收 */
const panelRef = ref<HTMLElement | null>(null)

/** 步进缩放：toFixed 消除浮点累加误差 */
function zoomIn() {
  scale.value = Math.min(1.5, +(scale.value + 0.1).toFixed(2))
}

function zoomOut() {
  scale.value = Math.max(0.6, +(scale.value - 0.1).toFixed(2))
}

/** Esc 关闭浮层（监听在 window 上，仅在浮层打开时生效） */
function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

/** 选中树图节点：同步回左侧知识树，并用 toast 提示当前选中的枝 */
function onSelect(id: number | string | null) {
  emit('update:selected-branch-id', id)
  if (id == null) return
  const branch = props.branches.find((b) => String(b.id) === String(id))
  if (branch) {
    message.success(`已选中「${branch.title}」· 点空白可关闭`, 1.6)
  }
}

/** 打开时重置缩放并聚焦面板（等待 DOM 渲染完成后再聚焦） */
watch(
  () => props.open,
  async (v) => {
    if (v) {
      scale.value = 1
      await nextTick()
      panelRef.value?.focus()
    }
  },
)

/** 打开/关闭时挂载/卸载全局键盘监听，避免关闭后仍拦截按键 */
watch(
  () => props.open,
  (v) => {
    if (v) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

/** 组件销毁兜底：防止浮层开着时销毁组件导致监听泄漏 */
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="viz-fade">
      <div
        v-if="open"
        class="viz-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="知识树图全屏"
      >
        <div class="viz-overlay__backdrop" @click="$emit('close')" />

        <div
          ref="panelRef"
          class="viz-overlay__panel"
          tabindex="-1"
          @click.stop
        >
          <div class="viz-overlay__toolbar">
            <div class="viz-overlay__title">
              <span class="viz-overlay__eyebrow">DOMAIN TREE</span>
              <strong>{{ domainName || '领域知识树' }}</strong>
            </div>
            <div class="viz-overlay__zoom">
              <button type="button" class="viz-overlay__zoom-btn" title="缩小" @click="zoomOut">
                <ZoomOut :size="16" />
              </button>
              <span class="viz-overlay__zoom-label">{{ Math.round(scale * 100) }}%</span>
              <button type="button" class="viz-overlay__zoom-btn" title="放大" @click="zoomIn">
                <ZoomIn :size="16" />
              </button>
            </div>
            <button type="button" class="viz-overlay__close" title="关闭 Esc" @click="$emit('close')">
              <X :size="18" />
            </button>
          </div>

          <!-- 树图舞台：整体按 scale 缩放；点击空白处透传为关闭浮层 -->
          <div class="viz-overlay__stage" :style="{ transform: `scale(${scale})` }">
            <DomainTreeViz
              hide-toolbar
              :domain-name="domainName"
              :branches="branches"
              :selected-branch-id="selectedBranchId"
              @update:selected-branch-id="onSelect"
              @learn-empty="(p) => $emit('learn-empty', p)"
              @blank-click="$emit('close')"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.viz-overlay {
  position: fixed;
  inset: 0;
  z-index: 320;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.viz-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(55, 60, 95, 0.42);
  backdrop-filter: blur(6px);
  cursor: pointer;
}

.viz-overlay__panel {
  position: relative;
  width: min(980px, 100%);
  height: min(700px, calc(100vh - 64px));
  background:
    radial-gradient(800px 400px at 20% -10%, rgba(228, 223, 253, 0.9), transparent 60%),
    radial-gradient(700px 360px at 100% 110%, rgba(246, 242, 255, 0.85), transparent 55%),
    rgba(255, 255, 255, 0.94);
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 24px;
  box-shadow: 0 24px 64px rgba(70, 80, 130, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  outline: none;
}

.viz-overlay__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1.5px dashed rgba(165, 172, 196, 0.35);
  flex-shrink: 0;
}

.viz-overlay__title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin-right: auto;
}

.viz-overlay__eyebrow {
  font-size: 10px;
  letter-spacing: 2px;
  color: #a5acc4;
}

.viz-overlay__title strong {
  font-size: 16px;
  font-weight: 600;
  color: #4c5570;
  letter-spacing: 1px;
}

.viz-overlay__zoom {
  display: flex;
  align-items: center;
  gap: 8px;
}

.viz-overlay__zoom-btn,
.viz-overlay__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: #7a83a0;
  cursor: pointer;
  box-shadow: 0 1px 0 rgba(96, 116, 168, 0.12);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.5, 1), color 0.15s, background 0.15s;
}

.viz-overlay__zoom-btn:hover,
.viz-overlay__close:hover {
  color: #9b8ce8;
  background: #e4dffd;
  transform: translateY(-1px);
}

.viz-overlay__zoom-label {
  font-size: 12px;
  color: #a5acc4;
  min-width: 40px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.viz-overlay__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  transform-origin: center center;
  transition: transform 0.2s cubic-bezier(0.22, 0.8, 0.32, 1);
  overflow: hidden;
}

.viz-fade-enter-active,
.viz-fade-leave-active {
  transition: opacity 0.22s ease;
}

.viz-fade-enter-active .viz-overlay__panel,
.viz-fade-leave-active .viz-overlay__panel {
  transition: transform 0.28s cubic-bezier(0.22, 0.8, 0.32, 1), opacity 0.22s ease;
}

.viz-fade-enter-from,
.viz-fade-leave-to {
  opacity: 0;
}

.viz-fade-enter-from .viz-overlay__panel,
.viz-fade-leave-to .viz-overlay__panel {
  transform: translateY(12px) scale(0.96);
  opacity: 0;
}
</style>
