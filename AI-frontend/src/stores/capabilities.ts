/**
 * 后端模块能力（Pinia）
 * - 调用 GET /app/modules（Axios baseURL 已含 /api）
 * - 探测成功：响应里缺省的 key 视为关闭
 * - 探测失败（旧后端无此接口 / 网络错误）：fail-open，避免把现有入口全部藏掉
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAppModules } from '@/api/modulesController'
import {
  isModuleEnabled,
  parseModulesPayload,
} from '@/config/modules'
import type { CapabilityGate } from '@/utils/moduleGate'
import { syncCapabilitySnapshot } from '@/utils/capabilitySnapshot'

/**
 * 从接口响应中提取“模块名 -> 是否启用”映射：
 * 兼容两种后端返回结构——{ modules: {...} } 包装形式，以及直接平铺的布尔值对象
 */
function extractModulesMap(data: unknown): unknown {
  if (!data || typeof data !== 'object') return undefined
  const rec = data as Record<string, unknown>
  if ('modules' in rec) return rec.modules && typeof rec.modules === 'object' ? rec.modules : {}
  const values = Object.values(rec)
  if (values.length && values.every((value) => typeof value === 'boolean')) return rec
  return undefined
}

export const useCapabilitiesStore = defineStore('capabilities', () => {
  // 模块启用表、是否已完成探测、探测是否失败（失败时 fail-open 全部视为开启）
  const modules = ref<Record<string, boolean>>({})
  const loaded = ref(false)
  const probeFailed = ref(false)
  // 进行中的探测请求，用于并发去重（多个入口同时 ensureLoaded 只发一次请求）
  let inflight: Promise<void> | null = null

  /** 判断某模块是否开启：探测失败时 fail-open；未加载完成时保守视为关闭 */
  function enabled(name: string): boolean {
    if (probeFailed.value) return true
    if (!loaded.value) return false
    return isModuleEnabled(modules.value, name)
  }

  /** 以 moduleGate 工具所需的最小接口（loaded + enabled）暴露门控能力 */
  function asGate(): CapabilityGate {
    return { loaded: loaded.value, enabled }
  }

  /** 将能力快照同步到 localStorage，供 axios 拦截器等非组件环境读取 */
  function persistSnapshot() {
    syncCapabilitySnapshot(loaded.value, modules.value, probeFailed.value)
  }

  /** 探测模块能力；已在进行中时复用同一 Promise，避免重复请求 */
  async function load() {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const res = await getAppModules()
        const raw = extractModulesMap(res.data.data)
        if (res.data.code === 0 && raw && typeof raw === 'object') {
          modules.value = parseModulesPayload(raw)
          probeFailed.value = false
        } else {
          probeFailed.value = true
          modules.value = {}
        }
      } catch {
        probeFailed.value = true
        modules.value = {}
      } finally {
        loaded.value = true
        persistSnapshot()
        inflight = null
      }
    })()
    return inflight
  }

  /** 确保能力清单已加载（路由守卫每次导航都会调用，已加载则直接返回） */
  async function ensureLoaded() {
    if (loaded.value) return
    await load()
  }

  // 对外同时暴露别名（isEnabled/fetchModules），兼容不同历史调用习惯
  return {
    modules,
    loaded,
    probeFailed,
    enabled,
    asGate,
    load,
    ensureLoaded,
    isEnabled: enabled,
    fetchModules: load,
  }
})
