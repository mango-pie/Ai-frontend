/**
 * 路由进入反应：用户访问特定页面时，桌宠说一句台词并播放反应动画。
 *
 * 内置站点主要页面的反应表，同时允许业务代码通过
 * registerRouteReaction 动态注册新路由的反应。
 */
import type { PetRouteReaction, PetState } from './types'

/** 路由 path -> 反应的注册表 */
const ROUTE_REACTIONS: Record<string, PetRouteReaction> = {
  '/blog': { line: '今天写点什么好呢…', state: 'react' },
  '/diary': { line: '今天的心情写了吗？', state: 'react' },
  '/worklog': { line: '今天的工作记一下？', state: 'react' },
  '/about': { line: '想了解站主？', state: 'react' },
}

/**
 * 查询某个路径的桌宠反应：精确匹配优先，
 * 其次按前缀匹配子路径（如 /blog/xxx 命中 /blog），未命中返回 null。
 */
export function getRouteReaction(path: string): PetRouteReaction | null {
  if (ROUTE_REACTIONS[path]) {
    return ROUTE_REACTIONS[path]
  }

  for (const [routePath, reaction] of Object.entries(ROUTE_REACTIONS)) {
    // 根路径 '/' 无法做前缀区分，只参与上面的精确匹配
    if (routePath !== '/' && path.startsWith(`${routePath}/`)) {
      return reaction
    }
  }

  return null
}

/** 动态注册一条路由反应，供业务页面补充自定义台词/状态 */
export function registerRouteReaction(path: string, reaction: PetRouteReaction) {
  ROUTE_REACTIONS[path] = reaction
}

export type { PetState }
