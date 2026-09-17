<script setup lang="ts">
/**
 * FloatingBubbleMenu 悬浮球导航菜单
 * 职责：在页面右下角渲染一个可拖拽的悬浮球，悬停时沿双圈轨道展开快捷导航入口。
 * - 菜单项来源于权限配置（MENU_ITEMS + filterMenuItems），按登录用户与系统能力开关动态过滤
 * - 位置记忆在 localStorage，窗口尺寸变化时自动夹紧在可视区内
 * - 交互约定：悬停展开菜单；按住球体拖动改变位置（拖动期间强制收起菜单）
 */
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
import { useCapabilitiesStore } from '@/stores/capabilities'
import { MENU_ITEMS, filterMenuItems, type MenuItemConfig } from '@/config/permission'
import { siteConfig } from '@/config/site'
import { getChatEntryPath } from '@/utils/chatSession'

// 悬浮球及菜单项的几何尺寸、内外圈半径（单位 px），展开区域需外扩一圈半径加半个 item
const BUBBLE_SIZE = 56
const ITEM_SIZE = 48
const INNER_ITEM_SIZE = 44
const RING_INNER_RADIUS = 78
const RING_OUTER_RADIUS = 132
const EXPAND_PAD = RING_OUTER_RADIUS + ITEM_SIZE / 2
const ZONE_EXPANDED = BUBBLE_SIZE + EXPAND_PAD * 2
// 悬浮球位置持久化到 localStorage 的键名
const STORAGE_KEY = 'bubble_menu_position_v2'

// 内圈固定放这几个高频入口，其余菜单项（含管理后台等）落到外圈
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
const capsStore = useCapabilitiesStore()

// 交互状态：悬浮球位置、是否拖拽中、是否展开、拖拽起点偏移、当前捕获的指针 id
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const isExpanded = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const pointerId = ref<number | null>(null)

// 路由路径 -> 菜单图标组件的映射，未命中的路径兜底为链接图标
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

// 递归拍平树形菜单配置，只保留带 path 的叶子节点（子菜单也展开成独立入口）
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

// 按当前登录用户与能力开关过滤后的全部可用菜单项
const flatMenuItems = computed(() => {
  const user = loginUserStore.loginUser?.id ? loginUserStore.loginUser : null
  return flattenMenuItems(
    filterMenuItems(MENU_ITEMS, user, {
      loaded: capsStore.loaded,
      enabled: capsStore.enabled,
    }),
  )
})

// 内圈：高频核心入口；外圈：其余全部入口
const innerRingItems = computed(() =>
  flatMenuItems.value.filter((item) => INNER_PATHS.has(item.path)),
)

const outerRingItems = computed(() =>
  flatMenuItems.value.filter((item) => !INNER_PATHS.has(item.path)),
)

// 悬浮/展开态下的热区尺寸：展开时需要扩大容器以容纳整圈菜单项；
// 热区始终以悬浮球中心对称放大，故偏移量为尺寸增量的一半
const zoneSize = computed(() => (isExpanded.value && !isDragging.value ? ZONE_EXPANDED : BUBBLE_SIZE))
const zoneOffset = computed(() => (zoneSize.value - BUBBLE_SIZE) / 2)

function getIcon(path: string) {
  return iconByPath[path] || LinkOutlined
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

// 依据站点配置计算悬浮球默认出现的位置（右下角，留出边距）
function getDefaultPosition() {
  const offset = siteConfig.effects.bubbleMenu.defaultOffset
  const bottomGap = siteConfig.effects.bubbleMenu.defaultBottomGap
  return {
    x: window.innerWidth - BUBBLE_SIZE - offset,
    y: window.innerHeight - BUBBLE_SIZE - bottomGap,
  }
}

// 将位置限制在视口内（四周保留 12px 边距），防止球被拖出屏幕
function clampPosition(pos: { x: number; y: number }) {
  const margin = 12
  return {
    x: clamp(pos.x, margin, window.innerWidth - BUBBLE_SIZE - margin),
    y: clamp(pos.y, margin, window.innerHeight - BUBBLE_SIZE - margin),
  }
}

// 从 localStorage 恢复上次位置；无记录或数据损坏时回退到默认位置
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

// 计算菜单项在圆环轨道上的绝对定位：以热区中心为圆心，
// 在 205°~335°（下半弧）范围内均匀分布，避免菜单弹出时遮挡球体上方内容
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

// 悬停进入热区时展开菜单（拖拽中不展开，避免拖动经过时误触发）
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

// 开始拖拽：仅响应鼠标左键/主指针，记录指针与球体的偏移并监听全局指针事件
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

// 结束拖拽：复位状态、解绑全局监听，并把最终位置持久化
function onPointerUp(e: PointerEvent) {
  if (pointerId.value !== e.pointerId) return
  isDragging.value = false
  pointerId.value = null
  teardownPointerListeners()
  savePosition()
}

// 点击菜单项跳转；聊天入口需经由 getChatEntryPath 决定（恢复会话或新建会话）
function onItemClick(path: string) {
  router.push(path === '/chat' ? getChatEntryPath() : path)
}

// 窗口尺寸变化时把球重新夹回视口并保存，防止遗留在可视区域外
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
    <!-- 悬浮/展开热区：展开时容器整体放大以包裹整圈菜单 -->
    <div
      class="bubble-menu__zone"
      @mouseenter="onZoneEnter"
      @mouseleave="onZoneLeave"
    >
      <!-- 展开的环形菜单（拖拽期间强制隐藏），内外两圈轨道按角度定位菜单项 -->
      <Transition name="bubble-ring">
        <div v-if="isExpanded && !isDragging" class="bubble-menu__ring">
          <span class="bubble-menu__orbit bubble-menu__orbit--inner" />
          <span class="bubble-menu__orbit bubble-menu__orbit--outer" />
          <!-- 内圈：高频核心入口 -->
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
          <!-- 外圈：其余全部入口 -->
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

      <!-- 悬浮球本体：按住拖动改变位置 -->
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
