// moduleGate 模块门控单测：路径到业务模块的映射（最长前缀优先）、隐藏/不可用模块的过滤与跳转决策
import { describe, expect, it } from 'vitest'

import {
  decide40100Action,
  filterGatedEntries,
  isModuleHidden,
  isModuleUnavailablePath,
  moduleForPath,
  moduleUnavailableLocation,
  type CapabilityGate,
} from '../moduleGate'

const gate = (loaded: boolean, enabledMap: Record<string, boolean>): CapabilityGate => ({
  loaded,
  enabled: (name) => enabledMap[name] === true,
})

describe('moduleForPath', () => {
  it('解析各业务模块前缀', () => {
    expect(moduleForPath('/blog')).toBe('blog')
    expect(moduleForPath('/blog/post/123')).toBe('blog')
    expect(moduleForPath('/category/3')).toBe('blog')
    expect(moduleForPath('/tag/7/')).toBe('blog')
    expect(moduleForPath('/diary/write')).toBe('diary')
    expect(moduleForPath('/knowledge')).toBe('knowledge')
    expect(moduleForPath('/knowledge/9/chat')).toBe('knowledge')
    expect(moduleForPath('/worklog')).toBe('worklog')
    expect(moduleForPath('/worklog/2026-09-12')).toBe('worklog')
  })

  it('最长前缀优先', () => {
    expect(moduleForPath('/admin/knowledge/notes')).toBe('knowledge')
    expect(moduleForPath('/admin/ops/stats')).toBe('ops')
    expect(moduleForPath('/admin/blogManage')).toBe('blog')
    expect(moduleForPath('/administrator/study/tree')).toBe('study')
  })

  it('平台常驻路径返回 undefined', () => {
    expect(moduleForPath('/')).toBeUndefined()
    expect(moduleForPath('/user/login')).toBeUndefined()
    expect(moduleForPath('/user/profile')).toBeUndefined()
    expect(moduleForPath('/about')).toBeUndefined()
    expect(moduleForPath('/module-unavailable')).toBeUndefined()
  })

  it('前缀必须是路径段边界', () => {
    expect(moduleForPath('/knowledgex')).toBeUndefined()
    expect(moduleForPath('/chatty')).toBeUndefined()
    expect(moduleForPath('/blogx/1')).toBeUndefined()
  })

  it('已下线模块的路径不再归属任何模块', () => {
    expect(moduleForPath('/chat')).toBeUndefined()
    expect(moduleForPath('/lab')).toBeUndefined()
    expect(moduleForPath('/app/mini/foo')).toBeUndefined()
  })

  it('忽略查询串并容忍首尾空白', () => {
    expect(moduleForPath('/blog?page=2')).toBe('blog')
    expect(moduleForPath(' /blog ')).toBe('blog')
  })
})

describe('isModuleHidden', () => {
  it('无模块要求或无能力数据时不隐藏', () => {
    expect(isModuleHidden(undefined, gate(true, {}))).toBe(false)
    expect(isModuleHidden('blog', undefined)).toBe(false)
  })

  it('仅「已加载且明确关闭」才隐藏', () => {
    expect(isModuleHidden('blog', gate(true, { blog: false }))).toBe(true)
    expect(isModuleHidden('blog', gate(true, { blog: true }))).toBe(false)
    // 能力未加载完成时不隐藏（fail-open，避免首屏误伤）
    expect(isModuleHidden('blog', gate(false, { blog: false }))).toBe(false)
  })
})

describe('decide40100Action', () => {
  it('登录探测 / 模块能力接口 / 登录页 / 不可用页 一律 ignore', () => {
    const base = { pathname: '/blog', loaded: true, enabled: () => false }
    expect(decide40100Action({ ...base, responseUrl: '/api/user/get/login' })).toBe('ignore')
    expect(decide40100Action({ ...base, responseUrl: '/api/app/modules' })).toBe('ignore')
    expect(decide40100Action({ ...base, pathname: '/user/login' })).toBe('ignore')
    expect(decide40100Action({ ...base, pathname: '/module-unavailable?module=blog' })).toBe('ignore')
  })

  it('模块关闭优先于登录跳转', () => {
    const action = decide40100Action({
      pathname: '/diary',
      loaded: true,
      enabled: (name) => name !== 'diary',
    })
    expect(action).toBe('unavailable')
  })

  it('能力未加载时不抢跳登录，交给路由守卫', () => {
    const action = decide40100Action({
      pathname: '/diary',
      loaded: false,
      enabled: () => false,
    })
    expect(action).toBe('ignore')
  })

  it('模块开启或常驻路径时回到登录跳转', () => {
    expect(
      decide40100Action({ pathname: '/diary', loaded: true, enabled: () => true }),
    ).toBe('login')
    expect(
      decide40100Action({ pathname: '/user/profile', loaded: true, enabled: () => false }),
    ).toBe('login')
  })
})

describe('filterGatedEntries', () => {
  it('按 requireModule 字段过滤', () => {
    const items = [
      { path: '/diary', label: '日记', requireModule: 'diary' },
      { path: '/games', label: '游戏舱', requireModule: 'games' },
    ]
    const visible = filterGatedEntries(items, gate(true, { diary: true }))
    expect(visible).toHaveLength(1)
    expect(visible[0]?.label).toBe('日记')
  })

  it('无 requireModule 时按 path 推导模块', () => {
    const items = [{ path: '/knowledge', label: '知识库' }]
    const visibleOn = filterGatedEntries(items, gate(true, { knowledge: true }))
    const visibleOff = filterGatedEntries(items, gate(true, {}))
    expect(visibleOn).toHaveLength(1)
    expect(visibleOff).toHaveLength(0)
  })
})

describe('moduleUnavailableLocation', () => {
  it('携带来源与模块参数', () => {
    expect(moduleUnavailableLocation('/diary', 'diary')).toBe(
      '/module-unavailable?from=%2Fdiary&module=diary',
    )
  })

  it('无参数时返回干净路径', () => {
    expect(moduleUnavailableLocation('')).toBe('/module-unavailable')
  })
})

describe('isModuleUnavailablePath', () => {
  it('识别不可用页及其子路径', () => {
    expect(isModuleUnavailablePath('/module-unavailable')).toBe(true)
    expect(isModuleUnavailablePath('/module-unavailable/')).toBe(true)
    expect(isModuleUnavailablePath('/module-unavailableX')).toBe(false)
    expect(isModuleUnavailablePath('/diary')).toBe(false)
  })
})
