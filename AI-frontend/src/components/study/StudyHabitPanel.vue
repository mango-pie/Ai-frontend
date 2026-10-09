<script setup lang="ts">
/**
 * 学习习惯打卡面板
 * 管理习惯的增删改、每日打卡与打卡月历展示：
 * 每个习惯以卡片形式呈现，支持当日打卡/取消、查看连续打卡天数、
 * 展开月历回顾历史，并通过弹窗表单新建或编辑习惯。
 */
import { inject, ref } from 'vue'
import { Plus, Pencil, Trash2, Flame, Check } from 'lucide-vue-next'
import { Modal, message } from 'ant-design-vue'
import { studyContextKey } from '@/composables/study/useStudyContext'
import StudyHabitCalendar from './StudyHabitCalendar.vue'

// 学习模块共享上下文：提供习惯列表、加载状态及打卡/增删改等操作
const ctx = inject(studyContextKey)!

// 新建/编辑习惯弹窗的开关与当前编辑对象（null 表示新建）
const modalOpen = ref(false)
const editing = ref<API.StudyHabitVO | null>(null)
// 当前展开月历的习惯 id（点击“月历”切换展开/收起）
const expandedId = ref<number>()
// 习惯表单：名称、颜色标识、描述，以及仅前端使用的默认提醒偏好
const form = ref({
  title: '',
  color: '#e879a9',
  description: '',
  /** 仅前端：对应 habit.reminder_enabled_default，不提交后端 */
  reminderEnabled: true,
})

// 打开新建弹窗：重置表单，提醒默认值取自学习设置中的习惯提醒偏好
function openAdd() {
  editing.value = null
  form.value = {
    title: '',
    color: '#e879a9',
    description: '',
    reminderEnabled: ctx.studySettings.value.habitReminderDefault,
  }
  modalOpen.value = true
}

// 打开编辑弹窗：用习惯现有数据回填表单；阻止事件冒泡以免触发卡片展开
function openEdit(habit: API.StudyHabitVO, e: Event) {
  e.stopPropagation()
  editing.value = habit
  form.value = {
    title: habit.title || '',
    color: habit.color || '#e879a9',
    description: habit.description || '',
    reminderEnabled: ctx.studySettings.value.habitReminderDefault,
  }
  modalOpen.value = true
}

// 保存：名称必填校验后按“编辑/新建”分别调用上下文的更新或新增接口，成功后关闭弹窗
async function submit() {
  const title = form.value.title.trim()
  if (!title) {
    message.warning('请输入习惯名称')
    return
  }
  if (editing.value?.id) {
    await ctx.updateHabitFields({
      id: editing.value.id,
      title,
      color: form.value.color,
      description: form.value.description,
    })
  } else {
    await ctx.addHabitItem(title, form.value.color)
  }
  modalOpen.value = false
}

// 删除习惯：二次确认后调用上下文的删除接口
function handleDelete(habit: API.StudyHabitVO) {
  if (!habit.id) return
  Modal.confirm({
    title: `删除习惯「${habit.title}」？`,
    okType: 'danger',
    onOk: () => ctx.deleteHabitById(habit.id!),
  })
}

// 展开/收起某习惯的打卡月历（再次点击同一习惯即收起）
function toggleExpand(id?: number) {
  expandedId.value = expandedId.value === id ? undefined : id
}
</script>

<template>
  <a-spin :spinning="ctx.habitsLoading.value">
    <div class="study-habit-toolbar">
      <a-button size="small" type="dashed" class="habit-add-btn" @click="openAdd">
        <Plus :size="15" class="habit-add-icon" /> 新建习惯
      </a-button>
    </div>

    <div v-if="ctx.habits.value.length" class="study-habit-grid">
      <!-- 习惯卡片：颜色圆点 + 名称，右侧按钮执行当日打卡/取消打卡 -->
      <div v-for="habit in ctx.habits.value" :key="habit.id" class="study-habit-card">
        <div class="study-habit-card__head">
          <span class="study-habit-card__dot" :style="{ background: habit.color || '#e879a9' }" />
          <span class="study-habit-card__title">{{ habit.title }}</span>
          <a-button
            size="small"
            class="habit-check-btn"
            :type="habit.checkedToday ? 'primary' : 'default'"
            @click="ctx.toggleHabitCheck(habit)"
          >
            <component :is="habit.checkedToday ? Check : Flame" :size="14" class="habit-check-icon" />
            {{ habit.checkedToday ? '已打卡' : '打卡' }}
          </a-button>
        </div>
        <div class="study-habit-card__streak">
          连续 <strong>{{ habit.streakCount ?? 0 }}</strong> 天 · 最佳 {{ habit.bestStreak ?? 0 }} 天
        </div>
        <div class="study-habit-card__actions">
          <!-- 卡片操作区：展开月历 / 编辑 / 删除 -->
          <a-button type="link" size="small" @click="toggleExpand(habit.id)">月历</a-button>
          <Pencil :size="15" class="habit-edit-icon" @click="openEdit(habit, $event)" />
          <Trash2 :size="15" class="habit-delete-icon" @click="handleDelete(habit)" />
        </div>
        <!-- 仅当前展开的习惯显示打卡月历 -->
        <StudyHabitCalendar v-if="expandedId === habit.id && habit.id" :habit-id="habit.id" />
      </div>
    </div>
    <div v-else class="study-empty" style="padding: 32px">还没有习惯，创建一个吧</div>

    <!-- 新建/编辑习惯弹窗：标题随编辑状态切换 -->
    <a-modal
      v-model:open="modalOpen"
      :title="editing ? '编辑习惯' : '新建习惯'"
      ok-text="保存"
      @ok="submit"
    >
      <a-form layout="vertical">
        <a-form-item label="名称">
          <a-input v-model:value="form.title" />
        </a-form-item>
        <a-form-item label="描述">
          <a-input v-model:value="form.description" />
        </a-form-item>
        <a-form-item label="颜色">
          <input v-model="form.color" type="color" />
        </a-form-item>
        <!-- 提醒开关仅在新建时出现：该偏好只保存在前端，不随习惯提交后端 -->
        <a-form-item v-if="!editing">
          <a-checkbox v-model:checked="form.reminderEnabled">
            默认开启提醒（仅前端偏好，尚未写入后端）
          </a-checkbox>
        </a-form-item>
      </a-form>
    </a-modal>
  </a-spin>
</template>

<style scoped>
.study-habit-toolbar {
  margin-bottom: 12px;
}

.study-habit-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 14px;
  color: var(--color-text-muted);
  cursor: pointer;
}

.habit-add-icon,
.habit-check-icon {
  vertical-align: -0.16em;
  transition: transform var(--transition-fast);
}
.habit-add-btn:hover .habit-add-icon {
  transform: rotate(90deg);
}
.habit-check-btn:hover .habit-check-icon {
  transform: scale(1.18);
}
.habit-edit-icon,
.habit-delete-icon {
  transition: transform var(--transition-fast), color var(--transition-fast);
}
.habit-edit-icon:hover {
  color: #e879a9;
  transform: rotate(-12deg) scale(1.1);
}
.habit-delete-icon:hover {
  color: #e879a9;
  transform: scale(1.15);
}
@media (prefers-reduced-motion: reduce) {
  .habit-add-icon,
  .habit-check-icon,
  .habit-edit-icon,
  .habit-delete-icon {
    transition: none;
  }
  .habit-add-btn:hover .habit-add-icon,
  .habit-check-btn:hover .habit-check-icon,
  .habit-edit-icon:hover,
  .habit-delete-icon:hover {
    transform: none;
  }
}
</style>
