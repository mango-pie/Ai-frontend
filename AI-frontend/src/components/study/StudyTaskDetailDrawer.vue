<script setup lang="ts">
/**
 * 学习任务详情抽屉
 * 从右侧滑出，展示并编辑所选任务的标题、备注、所属清单、优先级、
 * 截止时间与“今天要做”标记；各字段失焦/变更即自动保存（无独立保存按钮）。
 * 底部提供任务级检查项编辑、一键开始专注（番茄钟）与删除任务。
 */
import { computed, inject, reactive, watch } from 'vue'
import { Play, Trash2 } from 'lucide-vue-next'
import IconAction from '@/components/ui/IconAction.vue'
import { Modal } from 'ant-design-vue'
import { studyContextKey } from '@/composables/study/useStudyContext'
import { PRIORITY_MAP } from '@/constants/study'
import StudyChecklistEditor from './StudyChecklistEditor.vue'

const ctx = inject(studyContextKey)!

// 抽屉开关：有选中任务即打开；关闭时清理上下文中的选中任务
const open = computed({
  get: () => !!ctx.selectedTask.value,
  set: (v) => {
    if (!v) ctx.closeTaskDetail()
  },
})

// 任务编辑表单：与任务字段一一对应，dueDate 使用 datetime-local 控件格式
const form = reactive({
  title: '',
  content: '',
  priority: 0,
  isToday: false,
  listId: undefined as number | undefined,
  dueDate: '',
})

// 后端 ISO 时间 -> datetime-local 控件所需的 "YYYY-MM-DDTHH:mm" 格式（非法值返回空串）
function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// datetime-local 控件值 -> 后端存储的 "YYYY-MM-DD HH:mm:ss" 格式（空值返回 undefined 表示清除）
function fromDatetimeLocalValue(local: string): string | undefined {
  if (!local) return undefined
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

// 选中任务变化时把任务数据回填进表单（含挂载时立即执行一次）
watch(
  () => ctx.selectedTask.value,
  (task) => {
    if (!task) return
    form.title = task.title || ''
    form.content = task.content || ''
    form.priority = task.priority ?? 0
    form.isToday = task.isToday === 1
    form.listId = task.listId
    form.dueDate = toDatetimeLocalValue(task.dueDate)
  },
  { immediate: true },
)

// 优先级下拉选项（来自常量映射：数值 -> 中文标签）
const priorityOptions = Object.entries(PRIORITY_MAP).map(([value, { label }]) => ({
  value: Number(value),
  label,
}))

// 清单下拉选项：所有学习清单
const listOptions = computed(() =>
  ctx.lists.value.map((l) => ({ value: l.id, label: l.name })),
)

// 保存表单：把当前编辑值整体写回选中的任务（截止时间转换为后端格式）
async function save() {
  const task = ctx.selectedTask.value
  if (!task?.id) return
  await ctx.updateTaskFields({
    id: task.id,
    title: form.title.trim(),
    content: form.content,
    priority: form.priority,
    isToday: form.isToday,
    listId: form.listId,
    dueDate: fromDatetimeLocalValue(form.dueDate),
  })
}

// 删除任务：二次确认后调用上下文的删除接口
function handleDelete() {
  const id = ctx.selectedTask.value?.id
  if (!id) return
  Modal.confirm({
    title: '删除此任务？',
    okType: 'danger',
    onOk: () => ctx.deleteTaskById(id),
  })
}

// 以默认专注时长针对当前任务启动番茄钟，随后关闭抽屉并切到移动端的“专注”页签
async function startFocus() {
  const id = ctx.selectedTask.value?.id
  const minutes = ctx.studySettings.value.focusDefaultMinutes
  await ctx.startFocusSession(id, minutes)
  ctx.closeTaskDetail()
  ctx.mobileTab.value = 'focus'
}
</script>

<template>
  <a-drawer
    v-model:open="open"
    :title="form.title || '任务详情'"
    placement="right"
    width="400"
    class="study-detail-drawer"
  >
    <!-- 任务表单：各字段失焦或变更时即时保存，无需点击保存按钮 -->
    <a-form layout="vertical">
      <a-form-item label="标题">
        <a-input v-model:value="form.title" @blur="save" />
      </a-form-item>
      <a-form-item label="备注">
        <a-textarea v-model:value="form.content" :rows="4" @blur="save" />
      </a-form-item>
      <a-form-item label="清单">
        <a-select v-model:value="form.listId" :options="listOptions" @change="save" />
      </a-form-item>
      <a-form-item label="优先级">
        <a-select v-model:value="form.priority" :options="priorityOptions" @change="save" />
      </a-form-item>
      <a-form-item label="截止日期">
        <input
          v-model="form.dueDate"
          type="datetime-local"
          class="study-datetime-input"
          @change="save"
        />
      </a-form-item>
      <a-form-item>
        <a-checkbox v-model:checked="form.isToday" @change="save">标记为今天要做</a-checkbox>
      </a-form-item>
    </a-form>

    <!-- 检查项子表单：事件直接桥接到上下文的检查项增删改操作 -->
    <StudyChecklistEditor
      v-if="ctx.showChecklist.value"
      :items="ctx.selectedTask.value?.checklistItems"
      @add="(title) => ctx.addChecklistItem(ctx.selectedTask.value!.id!, title)"
      @toggle="(item, done) => ctx.toggleChecklistItem(item, done)"
      @delete="(id) => ctx.deleteChecklistItem(id)"
    />

    <!-- 底部主操作：按设置时长开始专注 / 删除任务 -->
    <div class="study-detail-actions">
      <IconAction
        :icon="Play"
        :label="`开始专注 ${ctx.studySettings.value.focusDefaultMinutes} 分钟`"
        variant="primary"
        block
        motion="pop"
        @click="startFocus"
      />
      <IconAction :icon="Trash2" label="删除任务" variant="danger" block motion="shake" @click="handleDelete" />
    </div>
  </a-drawer>
</template>

<style scoped>
.study-datetime-input {
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-primary);
}

.study-detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}
</style>
