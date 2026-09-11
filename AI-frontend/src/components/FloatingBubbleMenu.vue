<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Component } from 'vue'
import {
  AppstoreOutlined,
  BookOutlined,
  ExperimentOutlined,
  HomeOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  SettingOutlined,
  MessageOutlined,
  ReadOutlined,
  BugOutlined,
} from '@ant-design/icons-vue'
import { useLoginUserStore } from '@/stores/loginUser'
import { MENU_ITEMS, filterMenuItems, type MenuItemConfig } from '@/config/permission'
import { siteConfig } from '@/config/site'
import { getChatEntryPath } from '@/utils/chatSession'
import { useCapabilitiesStore } from '@/stores/capabilities'

const BUBBLE_SIZE = 56
const ITEM_SIZE = 48
const INNER_ITEM_SIZE = 44
const RING_INNER_RADIUS = 78
const RING_OUTER_RADIUS = 132
const EXPAND_PAD = RING_OUTER_RADIUS + ITEM_SIZE / 2
const ZONE_EXPANDED = BUBBLE_SIZE + EXPAND_PAD * 2
const STORAGE_KEY = 'bubble_menu_position_v2'

const INNER_PATHS = new Set(['/', '/blog', '/lab', '/about'])

interface BubbleMenuItem {
  key: string
  label: string
  path: string
}

interface SavedState {
  x: number
  y: number
}

const router = useRouter()
const loginUserStore = useLoginUserStore()
const capabilitiesStore = useCapabilitiesStore()

const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const isExpanded = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const pointerId = ref<number | null>(null)

const iconByPath: Record<string, Component> = {
  '/': HomeOutlined,
  '/blog': BookOutlined,
  '/lab': ExperimentOutlined,
  '/about': InfoCircleOutlined,
  '/admin/userManage': SettingOutlined,
  '/admin/appManage': SettingOutlined,
  '/admin/blogManage': SettingOutlined,
  '/administrator/study': ReadOutlined,
  '/test': BugOutlined,
  '/chat': MessageOutlined,
}

function flattenMenuItems(items: MenuItemConfig[]): BubbleMenuItem[] {
  const result: BubbleMenuItem[] = []
  for (const item of items) {
    if (item.path) {
      result.push({ key: item.key, label: item.label, path: item.path })
    }
    if (item.children?.length) {
      result.push(...flattenMenuItems(item.children))
    }
  }
  return result
}

const flatMenuItems = computed(() => {
  const user = loginUserStore.loginUser?.id ? loginUserStore.loginUser : null
  return flattenMenuItems(filterMenuItems(MENU_ITEMS, user, (name) => capabilitiesStore.enabled(name)))
})

const innerRingItems = computed(() =>
  flatMenuItems.value.filter((item) => INNER_PATHS.has(item.path)),
)

const outerRingItems = computed(() =>
  flatMenuItems.value.filter((item) => !INNER_PATHS.has(item.path)),
)

const zoneSize = computed(() => (isExpanded.value && !isDragging.value ? ZONE_EXPANDED : BUBBLE_SIZE))
const zoneOffset = computed(() => (zoneSize.value - BUBBLE_SIZE) / 2)

function getIcon(path: string) {
  return iconByPath[path] || LinkOutlined
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getDefaultPosition() {
  const offset = siteConfig.effects.bubbleMenu.defaultOffset
  const bottomGap = siteConfig.effects.bubbleMenu.defaultBottomGap
  return {
    x: window.innerWidth - BUBBLE_SIZE - offset,
    y: window.innerHeight - BUBBLE_SIZE - bottomGap,
  }
}

function clampPosition(pos: { x: number; y: number }) {
  const margin = 12
  return {
    x: clamp(pos.x, margin, window.innerWidth - BUBBLE_SIZE - margin),
    y: clamp(pos.y, margin, window.innerHeight - BUBBLE_SIZE - margin),
  }
}

function loadPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      position.value = getDefaultPosition()
      return
    }
    const saved = JSON.parse(raw) as SavedState
    position.value = clampPosition({ x: saved.x, y: saved.y })
  } catch {
    position.value = getDefaultPosition()
  }
}

function savePosition() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      x: position.value.x,
      y: position.value.y,
    }),
  )
}

function getRingItemStyle(index: number, count: number, radius: number, itemSize: number) {
  if (!count) return {}

  const center = zoneSize.value / 2
  const startAngle = 205
  const endAngle = 335
  const angle = count === 1 ? 270 : startAngle + ((endAngle - startAngle) * index) / (count - 1)
  const rad = (angle * Math.PI) / 180

  return {
    left: `${center + radius * Math.cos(rad) - itemSize / 2}px`,
    top: `${center + radius * Math.sin(rad) - itemSize / 2}px`,
    width: `${itemSize}px`,
    minHeight: `${itemSize}px`,
  }
}

function onZoneEnter() {
  if (!isDragging.value) {
    isExpanded.value = true
  }
}

function onZoneLeave() {
  if (!isDragging.value) {
    isExpanded.value = false
  }
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  pointerId.value = e.pointerId
  isDragging.value = true
  isExpanded.value = false
  dragOffset.value = {
    x: e.clientX - position.value.x,
    y: e.clientY - position.value.y,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value || pointerId.value !== e.pointerId) return
  position.value = clampPosition({
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y,
  })
}

function teardownPointerListeners() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

function onPointerUp(e: PointerEvent) {
  if (pointerId.value !== e.pointerId) return
  isDragging.value = false
  pointerId.value = null
  teardownPointerListeners()
  savePosition()
}

function onItemClick(path: string) {
  router.push(path === '/chat' ? getChatEntryPath() : path)
}

function onResize() {
  position.value = clampPosition(position.value)
  savePosition()
}

onMounted(() => {
  loadPosition()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  teardownPointerListeners()
})
</script>

<template>
  <div
    class="bubble-menu"
    :class="{
      'bubble-menu--dragging': isDragging,
      'bubble-menu--expanded': isExpanded && !isDragging,
    }"
    :style="{
      left: `${position.x - zoneOffset}px`,
      top: `${position.y - zoneOffset}px`,
      width: `${zoneSize}px`,
      height: `${zoneSize}px`,
    }"
  >
    <div
      class="bubble-menu__zone"
      @mouseenter="onZoneEnter"
      @mouseleave="onZoneLeave"
    >
      <Transition name="bubble-ring">
        <div v-if="isExpanded && !isDragging" class="bubble-menu__ring">
          <span class="bubble-menu__orbit bubble-menu__orbit--inner" />
          <span class="bubble-menu__orbit bubble-menu__orbit--outer" />
          <button
            v-for="(item, index) in innerRingItems"
            :key="item.key"
            type="button"
            class="bubble-menu__item bubble-menu__item--inner"
            :style="getRingItemStyle(index, innerRingItems.length, RING_INNER_RADIUS, INNER_ITEM_SIZE)"
            :title="item.label"
            @click.stop="onItemClick(item.path)"
          >
            <component :is="getIcon(item.path)" class="bubble-menu__item-icon" />
            <span class="bubble-menu__item-label">{{ item.label }}</span>
          </button>
          <button
            v-for="(item, index) in outerRingItems"
            :key="item.key"
            type="button"
            class="bubble-menu__item bubble-menu__item--outer"
            :style="getRingItemStyle(index, outerRingItems.length, RING_OUTER_RADIUS, ITEM_SIZE)"
            :title="item.label"
            @click.stop="onItemClick(item.path)"
          >
            <component :is="getIcon(item.path)" class="bubble-menu__item-icon" />
            <span class="bubble-menu__item-label">{{ item.label }}</span>
          </button>
        </div>
      </Transition>

      <button
        type="button"
        class="bubble-menu__trigger"
        aria-label="悬停展开导航，按住拖动"
        @pointerdown="onPointerDown"
      >
        <AppstoreOutlined />
      </button>
    </div>
  </div>
</template>

<style scoped>
.bubble-menu {
  position: fixed;
  z-index: 900;
  touch-action: none;
  user-select: none;
  transition: width var(--transition-normal), height var(--transition-normal), left var(--transition-normal), top var(--transition-normal);
}

.bubble-menu--dragging {
  z-index: 901;
  transition: none;
}

.bubble-menu__zone {
  position: relative;
  width: 100%;
  height: 100%;
}

.bubble-menu__ring {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bubble-menu__orbit {
  position: absolute;
  left: 50%;
  top: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.bubble-menu__orbit--inner {
  width: 156px;
  height: 156px;
}

.bubble-menu__orbit--outer {
  width: 264px;
  height: 264px;
  border-color: rgba(232, 121, 169, 0.15);
}

.bubble-menu__item {
  position: absolute;
  padding: 6px 4px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg-card);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-md);
  color: var(--color-text-primary);
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.bubble-menu__item--inner {
  background: rgba(45, 36, 56, 0.88);
}

.bubble-menu__item--outer {
  background: rgba(45, 36, 56, 0.92);
}

.bubble-menu__item:hover {
  transform: scale(1.08);
  border-color: rgba(232, 121, 169, 0.45);
  box-shadow: var(--shadow-glow);
}

.bubble-menu__item--inner .bubble-menu__item-icon {
  font-size: 15px;
}

.bubble-menu__item-icon {
  font-size: 16px;
  color: var(--color-primary-light);
}

.bubble-menu__item--inner .bubble-menu__item-label {
  font-size: 9px;
  max-width: 40px;
}

.bubble-menu__item-label {
  font-size: 10px;
  line-height: 1.1;
  color: var(--color-text-secondary);
  max-width: 44px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bubble-menu__trigger {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 56px;
  height: 56px;
  border: 1px solid rgba(232, 121, 169, 0.35);
  border-radius: 50%;
  background: var(--gradient-primary);
  color: #fff;
  font-size: 22px;
  cursor: grab;
  box-shadow: var(--shadow-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);
  transition: transform var(--transition-fast), box-shadow var(--transition-normal);
}

.bubble-menu__trigger:active,
.bubble-menu--dragging .bubble-menu__trigger {
  cursor: grabbing;
  transform: translate(-50%, -50%) scale(1.06);
}

.bubble-menu--expanded .bubble-menu__trigger {
  box-shadow: var(--shadow-glow-lg);
}

.bubble-ring-enter-active,
.bubble-ring-leave-active {
  transition: opacity var(--transition-normal), transform var(--transition-normal);
}

.bubble-ring-enter-from,
.bubble-ring-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

@media (max-width: 768px) {
  .bubble-menu__item {
    width: 52px;
    min-height: 52px;
  }

  .bubble-menu__item-label {
    font-size: 11px;
    max-width: 48px;
  }
}
</style>
