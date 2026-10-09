/**
 * capabilities store 单测（node 环境）：
 * - GET /app/modules 包装形式与平铺形式的解析
 * - 探测失败 / code 非 0 时 fail-open
 * - 并发 ensureLoaded 去重、加载后不再请求
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/modulesController', () => ({
  getAppModules: vi.fn(),
}))
// 快照同步依赖 localStorage，node 环境不存在，mock 掉只验证调用
vi.mock('@/utils/capabilitySnapshot', () => ({
  syncCapabilitySnapshot: vi.fn(),
}))

import { getAppModules } from '@/api/modulesController'
import { syncCapabilitySnapshot } from '@/utils/capabilitySnapshot'
import { useCapabilitiesStore } from '../capabilities'

const mockedGet = vi.mocked(getAppModules)

beforeEach(() => {
  setActivePinia(createPinia())
  mockedGet.mockReset()
  vi.mocked(syncCapabilitySnapshot).mockClear()
})

describe('capabilities store', () => {
  it('未加载完成时保守视为关闭', () => {
    const store = useCapabilitiesStore()
    expect(store.loaded).toBe(false)
    expect(store.enabled('blog')).toBe(false)
  })

  it('加载成功（{ modules: {...} } 包装形式）', async () => {
    mockedGet.mockResolvedValue({
      data: { code: 0, data: { modules: { blog: true, diary: false } } },
    } as never)
    const store = useCapabilitiesStore()
    await store.ensureLoaded()
    expect(store.loaded).toBe(true)
    expect(store.probeFailed).toBe(false)
    expect(store.enabled('blog')).toBe(true)
    expect(store.enabled('diary')).toBe(false)
    // 响应中缺省的 key 视为关闭
    expect(store.enabled('chat')).toBe(false)
    expect(syncCapabilitySnapshot).toHaveBeenCalled()
  })

  it('加载成功（平铺布尔值形式）', async () => {
    mockedGet.mockResolvedValue({
      data: { code: 0, data: { knowledge: true, music: false } },
    } as never)
    const store = useCapabilitiesStore()
    await store.load()
    expect(store.enabled('knowledge')).toBe(true)
    expect(store.enabled('music')).toBe(false)
  })

  it('请求抛错时 fail-open（全部视为开启）', async () => {
    mockedGet.mockRejectedValue(new Error('network down'))
    const store = useCapabilitiesStore()
    await store.load()
    expect(store.loaded).toBe(true)
    expect(store.probeFailed).toBe(true)
    expect(store.enabled('blog')).toBe(true)
    expect(store.enabled('anything-unknown')).toBe(true)
  })

  it('响应 code 非 0 时同样 fail-open', async () => {
    mockedGet.mockResolvedValue({
      data: { code: 500, data: null, message: 'boom' },
    } as never)
    const store = useCapabilitiesStore()
    await store.load()
    expect(store.probeFailed).toBe(true)
    expect(store.enabled('blog')).toBe(true)
  })

  it('并发 ensureLoaded 只发一次请求', async () => {
    mockedGet.mockResolvedValue({
      data: { code: 0, data: { modules: { blog: true } } },
    } as never)
    const store = useCapabilitiesStore()
    await Promise.all([store.ensureLoaded(), store.ensureLoaded(), store.ensureLoaded()])
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('已加载后 ensureLoaded 不再请求', async () => {
    mockedGet.mockResolvedValue({
      data: { code: 0, data: { modules: {} } },
    } as never)
    const store = useCapabilitiesStore()
    await store.ensureLoaded()
    await store.ensureLoaded()
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})
