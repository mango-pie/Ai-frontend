<script setup lang="ts">
/**
 * 今日学习统计卡片
 * 以四张数字卡片汇总当天数据：任务完成比、逾期数、专注分钟数、习惯打卡比，
 * 数据来自学习上下文的 todayStats（由后端统计接口返回）。
 */
import { computed, inject } from 'vue'
import { studyContextKey } from '@/composables/study/useStudyContext'

const ctx = inject(studyContextKey)!

// 今日统计原始数据
const stats = computed(() => ctx.todayStats.value)

// 组装四张卡片的展示值：比值类用 "x/y" 形式，计数类直接展示数字
const cards = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '今日任务', num: `${s.completedTasks ?? 0}/${s.totalTasks ?? 0}` },
    { label: '逾期', num: s.overdueTasks ?? 0 },
    { label: '专注(分)', num: s.focusMinutes ?? 0 },
    { label: '习惯打卡', num: `${s.habitsChecked ?? 0}/${s.habitsTotal ?? 0}` },
  ]
})
</script>

<template>
  <!-- 统计卡片网格：遍历派生的卡片数据渲染 -->
  <div class="study-stats-grid">
    <div v-for="item in cards" :key="item.label" class="study-stat-card">
      <div class="study-stat-card__num">{{ item.num }}</div>
      <div class="study-stat-card__label">{{ item.label }}</div>
    </div>
  </div>
  <p v-if="stats?.date" class="study-stats-date">统计日期：{{ stats.date }}</p>
</template>

<style scoped>
.study-stats-date {
  margin: 12px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  text-align: center;
}
</style>
