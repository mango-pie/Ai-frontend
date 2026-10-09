<script setup lang="ts">
/**
 * 学习任务主面板
 * 按侧栏选中的视图（智能清单/自建清单）展示任务列表，提供：
 * 视图标题、博客草稿同步（按能力开关显隐）、快速添加任务、勾选完成与打开详情。
 */
import { computed, inject, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { studyContextKey } from '@/composables/study/useStudyContext'
import { getViewTitle } from '@/constants/study'
import { useCapabilitiesStore } from '@/stores/capabilities'
import StudyQuickAdd from './StudyQuickAdd.vue'
import StudyTaskItem from './StudyTaskItem.vue'

const ctx = inject(studyContextKey)!

const capsStore = useCapabilitiesStore()
/** 博客模块开关：关闭时隐藏「同步博客草稿」 */
const blogEnabled = computed(() => !capsStore.loaded || capsStore.enabled('blog'))

// 当前视图标题（如“今日任务”或具体清单名），由选中的视图派生
const viewTitle = computed(() =>
  getViewTitle(ctx.selection.value.view, ctx.selection.value.listName),
)

// React to Agent tool uiAction (e.g. create_study_task → study_today / study_task_list)
// 监听 Agent 工具触发的 UI 事件：学习模块相关动作（如创建任务）后刷新任务列表，
// 保证 AI 助手操作完成后界面即时同步
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

// 快速添加：把输入的标题交给上下文创建任务（默认进收集箱）
async function onQuickAdd(title: string) {
  await ctx.addTaskQuick(title)
}

// 勾选切换：标记任务完成/未完成
async function onToggle(task: API.StudyTaskVO, done: boolean) {
  await ctx.toggleTaskDone(task, done)
}

// 博客草稿同步按钮的加载态
const syncing = ref(false)

// 把博客模块的草稿文章同步为学习任务，期间按钮转圈防止重复触发
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
      <!-- 博客草稿同步入口：仅在后端开启 blog 能力时显示 -->
      <a-button v-if="blogEnabled" size="small" class="study-sync-btn" :loading="syncing" @click="onSyncBlog">
        <RefreshCw :size="15" class="study-sync-icon" /> 同步博客草稿
      </a-button>
    </div>

    <StudyQuickAdd @submit="onQuickAdd" />

    <a-spin :spinning="ctx.tasksLoading.value">
      <!-- 任务列表 / 空态：加载完成后仍无数据则显示引导文案 -->
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

<style scoped>
.study-sync-icon {
  vertical-align: -0.16em;
  transition: transform var(--transition-normal);
}
.study-sync-btn:hover .study-sync-icon {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .study-sync-icon {
    transition: none;
  }
  .study-sync-btn:hover .study-sync-icon {
    transform: none;
  }
}
</style>
