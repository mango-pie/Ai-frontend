<script setup lang="ts">
/**
 * SVG 领域树图：根在上，L1 水平展开，L2 挂父下；鼠标微摆
 * 紫罗兰玻璃节点 · 单击选中 · 点空白区由父层关闭
 */
import { computed, onMounted, ref } from 'vue'
import type { LearningBranchTreeNode } from '@/api/learning.types'

type Props = {
  domainName: string
  branches: LearningBranchTreeNode[]
  selectedBranchId: number | string | null
  loading?: boolean
  /** 隐藏内置缩放条（外层 Overlay 已有） */
  hideToolbar?: boolean
}

type Emits = {
  'update:selected-branch-id': [branchId: number | string | null]
  'learn-empty': [payload: { branchId: number | string; branchTitle: string }]
  /** 点击画布空白 */
  'blank-click': []
}

const props = withDefaults(defineProps<Props>(), { loading: false, hideToolbar: false })
const emit = defineEmits<Emits>()

const wrapRef = ref<HTMLElement | null>(null)
/** 鼠标在画布内的归一化坐标（0~1），驱动节点微摆动效 */
const pointer = ref({ x: 0.5, y: 0.2 })
/** 用户系统开启"减少动态效果"时关闭微摆 */
const reduceMotion = ref(false)
/** 用户手动缩放比例（0.7 ~ 1.4） */
const scale = ref(1)

/** 步进缩放：toFixed 消除浮点累加误差 */
function zoomIn() {
  scale.value = Math.min(1.4, +(scale.value + 0.1).toFixed(2))
}
function zoomOut() {
  scale.value = Math.max(0.7, +(scale.value - 0.1).toFixed(2))
}

/** 布局节点：枝数据 + 计算出的画布坐标（x/y）与层级 */
type LayoutNode = {
  id: string
  title: string
  leafCount: number
  depth: 1 | 2
  x: number
  y: number
  branch: LearningBranchTreeNode
}

/** 固定画布尺寸与根节点位置：根居中在上，L1 一排在中间，L2 一排在下方 */
const W = 900
const H = 560
const ROOT = { x: W / 2, y: 56 }

/** 依据 L1 枝数量自动降低整体缩放，避免节点过密互相遮挡 */
const autoScale = computed(() => {
  const n = props.branches.filter((b) => b.depth === 1).length
  if (n <= 6) return 1
  if (n <= 12) return 0.85
  return 0.7
})

const l1List = computed(() => props.branches.filter((b) => b.depth === 1))

/**
 * 计算全部节点的布局坐标：
 * L1 枝等间距排在同一行；其 L2 子枝只展示部分——
 * 父枝被选中时全量展开，否则只保留被选中的子枝 + 前 2 个，控制画面密度。
 */
const layoutNodes = computed(() => {
  const nodes: LayoutNode[] = []
  const l1s = l1List.value
  const n = Math.max(l1s.length, 1)
  const gap = Math.min(160, (W - 120) / n)
  const startX = ROOT.x - ((n - 1) * gap) / 2

  l1s.forEach((b, i) => {
    const x = startX + i * gap
    const y = 200
    nodes.push({
      id: String(b.id),
      title: b.title,
      leafCount: b.leafCount,
      depth: 1,
      x,
      y,
      branch: b,
    })
    const kids = props.branches.filter(
      (c) => c.depth === 2 && String(c.parentBranchId) === String(b.id),
    )
    const selected = String(props.selectedBranchId)
    const parentSelected = selected === String(b.id)
    const showKids = parentSelected
      ? kids
      : kids.filter((c) => String(c.id) === selected).length
        ? kids.filter((c) => String(c.id) === selected)
        : kids.slice(0, 2)

    showKids.forEach((c, j) => {
      const kn = Math.max(showKids.length, 1)
      const kg = Math.min(90, 140 / kn)
      const kx = x - ((kn - 1) * kg) / 2 + j * kg
      nodes.push({
        id: String(c.id),
        title: c.title,
        leafCount: c.leafCount,
        depth: 2,
        x: kx,
        y: 360,
        branch: c,
      })
    })
  })
  return nodes
})

/** 连线集合：根→L1、L1→L2，各生成一条贝塞尔曲线的起止点 */
const edges = computed(() => {
  const list: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []
  for (const node of layoutNodes.value) {
    if (node.depth === 1) {
      list.push({ x1: ROOT.x, y1: ROOT.y + 18, x2: node.x, y2: node.y - 22, key: `r-${node.id}` })
    } else {
      const parent = layoutNodes.value.find(
        (n) => n.depth === 1 && String(n.branch.id) === String(node.branch.parentBranchId),
      )
      if (parent) {
        list.push({
          x1: parent.x,
          y1: parent.y + 18,
          x2: node.x,
          y2: node.y - 18,
          key: `p-${node.id}`,
        })
      }
    }
  }
  return list
})

/** 根据鼠标位置计算节点的微摆变换（朝指针方向轻微平移+旋转），模拟风吹效果 */
function swayAt(x: number, y: number) {
  if (reduceMotion.value) return { transform: 'none', transformOrigin: `${x}px ${y}px` }
  const nx = x / W
  const ny = y / H
  const dx = (pointer.value.x - nx) * 14
  const dy = (pointer.value.y - ny) * 10
  const rot = (pointer.value.x - nx) * 6
  return {
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`,
    transformOrigin: `${x}px ${y}px`,
  }
}

function sway(node: LayoutNode) {
  return swayAt(node.x, node.y)
}

/** 追踪鼠标在画布内的归一化位置，供微摆计算使用 */
function onPointer(e: PointerEvent) {
  const el = wrapRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  pointer.value = {
    x: (e.clientX - rect.left) / Math.max(rect.width, 1),
    y: (e.clientY - rect.top) / Math.max(rect.height, 1),
  }
}

/** 单击节点：同步选中枝到左侧知识树 */
function onSelect(node: LayoutNode) {
  emit('update:selected-branch-id', node.branch.id)
}

/** 双击空枝：触发"补学"流程（选中该枝并请父层引导 AI 搜索） */
function onLearn(node: LayoutNode) {
  if (node.leafCount > 0) return
  emit('learn-empty', { branchId: node.branch.id, branchTitle: node.branch.title })
  emit('update:selected-branch-id', node.branch.id)
}

/** 读取系统"减少动态效果"偏好，据此禁用微摆动画 */
onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <div
    ref="wrapRef"
    class="domain-tree-viz"
    @pointermove="onPointer"
  >
    <div v-if="!hideToolbar" class="domain-tree-viz__toolbar">
      <button type="button" class="domain-tree-viz__zoom-btn" title="缩小" @click="zoomOut">−</button>
      <span class="domain-tree-viz__zoom-label">{{ Math.round(scale * 100) }}%</span>
      <button type="button" class="domain-tree-viz__zoom-btn" title="放大" @click="zoomIn">+</button>
    </div>
    <div v-if="loading" class="domain-tree-viz__loading">加载树图…</div>
    <!-- 画布：总缩放 = 用户手动缩放 × 节点数量自适应缩放 -->
    <div v-else class="domain-tree-viz__canvas" :style="{ transform: `scale(${(scale * autoScale).toFixed(2)})` }">
      <svg
        class="domain-tree-viz__svg"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="`${domainName} 知识树图`"
      >
        <defs>
          <linearGradient id="ld-trunk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#b8a8f0" stop-opacity="0.95" />
            <stop offset="100%" stop-color="#9b8ce8" stop-opacity="0.45" />
          </linearGradient>
          <filter id="ld-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- 空白命中区：点空白返回 -->
        <rect
          class="domain-tree-viz__blank"
          x="0"
          y="0"
          :width="W"
          :height="H"
          fill="transparent"
          @click="emit('blank-click')"
        />

        <path
          v-for="e in edges"
          :key="e.key"
          class="domain-tree-viz__edge"
          :d="`M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}`"
          fill="none"
          stroke="url(#ld-trunk)"
          stroke-width="2.5"
        />

        <g class="domain-tree-viz__root" :style="swayAt(ROOT.x, ROOT.y)" @click.stop>
          <circle :cx="ROOT.x" :cy="ROOT.y" r="28" class="domain-tree-viz__root-circle" />
          <text :x="ROOT.x" :y="ROOT.y + 5" text-anchor="middle" class="domain-tree-viz__root-label">
            {{ domainName || 'Domain' }}
          </text>
        </g>

        <!-- 枝节点循环：单击选中、空枝双击补学；右上角绿色徽标显示已挂笔记数，空枝显示"补学 →"入口 -->
        <g
          v-for="node in layoutNodes"
          :key="node.id"
          class="domain-tree-viz__node"
          :class="{
            'is-active': String(selectedBranchId) === node.id,
            'is-empty': node.leafCount === 0,
          }"
          :style="sway(node)"
          @click.stop="onSelect(node)"
          @dblclick.stop="onLearn(node)"
        >
          <circle
            :cx="node.x"
            :cy="node.y"
            :r="node.depth === 1 ? 22 : 16"
            class="domain-tree-viz__circle"
          />
          <text :x="node.x" :y="node.y + 4" text-anchor="middle" class="domain-tree-viz__label">
            {{ node.title.length > 6 ? node.title.slice(0, 5) + '…' : node.title }}
          </text>
          <circle
            v-if="node.leafCount > 0"
            class="domain-tree-viz__badge-bg"
            :cx="node.x + (node.depth === 1 ? 18 : 14)"
            :cy="node.y - (node.depth === 1 ? 14 : 10)"
            r="9"
          />
          <text
            v-if="node.leafCount > 0"
            :x="node.x + (node.depth === 1 ? 18 : 14)"
            :y="node.y - (node.depth === 1 ? 10.5 : 6.5)"
            text-anchor="middle"
            class="domain-tree-viz__badge"
          >
            {{ node.leafCount }}
          </text>
          <text
            v-else
            :x="node.x"
            :y="node.y + (node.depth === 1 ? 38 : 30)"
            text-anchor="middle"
            class="domain-tree-viz__hint"
            @click.stop="onLearn(node)"
          >
            补学 →
          </text>
        </g>
      </svg>
    </div>
    <p class="domain-tree-viz__tip">单击选中同步左树 · 空枝双击补学 · 点空白关闭</p>
  </div>
</template>

<style scoped>
.domain-tree-viz {
  --viz-ink: #4c5570;
  --viz-ink-soft: #7a83a0;
  --viz-ink-faint: #a5acc4;
  --viz-room: #9b8ce8;
  --viz-room-soft: #e4dffd;
  --viz-mint: #5fc4a5;
  --viz-blue: #6aaee8;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--viz-ink);
}

.domain-tree-viz__toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.domain-tree-viz__zoom-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.85);
  color: var(--viz-ink-soft);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.domain-tree-viz__zoom-btn:hover {
  color: var(--viz-room);
  background: var(--viz-room-soft);
}

.domain-tree-viz__zoom-label {
  min-width: 40px;
  text-align: center;
  font-size: 12px;
  color: var(--viz-ink-faint);
  font-variant-numeric: tabular-nums;
}

.domain-tree-viz__loading {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--viz-ink-faint);
  font-size: 13px;
}

.domain-tree-viz__canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  transition: transform 0.2s cubic-bezier(0.22, 0.8, 0.32, 1);
}

.domain-tree-viz__svg {
  width: 100%;
  height: 100%;
  max-height: 520px;
  overflow: visible;
  cursor: default;
}

.domain-tree-viz__blank {
  cursor: pointer;
}

.domain-tree-viz__edge {
  pointer-events: none;
}

.domain-tree-viz__root-circle {
  fill: color-mix(in srgb, var(--viz-room) 55%, #fff);
  stroke: #fff;
  stroke-width: 2.5;
  filter: drop-shadow(0 4px 12px color-mix(in srgb, var(--viz-room) 35%, transparent));
}

.domain-tree-viz__root-label {
  fill: #fff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  pointer-events: none;
}

.domain-tree-viz__node {
  cursor: pointer;
}

.domain-tree-viz__circle {
  fill: color-mix(in srgb, var(--viz-room-soft) 88%, #fff);
  stroke: color-mix(in srgb, var(--viz-room) 55%, #fff);
  stroke-width: 2;
  transition: fill 0.25s, stroke 0.25s, filter 0.25s;
}

.domain-tree-viz__node:hover .domain-tree-viz__circle {
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--viz-room) 45%, transparent));
  stroke: var(--viz-room);
}

.domain-tree-viz__node.is-active .domain-tree-viz__circle {
  fill: var(--viz-room);
  stroke: #fff;
  stroke-width: 2.5;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--viz-room) 55%, transparent));
}

.domain-tree-viz__node.is-empty .domain-tree-viz__circle {
  fill: rgba(255, 255, 255, 0.72);
  stroke: color-mix(in srgb, var(--viz-ink-faint) 55%, #fff);
  stroke-dasharray: 4 3;
}

.domain-tree-viz__node.is-empty.is-active .domain-tree-viz__circle {
  fill: color-mix(in srgb, var(--viz-room) 70%, #fff);
  stroke: #fff;
  stroke-dasharray: none;
}

.domain-tree-viz__label {
  fill: var(--viz-ink-soft);
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}

.domain-tree-viz__node.is-active .domain-tree-viz__label {
  fill: #fff;
}

.domain-tree-viz__badge-bg {
  fill: var(--viz-mint);
  stroke: #fff;
  stroke-width: 1.5;
  pointer-events: none;
}

.domain-tree-viz__badge {
  fill: #fff;
  font-size: 9px;
  font-weight: 700;
  pointer-events: none;
}

.domain-tree-viz__hint {
  fill: var(--viz-room);
  font-size: 10px;
  letter-spacing: 1px;
  cursor: pointer;
}

.domain-tree-viz__tip {
  flex: none;
  margin: 0;
  padding: 8px 14px 12px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--viz-ink-faint);
}
</style>
