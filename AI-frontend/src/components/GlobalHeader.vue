<script setup lang="ts">
/**
 * GlobalHeader 全局顶栏
 * 职责：展示 Logo/站名（点击回首页）、水平导航菜单（由父组件传入并按权限过滤）、
 * 以及右侧登录态区域（已登录展示头像下拉菜单，未登录展示登录按钮）。
 * 菜单点击仅向父组件抛出 menuClick 事件，导航跳转逻辑由父组件统一处理。
 */
import { computed } from 'vue'
import { useLoginUserStore } from '@/stores/loginUser.ts'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { MenuProps } from 'ant-design-vue'
import { User, LogOut, LogIn, ChevronDown } from 'lucide-vue-next'
import { userLogout } from '@/api/userController'
import { siteConfig } from '@/config/site'

interface MenuItem {
  key: string
  label: string
  path?: string
  children?: MenuItem[]
}

const props = defineProps<{
  menuItems: MenuItem[]
  selectedKeys: string[]
}>()

const emit = defineEmits<{
  (e: 'menuClick', key: string): void
}>()

const router = useRouter()
const logoSrc = new URL('../assets/logo.svg', import.meta.url).href
const loginUserStore = useLoginUserStore()

// 把内部菜单树结构递归转换为 ant-design-vue Menu 组件所需的 items 格式
const menuItemsForAntd = computed<MenuProps['items']>(() => {
  const convert = (items: MenuItem[]): MenuProps['items'] => {
    return items.map(item => {
      const result: any = {
        key: item.key,
        label: item.label,
      }
      if (item.children && item.children.length > 0) {
        result.children = convert(item.children)
      }
      return result
    })
  }
  return convert(props.menuItems)
})

// 导航菜单点击：透传给父组件处理路由跳转
const handleMenuClick = (info: { key: string | number }) => {
  emit('menuClick', String(info.key))
}

type MenuClickEvent = { key: string | number }

// 头像下拉菜单：个人中心直接跳转；退出登录调后端接口并复位本地登录态
const handleAvatarClick = async ({ key }: MenuClickEvent) => {
  if (key === 'profile') {
    await router.push('/user/profile')
    return
  }
  if (key === 'logout') {
    const res = await userLogout()
    if (res.data.code === 0 && res.data.data) {
      loginUserStore.setLoginUser({ userName: '未登录' })
      message.success('已退出登录')
      await router.push('/user/login')
    } else {
      message.error('退出失败，' + res.data.message)
    }
  }
}
</script>

<template>
  <div class="global-header">
    <!-- 品牌区：点击回首页 -->
    <div class="global-header__left" @click="router.push('/')">
      <img class="global-header__logo" :src="logoSrc" alt="Logo" />
      <div class="global-header__brand">
        <span class="global-header__title">{{ siteConfig.siteName }}</span>
        <span class="global-header__subtitle">{{ siteConfig.siteSubtitle }}</span>
      </div>
    </div>

    <!-- 中部导航菜单 -->
    <div class="global-header__center">
      <a-menu
        mode="horizontal"
        :items="menuItemsForAntd"
        :selectedKeys="props.selectedKeys"
        @click="handleMenuClick"
        class="global-header__menu"
      />
    </div>

    <!-- 右侧登录态：已登录显示头像+下拉菜单，未登录显示登录按钮 -->
    <div class="user-login-status">
      <div v-if="loginUserStore.loginUser.id">
        <a-dropdown
          placement="bottomRight"
          :trigger="['click']"
        >
          <a-space class="user-entry" size="small">
            <a-avatar :src="loginUserStore.loginUser.userAvatar" class="user-entry__avatar" />
            <span class="user-entry__name">{{ loginUserStore.loginUser.userName ?? '无名' }}</span>
            <ChevronDown :size="15" class="user-entry__caret" />
          </a-space>
          <template #overlay>
            <a-menu @click="handleAvatarClick" class="user-dropdown-menu">
              <a-menu-item key="profile">
                <template #icon><User :size="15" /></template>
                个人信息
              </a-menu-item>
              <a-menu-divider />
              <a-menu-item key="logout">
                <template #icon><LogOut :size="15" /></template>
                退出登录
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
      <div v-else>
        <a-button type="primary" class="login-btn" @click="router.push('/user/login')">
          <template #icon><LogIn :size="15" /></template>
          登录
        </a-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.global-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  padding: 0 24px;
  gap: 24px;
  height: 64px;
  overflow: hidden;
  background: transparent;
}

.global-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.global-header__left:hover {
  transform: scale(1.02);
}

.global-header__logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(232, 121, 169, 0.4));
}

.global-header__brand {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.global-header__title {
  font-size: 18px;
  font-weight: 600;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
  line-height: 1.2;
}

.global-header__subtitle {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.global-header__center {
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
}

.global-header__menu {
  border-bottom: none !important;
  background: transparent !important;
  line-height: 64px;
}

.global-header__menu :deep(.ant-menu) {
  background: transparent !important;
}

.global-header__menu :deep(.ant-menu-overflow) {
  gap: 0;
}

.global-header__menu :deep(.ant-menu-horizontal) {
  border-bottom: none;
  gap: 0;
}

.global-header__menu :deep(.ant-menu-horizontal > .ant-menu-item),
.global-header__menu :deep(.ant-menu-horizontal > .ant-menu-submenu) {
  margin: 0 !important;
  padding: 0 !important;
  top: 0;
  border-radius: 0;
}

.global-header__menu :deep(.ant-menu-item) {
  color: var(--color-text-secondary);
  transition: background 0.25s ease, color 0.25s ease;
  margin: 0 !important;
  border-radius: 0;
  padding: 0 22px !important;
  height: 64px !important;
  line-height: 64px !important;
  display: inline-flex !important;
  align-items: center;
}

.global-header__menu :deep(.ant-menu-item::after) {
  display: none !important;
}

.global-header__menu :deep(.ant-menu-item:hover) {
  color: var(--color-text-primary);
  background: rgba(232, 121, 169, 0.12) !important;
}

.global-header__menu :deep(.ant-menu-item-selected) {
  color: #fff !important;
  background: var(--gradient-primary) !important;
  box-shadow: none;
}

.global-header__menu :deep(.ant-menu-item-selected::after) {
  display: none !important;
}

.global-header__menu :deep(.ant-menu-submenu) {
  margin: 0 !important;
  padding: 0 !important;
}

.global-header__menu :deep(.ant-menu-submenu-title) {
  color: var(--color-text-secondary) !important;
  margin: 0 !important;
  border-radius: 0;
  padding: 0 22px !important;
  height: 64px !important;
  line-height: 64px !important;
  display: inline-flex !important;
  align-items: center;
  transition: background 0.25s ease, color 0.25s ease;
}

.global-header__menu :deep(.ant-menu-submenu-title::after) {
  display: none !important;
}

.global-header__menu :deep(.ant-menu-submenu-title:hover) {
  color: var(--color-text-primary) !important;
  background: rgba(232, 121, 169, 0.12) !important;
}

.global-header__menu :deep(.ant-menu-submenu-open .ant-menu-submenu-title),
.global-header__menu :deep(.ant-menu-submenu-selected .ant-menu-submenu-title) {
  color: #fff !important;
  background: var(--gradient-primary) !important;
}

.global-header__menu :deep(.ant-menu-sub) {
  background: rgba(26, 22, 37, 0.95) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  padding: 4px 0;
}

.global-header__menu :deep(.ant-menu-sub .ant-menu-item) {
  height: 44px !important;
  line-height: 44px !important;
  padding: 0 20px !important;
  margin: 0 !important;
  border-radius: 8px;
  color: var(--color-text-secondary) !important;
}

.global-header__menu :deep(.ant-menu-sub .ant-menu-item:hover) {
  background: rgba(232, 121, 169, 0.12) !important;
  color: var(--color-text-primary) !important;
}

.global-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.user-login-status {
  display: flex;
  align-items: center;
}

.user-entry {
  cursor: pointer;
  user-select: none;
  padding: 6px 12px;
  border-radius: 20px;
  transition: all 0.3s ease;
}

.user-entry:hover {
  background: rgba(232, 121, 169, 0.1);
}

.user-entry__avatar {
  border: 2px solid rgba(232, 121, 169, 0.45);
}

.user-entry__name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-primary);
  font-weight: 500;
}

.user-dropdown-menu :deep(.ant-menu-item) {
  color: var(--color-text-primary) !important;
}

.user-dropdown-menu :deep(.ant-menu-item:hover) {
  background: rgba(232, 121, 169, 0.15) !important;
}

.login-btn {
  background: var(--gradient-primary) !important;
  border: none !important;
  box-shadow: var(--shadow-glow);
  transition: all 0.3s ease;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow-lg);
}

.login-btn :deep(svg) {
  vertical-align: -0.16em;
  transition: transform var(--transition-fast);
}
.login-btn:hover :deep(svg) {
  transform: translateX(2px);
}

.user-entry__caret {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}
.user-entry:hover .user-entry__caret {
  transform: translateY(2px);
}

@media (prefers-reduced-motion: reduce) {
  .login-btn :deep(svg),
  .user-entry__caret {
    transition: none;
  }
  .login-btn:hover :deep(svg),
  .user-entry:hover .user-entry__caret {
    transform: none;
  }
}

@media (max-width: 768px) {
  .global-header {
    padding: 0 12px;
    gap: 12px;
  }

  .global-header__title {
    font-size: 15px;
  }

  .global-header__subtitle {
    display: none;
  }

  .global-header__logo {
    width: 32px;
    height: 32px;
  }

  .user-entry__name {
    display: none;
  }

  .global-header__menu :deep(.ant-menu-item),
  .global-header__menu :deep(.ant-menu-submenu-title) {
    padding: 0 14px !important;
    font-size: 14px;
  }
}
</style>