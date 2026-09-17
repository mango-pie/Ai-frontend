/**
 * 登录用户全局状态（Pinia Store）
 * - loginUser：当前登录用户信息（未登录时为默认值，无 id）
 * - fetchLoginUser：请求后端“获取当前登录用户”接口并写回 store（登录后或布局挂载时调用）
 * - setLoginUser：直接覆盖 store 中的用户（用于登出时清空）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getLoginUser } from '@/api/userController.ts'

export const useLoginUserStore = defineStore('loginUser', () => {
  // 未登录时的占位用户：userName 显示“未登录”，不含 id
  const loginUser = ref<API.LoginUserVO>({
    userName: '未登录',
  })

  /** 拉取当前登录用户；失败（未登录/网络异常）时保持原状态不抛出 */
  async function fetchLoginUser() {
    try {
      const res = await getLoginUser()
      if (res.data.code === 0 && res.data.data) {
        loginUser.value = res.data.data
      }
    } catch (error) {
      // 当未登录时，保持默认状态
      console.log('未登录或获取用户信息失败:', error)
    }
  }

  /** 直接覆盖用户信息（登录成功写入 / 登出清空） */
  function setLoginUser(newLoginUser: API.LoginUserVO) {
    loginUser.value = newLoginUser
  }

  return { loginUser, setLoginUser, fetchLoginUser }
})
