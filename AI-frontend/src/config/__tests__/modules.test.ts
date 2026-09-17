/**
 * modules.ts / permission.ts 模块开关测试：模块 key 归一化、开关 payload 解析、
 * 路由前缀到所属模块的映射、菜单项按 requireModule 过滤、模块中文标签
 */
import { describe, expect, it } from 'vitest'
import {
  filterMenuItems,
  MENU_ITEMS,
  type MenuItemConfig,
} from '../permission'
import {
  getModuleLabel,
  getRequiredModuleByPath,
  isModuleEnabled,
  normalizeModuleKey,
  parseModulesPayload,
} from '../modules'

describe('normalizeModuleKey', () => {
  it('aliases lab keys to app-lab', () => {
    expect(normalizeModuleKey('lab')).toBe('app-lab')
    expect(normalizeModuleKey('appLab')).toBe('app-lab')
    expect(normalizeModuleKey('app_lab')).toBe('app-lab')
  })
})

describe('parseModulesPayload / isModuleEnabled', () => {
  it('treats missing keys as disabled', () => {
    const modules = parseModulesPayload({ blog: true, chat: false })
    expect(isModuleEnabled(modules, 'blog')).toBe(true)
    expect(isModuleEnabled(modules, 'chat')).toBe(false)
    expect(isModuleEnabled(modules, 'diary')).toBe(false)
    expect(isModuleEnabled(modules, 'knowledge')).toBe(false)
  })
})

describe('getRequiredModuleByPath', () => {
  it('maps existing module routes', () => {
    expect(getRequiredModuleByPath('/blog')).toBe('blog')
    expect(getRequiredModuleByPath('/blog/123')).toBe('blog')
    expect(getRequiredModuleByPath('/category/vue')).toBe('blog')
    expect(getRequiredModuleByPath('/diary/write')).toBe('diary')
    expect(getRequiredModuleByPath('/chat/9')).toBe('chat')
    expect(getRequiredModuleByPath('/lab')).toBe('app-lab')
    expect(getRequiredModuleByPath('/app/chat/1')).toBe('app-lab')
    expect(getRequiredModuleByPath('/knowledge/notes')).toBe('knowledge')
    expect(getRequiredModuleByPath('/library')).toBe('library')
    expect(getRequiredModuleByPath('/library/recycle')).toBe('library')
    expect(getRequiredModuleByPath('/administrator/study')).toBe('study')
  })

  it('does not confuse /library with /lab', () => {
    expect(getRequiredModuleByPath('/library')).not.toBe('app-lab')
    expect(getRequiredModuleByPath('/lab')).toBe('app-lab')
  })

  it('does not treat platform routes as modules', () => {
    expect(getRequiredModuleByPath('/')).toBeUndefined()
    expect(getRequiredModuleByPath('/about')).toBeUndefined()
    expect(getRequiredModuleByPath('/user/login')).toBeUndefined()
    expect(getRequiredModuleByPath('/admin/userManage')).toBeUndefined()
  })
})

describe('filterMenuItems requireModule', () => {
  it('hides blog entries when blog is off and keeps platform items', () => {
    const caps = { loaded: true, enabled: (name: string) => name !== 'blog' }
    const items = filterMenuItems(MENU_ITEMS, null, caps)
    const keys = collectKeys(items)
    expect(keys).toContain('home')
    expect(keys).toContain('about')
    expect(keys).toContain('lab')
    expect(keys).not.toContain('blogHome')
  })

  it('hides library entry when library module is off', () => {
    const caps = { loaded: true, enabled: (name: string) => name !== 'library' }
    const items = filterMenuItems(MENU_ITEMS, { id: 1, userRole: 'user' }, caps)
    const keys = collectKeys(items)
    expect(keys).not.toContain('library')
    const capsOn = { loaded: true, enabled: () => true }
    const itemsOn = filterMenuItems(MENU_ITEMS, { id: 1, userRole: 'user' }, capsOn)
    expect(collectKeys(itemsOn)).toContain('library')
  })
})

describe('getModuleLabel', () => {
  it('returns Chinese labels for known keys', () => {
    expect(getModuleLabel('blog')).toBe('博客')
    expect(getModuleLabel('app-lab')).toBe('实验室')
    expect(getModuleLabel('worklog')).toBe('工作日志')
    expect(getModuleLabel('library')).toBe('资料库')
  })
})

/** 递归收集过滤后菜单的 key（含子级），便于断言某项是否被隐藏 */
function collectKeys(items: MenuItemConfig[]): string[] {
  return items.flatMap((item) => [item.key, ...(item.children ? collectKeys(item.children) : [])])
}
