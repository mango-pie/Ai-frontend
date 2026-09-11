/**
 * 统一权限配置：路由访问权限 + 菜单展示权限
 * 新增页面时：
 * 1. 在 ROUTE_PERMISSIONS 中增加 path -> requiredRole
 * 2. 若需在导航菜单展示，在 MENU_ITEMS 中增加一项（key、label、path、requiredRole、requireModule）
 * 路由与 access 会根据 ROUTE_PERMISSIONS 校验；布局会根据 MENU_ITEMS + requiredRole + requireModule 过滤菜单
 * 3. 业务模块入口需声明 requireModule（与 GET /app/modules 的 key 对齐）
 */

/** 路由所需权限：不设 = 所有人；'user' = 仅登录；'admin' = 仅管理员 */
export type RequiredRole = 'user' | 'admin' | 'administrator'

/** 管理员角色（与后端一致） */
const ADMIN_ROLES = ['admin', 'administrator'] as const
/**高级管理角色（与后端一致） */
const AdministratorRoles = ['administrator'] as const
/**
/** 路径 -> 所需权限（仅配置需要鉴权的路径，未配置的视为公开） */
export const ROUTE_PERMISSIONS: Record<string, RequiredRole | undefined> = {
  '/user/profile': 'user',
  '/admin/userManage': 'admin',
  '/admin/appManage': 'admin',
  '/admin/blogManage': 'admin',
  '/administrator/study': 'administrator',
  '/chat': 'user',
  '/diary': 'user',
}

/**
 * 导航菜单配置（含是否展示的权限要求）
 * 新增要在菜单里展示的页面时在此添加一项，requiredRole 决定谁能看到
 */
export interface MenuItemConfig {
  key: string
  label: string
  path?: string
  /** 不设 = 所有人可见；'user' = 仅登录后可见；'admin' = 仅管理员可见 */
  requiredRole?: RequiredRole
  /** 对应 GET /app/modules 的模块 key；不设 = 平台常驻入口 */
  requireModule?: string
  children?: MenuItemConfig[]
}

export const MENU_ITEMS: MenuItemConfig[] = [
  { key: 'home', label: '首页', path: '/' },
  { key: 'blogHome', label: '随笔', path: '/blog', requireModule: 'blog' },
  { key: 'diary', label: '日记', path: '/diary', requiredRole: 'user', requireModule: 'diary' },
  { key: 'lab', label: '实验室', path: '/lab', requireModule: 'app-lab' },
  {
    key: 'manage',
    label: '管理',
    requiredRole: 'admin',
    children: [
      { key: 'userManage', label: '用户管理', path: '/admin/userManage', requiredRole: 'admin' },
      { key: 'appManage', label: '应用管理', path: '/admin/appManage', requiredRole: 'admin', requireModule: 'app-lab' },
      { key: 'blogManage', label: '博客管理', path: '/admin/blogManage', requiredRole: 'admin', requireModule: 'blog' },
    ],
  },
  { key: 'about', label: '关于', path: '/about' },
  { key: 'study', label: '学习', path: '/administrator/study', requiredRole: 'administrator', requireModule: 'study' },
  { key: 'test', label: '测试', path: '/test', requiredRole: 'administrator' },
  { key: 'chat', label: '对话', path: '/chat', requiredRole: 'user', requireModule: 'chat' },
]

/** 当前用户是否具备管理员角色 */
export function isAdminRole(userRole: string | undefined): boolean {
  return !!userRole && ADMIN_ROLES.includes(userRole as (typeof ADMIN_ROLES)[number])
}

export function isAdministrator(userRole: string | undefined): boolean {
  return !!userRole && AdministratorRoles.includes(userRole as (typeof AdministratorRoles)[number])
}

/** 获取某路径所需权限（未配置则视为公开；以 /admin 开头的路径默认需 admin） */
export function getRequiredRole(path: string): RequiredRole | undefined {
  if (ROUTE_PERMISSIONS[path] !== undefined) return ROUTE_PERMISSIONS[path]
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/administrator')) return 'administrator'
  if (path === '/chat' || path.startsWith('/chat/')) return 'user'
  if (path === '/diary' || path.startsWith('/diary/')) return 'user'
  return undefined
}

/** 是否有权访问某路径 */
export function canAccessRoute(
  path: string,
  user: { id?: number; userRole?: string } | null,
): boolean {
  const required = getRequiredRole(path)
  if (!required) return true
  if (!user?.id) return false
  if (required === 'user') return true
  if (required === 'admin') return isAdminRole(user.userRole)
  if (required === 'administrator') return isAdministrator(user.userRole)
  return false
}

/** 是否应在菜单中展示该项（根据当前用户、item.requiredRole 与模块开关） */
export function canShowMenuItem(
  item: MenuItemConfig,
  user: { id?: number; userRole?: string } | null,
  moduleEnabled: (name: string) => boolean = () => true,
): boolean {
  // 检查当前项是否满足权限
  const currentItemVisible = (() => {
    if (!item.requiredRole) return true
    if (item.requiredRole === 'user') return !!user?.id
    if (item.requiredRole === 'admin') return !!user?.id && isAdminRole(user.userRole)
    if (item.requiredRole === 'administrator') return !!user?.id && isAdministrator(user.userRole)
    return false
  })()

  if (!currentItemVisible) return false

  if (item.requireModule && !moduleEnabled(item.requireModule)) {
    return false
  }

  // 递归过滤子菜单
  if (item.children) {
    const visibleChildren = item.children.filter((child) => canShowMenuItem(child, user, moduleEnabled))
    // 如果当前项有子菜单但没有可见的子项，则不显示当前项
    if (!item.path && visibleChildren.length === 0) return false
  }

  return true
}

/** 递归过滤菜单及其子菜单 */
export function filterMenuItems(
  items: MenuItemConfig[],
  user: { id?: number; userRole?: string } | null,
  moduleEnabled: (name: string) => boolean = () => true,
): MenuItemConfig[] {
  return items
    .filter((item) => canShowMenuItem(item, user, moduleEnabled))
    .map((item) => {
      if (item.children) {
        return {
          ...item,
          children: filterMenuItems(item.children, user, moduleEnabled),
        }
      }
      return item
    })
}
