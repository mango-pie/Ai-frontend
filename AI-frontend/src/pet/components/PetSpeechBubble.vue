<!--
  桌宠台词气泡：在宠物头顶显示一句台词，3 秒后自动淡出。
  visible 变化或同一打开状态下换台词都会重新计时。
-->
<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  text: string
  visible: boolean
}>()

/** 实际显示状态：由 visible/text 驱动，并带 3s 自动隐藏 */
const show = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** 清理自动隐藏定时器 */
function clearTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

// visible 翻转：关闭或无文本立即隐藏；打开则显示并启动 3s 自动隐藏
watch(
  () => props.visible,
  (visible) => {
    clearTimer()
    if (!visible || !props.text) {
      show.value = false
      return
    }
    show.value = true
    hideTimer = setTimeout(() => {
      show.value = false
      hideTimer = null
    }, 3000)
  },
  { immediate: true },
)

// 面板保持打开时换台词：重新计时，让新台词完整停留 3s
watch(
  () => props.text,
  () => {
    if (!props.visible || !props.text) return
    clearTimer()
    show.value = true
    hideTimer = setTimeout(() => {
      show.value = false
      hideTimer = null
    }, 3000)
  },
)

onUnmounted(clearTimer)
</script>

<template>
  <!-- 过渡：淡入淡出并伴随轻微上移 -->
  <Transition name="pet-bubble">
    <div v-if="show && text" class="pet-speech-bubble">
      {{ text }}
    </div>
  </Transition>
</template>

<style scoped>
/* 气泡：悬于宠物头顶居中；窄视口下收缩宽度；不拦截鼠标事件 */
.pet-speech-bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  width: max-content;
  max-width: min(280px, calc(100vw - 32px));
  min-width: 120px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: rgba(45, 36, 56, 0.94);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-md);
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  white-space: normal;
  word-break: break-word;
  pointer-events: none;
  z-index: 3;
}

/* 指向宠物的下三角（旋转 45deg 的方块，只描两侧边框） */
.pet-speech-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 10px;
  height: 10px;
  background: rgba(45, 36, 56, 0.94);
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  transform: translateX(-50%) rotate(45deg);
}

.pet-bubble-enter-active,
.pet-bubble-leave-active {
  transition: opacity var(--transition-normal), transform var(--transition-normal);
}

.pet-bubble-enter-from,
.pet-bubble-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}
</style>
