<script setup lang="ts">
/**
 * 学习任务列表行
 * 展示单条任务：优先级色条、完成勾选、标题，以及“今日/逾期/截止时间/博客草稿/所属清单”等标签。
 * 点击整行打开任务详情抽屉，勾选框切换完成状态（阻止冒泡避免误触打开详情）。
 */
import {
  PRIORITY_MAP,
  TASK_STATUS,
  SOURCE_TYPE_BLOG,
  isTaskOverdue,
  formatStudyDate,
} from '@/constants/study'

defineProps<{
  task: API.StudyTaskVO
}>()

// 上抛交互：切换完成状态 / 点击打开任务详情
const emit = defineEmits<{
  toggle: [done: boolean]
  open: []
}>()

// 取优先级对应的展示色，未配置时透明（色条不显眼）
function priorityColor(priority?: number) {
  return PRIORITY_MAP[priority ?? 0]?.color ?? 'transparent'
}
</script>

<template>
  <!-- 任务行：已完成时整行弱化；点击任意位置打开详情 -->
  <div
    class="study-task-item"
    :class="{ 'study-task-item--done': task.status === TASK_STATUS.DONE }"
    @click="emit('open')"
  >
    <!-- 优先级色条：颜色随任务优先级变化 -->
    <span
      class="study-task-item__priority"
      :style="{ background: priorityColor(task.priority) }"
    />
    <a-checkbox
      :checked="task.status === TASK_STATUS.DONE"
      @click.stop
      @update:checked="(checked: boolean) => emit('toggle', checked)"
    />
    <div class="study-task-item__main">
      <div class="study-task-item__title">{{ task.title }}</div>
      <!-- 元信息标签：按需显示今日、逾期、截止时间、博客草稿来源、所属清单（收集箱除外） -->
      <div class="study-task-item__meta">
        <span v-if="task.isToday === 1" class="study-task-item__tag study-task-item__tag--today">今日</span>
        <span v-if="isTaskOverdue(task)" class="study-task-item__tag study-task-item__tag--overdue">逾期</span>
        <span v-if="task.dueDate" class="study-task-item__tag">{{ formatStudyDate(task.dueDate) }}</span>
        <span v-if="task.sourceType === SOURCE_TYPE_BLOG" class="study-task-item__tag study-task-item__tag--blog">博客草稿</span>
        <span v-if="task.listName && task.listName !== '收集箱'" class="study-task-item__tag">{{ task.listName }}</span>
      </div>
    </div>
  </div>
</template>
