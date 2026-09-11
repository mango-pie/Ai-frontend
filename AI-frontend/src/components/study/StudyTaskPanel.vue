<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { SyncOutlined } from '@ant-design/icons-vue'
import { studyContextKey } from '@/composables/study/useStudyContext'
import { getViewTitle } from '@/constants/study'
import { useCapabilitiesStore } from '@/stores/capabilities'
import StudyQuickAdd from './StudyQuickAdd.vue'
import StudyTaskItem from './StudyTaskItem.vue'

const ctx = inject(studyContextKey)!
const capabilitiesStore = useCapabilitiesStore()
const blogEnabled = computed(() => capabilitiesStore.enabled('blog'))

const viewTitle = computed(() =>
  getViewTitle(ctx.selection.value.view, ctx.selection.value.listName),
)

// React to Agent tool uiAction (e.g. create_study_task → study_today / study_task_list)
if (typeof window !== 'undefined') {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.type === 'refresh' && detail.module && detail.module.startsWith('study')) {
      // Refresh the task list view
      ;(ctx as any).refreshTasks?.() || (ctx as any).tasksState?.refreshTasks?.() || Promise.resolve()
    }
  }
  window.addEventListener('agent-ui-action', handler)
  // Note: for a real app we'd remove on unmount; here the panel lives for the session.
}

async function onQuickAdd(title: string) {
  await ctx.addTaskQuick(title)
}

async function onToggle(task: API.StudyTaskVO, done: boolean) {
  await ctx.toggleTaskDone(task, done)
}

const syncing = ref(false)

async function onSyncBlog() {
  syncing.value = true
  try {
    await ctx.syncBlogDrafts()
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <main class="study-panel study-panel--main">
    <div class="study-task-toolbar">
      <h2 class="study-task-toolbar__title">{{ viewTitle }}</h2>
      <a-button v-if="blogEnabled" size="small" :loading="syncing" @click="onSyncBlog">
        <SyncOutlined /> 同步博客草稿
      </a-button>
    </div>

    <StudyQuickAdd @submit="onQuickAdd" />

    <a-spin :spinning="ctx.tasksLoading.value">
      <div v-if="ctx.tasks.value.length" class="study-task-list">
        <StudyTaskItem
          v-for="task in ctx.tasks.value"
          :key="task.id"
          :task="task"
          @toggle="(done) => onToggle(task, done)"
          @open="ctx.openTaskDetail(task)"
        />
      </div>
      <div v-else-if="!ctx.tasksLoading.value" class="study-empty">
        暂无任务，在上方输入框添加一条吧
      </div>
    </a-spin>
  </main>
</template>
