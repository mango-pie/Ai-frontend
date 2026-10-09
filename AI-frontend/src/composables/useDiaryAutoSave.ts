/**
 * 日记编辑器的自动保存：编辑触发防抖（默认 2s）后调后端保存接口。
 * 保存结果（idle/saving/saved/error）与后端返回的 entryId 暴露给编辑页展示。
 */
import { ref, watch, type Ref } from 'vue'
import { saveDiaryEntry } from '@/integrations/diaryController'
import type { DiarySavePayload } from './useDiaryTypes'

/** 自动保存状态机：空闲 → 保存中 → 已保存 / 出错 */
export type DiarySaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * 日记自动保存 composable。
 * @param getPayload 惰性获取当前编辑内容，防抖到真正保存时才读取最新值
 * @param options.debounceMs 防抖间隔，默认 2000ms
 * @param options.enabled 开关 ref（如手动模式关闭自动保存），false 时挂起的保存会被丢弃
 */
export function useDiaryAutoSave(
  getPayload: () => DiarySavePayload,
  options?: { debounceMs?: number; enabled?: Ref<boolean> },
) {
  const saveStatus = ref<DiarySaveStatus>('idle')
  const entryId = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounceMs = options?.debounceMs ?? 2000

  /** 立即保存；statusOverride 可在手动保存时强制草稿/正式状态。没有日期视为无效内容直接跳过 */
  async function saveNow(statusOverride?: number) {
    const payload = getPayload()
    if (!payload.diaryDate) return false

    saveStatus.value = 'saving'
    try {
      const res = await saveDiaryEntry({
        ...payload,
        status: statusOverride ?? payload.status,
      })
      if (res.data.code === 0 && res.data.data) {
        entryId.value = Number(res.data.data)
        saveStatus.value = 'saved'
        return true
      }
      saveStatus.value = 'error'
      return false
    } catch {
      saveStatus.value = 'error'
      return false
    }
  }

  /** 防抖调度：编辑时不断重置定时器，停笔 debounceMs 后才真正保存 */
  function scheduleSave() {
    if (options?.enabled && !options.enabled.value) return
    if (timer) clearTimeout(timer)
    saveStatus.value = 'idle'
    timer = setTimeout(() => {
      saveNow()
    }, debounceMs)
  }

  /** 编辑内容变化时调用，标记脏数据并进入防抖保存流程 */
  function markDirty() {
    scheduleSave()
  }

  // 自动保存被关闭时，取消仍在等待中的防抖保存
  watch(
    () => options?.enabled?.value,
    (enabled) => {
      if (enabled === false && timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  )

  return {
    saveStatus,
    entryId,
    markDirty,
    saveNow,
  }
}
