<script setup lang="ts">
/**
 * 学习习惯打卡月历
 * 以日历网格展示某个习惯在当月各天的打卡记录（已打卡的日期高亮），
 * 支持按月前后翻页查看历史打卡情况。
 */
import { computed, inject, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { studyContextKey } from '@/composables/study/useStudyContext'

const props = defineProps<{
  habitId: number
}>()

// 注入学习模块共享上下文，用于请求该习惯指定年月的打卡日期列表
const ctx = inject(studyContextKey)!
// 当月已打卡的日期集合（服务端返回的 "YYYY-MM-DD" 字符串数组）
const dates = ref<string[]>([])
// 当前展示的年/月，初始为系统当前月份
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)

// 日历表头：周日为一周第一列
const weekLabels = ['日', '一', '二', '三', '四', '五', '六']

// 拉取当前年月的打卡日期并刷新高亮数据
async function load() {
  dates.value = await ctx.getHabitCalendarDates(props.habitId, year.value, month.value)
}

// 习惯切换或组件挂载时立即加载对应打卡数据
watch(
  () => props.habitId,
  () => load(),
  { immediate: true },
)

// 已打卡日期索引，便于日历格子按 "YYYY-MM-DD" 快速查询
const checkedSet = computed(() => new Set(dates.value))

// 组装日历网格数据：月初前置空白占位 + 每天是否已打卡的标记
const cells = computed(() => {
  const first = new Date(year.value, month.value - 1, 1)
  const lastDay = new Date(year.value, month.value, 0).getDate()
  const startPad = first.getDay()
  const result: { day: number | null; checked: boolean }[] = []
  for (let i = 0; i < startPad; i++) result.push({ day: null, checked: false })
  for (let d = 1; d <= lastDay; d++) {
    const key = `${year.value}-${String(month.value).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    result.push({ day: d, checked: checkedSet.value.has(key) })
  }
  return result
})

// 上一个月：跨年时回退到上一年 12 月，随后重新加载打卡数据
function prevMonth() {
  if (month.value === 1) {
    month.value = 12
    year.value -= 1
  } else {
    month.value -= 1
  }
  load()
}

// 下一个月：跨年时前进到下一年 1 月，随后重新加载打卡数据
function nextMonth() {
  if (month.value === 12) {
    month.value = 1
    year.value += 1
  } else {
    month.value += 1
  }
  load()
}
</script>

<template>
  <div class="study-habit-calendar-wrap">
    <div class="study-habit-calendar-nav">
      <!-- 月份切换：左右箭头翻页，中间显示当前年月 -->
      <a-button size="small" type="text" class="cal-nav-btn cal-nav-btn--prev" @click="prevMonth">
        <ChevronLeft :size="16" />
      </a-button>
      <span>{{ year }}年{{ month }}月</span>
      <a-button size="small" type="text" class="cal-nav-btn cal-nav-btn--next" @click="nextMonth">
        <ChevronRight :size="16" />
      </a-button>
    </div>
    <div class="study-habit-calendar">
      <!-- 表头：星期一到日 -->
      <div v-for="w in weekLabels" :key="w" class="study-habit-calendar__cell study-habit-calendar__cell--head">
        {{ w }}
      </div>
      <!-- 日期格：占位格为空，已打卡的日期追加高亮样式 -->
      <div
        v-for="(cell, idx) in cells"
        :key="idx"
        class="study-habit-calendar__cell"
        :class="{ 'study-habit-calendar__cell--checked': cell.checked && cell.day }"
      >
        {{ cell.day ?? '' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.study-habit-calendar-wrap {
  margin-top: 8px;
}

.study-habit-calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.82rem;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.cal-nav-btn :deep(svg) {
  transition: transform var(--transition-fast);
}
.cal-nav-btn--prev:hover :deep(svg) {
  transform: translateX(-2px);
}
.cal-nav-btn--next:hover :deep(svg) {
  transform: translateX(2px);
}
@media (prefers-reduced-motion: reduce) {
  .cal-nav-btn :deep(svg) {
    transition: none;
  }
  .cal-nav-btn:hover :deep(svg) {
    transform: none;
  }
}
</style>
