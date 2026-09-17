
<template>
  <!-- 仅有权限时渲染插槽内容，无权限直接不渲染 -->
  <slot v-if="hasPermission"></slot>
</template>

<script setup lang="ts">
/**
 * PermissionWrapper 权限包裹组件
 * 职责：声明式的权限控制容器——按所需角色或自定义校验函数判断当前登录用户，
 * 有权限则渲染插槽内容，无权限则整体隐藏（不渲染任何替代 UI）。
 */
import { computed } from 'vue'
import { useLoginUserStore } from '@/stores/loginUser'
import { isAdminRole, isAdministrator } from '@/config/permission'
import type { RequiredRole } from '@/config/permission'

interface Props {
  /** 所需角色：'user' | 'admin' | 'administrator' */
  required?: RequiredRole
  /** 自定义权限检查函数 */
  customCheck?: (user: API.LoginUserVO) => boolean
}

const props = defineProps<Props>()
const loginUserStore = useLoginUserStore()

// 权限判定：customCheck 优先，其次按 required 角色逐级校验（登录 -> 管理员 -> 高级管理员）
const hasPermission = computed(() => {
  const user = loginUserStore.loginUser

  // 自定义检查优先
  if (props.customCheck) {
    return props.customCheck(user)
  }

  // 未设置权限要求，默认显示
  if (!props.required) {
    return true
  }

  // 需要登录
  if (props.required === 'user') {
    return !!user?.id
  }

  // 需要管理员
  if (props.required === 'admin') {
    return !!user?.id && isAdminRole(user.userRole)
  }

  // 需要高级管理员
  if (props.required === 'administrator') {
    return !!user?.id && isAdministrator(user.userRole)
  }

  return false
})
</script>
