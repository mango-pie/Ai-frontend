<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
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

function resolveEnableMode(): PetEnableMode {
  if (!cfg.enabled) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'static'
  if (!cfg.showOnMobile && window.matchMedia('(pointer: coarse)').matches) return false
  return 'full'
}

const enableMode = ref<PetEnableMode>(resolveEnableMode())

const speechText = ref('')
const speechVisible = ref(false)
const lastLine = ref('')
const chatPanelVisible = ref(false)
const hitboxRef = ref<HTMLElement | null>(null)

function showLine(line: string) {
  if (!cfg.dialogueEnabled || chatPanelVisible.value) return
  speechText.value = line
  speechVisible.value = true
}

const engine = usePetEngine({
  petSize,
  getMode: () => enableMode.value || 'static',
  onRouteLine: showLine,
})

const { position, viewModel } = engine
const petAiChat = usePetAiChat()

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

const shellStyle = computed(() => ({
  transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
  zIndex: PET_Z_INDEX,
}))

const chatPlacement = computed(() => (position.value.y < 180 ? 'bottom' : 'top'))

const isLoggedIn = computed(() => Boolean(loginUserStore.loginUser.id))
const chatEnabled = computed(() => useCapabilitiesStore().enabled('chat'))

const renderer = computed(() => cfg.renderer)

function onAnimationComplete(state: PetState) {
  engine.onAnimationComplete(state)
}

function toggleChatPanel() {
  if (!chatEnabled.value) return
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
  if (!enableMode.value) return
  engine.mount()
})

onUnmounted(() => {
  engine.unmount()
  pointer.unmount()
})
</script>

<template>
  <div
    v-if="enableMode"
    class="pet-dango"
    :style="shellStyle"
    aria-hidden="true"
  >
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
      <PetChatPanel
        v-if="chatEnabled"
        :visible="chatPanelVisible"
        :placement="chatPlacement"
        :logged-in="isLoggedIn"
        :chat="petAiChat"
        :anchor-el="hitboxRef"
        @close="closeChatPanel"
        @login="goLogin"
      />
      <PetSpeechBubble :text="speechText" :visible="speechVisible && !chatPanelVisible" />
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
.pet-dango {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  will-change: transform;
  overflow: visible;
}

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
