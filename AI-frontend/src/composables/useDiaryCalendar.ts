/**
 * 日记日历：按月拉取有日记的日期摘要，供日历格子上标记情绪/是否有日记。
 * 提供上一月/下一月翻页，翻页后自动重新加载。
 */
import { ref } from 'vue'
import { listDiaryByMonth } from '@/integrations/diaryController'

/**
 * 日记日历 composable。
 * 返回当前年月、当月条目列表、加载态，以及按日期索引的查询函数与翻页操作。
 */
export function useDiaryCalendar() {
  const year = ref(new Date().getFullYear())
  const month = ref(new Date().getMonth() + 1)
  const monthItems = ref<API.DiaryEntryMonthItemVO[]>([])
  const loading = ref(false)

  /** 把当月条目整理成 diaryDate → 条目 的映射，渲染日历格时 O(1) 查询 */
  const itemByDate = () => {
    const map = new Map<string, API.DiaryEntryMonthItemVO>()
    for (const item of monthItems.value) {
      if (item.diaryDate) {
        map.set(item.diaryDate, item)
      }
    }
    return map
  }

  /** 加载指定年月的日记摘要；不传参则刷新当前月。请求失败按空月处理 */
  async function loadMonth(y?: number, m?: number) {
    if (y != null) year.value = y
    if (m != null) month.value = m
    loading.value = true
    try {
      const res = await listDiaryByMonth({ year: year.value, month: month.value })
      if (res.data.code === 0 && res.data.data) {
        monthItems.value = res.data.data
      } else {
        monthItems.value = []
      }
    } catch {
      monthItems.value = []
    } finally {
      loading.value = false
    }
  }

  function prevMonth() {
    if (month.value === 1) {
      month.value = 12
      year.value -= 1
    } else {
      month.value -= 1
    }
    return loadMonth()
  }

  function nextMonth() {
    if (month.value === 12) {
      month.value = 1
      year.value += 1
    } else {
      month.value += 1
    }
    return loadMonth()
  }

  return {
    year,
    month,
    monthItems,
    loading,
    itemByDate,
    loadMonth,
    prevMonth,
    nextMonth,
  }
}
