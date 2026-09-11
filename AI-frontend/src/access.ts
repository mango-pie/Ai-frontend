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
  if (firstFetchLoginUser) {
    await Promise.all([loginUserStore.fetchLoginUser(), capabilitiesStore.ensureLoaded()])
    loginUser = loginUserStore.loginUser
    firstFetchLoginUser = false
  } else {
    await capabilitiesStore.ensureLoaded()
  }

  const requiredModule =
    (typeof to.meta.requireModule === 'string' && to.meta.requireModule) ||
    getRequiredModuleByPath(to.path)
  if (requiredModule && !capabilitiesStore.enabled(requiredModule)) {
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

  if (!loginUser?.id) {
    message.error('请先登录')
    return { path: '/user/login', query: { redirect: to.fullPath } }
  }

  if (required === 'admin' && !isAdminRole(loginUser.userRole)) {
    message.error('没有权限')
    return { path: '/' }
  }

  return true
})
