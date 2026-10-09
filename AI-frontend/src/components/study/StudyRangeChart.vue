<script setup lang="ts">
/**
 * 近 7 日学习数据柱状图
 * 用纯 CSS 柱形展示最近一周每天的专注分钟数（以最大值为满高度基准），
 * 并汇总区间内的完成任务数、专注总时长与习惯打卡次数。
 */
import { computed, inject } from 'vue'
import { studyContextKey } from '@/composables/study/useStudyContext'

const ctx = inject(studyContextKey)!

// 近 7 日逐日明细（date + focusMinutes），来自上下文的区间统计
const breakdown = computed(() => ctx.rangeStats.value?.dailyBreakdown ?? [])

// 一周内的最大专注分钟数：柱高的归一化基准（至少为 1 避免除零）
const maxFocus = computed(() =>
  Math.max(1, ...breakdown.value.map((d) => d.focusMinutes ?? 0)),
)
</script>

<template>
  <div class="study-range-chart">
    <div class="study-sidebar__section-label">近 7 日专注</div>
    <!-- 柱状图：柱高按当日专注分钟占最大值的比例计算，悬停显示具体分钟数 -->
    <div v-if="breakdown.length" class="study-range-chart__bars">
      <div v-for="item in breakdown" :key="item.date" class="study-range-chart__bar-wrap">
        <div
          class="study-range-chart__bar"
          :style="{ height: `${((item.focusMinutes ?? 0) / maxFocus) * 100}%` }"
          :title="`${item.focusMinutes ?? 0} 分钟`"
        />
        <span class="study-range-chart__date">{{ item.date?.slice(5) }}</span>
      </div>
    </div>
    <div v-else class="study-empty" style="padding: 24px">暂无数据</div>

    <!-- 区间汇总：完成任务数 / 专注总分钟 / 习惯打卡次数 -->
    <div v-if="ctx.rangeStats.value" class="study-range-summary">
      <span>完成任务 {{ ctx.rangeStats.value.completedTaskCount ?? 0 }} 个</span>
      <span>专注 {{ ctx.rangeStats.value.focusMinutes ?? 0 }} 分钟</span>
      <span>习惯打卡 {{ ctx.rangeStats.value.habitCheckCount ?? 0 }} 次</span>
    </div>
  </div>
</template>

<style scoped>
.study-range-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}
</style>
