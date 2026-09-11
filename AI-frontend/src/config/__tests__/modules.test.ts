import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
    assert.equal(normalizeModuleKey('lab'), 'app-lab')
    assert.equal(normalizeModuleKey('appLab'), 'app-lab')
    assert.equal(normalizeModuleKey('app_lab'), 'app-lab')
  })
})

describe('parseModulesPayload / isModuleEnabled', () => {
  it('treats missing keys as disabled', () => {
    const modules = parseModulesPayload({ blog: true, chat: false })
    assert.equal(isModuleEnabled(modules, 'blog'), true)
    assert.equal(isModuleEnabled(modules, 'chat'), false)
    assert.equal(isModuleEnabled(modules, 'diary'), false)
    assert.equal(isModuleEnabled(modules, 'knowledge'), false)
  })
})

describe('getRequiredModuleByPath', () => {
  it('maps existing module routes', () => {
    assert.equal(getRequiredModuleByPath('/blog'), 'blog')
    assert.equal(getRequiredModuleByPath('/blog/123'), 'blog')
    assert.equal(getRequiredModuleByPath('/category/vue'), 'blog')
    assert.equal(getRequiredModuleByPath('/diary/write'), 'diary')
    assert.equal(getRequiredModuleByPath('/chat/9'), 'chat')
    assert.equal(getRequiredModuleByPath('/lab'), 'app-lab')
    assert.equal(getRequiredModuleByPath('/app/chat/1'), 'app-lab')
    assert.equal(getRequiredModuleByPath('/knowledge/notes'), 'knowledge')
    assert.equal(getRequiredModuleByPath('/administrator/study'), 'study')
  })

  it('does not treat platform routes as modules', () => {
    assert.equal(getRequiredModuleByPath('/'), undefined)
    assert.equal(getRequiredModuleByPath('/about'), undefined)
    assert.equal(getRequiredModuleByPath('/user/login'), undefined)
    assert.equal(getRequiredModuleByPath('/admin/userManage'), undefined)
  })
})

describe('filterMenuItems requireModule', () => {
  it('hides blog entries when blog is off and keeps platform items', () => {
    const items = filterMenuItems(MENU_ITEMS, null, (name) => name !== 'blog')
    const keys = collectKeys(items)
    assert.ok(keys.includes('home'))
    assert.ok(keys.includes('about'))
    assert.ok(keys.includes('lab'))
    assert.ok(!keys.includes('blogHome'))
  })
})

describe('getModuleLabel', () => {
  it('returns Chinese labels for known keys', () => {
    assert.equal(getModuleLabel('blog'), '博客')
    assert.equal(getModuleLabel('app-lab'), '实验室')
  })
})

function collectKeys(items: MenuItemConfig[]): string[] {
  return items.flatMap((item) => [item.key, ...(item.children ? collectKeys(item.children) : [])])
}
