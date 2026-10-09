<script setup lang="ts">
/**
 * 学习模块侧边导航栏
 * 上半部分为智能清单（今日/本周/收集箱/已完成）入口，
 * 下半部分为用户自建的学习清单（支持新建、改名换色、删除），
 * 选中状态统一记录在学习上下文的 selection 中，供任务面板读取过滤。
 */
import { inject, ref, type Component } from 'vue'
import { CalendarDays, Inbox, CheckCircle2, Plus, Lock, Pencil, Trash2 } from 'lucide-vue-next'
import { Modal, Form, Input, message } from 'ant-design-vue'
import { studyContextKey } from '@/composables/study/useStudyContext'
import { SMART_VIEWS, LIST_TYPE_INBOX, type SmartViewKey } from '@/constants/study'

const ctx = inject(studyContextKey)!
// 清单新建/编辑弹窗的开关、当前编辑对象（null 为新建）与表单数据
const listModalOpen = ref(false)
const editingList = ref<API.StudyListVO | null>(null)
const listForm = ref({ name: '', color: '#7c9ce0' })

// 智能清单 key 到图标的映射（今日/本周共用日历图标，收集箱、已完成各自区分）
const smartIcons: Record<string, Component> = {
  today: CalendarDays,
  week: CalendarDays,
  inbox: Inbox,
  completed: CheckCircle2,
}

// 判断某个智能清单是否为当前选中视图
function isActiveSmart(key: SmartViewKey) {
  return ctx.selection.value.view === key && ctx.selection.value.view !== 'list'
}

// 判断某个自建清单是否为当前选中视图（需同时匹配清单 id）
function isActiveList(list: API.StudyListVO) {
  return ctx.selection.value.view === 'list' && ctx.selection.value.listId === list.id
}

// 切换到智能清单视图（今日/本周/收集箱/已完成）
async function selectSmart(key: SmartViewKey) {
  await ctx.setSelection({ view: key })
}

// 切换到指定自建清单视图
async function selectList(list: API.StudyListVO) {
  if (!list.id) return
  await ctx.setSelection({ view: 'list', listId: list.id, listName: list.name })
}

// 自建清单 = 除“收集箱”外的所有清单（收集箱是系统内置、不可编辑删除）
const customLists = () =>
  ctx.lists.value.filter((l) => l.listType !== LIST_TYPE_INBOX)

// 打开新建清单弹窗：重置表单为默认值
function openAddList() {
  editingList.value = null
  listForm.value = { name: '', color: '#7c9ce0' }
  listModalOpen.value = true
}

// 打开编辑清单弹窗：回填现有名称与颜色；阻止冒泡以免触发清单切换
function openEditList(list: API.StudyListVO, e: Event) {
  e.stopPropagation()
  editingList.value = list
  listForm.value = { name: list.name || '', color: list.color || '#7c9ce0' }
  listModalOpen.value = true
}

// 保存清单：名称必填，按编辑/新建分别调用上下文接口，成功后关闭弹窗
async function submitListForm() {
  const name = listForm.value.name.trim()
  if (!name) {
    message.warning('请输入清单名称')
    return
  }
  if (editingList.value?.id) {
    await ctx.updateListFields({
      id: editingList.value.id,
      name,
      color: listForm.value.color,
    })
  } else {
    await ctx.addList(name, listForm.value.color)
  }
  listModalOpen.value = false
}

// 删除清单：收集箱不可删；确认后删除，若删除的正是当前选中的清单则回退到收集箱视图
async function handleDeleteList(list: API.StudyListVO, e: Event) {
  e.stopPropagation()
  if (!list.id) return
  if (list.listType === LIST_TYPE_INBOX) return
  Modal.confirm({
    title: `删除清单「${list.name}」？`,
    content: '清单内任务将移至收集箱',
    okType: 'danger',
    onOk: async () => {
      const ok = await ctx.deleteListById(list.id!)
      if (ok && isActiveList(list)) {
        await selectSmart('inbox')
      }
    },
  })
}
</script>

<template>
  <aside class="study-panel study-panel--sidebar">
    <div class="study-panel__head">清单</div>
    <div class="study-panel__body">
      <div class="study-sidebar__section-label">智能清单</div>
      <!-- 智能清单导航：按固定视图（今日/本周/收集箱/已完成）切换任务过滤 -->
      <button
        v-for="item in SMART_VIEWS"
        :key="item.key"
        type="button"
        class="study-nav-item"
        :class="{ 'study-nav-item--active': isActiveSmart(item.key) }"
        @click="selectSmart(item.key)"
      >
        <component :is="smartIcons[item.key]" :size="16" />
        <span>{{ item.label }}</span>
      </button>

      <div class="study-sidebar__section-label">学习清单</div>
      <!-- 自建清单导航：颜色圆点标识，悬停显示编辑/删除；收集箱带锁图标且不可编辑删除 -->
      <button
        v-for="list in customLists()"
        :key="list.id"
        type="button"
        class="study-nav-item"
        :class="{ 'study-nav-item--active': isActiveList(list) }"
        @click="selectList(list)"
      >
        <span class="study-nav-item__dot" :style="{ background: list.color || '#7c9ce0' }" />
        <span>{{ list.name }}</span>
        <Lock v-if="list.listType === LIST_TYPE_INBOX" :size="12" style="opacity: 0.5" />
        <span v-if="list.taskCount" class="study-nav-item__count">{{ list.taskCount }}</span>
        <Pencil
          v-if="list.listType !== LIST_TYPE_INBOX"
          :size="14"
          class="study-list-edit"
          @click="openEditList(list, $event)"
        />
        <Trash2
          v-if="list.listType !== LIST_TYPE_INBOX"
          :size="14"
          class="study-list-delete"
          @click="handleDeleteList(list, $event)"
        />
      </button>

      <div class="study-list-actions">
        <a-button type="dashed" block size="small" class="study-add-list-btn" @click="openAddList">
          <Plus :size="15" class="study-add-list-icon" /> 新建清单
        </a-button>
      </div>
    </div>

    <!-- 新建/编辑清单弹窗：名称 + 颜色两项 -->
    <a-modal
      v-model:open="listModalOpen"
      :title="editingList ? '编辑清单' : '新建清单'"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitListForm"
    >
      <a-form layout="vertical">
        <a-form-item label="名称">
          <a-input v-model:value="listForm.name" placeholder="例如：Vue 学习" />
        </a-form-item>
        <a-form-item label="颜色">
          <input v-model="listForm.color" type="color" class="study-color-input" />
        </a-form-item>
      </a-form>
    </a-modal>
  </aside>
</template>

<style scoped>
.study-list-edit,
.study-list-delete {
  margin-left: 4px;
  opacity: 0.4;
  flex-shrink: 0;
  transition: transform var(--transition-fast), opacity var(--transition-fast), color var(--transition-fast);
}

.study-list-edit:hover {
  opacity: 1;
  color: #e879a9;
  transform: rotate(-12deg) scale(1.1);
}

.study-list-delete:hover {
  opacity: 1;
  color: #e879a9;
  transform: scale(1.12);
}

.study-add-list-icon {
  vertical-align: -0.16em;
  transition: transform var(--transition-fast);
}
.study-add-list-btn:hover .study-add-list-icon {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .study-list-edit,
  .study-list-delete,
  .study-add-list-icon {
    transition: none;
  }
  .study-list-edit:hover,
  .study-list-delete:hover,
  .study-add-list-btn:hover .study-add-list-icon {
    transform: none;
  }
}

.study-color-input {
  width: 48px;
  height: 32px;
  border: none;
  cursor: pointer;
  background: transparent;
}
</style>
