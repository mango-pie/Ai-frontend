<script setup lang="ts">
/**
 * 领域知识树 — 左侧目录面板
 * L1 支持折叠/展开 L2；编辑模式悬停显示操作按钮；空枝有独立补学入口
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  FolderTree,
  Folder,
  FolderOpen,
  GitBranch,
  Leaf,
  Pencil,
  Trash2,
  Combine,
  Plus,
  Search,
  ChevronRight,
} from 'lucide-vue-next'
import type { LearningBranchTreeNode } from '@/api/learning.types'
import InlineEdit from './InlineEdit.vue'

type Props = {
  loading?: boolean
  domainName: string
  branches: LearningBranchTreeNode[]
  selectedBranchId: number | string | null
  snapshotTruncated?: boolean
  snapshotMessage?: string
  editMode?: boolean
  createL1Requested?: boolean
}

type Emits = {
  'update:selected-branch-id': [branchId: number | string | null]
  'learn-empty': [payload: { branchId: number | string; branchTitle: string }]
  'rename-branch': [branchId: number | string, title: string]
  'delete-branch': [branchId: number | string]
  'merge-branch': [sourceBranchId: number | string]
  'create-l1-branch': [title: string]
  'create-l2-branch': [parentBranchId: number | string, title: string]
  'update:createL1Requested': [value: boolean]
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  selectedBranchId: null,
  snapshotTruncated: false,
  editMode: false,
  createL1Requested: false,
})

const emit = defineEmits<Emits>()

/** 一级枝列表（L1 主题），L2 子枝通过 childrenOf 按需取 */
const l1Branches = computed(() => props.branches.filter((b) => b.depth === 1))

/** 取某 L1 枝下的全部 L2 子枝（id 统一转字符串比较，兼容 number/string） */
function childrenOf(parentId: number | string) {
  return props.branches.filter(
    (b) => b.depth === 2 && String(b.parentBranchId) === String(parentId),
  )
}

// ── expand / collapse ──
const expandedIds = reactive(new Set<string>())

function toggleExpand(branchId: number | string) {
  const key = String(branchId)
  if (expandedIds.has(key)) {
    expandedIds.delete(key)
  } else {
    expandedIds.add(key)
  }
}

function isExpanded(branchId: number | string) {
  return expandedIds.has(String(branchId))
}

// 首次加载时展开所有有子枝的 L1，方便一眼看出树层级
watch(
  () => props.branches,
  (list) => {
    if (!list.length || expandedIds.size) return
    for (const b of list) {
      if (b.depth === 1 && childrenOf(b.id).length > 0) {
        expandedIds.add(String(b.id))
      }
    }
    // 若没有任何子枝，至少展开第一个 L1（空枝 CTA）
    if (!expandedIds.size) {
      const firstL1 = list.find((b) => b.depth === 1)
      if (firstL1) expandedIds.add(String(firstL1.id))
    }
  },
  { immediate: true },
)

// ── selection ──
/** 选中枝：同步给父组件；带子枝时自动展开，减少一次点击 */
function onSelect(branch: LearningBranchTreeNode) {
  emit('update:selected-branch-id', branch.id)
  // auto-expand when selecting a branch that has children
  if (childrenOf(branch.id).length > 0) {
    expandedIds.add(String(branch.id))
  }
}

/** 空枝"补学"入口：选中该枝并请父层发起 AI 搜索文章 */
function onLearnEmpty(branch: LearningBranchTreeNode) {
  emit('learn-empty', { branchId: branch.id, branchTitle: branch.title })
  emit('update:selected-branch-id', branch.id)
}

// ── inline rename ──
/** 当前正在改名的枝 id（字符串化）与编辑框初始标题；为 null 表示未在改名 */
const renamingId = ref<string | null>(null)
const renamingTitle = ref('')

/** 进入改名态：记录目标枝并把原标题填入输入框 */
function startRename(branch: LearningBranchTreeNode) {
  renamingId.value = String(branch.id)
  renamingTitle.value = branch.title
}

/** 确认改名：先做同级重名校验，通过后才把新标题抛给父组件提交 */
function confirmRename(title: string) {
  if (renamingId.value == null) return
  const branch = props.branches.find((b) => String(b.id) === renamingId.value)
  const parentId = branch?.parentBranchId ?? 0
  if (isSiblingDuplicate(title, parentId, renamingId.value)) {
    message.warning('同级已存在同名枝')
    return
  }
  emit('rename-branch', renamingId.value, title)
  renamingId.value = null
  renamingTitle.value = ''
}

function cancelRename() {
  renamingId.value = null
  renamingTitle.value = ''
}

/** 检查同级枝名是否冲突（trim + 忽略大小写） */
function isSiblingDuplicate(title: string, parentBranchId: number | string, excludeId?: number | string): boolean {
  const norm = title.trim().toLowerCase()
  return props.branches.some(
    (b) =>
      String(b.parentBranchId) === String(parentBranchId) &&
      b.title.trim().toLowerCase() === norm &&
      (excludeId == null || String(b.id) !== String(excludeId)),
  )
}

// ── inline create L1 ──
/** 是否正在新建 L1 枝（编辑模式行内输入） */
const creatingL1 = ref(false)

/** 打开新建 L1 的行内输入框 */
function startCreateL1() {
  creatingL1.value = true
}

/** 确认新建 L1：与根级（parentBranchId=0）现有枝查重后抛出创建事件 */
function confirmCreateL1(title: string) {
  if (isSiblingDuplicate(title, 0)) {
    message.warning('同级已存在同名枝')
    return
  }
  creatingL1.value = false
  emit('update:createL1Requested', false)
  emit('create-l1-branch', title)
}

function cancelCreateL1() {
  creatingL1.value = false
  emit('update:createL1Requested', false)
}

/** 外部（如父组件工具栏"新建主题"按钮）请求打开新建 L1 输入框 */
watch(
  () => props.createL1Requested,
  (v) => {
    if (v) startCreateL1()
  },
)

// ── keyboard nav ──
/** 上下方向键在可见树行之间移动焦点并触发选中，实现无鼠标导航 */
function onTreeKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const rows = Array.from(
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.tree-row[tabindex]'),
  )
  const idx = rows.indexOf(e.target as HTMLElement)
  const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
  const nextRow = rows[nextIdx]
  if (nextRow) {
    nextRow.focus()
    nextRow.click()
  }
}

// ── inline create L2 ──
/** 正在新建 L2 子枝的父枝 id；为 null 表示未在创建 */
const creatingL2Parent = ref<string | null>(null)

/** 在指定父枝下新建子枝：记录父枝并确保其处于展开状态 */
function startCreateL2(parentId: number | string) {
  creatingL2Parent.value = String(parentId)
  expandedIds.add(String(parentId))
}

/** 确认新建子枝：校验父枝存在、标题非空、同级不重名，再抛出创建事件 */
function confirmCreateL2(title: string) {
  const parentId = creatingL2Parent.value
  if (parentId == null || parentId === '' || parentId === '0') {
    message.error('缺少父枝，无法创建子枝')
    return
  }
  const trimmed = title.trim()
  if (!trimmed) {
    message.warning('请填写子枝标题')
    return
  }
  if (isSiblingDuplicate(trimmed, parentId)) {
    message.warning('同级已存在同名枝')
    return
  }
  // 先清状态再 emit，避免 blur 二次确认
  creatingL2Parent.value = null
  emit('create-l2-branch', parentId, trimmed)
}

function cancelCreateL2() {
  creatingL2Parent.value = null
}

// ── context menu ──
/** 右键菜单状态：显示位置（已 clamp 在视口内）与目标枝 */
interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  branch: LearningBranchTreeNode | null
}

const ctxMenu = reactive<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  branch: null,
})

function onContextMenu(e: MouseEvent, branch: LearningBranchTreeNode) {
  e.preventDefault()
  e.stopPropagation()
  // clamp position within viewport
  const menuW = 160
  const menuH = 180
  ctxMenu.x = Math.min(e.clientX, window.innerWidth - menuW - 8)
  ctxMenu.y = Math.min(e.clientY, window.innerHeight - menuH - 8)
  ctxMenu.branch = branch
  ctxMenu.visible = true
}

function closeContextMenu() {
  ctxMenu.visible = false
  ctxMenu.branch = null
}

/** 右键菜单动作分发：改名/加子枝/合并/删除（有叶的枝禁止删除） */
function ctxAction(action: 'rename' | 'add-child' | 'merge' | 'delete') {
  if (!ctxMenu.branch) return
  const b = ctxMenu.branch
  closeContextMenu()
  switch (action) {
    case 'rename':
      startRename(b)
      break
    case 'add-child':
      if (b.depth === 1) {
        // 右键添加子枝不依赖编辑模式；展开后显示行内输入
        startCreateL2(b.id)
      }
      break
    case 'merge':
      emit('merge-branch', b.id)
      break
    case 'delete':
      if (b.leafCount === 0) emit('delete-branch', b.id)
      else message.warning('有叶枝不可删，请先移叶或取消挂载')
      break
  }
}

/** 全局点击关闭菜单：点击菜单自身除外（由菜单上的 @click.stop 兜底） */
function onGlobalClick(e: MouseEvent) {
  if (!ctxMenu.visible) return
  const t = e.target as HTMLElement | null
  if (t?.closest?.('.tree-ctx-menu')) return
  closeContextMenu()
}

/** Esc 关闭右键菜单 */
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ctxMenu.visible) closeContextMenu()
}

onMounted(() => {
  // 用 bubble 阶段，避免 capture 抢在菜单按钮 click 之前关掉菜单
  document.addEventListener('click', onGlobalClick)
  document.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick)
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="domain-tree" :class="{ 'domain-tree--editing': editMode }">
    <!-- header -->
    <div class="domain-tree__header">
      <div class="domain-tree__domain-name">
        <span class="domain-tree__dom mono">DOMAIN · {{ (domainName || '领域').toUpperCase() }}</span>
      </div>
      <span
        v-if="branches.length"
        class="domain-tree__summary"
      >{{ l1Branches.length }} 主题</span>
    </div>

    <!-- snapshot warning -->
    <div v-if="snapshotTruncated" class="domain-tree__snapshot-warn" :title="snapshotMessage">
      ⚠ 枝过多，建议整理
    </div>

    <!-- loading -->
    <div v-if="loading" class="domain-tree__list" aria-label="加载中">
      <div v-for="i in (branches.length || 4)" :key="i" class="u-skeleton-shimmer" style="height: 32px" />
    </div>

    <!-- empty tree -->
    <div v-else-if="!branches.length && !editMode" class="domain-tree__empty">
      <FolderTree :size="28" :stroke-width="1" style="opacity: 0.3" />
      <p>还没有枝</p>
      <p class="domain-tree__empty-hint">编辑树 或 通过提问来创建第一个主题</p>
    </div>

    <div v-else class="domain-tree__list" aria-label="领域树" @keydown="onTreeKeydown">
      <!-- inline create L1 -->
      <div v-if="editMode && creatingL1" class="domain-tree__inline-create domain-tree__inline-create--l1">
        <InlineEdit
          model-value=""
          placeholder="新建 L1 枝标题"
          @confirm="confirmCreateL1"
          @cancel="cancelCreateL1"
        />
      </div>

      <template v-for="l1 in l1Branches" :key="l1.id">
        <!-- ====== L1 row ====== -->
        <div
          v-if="String(l1.id) !== renamingId"
          class="tree-row tree-row--l1"
          :class="{
            'tree-row--active': String(l1.id) === String(selectedBranchId),
            'tree-row--empty': l1.leafCount === 0,
          }"
          role="treeitem"
          :aria-selected="String(l1.id) === String(selectedBranchId)"
          tabindex="0"
          @click="onSelect(l1)"
          @keydown.enter.prevent="onSelect(l1)"
          @dblclick="editMode && startRename(l1)"
          @contextmenu="onContextMenu($event, l1)"
        >
          <!-- chevron -->
          <button
            v-if="childrenOf(l1.id).length > 0"
            class="tree-chevron"
            :class="{ 'tree-chevron--open': isExpanded(l1.id) }"
            type="button"
            :aria-label="isExpanded(l1.id) ? '折叠子枝' : '展开子枝'"
            @click.stop="toggleExpand(l1.id)"
          >
            <ChevronRight :size="15" :stroke-width="2.5" />
          </button>
          <span v-else class="tree-chevron tree-chevron--spacer" aria-hidden="true" />

          <!-- icon：L1 = 文件夹 / 空枝 = 分叉 -->
          <span
            class="tree-node-icon tree-node-icon--l1"
            :class="{
              'tree-node-icon--dim': l1.leafCount === 0,
              'tree-node-icon--open': isExpanded(l1.id) && childrenOf(l1.id).length > 0,
            }"
          >
            <GitBranch v-if="l1.leafCount === 0 && childrenOf(l1.id).length === 0" :size="15" :stroke-width="2" />
            <FolderOpen v-else-if="isExpanded(l1.id) && childrenOf(l1.id).length > 0" :size="15" :stroke-width="2" />
            <Folder v-else :size="15" :stroke-width="2" />
          </span>

          <!-- title + meta -->
          <div class="tree-row__body">
            <span class="tree-row__title">{{ l1.title }}</span>
            <span v-if="l1.leafCount > 0" class="tree-row__badge">{{ l1.leafCount }}</span>
            <span v-else class="tree-row__tag tree-row__tag--empty">空</span>
          </div>

          <!-- edit actions (hover visible) -->
          <div v-if="editMode" class="tree-actions" @click.stop>
            <button type="button" class="tree-action-btn" title="添加子枝" @click="startCreateL2(l1.id)">
              <Plus :size="13" />
            </button>
            <button type="button" class="tree-action-btn" title="改名" @click="startRename(l1)">
              <Pencil :size="13" />
            </button>
            <button
              v-if="l1.leafCount === 0"
              type="button"
              class="tree-action-btn tree-action-btn--danger"
              title="删除"
              @click="emit('delete-branch', l1.id)"
            >
              <Trash2 :size="13" />
            </button>
            <button type="button" class="tree-action-btn" title="合并" @click="emit('merge-branch', l1.id)">
              <Combine :size="13" />
            </button>
          </div>
        </div>

        <!-- L1 rename inline -->
        <div v-else class="domain-tree__inline-rename domain-tree__inline-rename--l1">
          <InlineEdit
            :model-value="renamingTitle"
            @confirm="confirmRename"
            @cancel="cancelRename"
          />
        </div>

        <!-- Empty L1 CTA (shown when expanded and leafCount is 0) -->
        <div
          v-if="isExpanded(l1.id) && l1.leafCount === 0"
          class="tree-empty-cta"
          role="button"
          tabindex="0"
          @click="onLearnEmpty(l1)"
          @keydown.enter.prevent="onLearnEmpty(l1)"
        >
          <Search :size="12" />
          还没学 · 去搜一篇
        </div>

        <!-- ====== L2 children / 新建子枝 ====== -->
        <Transition name="tree-slide">
          <div
            v-if="isExpanded(l1.id) && (childrenOf(l1.id).length > 0 || creatingL2Parent === String(l1.id))"
            class="tree-l2-group"
          >
            <template v-for="l2 in childrenOf(l1.id)" :key="l2.id">
              <div
                v-if="String(l2.id) !== renamingId"
                class="tree-row tree-row--l2"
                :class="{
                  'tree-row--active': String(l2.id) === String(selectedBranchId),
                }"
                role="treeitem"
                :aria-selected="String(l2.id) === String(selectedBranchId)"
                tabindex="0"
                @click="onSelect(l2)"
                @keydown.enter.prevent="onSelect(l2)"
                @dblclick="editMode && startRename(l2)"
                @contextmenu="onContextMenu($event, l2)"
              >
                <span class="tree-guide" aria-hidden="true" />
                <span class="tree-node-icon tree-node-icon--l2">
                  <Leaf :size="13" :stroke-width="2" />
                </span>
                <div class="tree-row__body">
                  <span class="tree-row__title">{{ l2.title }}</span>
                  <span v-if="l2.leafCount > 0" class="tree-row__badge tree-row__badge--l2">{{ l2.leafCount }}</span>
                </div>
                <div v-if="editMode" class="tree-actions" @click.stop>
                  <button type="button" class="tree-action-btn" title="改名" @click="startRename(l2)">
                    <Pencil :size="13" />
                  </button>
                  <button
                    v-if="l2.leafCount === 0"
                    type="button"
                    class="tree-action-btn tree-action-btn--danger"
                    title="删除"
                    @click="emit('delete-branch', l2.id)"
                  >
                    <Trash2 :size="13" />
                  </button>
                  <button type="button" class="tree-action-btn" title="合并" @click="emit('merge-branch', l2.id)">
                    <Combine :size="13" />
                  </button>
                </div>
              </div>
              <div v-else class="domain-tree__inline-rename domain-tree__inline-rename--l2">
                <InlineEdit
                  :model-value="renamingTitle"
                  @confirm="confirmRename"
                  @cancel="cancelRename"
                />
              </div>
            </template>

            <!-- inline create L2：右键「添加子枝」或编辑模式均可 -->
            <div
              v-if="creatingL2Parent === String(l1.id)"
              class="domain-tree__inline-create domain-tree__inline-create--l2"
            >
              <span class="tree-guide" aria-hidden="true" />
              <InlineEdit
                model-value=""
                placeholder="新建子枝标题"
                @confirm="confirmCreateL2"
                @cancel="cancelCreateL2"
              />
            </div>
          </div>
        </Transition>
      </template>
    </div>

    <!-- context menu -->
    <Teleport to="body">
      <Transition name="ctx-fade">
        <div
          v-if="ctxMenu.visible"
          class="tree-ctx-menu"
          :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
          role="menu"
          @click.stop
        >
          <button class="tree-ctx-menu__item" type="button" @click="ctxAction('rename')">
            <Pencil :size="13" /> 改名
          </button>
          <button
            v-if="ctxMenu.branch?.depth === 1"
            class="tree-ctx-menu__item"
            type="button"
            @click="ctxAction('add-child')"
          >
            <Plus :size="13" /> 添加子枝
          </button>
          <button class="tree-ctx-menu__item" type="button" @click="ctxAction('merge')">
            <Combine :size="13" /> 合并到…
          </button>
          <button
            v-if="ctxMenu.branch?.leafCount === 0"
            class="tree-ctx-menu__item tree-ctx-menu__item--danger"
            type="button"
            @click="ctxAction('delete')"
          >
            <Trash2 :size="13" /> 删除空枝
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ========== root ========== */
.domain-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.domain-tree--editing {
  border: 1px dashed var(--ld-color-primary-muted, rgba(184, 164, 201, 0.35));
  border-radius: var(--ld-radius-md, 10px);
  background: var(--ld-color-primary-subtle, rgba(184, 164, 201, 0.04));
  padding: 6px;
}

/* ========== header ========== */
.domain-tree__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
  padding: 0 2px 10px;
  margin-bottom: 2px;
  border-bottom: 1.5px dashed color-mix(in srgb, var(--room, #9b8ce8) 22%, transparent);
}

.domain-tree__domain-name {
  margin: 0;
  min-width: 0;
}

.domain-tree__dom {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--ink-faint, #a5acc4);
}

.domain-tree__root-icon {
  color: var(--room, #9b8ce8);
  flex-shrink: 0;
}

.domain-tree__summary {
  flex: none;
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--ink-faint, #a5acc4);
  font-variant-numeric: tabular-nums;
}

/* ========== snapshot warning ========== */
.domain-tree__snapshot-warn {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.2);
  font-size: 0.75rem;
  color: #fbbf24;
}

/* ========== list ========== */
.domain-tree__list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

/* ========== empty tree ========== */
.domain-tree__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ld-color-text-tertiary, #8a7d9a);
  font-size: 0.875rem;
  text-align: center;
  padding: 20px;
}

.domain-tree__empty-hint {
  font-size: 0.75rem;
  opacity: 0.7;
}

/* ========== tree row (shared) ========== */
.tree-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px 7px 4px;
  border-radius: 10px;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
  user-select: none;
}

.tree-row:hover {
  background: rgba(255, 255, 255, 0.72);
}

.tree-row:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--room, #9b8ce8) 55%, transparent);
  outline-offset: 1px;
}

.tree-row--active {
  background: #fff;
  border-color: color-mix(in srgb, var(--room, #9b8ce8) 28%, transparent);
  box-shadow: 0 1px 0 rgba(96, 116, 168, 0.14), 0 4px 14px rgba(96, 116, 168, 0.1);
}

.tree-row--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--room, #9b8ce8);
}

/* L1 specific */
.tree-row--l1 {
  font-weight: 600;
  min-height: 36px;
  color: var(--ink, #4c5570);
}

.tree-row--l1 .tree-row__title {
  font-size: 13px;
  color: var(--ink, #4c5570);
}

/* L2 group + connecting spine */
.tree-l2-group {
  position: relative;
  margin: 2px 0 6px 17px;
  padding-left: 14px;
}

.tree-l2-group::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 10px;
  width: 1.5px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--room, #9b8ce8) 38%, transparent);
}

.tree-row--l2 {
  position: relative;
  font-weight: 400;
  margin-left: 0;
  min-height: 32px;
  padding-left: 2px;
}

.tree-row--l2 .tree-row__title {
  font-size: 12px;
  color: var(--ink-soft, #7a83a0);
}

.tree-row--l2.tree-row--active .tree-row__title {
  color: var(--ink, #4c5570);
}

/* L2 elbow connector */
.tree-guide {
  position: absolute;
  left: -14px;
  top: 50%;
  width: 12px;
  height: 1.5px;
  background: color-mix(in srgb, var(--room, #9b8ce8) 38%, transparent);
  pointer-events: none;
}

.tree-row--l2::after,
.tree-row--l2::before {
  display: none;
}

.tree-l2-group > .tree-row--l2:last-child::after {
  display: none;
}

/* Empty branch */
.tree-row--empty .tree-row__title {
  color: var(--ink-faint, #a5acc4);
}

.tree-row--empty {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--room, #9b8ce8) 28%, transparent);
}

/* ========== chevron ========== */
.tree-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--ink-faint, #a5acc4);
  cursor: pointer;
  border-radius: 6px;
  flex-shrink: 0;
  padding: 0;
  transition: color 0.15s ease, background 0.15s ease, transform 0.2s ease;
}

.tree-chevron:hover {
  color: var(--room, #9b8ce8);
  background: color-mix(in srgb, var(--room-soft, #e4dffd) 80%, #fff);
}

.tree-chevron--open {
  color: var(--room, #9b8ce8);
}

.tree-chevron--open :deep(svg) {
  transform: rotate(90deg);
}

.tree-chevron--spacer {
  visibility: hidden;
}

/* ========== node icon ========== */
.tree-node-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  color: var(--room, #9b8ce8);
  background: color-mix(in srgb, var(--room-soft, #e4dffd) 70%, transparent);
}

.tree-node-icon--l1 {
  color: var(--room, #9b8ce8);
}

.tree-node-icon--open {
  background: var(--room, #9b8ce8);
  color: #fff;
}

.tree-node-icon--dim {
  color: var(--ink-faint, #a5acc4);
  background: rgba(255, 255, 255, 0.55);
  border: 1px dashed color-mix(in srgb, var(--room, #9b8ce8) 30%, transparent);
}

.tree-node-icon--l2 {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  color: var(--c-blue, #6aaee8);
  background: #eef2fc;
}

/* ========== body: title + badge ========== */
.tree-row__body {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
}

.tree-row__title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-row__badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  font-family: ui-monospace, Consolas, monospace;
  color: var(--ink-faint, #a5acc4);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 1px 7px;
  line-height: 1.5;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.tree-row__badge--l2 {
  font-size: 9px;
  color: var(--c-blue, #6aaee8);
  background: #eef2fc;
}

.tree-row__tag {
  margin-left: auto;
  font-size: 9px;
  font-weight: 600;
  border-radius: 999px;
  padding: 1px 7px;
  line-height: 1.5;
  flex-shrink: 0;
  letter-spacing: 1px;
}

.tree-row__tag--empty {
  color: var(--room, #9b8ce8);
  background: transparent;
  border: 1px dashed color-mix(in srgb, var(--room, #9b8ce8) 40%, transparent);
}

/* ========== edit actions (hover) ========== */
.tree-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tree-row:hover .tree-actions,
.tree-row:focus-within .tree-actions,
.domain-tree--editing .tree-actions {
  opacity: 1;
}

.tree-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--ld-color-text-tertiary, #8a7d9a);
  border-radius: 5px;
  cursor: pointer;
  padding: 0;
  transition: background 0.12s ease, color 0.12s ease;
}

.tree-action-btn:hover {
  background: var(--ld-color-surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--ld-color-text-primary, #f5f0f8);
}

.tree-action-btn--danger:hover {
  color: var(--ld-color-danger, #ef4444);
  background: rgba(239, 68, 68, 0.12);
}

/* ========== empty branch CTA ========== */
.tree-empty-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 48px;
  padding: 5px 10px;
  font-size: 0.78rem;
  color: var(--ld-color-ai, #7c9ce0);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s ease;
  align-self: flex-start;
}

.tree-empty-cta:hover {
  background: var(--ld-color-ai-20, rgba(124, 156, 224, 0.2));
}

/* ========== inline edit/create ========== */
.domain-tree__inline-rename,
.domain-tree__inline-create {
  padding: 4px 8px;
}

.domain-tree__inline-rename--l2,
.domain-tree__inline-create--l2 {
  position: relative;
  padding-left: 2px;
}

.domain-tree__inline-create--l1 {
  padding-left: 4px;
}

/* ========== slide transition ========== */
.tree-slide-enter-active,
.tree-slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.tree-slide-enter-from,
.tree-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
  max-height: 0;
}

.tree-slide-enter-to,
.tree-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 800px;
}

/* ========== context menu ========== */
.tree-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 158px;
  background: rgba(255, 255, 255, 0.96);
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(70, 80, 130, 0.22);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  backdrop-filter: blur(12px);
}

.tree-ctx-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--ink-soft, #7a83a0);
  font-family: inherit;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease, color 0.1s ease;
}

.tree-ctx-menu__item:hover {
  background: var(--room-soft, #e4dffd);
  color: var(--room, #9b8ce8);
}

.tree-ctx-menu__item--danger:hover {
  background: #fff0f4;
  color: var(--c-sakura, #f490ad);
}

.ctx-fade-enter-active,
.ctx-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.ctx-fade-enter-from,
.ctx-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
