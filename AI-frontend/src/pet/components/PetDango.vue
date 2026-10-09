<!--
  桌宠（PetDango）外壳组件：固定定位、随引擎坐标移动的宠物容器。
  负责组装行为引擎（usePetEngine）、指针交互（usePetPointer）与
  AI 对话（usePetAiChat），按站点配置在 CSS / Sprite / GIF 三种
  渲染器中选择，并管理台词气泡与聊天面板的显隐。
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import { useLoginUserStore } from '@/stores/loginUser'
import { PET_Z_INDEX } from '../constants'
import { pickRandomLine } from '../petLines'
import { usePetEngine } from '../composables/usePetEngine'
import { usePetAiChat } from '../composables/usePetAiChat'
import { usePetPointer } from '../composables/usePetPointer'
import { clampPointToWanderBounds } from '../composables/usePetAvoidance'
import type { PetEnableMode, PetState } from '../types'
import PetSpeechBubble from './PetSpeechBubble.vue'
import PetChatPanel from './PetChatPanel.vue'
import PetRendererCss from './renderers/PetRendererCss.vue'
import PetRendererGif from './renderers/PetRendererGif.vue'
import PetRendererSprite from './renderers/PetRendererSprite.vue'

const cfg = siteConfig.effects.petDango
const petSize = cfg.size
const router = useRouter()
const loginUserStore = useLoginUserStore()

/**
 * 决定桌宠启用模式：
 * 配置关闭 -> 完全禁用；用户偏好“减少动态效果” -> 降级为 static（只展示不行动）；
 * 移动端（粗指针）按配置隐藏，避免遮挡小屏内容。
 */
function resolveEnableMode(): PetEnableMode {
  if (!cfg.enabled) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'static'
  if (!cfg.showOnMobile && window.matchMedia('(pointer: coarse)').matches) return false
  return 'full'
}

const enableMode = ref<PetEnableMode>(resolveEnableMode())

// 台词气泡与聊天面板的 UI 状态
const speechText = ref('')
const speechVisible = ref(false)
const lastLine = ref('')
const chatPanelVisible = ref(false)
const hitboxRef = ref<HTMLElement | null>(null)

/** 显示一句台词气泡；站点关闭台词或聊天面板已打开时不打扰 */
function showLine(line: string) {
  if (!cfg.dialogueEnabled || chatPanelVisible.value) return
  speechText.value = line
  speechVisible.value = true
}

// 行为引擎：状态机 + 移动。static 模式下引擎只渲染快照、不跑主循环
const engine = usePetEngine({
  petSize,
  getMode: () => enableMode.value || 'static',
  onRouteLine: showLine,
})

const { position, viewModel } = engine
const petAiChat = usePetAiChat()

// 指针交互接线：点击 -> react + 不重复的随机台词；拖拽 -> 引擎位置同步（仍钳制在活动区内）
const pointer = usePetPointer({
  petSize,
  getPosition: () => position.value,
  onDragStart: () => engine.setDrag(true),
  onDragEnd: () => engine.setDrag(false),
  onDragMove: (point) => engine.setPosition(clampPointToWanderBounds(point, petSize)),
  onClick: () => {
    engine.setReact()
    const line = pickRandomLine(lastLine.value)
    lastLine.value = line
    showLine(line)
  },
  onLookAt: (point) => engine.setLookAt(point),
  onInteraction: () => engine.touchInteraction(),
})

/** 容器定位：用 transform 移动整个桌宠（走合成层，不触发重排） */
const shellStyle = computed(() => ({
  transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
  zIndex: PET_Z_INDEX,
}))

/** 宠物靠近视口顶部时聊天面板改放下方，避免面板被视口上边缘裁掉 */
const chatPlacement = computed(() => (position.value.y < 180 ? 'bottom' : 'top'))

/** AI 聊天仅对已登录用户开放 */
const isLoggedIn = computed(() => Boolean(loginUserStore.loginUser.id))

const renderer = computed(() => cfg.renderer)

/** 渲染器一次性动画（react）播完的透传 */
function onAnimationComplete(state: PetState) {
  engine.onAnimationComplete(state)
}

function toggleChatPanel() {
  chatPanelVisible.value = !chatPanelVisible.value
}

function closeChatPanel() {
  chatPanelVisible.value = false
}

function goLogin() {
  closeChatPanel()
  router.push('/user/login')
}

onMounted(() => {
  // 只要启用了（static 或 full）都挂载引擎；static 下引擎内部不启动循环
  if (!enableMode.value) return
  engine.mount()
})

onUnmounted(() => {
  engine.unmount()
  pointer.unmount()
})
</script>

<template>
  <!-- 根容器：fixed + transform 定位；纯装饰性角色，对屏幕阅读器隐藏 -->
  <div
    v-if="enableMode"
    class="pet-dango"
    :style="shellStyle"
    aria-hidden="true"
  >
    <!-- 命中区：外壳不拦截鼠标事件，只有这一层接收指针交互；双击呼出聊天面板 -->
    <div
      ref="hitboxRef"
      class="pet-dango__hitbox"
      :style="{ width: `${petSize}px`, height: `${petSize}px` }"
      @pointerdown="pointer.onPointerDown"
      @pointerenter="pointer.onPointerEnter"
      @pointermove="pointer.onPointerMoveOver"
      @pointerleave="pointer.onPointerLeave"
      @dblclick="toggleChatPanel"
    >
      <!-- AI 聊天面板（需登录） -->
      <PetChatPanel
        :visible="chatPanelVisible"
        :placement="chatPlacement"
        :logged-in="isLoggedIn"
        :chat="petAiChat"
        :anchor-el="hitboxRef"
        @close="closeChatPanel"
        @login="goLogin"
      />
      <!-- 台词气泡：聊天面板打开时隐藏，避免叠字 -->
      <PetSpeechBubble :text="speechText" :visible="speechVisible && !chatPanelVisible" />
      <!-- 渲染器三选一：sprite -> gif -> css 兜底，动画完成事件统一回传引擎 -->
      <PetRendererSprite
        v-if="renderer === 'sprite'"
        :model="viewModel"
        :size="petSize"
        @animation-complete="onAnimationComplete"
      />
      <PetRendererGif
        v-else-if="renderer === 'gif'"
        :model="viewModel"
        :size="petSize"
        @animation-complete="onAnimationComplete"
      />
      <PetRendererCss
        v-else
        :model="viewModel"
        :size="petSize"
        @animation-complete="onAnimationComplete"
      />
    </div>
  </div>
</template>

<style scoped>
/* 外壳：只负责定位与层级；will-change 让浏览器为 transform 动画常驻合成层 */
.pet-dango {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  will-change: transform;
  overflow: visible;
}

/* 命中区：恢复鼠标事件；touch-action:none 让触屏拖拽不触发页面滚动 */
.pet-dango__hitbox {
  position: relative;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  user-select: none;
  overflow: visible;
}

.pet-dango__hitbox:active {
  cursor: grabbing;
}
</style>
