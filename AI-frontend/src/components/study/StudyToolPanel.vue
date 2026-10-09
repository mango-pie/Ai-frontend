<script setup lang="ts">
/**
 * 学习工具面板（右侧栏）
 * 以页签形式聚合三组学习工具：番茄钟（专注）、习惯打卡（习惯）、今日统计与近 7 日图表（统计）。
 * 当前页签记录在学习上下文的 mobileTab 中，供任务详情“开始专注”等场景联动跳转。
 */
import { computed, inject } from 'vue'
import { studyContextKey } from '@/composables/study/useStudyContext'
import StudyPomodoro from './StudyPomodoro.vue'
import StudyTodayStats from './StudyTodayStats.vue'
import StudyHabitPanel from './StudyHabitPanel.vue'
import StudyRangeChart from './StudyRangeChart.vue'

const ctx = inject(studyContextKey)!

// 页签选中态：读写上下文的 mobileTab，非法值回退到“专注”页签
const toolTab = computed({
  get: () => {
    const m = ctx.mobileTab.value
    if (m === 'focus' || m === 'habits' || m === 'stats') return m
    return 'focus'
  },
  set: (v: string) => {
    if (v === 'focus' || v === 'habits' || v === 'stats') {
      ctx.mobileTab.value = v
    }
  },
})
</script>

<template>
  <aside class="study-panel study-panel--tools">
    <!-- 三个工具页签：专注（番茄钟）/ 习惯打卡 / 统计（今日卡片 + 近 7 日柱状图） -->
    <a-tabs v-model:active-key="toolTab" class="study-tool-tabs">
      <a-tab-pane key="focus" tab="专注">
        <div class="study-tool-content">
          <StudyPomodoro />
        </div>
      </a-tab-pane>
      <a-tab-pane key="habits" tab="习惯">
        <div class="study-tool-content">
          <StudyHabitPanel />
        </div>
      </a-tab-pane>
      <a-tab-pane key="stats" tab="统计">
        <div class="study-tool-content">
          <StudyTodayStats />
          <StudyRangeChart />
        </div>
      </a-tab-pane>
    </a-tabs>
  </aside>
</template>

<style scoped>
.study-panel--tools :deep(.ant-tabs-content) {
  max-height: calc(100vh - 220px);
  overflow: auto;
}
</style>
