/**
 * 后端模块能力（Pinia）
 * - 调用现有 GET /app/modules（Axios baseURL 已含 /api，withCredentials 保持 Session）
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

export const useCapabilitiesStore = defineStore('capabilities', () => {
  const modules = ref<Record<string, boolean>>({})
  const loaded = ref(false)
  const probeFailed = ref(false)
  let inflight: Promise<void> | null = null

  function enabled(name: string): boolean {
    if (probeFailed.value) return true
    if (!loaded.value) return false
    return isModuleEnabled(modules.value, name)
  }

  async function load() {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const res = await getAppModules()
        if (res.data.code === 0 && res.data.data?.modules) {
          modules.value = parseModulesPayload(res.data.data.modules)
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
        inflight = null
      }
    })()
    return inflight
  }

  async function ensureLoaded() {
    if (loaded.value) return
    await load()
  }

  return { modules, loaded, probeFailed, enabled, load, ensureLoaded }
})
