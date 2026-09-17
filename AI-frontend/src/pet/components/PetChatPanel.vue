<script setup lang="ts">
/**
 * 桌宠的对话面板（双击桌宠弹出）
 * - 回复按「分段计划」逐段打字机呈现：SSE 流式返回分段与每段延迟，逐段 reveal
 * - 若流式没有分段信息，则退化为整段缓冲后一次性打字显示
 * - 点击面板与桌宠以外的区域自动关闭；未登录时显示引导登录视图
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { applySegmentPlan } from '@/utils/sseChatStream'
import { createPetSegmentHandlers } from '@/composables/useSegmentTypewriter'
import { sanitizeSegmentDisplayText } from '@/utils/chatSegmentDisplay'
import type { PetStreamHandlers } from '@/pet/composables/usePetAiChat'
interface PetChatApi {
  askStream: (question: string, handlers: PetStreamHandlers) => Promise<string>
}

const props = defineProps<{
  visible: boolean
  placement: 'top' | 'bottom'
  loggedIn: boolean
  chat: PetChatApi
  anchorEl?: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
  login: []
}>()

// 输入与回复状态：replySegments 保存已揭示的分段文本（打字机逐段填充）
const inputValue = ref('')
const replySegments = ref<string[]>([])
const isStreaming = ref(false)

// 面板与输入框的 DOM 引用：用于外点关闭与自动聚焦
const panelRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

/** 正在流式返回但尚无任何可显示文字时，展示三点跳动的「思考中」动画 */
const showTyping = computed(
  () => isStreaming.value && replySegments.value.every((s) => !s),
)

/** 回复区滚动到底部：新分段揭示/打字推进时跟随 */
function scrollReplyToBottom() {
  const el = panelRef.value?.querySelector('.pet-chat-panel__reply')
  if (el) el.scrollTop = el.scrollHeight
}

/** 点击面板与桌宠锚点以外的区域时关闭面板（outside-click 模式） */
function handleDocumentPointerDown(event: PointerEvent) {
  if (!props.visible) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (panelRef.value?.contains(target)) return
  if (props.anchorEl?.contains(target)) return
  emit('close')
}

// 面板显隐切换：打开时注册外点监听并聚焦输入框，关闭时移除监听
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      document.addEventListener('pointerdown', handleDocumentPointerDown)
      await nextTick()
      inputRef.value?.focus()
    } else {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

/**
 * 发送消息并流式接收回复：
 * - 优先走 onSegmentPlan（分段 + 每段延迟）的打字机分段展示
 * - 没有分段计划时，把全部 chunk 缓冲后按整段打字呈现
 * - 空回复/异常时给兜底文案，保证桌宠永远「有话说」
 */
async function handleSend() {
  const text = inputValue.value.trim()
  if (!text || isStreaming.value) return

  if (!props.loggedIn) {
    emit('login')
    return
  }

  inputValue.value = ''
  replySegments.value = []
  isStreaming.value = true

  // streamBuffer：兜底用的原始流文本；segmentPlanApplied：标记是否走了分段计划
  let streamBuffer = ''
  let segmentPlanApplied = false
  const segmentHandlers = createPetSegmentHandlers({
    replySegments,
    options: { onProgress: scrollReplyToBottom },
  })

  try {
    await props.chat.askStream(text, {
      onChunk: (chunk) => {
        streamBuffer += chunk
      },
      onSegmentPlan: async (segments, delays) => {
        segmentPlanApplied = true
        replySegments.value = []
        await applySegmentPlan(segments, delays, segmentHandlers)
      },
    })
    // 未收到分段计划 → 用完整缓冲文本做一次整段打字
    if (!segmentPlanApplied && streamBuffer.trim()) {
      await segmentHandlers.revealReplace(sanitizeSegmentDisplayText(streamBuffer))
    }
    if (!replySegments.value.some((s) => s.trim())) {
      replySegments.value = ['我刚刚走神了，再问我一次吧~']
    }
  } catch {
    replySegments.value = ['连接 AI 失败了，等会再试试~']
  } finally {
    isStreaming.value = false
  }
}

/** Enter 发送、Shift+Enter 换行 */
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <!-- placement 由父组件按桌宠位置决定（靠上沿向上弹/向下弹），带淡入淡出过渡 -->
  <Transition name="pet-chat-panel">
    <div
      v-if="visible"
      ref="panelRef"
      class="pet-chat-panel"
      :class="`pet-chat-panel--${placement}`"
      @pointerdown.stop
    >
      <button
        type="button"
        class="pet-chat-panel__close"
        aria-label="关闭对话"
        @click="emit('close')"
      >
        ×
      </button>

      <!-- 未登录视图：引导去登录 -->
      <div v-if="!loggedIn" class="pet-chat-panel__login">
        <p>请先登录后再和我聊天~</p>
        <button type="button" class="pet-chat-panel__login-btn" @click="emit('login')">
          去登录
        </button>
      </div>

      <template v-else>
        <!-- 回复区三态：思考中动画 / 分段打字内容 / 空态提示 -->
        <div class="pet-chat-panel__reply">
          <div v-if="showTyping" class="pet-chat-panel__typing">
            <span /><span /><span />
          </div>
          <!-- v-memo 按段缓存，打字过程中只重渲染正在变化的分段 -->
          <template v-else-if="replySegments.length">
            <p
              v-for="(seg, i) in replySegments"
              :key="i"
              v-memo="[seg, i]"
              class="pet-chat-panel__reply-segment"
            >
              {{ seg }}
            </p>
          </template>
          <p v-else class="pet-chat-panel__hint">想聊点什么？</p>
        </div>

        <!-- 输入区：流式进行中禁用输入与发送 -->
        <div class="pet-chat-panel__input-row">
          <textarea
            ref="inputRef"
            v-model="inputValue"
            class="pet-chat-panel__input"
            placeholder="输入消息..."
            rows="2"
            :disabled="isStreaming"
            @keydown="handleKeydown"
          />
          <button
            type="button"
            class="pet-chat-panel__send"
            :disabled="isStreaming || !inputValue.trim()"
            @click="handleSend"
          >
            发送
          </button>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
/* 面板本体：绝对定位于桌宠上/下方居中，深色玻璃质感 */
.pet-chat-panel {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: min(320px, calc(100vw - 32px));
  min-width: 240px;
  padding: 10px 10px 8px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: rgba(45, 36, 56, 0.96);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-md);
  color: var(--color-text-primary);
  pointer-events: auto;
  z-index: 2;
}

.pet-chat-panel--top {
  bottom: calc(100% + 10px);
}

.pet-chat-panel--bottom {
  top: calc(100% + 10px);
}

.pet-chat-panel--top::after,
.pet-chat-panel--bottom::after {
  content: '';
  position: absolute;
  left: 50%;
  width: 10px;
  height: 10px;
  background: rgba(45, 36, 56, 0.96);
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  transform: translateX(-50%) rotate(45deg);
}

.pet-chat-panel--top::after {
  bottom: -5px;
}

.pet-chat-panel--bottom::after {
  top: -5px;
  transform: translateX(-50%) rotate(225deg);
}

.pet-chat-panel__close {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.pet-chat-panel__close:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.pet-chat-panel__reply {
  min-height: 48px;
  max-height: 160px;
  overflow-y: auto;
  margin: 18px 4px 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--color-border);
}

.pet-chat-panel__reply-segment {
  margin: 0 0 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
}

.pet-chat-panel__reply-segment:last-child {
  margin-bottom: 0;
}

.pet-chat-panel__reply-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
}

.pet-chat-panel__hint {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.pet-chat-panel__typing {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 16px;
}

.pet-chat-panel__typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-text-secondary);
  animation: pet-chat-typing 1.2s infinite ease-in-out;
}

.pet-chat-panel__typing span:nth-child(2) {
  animation-delay: 0.15s;
}

.pet-chat-panel__typing span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes pet-chat-typing {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.pet-chat-panel__input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.pet-chat-panel__input {
  flex: 1;
  min-height: 52px;
  max-height: 96px;
  resize: none;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.18);
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.45;
  font-family: inherit;
}

.pet-chat-panel__input:focus {
  outline: none;
  border-color: rgba(167, 139, 250, 0.6);
}

.pet-chat-panel__input:disabled {
  opacity: 0.6;
}

.pet-chat-panel__send {
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(167, 139, 250, 0.85);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.pet-chat-panel__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pet-chat-panel__login {
  padding: 24px 8px 16px;
  text-align: center;
}

.pet-chat-panel__login p {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.pet-chat-panel__login-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: rgba(167, 139, 250, 0.85);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.pet-chat-panel-enter-active,
.pet-chat-panel-leave-active {
  transition: opacity var(--transition-normal), transform var(--transition-normal);
}

.pet-chat-panel-enter-from,
.pet-chat-panel-leave-to {
  opacity: 0;
}

.pet-chat-panel--top.pet-chat-panel-enter-from,
.pet-chat-panel--top.pet-chat-panel-leave-to {
  transform: translateX(-50%) translateY(8px);
}

.pet-chat-panel--bottom.pet-chat-panel-enter-from,
.pet-chat-panel--bottom.pet-chat-panel-leave-to {
  transform: translateX(-50%) translateY(-8px);
}
</style>
