<script setup lang="ts">
/**
 * 学习工作台页面（Study 房间）：
 * 页面本身只负责骨架搭建，任务/专注/习惯/统计的完整状态与逻辑
 * 统一收敛在 useStudyContext 组合式函数中，供各子面板共享。
 */
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import { computed, onMounted } from 'vue'
import { useStudyContext } from '@/composables/study/useStudyContext'
import StudySidebar from '@/components/study/StudySidebar.vue'
import StudyTaskPanel from '@/components/study/StudyTaskPanel.vue'
import StudyToolPanel from '@/components/study/StudyToolPanel.vue'
import StudyTaskDetailDrawer from '@/components/study/StudyTaskDetailDrawer.vue'
import '@/assets/admin-theme.css'
import '@/assets/study-workspace.css'

const ctx = useStudyContext()

// 移动端通过底部 tab 切换面板，用类名控制各面板的显示/隐藏
const mobileLayoutClass = computed(() => `study-layout--mobile-${ctx.mobileTab.value}`)

// 移动端分段控制器的选项：任务/专注/习惯/统计
const mobileOptions = [
  { label: '任务', value: 'tasks' },
  { label: '专注', value: 'focus' },
  { label: '习惯', value: 'habits' },
  { label: '统计', value: 'stats' },
]

onMounted(() => {
  // 首次进入拉取工作台全量数据（任务、专注记录、习惯等）
  ctx.bootstrap(true)
})
</script>

<template>
  <StationRoomShell brand-path="/" note-label="Study · 学习工作台" room="study">
  <div id="studyView" class="study-page admin-theme-page">
    <header class="study-page__header">
      <h1 class="study-page__title">学习工作台</h1>
      <p class="study-page__subtitle">任务 · 专注 · 习惯，像 TickTick 一样管理你的学习节奏</p>
    </header>

    <!-- 仅 administrator 角色可访问，其余用户直接展示 403 -->
    <a-result
      v-if="ctx.forbidden.value"
      status="403"
      title="无权访问"
      sub-title="学习工作台仅 administrator 角色可用"
    />

    <!-- 移动端：分段控制器切换面板；桌面端：三栏布局同屏展示 -->
    <a-spin v-else :spinning="ctx.loading.value">
      <div class="study-mobile-tabs">
        <a-segmented v-model:value="ctx.mobileTab.value" block :options="mobileOptions" />
      </div>

      <div class="study-layout" :class="mobileLayoutClass">
        <StudySidebar />
        <StudyTaskPanel />
        <StudyToolPanel />
      </div>
    </a-spin>

    <StudyTaskDetailDrawer />
  </div>
  </StationRoomShell>
</template>
