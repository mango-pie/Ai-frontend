<script setup lang="ts">
/**
 * 学习任务清单编辑器（检查项子表单）
 * 用于任务详情中维护一组可勾选的检查项：新增、勾选完成、删除，
 * 本组件只负责收集交互并通过事件上抛，实际数据变更由父组件（任务详情抽屉）完成。
 */
import { ref } from 'vue'
import { Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  items?: API.StudyTaskChecklistVO[]
}>()

// 向父组件上抛的三种操作：新增检查项 / 勾选状态切换 / 删除指定检查项
const emit = defineEmits<{
  add: [title: string]
  toggle: [item: API.StudyTaskChecklistVO, done: boolean]
  delete: [id: number]
}>()

// 新增检查项的输入框内容
const newTitle = ref('')

// 回车提交新检查项：去除首尾空白后为空则忽略，成功后清空输入框
function submitNew() {
  const title = newTitle.value.trim()
  if (!title) return
  emit('add', title)
  newTitle.value = ''
}
</script>

<template>
  <div class="study-checklist">
    <div class="study-sidebar__section-label">检查项</div>
    <!-- 检查项列表：已完成的整行置灰并勾选，行内可切换勾选或删除 -->
    <div
      v-for="item in items"
      :key="item.id"
      class="study-checklist-item"
      :class="{ 'study-checklist-item--done': item.done === 1 }"
    >
      <a-checkbox
        :checked="item.done === 1"
        @update:checked="(checked: boolean) => emit('toggle', item, checked)"
      />
      <span>{{ item.title }}</span>
      <a-button type="link" size="small" danger class="checklist-del-btn" @click="emit('delete', item.id!)">
        <Trash2 :size="14" class="checklist-del-icon" />
      </a-button>
    </div>
    <!-- 底部输入框：回车即追加一条新检查项 -->
    <a-input
      v-model:value="newTitle"
      size="small"
      placeholder="添加检查项…"
      @press-enter="submitNew"
    />
  </div>
</template>

<style scoped>
.study-checklist {
  margin-top: 16px;
}

.checklist-del-icon {
  vertical-align: -0.14em;
  transition: transform var(--transition-fast);
}
.checklist-del-btn:hover .checklist-del-icon {
  transform: scale(1.15);
}
@media (prefers-reduced-motion: reduce) {
  .checklist-del-icon {
    transition: none;
  }
  .checklist-del-btn:hover .checklist-del-icon {
    transform: none;
  }
}
</style>
