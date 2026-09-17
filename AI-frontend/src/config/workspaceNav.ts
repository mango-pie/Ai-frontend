/**
 * 全站导航配置（单一来源）
 * - TOP_NAV_GROUPS：房间顶栏一级导航（六组，HomeTopbar 消费）
 * - RAIL_NAV：站点系快速切换 rail（四组 + 独立入口，WorkspaceRail 消费）
 * 权限过滤统一走 filterWorkspaceNav（requiredRole + requireModule + 能力门控）。
 */
import type { Component } from 'vue'
import {
  Home,
  MessagesSquare,
  LibraryBig,
  Archive,
  NotebookPen,
  FlaskConical,
  GraduationCap,
  Settings,
  Sparkles,
  Activity,
  BookOpen,
  Users,
  AppWindowMac,
  PenTool,
  Info,
  ListChecks,
  ListTree,
  ClipboardList,
  MessageSquareLock,
  Music2,
  PenLine,
  User,
} from 'lucide-vue-next'
import type { CapabilityGate, RequiredRole } from '@/config/permission'
import { canShowMenuItem, type MenuItemConfig } from '@/config/permission'

export interface WorkspaceNavItem {
  key: string
  label: string
  path: string
  icon: Component
  requiredRole?: RequiredRole
  /** 依赖的后端模块 key；模块关闭时隐藏该项 */
  requireModule?: string
  /** 匹配路径前缀（用于高亮） */
  matchPrefix?: string
  /** 未登录点击时跳登录页 */
  requireLogin?: boolean
  /** 所属 rail 分组 */
  group?: NavGroupKey
  children?: WorkspaceNavItem[]
}

export type NavGroupKey = 'create' | 'ai' | 'admin' | 'account'

/* ================= 叶子页面 ================= */

const chat: WorkspaceNavItem = {
  key: 'chat',
  label: '对话',
  path: '/chat',
  icon: MessagesSquare,
  requiredRole: 'user',
  requireModule: 'chat',
  matchPrefix: '/chat',
  requireLogin: true,
  group: 'ai',
}

const knowledge: WorkspaceNavItem = {
  key: 'knowledge',
  label: '知识库',
  path: '/knowledge',
  icon: LibraryBig,
  requiredRole: 'user',
  requireModule: 'knowledge',
  matchPrefix: '/knowledge',
  requireLogin: true,
  group: 'ai',
}

const library: WorkspaceNavItem = {
  key: 'library',
  label: '资料库',
  path: '/library',
  icon: Archive,
  requiredRole: 'user',
  requireModule: 'library',
  matchPrefix: '/library',
  requireLogin: true,
  group: 'ai',
}

const reading: WorkspaceNavItem = {
  key: 'reading',
  label: 'AI 精读',
  path: '/admin/knowledge/ingest',
  icon: Sparkles,
  requiredRole: 'admin',
  requireModule: 'knowledge',
  matchPrefix: '/admin/knowledge',
  group: 'ai',
  children: [
    {
      key: 'knowledgeIngest',
      label: '内容采集',
      path: '/admin/knowledge/ingest',
      icon: Sparkles,
      requiredRole: 'admin',
      requireModule: 'knowledge',
    },
    {
      key: 'knowledgeNotes',
      label: '精读列表',
      path: '/admin/knowledge/notes',
      icon: BookOpen,
      requiredRole: 'admin',
      requireModule: 'knowledge',
    },
    {
      key: 'knowledgeLearning',
      label: '领域知识树',
      path: '/admin/knowledge/learning',
      icon: ListTree,
      requiredRole: 'admin',
      requireModule: 'knowledge',
      matchPrefix: '/admin/knowledge/learning',
    },
  ],
}

const blog: WorkspaceNavItem = {
  key: 'blog',
  label: '随笔',
  path: '/blog',
  icon: BookOpen,
  requireModule: 'blog',
  matchPrefix: '/blog',
  group: 'create',
}

const diary: WorkspaceNavItem = {
  key: 'diary',
  label: '日记',
  path: '/diary',
  icon: NotebookPen,
  requiredRole: 'user',
  requireModule: 'diary',
  matchPrefix: '/diary',
  requireLogin: true,
  group: 'create',
}

const worklog: WorkspaceNavItem = {
  key: 'worklog',
  label: '工作日志',
  path: '/worklog',
  icon: ClipboardList,
  requiredRole: 'user',
  requireModule: 'worklog',
  matchPrefix: '/worklog',
  requireLogin: true,
  group: 'create',
}

const lab: WorkspaceNavItem = {
  key: 'lab',
  label: '实验室',
  path: '/lab',
  icon: FlaskConical,
  requireModule: 'app-lab',
  matchPrefix: '/lab',
}

const music: WorkspaceNavItem = {
  key: 'music',
  label: '音乐',
  path: '/music',
  icon: Music2,
  matchPrefix: '/music',
}

const study: WorkspaceNavItem = {
  key: 'study',
  label: '学习',
  path: '/administrator/study',
  icon: GraduationCap,
  requiredRole: 'administrator',
  requireModule: 'study',
  matchPrefix: '/administrator/study',
  group: 'admin',
}

const userManage: WorkspaceNavItem = {
  key: 'userManage',
  label: '用户管理',
  path: '/admin/userManage',
  icon: Users,
  requiredRole: 'admin',
  matchPrefix: '/admin/userManage',
  group: 'admin',
}

const appManage: WorkspaceNavItem = {
  key: 'appManage',
  label: '应用管理',
  path: '/admin/appManage',
  icon: AppWindowMac,
  requiredRole: 'admin',
  requireModule: 'app-lab',
  matchPrefix: '/admin/appManage',
  group: 'admin',
}

const blogManage: WorkspaceNavItem = {
  key: 'blogManage',
  label: '博客管理',
  path: '/admin/blogManage',
  icon: PenTool,
  requiredRole: 'admin',
  requireModule: 'blog',
  matchPrefix: '/admin/blogManage',
  group: 'admin',
}

const chatHistoryManage: WorkspaceNavItem = {
  key: 'chatHistoryManage',
  label: '对话管理',
  path: '/admin/chatHistoryManage',
  icon: MessageSquareLock,
  requiredRole: 'admin',
  requireModule: 'chat',
  matchPrefix: '/admin/chatHistoryManage',
  group: 'admin',
}

const opsCenter: WorkspaceNavItem = {
  key: 'opsCenter',
  label: '运维中心',
  path: '/admin/ops/usage',
  icon: Activity,
  requiredRole: 'admin',
  requireModule: 'ops',
  matchPrefix: '/admin/ops',
  group: 'admin',
}

const siteSettings: WorkspaceNavItem = {
  key: 'siteSettings',
  label: '站点设置',
  path: '/admin/settings/site',
  icon: Settings,
  requiredRole: 'admin',
  matchPrefix: '/admin/settings',
  group: 'admin',
}

const profile: WorkspaceNavItem = {
  key: 'profile',
  label: '个人信息',
  path: '/user/profile',
  icon: User,
  requiredRole: 'user',
  matchPrefix: '/user/profile',
  requireLogin: true,
  group: 'account',
}

/* ================= 顶栏六组 ================= */

export interface NavGroupItem {
  key: string
  label: string
  /** link = 直接跳转；menu = 分组下拉 */
  type: 'link' | 'menu'
  path?: string
  matchPrefix?: string
  /** 仅 admin 可见 */
  adminOnly?: boolean
  children?: WorkspaceNavItem[]
}

export const TOP_NAV_GROUPS: NavGroupItem[] = [
  { key: 'home', label: '首页', type: 'link', path: '/' },
  { key: 'create', label: '创作', type: 'menu', children: [blog, diary, worklog] },
  { key: 'ai', label: '智能', type: 'menu', children: [chat, knowledge, library, reading] },
  { key: 'lab', label: '实验室', type: 'link', path: '/lab', matchPrefix: '/lab' },
  { key: 'music', label: '音乐', type: 'link', path: '/music', matchPrefix: '/music' },
  {
    key: 'admin',
    label: '管理',
    type: 'menu',
    adminOnly: true,
    children: [study, userManage, appManage, blogManage, chatHistoryManage, opsCenter, siteSettings],
  },
]

/* ================= rail 快速切换 ================= */

export const RAIL_HOME: WorkspaceNavItem = { key: 'hall', label: '门厅', path: '/', icon: Home }

/** rail 独立入口（不分组，直接图标） */
export const RAIL_QUICK: WorkspaceNavItem[] = [lab, music]

export interface RailGroup {
  key: NavGroupKey
  label: string
  icon: Component
  children: WorkspaceNavItem[]
}

export const RAIL_GROUPS: RailGroup[] = [
  { key: 'create', label: '创作', icon: PenLine, children: [blog, diary, worklog] },
  { key: 'ai', label: '智能', icon: Sparkles, children: [chat, knowledge, library, reading] },
  {
    key: 'admin',
    label: '管理',
    icon: Settings,
    children: [study, userManage, appManage, blogManage, chatHistoryManage, opsCenter, siteSettings],
  },
  { key: 'account', label: '账户', icon: User, children: [profile] },
]

/** 公开顶栏导航（PublicHeader 用，保持原样） */
export const PUBLIC_NAV: WorkspaceNavItem[] = [
  { key: 'blog', label: '随笔', path: '/blog', icon: BookOpen, matchPrefix: '/blog', requireModule: 'blog' },
  { key: 'lab', label: '实验室', path: '/lab', icon: FlaskConical, matchPrefix: '/lab', requireModule: 'app-lab' },
  { key: 'about', label: '关于', path: '/about', icon: Info, matchPrefix: '/about' },
]

/* ================= 权限过滤与激活判定 ================= */

/** 把 WorkspaceNavItem 适配到 canShowMenuItem */
function toMenuConfig(item: WorkspaceNavItem): MenuItemConfig {
  return {
    key: item.key,
    label: item.label,
    path: item.path,
    requiredRole: item.requiredRole,
    requireModule: item.requireModule,
    children: item.children?.map(toMenuConfig),
  }
}

/** 递归过滤导航项：按用户角色与模块能力剔除无权限/未开启的项（含子级） */
export function filterWorkspaceNav<T extends WorkspaceNavItem>(
  items: T[],
  user: { id?: number; userRole?: string } | null,
  caps?: CapabilityGate,
): T[] {
  return items
    .filter((item) => canShowMenuItem(toMenuConfig(item), user, caps))
    .map((item) => {
      if (!item.children?.length) return item
      return {
        ...item,
        children: filterWorkspaceNav(item.children as WorkspaceNavItem[], user, caps) as T['children'],
      }
    })
}

/** 判断导航项在当前路径下是否应高亮（支持 matchPrefix 前缀匹配，子路径也算命中） */
export function isNavActive(item: WorkspaceNavItem, path: string): boolean {
  if (item.matchPrefix) {
    if (item.matchPrefix === '/admin') {
      // 管理分组：admin 下但排除 knowledge / ops 已有独立入口时仍高亮父级
      return (
        path.startsWith('/admin') &&
        !path.startsWith('/admin/knowledge') &&
        !path.startsWith('/admin/ops')
      )
    }
    return path === item.matchPrefix || path.startsWith(item.matchPrefix + '/')
  }
  return path === item.path || path.startsWith(item.path + '/')
}

/** 顶栏分组是否激活：组内任一项命中即高亮 */
export function isGroupActive(group: NavGroupItem, path: string): boolean {
  if (group.type === 'link') {
    if (group.path === '/') return path === '/'
    if (group.matchPrefix) {
      return path === group.matchPrefix || path.startsWith(group.matchPrefix + '/')
    }
    return group.path === path
  }
  return (group.children ?? []).some(
    (c) => isNavActive(c, path) || (c.children ?? []).some((sub) => isNavActive(sub, path)),
  )
}
