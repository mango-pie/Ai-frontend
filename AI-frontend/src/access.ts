/**
 * 路由访问控制入口（通过副作用注册全局前置守卫，main.ts 中 `import '@/access'` 生效）
 * 整体流程：
 * 1. 首次导航并行拉取登录用户与模块能力清单，之后仅确保能力清单就绪
 * 2. 模块门控：目标路由所需模块未开启时重定向到 /module-unavailable
 * 3. 会话恢复：回到「对话」首页时自动跳回上次浏览的具体对话
 * 4. 角色校验：按 ROUTE_PERMISSIONS 要求登录 / 管理员角色，不满足则跳转登录页或首页
 */
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { message } from 'ant-design-vue'
import router from '@/router'
import { getRequiredRole, isAdminRole } from '@/config/permission'
import { getRequiredModuleByPath } from '@/config/modules'
import { getLastChatConversationId, shouldResumeChatHome } from '@/utils/chatSession'

// 是否为首次获取登录用户
let firstFetchLoginUser = true

/**
 * 全局权限校验（依据 src/config/permission.ts 的 ROUTE_PERMISSIONS 与路径前缀）
 * 以及模块门控（GET /app/modules + 路由 meta.requireModule）
 */
router.beforeEach(async (to, _from) => {
  const loginUserStore = useLoginUserStore()
  const capabilitiesStore = useCapabilitiesStore()
  let loginUser = loginUserStore.loginUser
  // 首次进入应用时才请求登录用户接口，后续导航直接复用 store 缓存，减少请求
  if (firstFetchLoginUser) {
    await Promise.all([loginUserStore.fetchLoginUser(), capabilitiesStore.ensureLoaded()])
    loginUser = loginUserStore.loginUser
    firstFetchLoginUser = false
  } else {
    await capabilitiesStore.ensureLoaded()
  }

  // 模块门控：优先取路由 meta.requireModule，其次按路径前缀推断所属模块
  const requiredModule =
    (typeof to.meta.requireModule === 'string' && to.meta.requireModule) ||
    getRequiredModuleByPath(to.path)
  if (requiredModule && !capabilitiesStore.enabled(requiredModule)) {
    // 目标本身就是“模块不可用”页时直接放行，避免死循环
    if (to.path === '/module-unavailable') {
      return true
    }
    return {
      path: '/module-unavailable',
      query: { module: requiredModule },
      replace: true,
    }
  }

  // 回到「对话」时恢复上次具体对话页，而非停留在 /chat 列表
  if (
    capabilitiesStore.enabled('chat') &&
    shouldResumeChatHome(to.path, to.query as Record<string, unknown>)
  ) {
    const last = getLastChatConversationId()
    if (last) {
      return { path: `/chat/${last}`, replace: true }
    }
  }

  const required = getRequiredRole(to.path)
  if (!required) {
    return true
  }

  // 未登录直接访问受保护页面：提示并携带回跳地址去登录页
  if (!loginUser?.id) {
    message.error('请先登录')
    return { path: '/user/login', query: { redirect: to.fullPath } }
  }

  // 需要 admin 角色但当前用户不是管理员：提示无权限并遣返首页
  if (required === 'admin' && !isAdminRole(loginUser.userRole)) {
    message.error('没有权限')
    return { path: '/' }
  }

  return true
})
