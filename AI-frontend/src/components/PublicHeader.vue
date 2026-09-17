<script setup lang="ts">
/**
 * PublicHeader 公开场页顶栏
 * 职责：面向未进入工作台的公开页面（首页/博客/实验室等）的响应式导航头。
 * - 导航项来自 PUBLIC_NAV 配置，按登录用户与系统能力开关动态过滤
 * - 桌面端横向导航 + 头像下拉；移动端汉堡按钮展开抽屉导航
 * - 点击"博客"时会恢复用户上次浏览的文章（resolveBlogMenuClickPath）
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { LogIn, LogOut, Menu, User, X } from 'lucide-vue-next'
import { userLogout } from '@/api/userController'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { siteConfig } from '@/config/site'
import { PUBLIC_NAV, filterWorkspaceNav, isNavActive } from '@/config/workspaceNav'
import IconAction from '@/components/ui/IconAction.vue'
import { resolveBlogMenuClickPath } from '@/composables/useBlogLastPost'

const router = useRouter()
const route = useRoute()
const loginUserStore = useLoginUserStore()
const capsStore = useCapabilitiesStore()
const logoSrc = new URL('../assets/logo.svg', import.meta.url).href
const mobileOpen = ref(false)

// 按登录用户与能力开关过滤出当前可见的导航项
const navItems = computed(() =>
  filterWorkspaceNav(PUBLIC_NAV, loginUserStore.loginUser ?? null, {
    loaded: capsStore.loaded,
    enabled: capsStore.enabled,
  }),
)


// 导航跳转：博客入口特殊处理为"上次浏览的文章"；跳转前收起移动端抽屉，重复路由不重复跳转
const go = (path: string) => {
  let target = path
  if (path === '/blog') {
    target = resolveBlogMenuClickPath(route.path)
  }
  mobileOpen.value = false
  if (target !== route.path) router.push(target)
}

const goLogin = () => {
  mobileOpen.value = false
  if (route.path !== '/user/login') {
    router.push('/user/login')
  }
}

// 头像下拉菜单：个人中心跳转；退出登录调后端接口并复位本地登录态
const handleAvatarClick = async (key: string) => {
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
  <header class="public-header">
    <!-- 品牌区：点击回首页 -->
    <div class="public-header__brand" @click="go('/')">
      <img class="public-header__logo" :src="logoSrc" alt="Logo" />
      <div class="public-header__titles">
        <span class="public-header__name">{{ siteConfig.siteName }}</span>
        <span class="public-header__sub">{{ siteConfig.siteSubtitle }}</span>
      </div>
    </div>

    <!-- 桌面端横向导航（移动端由媒体规则隐藏） -->
    <nav class="public-header__nav" aria-label="公开导航">
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        class="public-header__link"
        :class="{ 'is-active': isNavActive(item, route.path) }"
        @click="go(item.path)"
      >
        <component :is="item.icon" :size="16" :stroke-width="2" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="public-header__actions">
      <!-- 已登录：头像 + 个人信息/退出下拉 -->
      <template v-if="loginUserStore.loginUser.id">
        <a-dropdown placement="bottomRight" :trigger="['click']">
          <button type="button" class="public-header__user">
            <a-avatar :size="32" :src="loginUserStore.loginUser.userAvatar" />
            <span class="public-header__user-name">{{ loginUserStore.loginUser.userName ?? '无名' }}</span>
          </button>
          <template #overlay>
            <a-menu
              @click="({ key }: { key: string | number }) => handleAvatarClick(String(key))"
            >
              <a-menu-item key="profile">
                <span class="menu-row"><User :size="14" /> 个人信息</span>
              </a-menu-item>
              <a-menu-divider />
              <a-menu-item key="logout">
                <span class="menu-row"><LogOut :size="14" /> 退出登录</span>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </template>
      <!-- 未登录：展示登录按钮 -->
      <IconAction
        v-else
        :icon="LogIn"
        label="登录"
        variant="primary"
        size="sm"
        @click="goLogin"
      />

      <!-- 移动端汉堡按钮：切换抽屉导航开合，图标随状态切换 -->
      <button
        type="button"
        class="public-header__burger"
        :aria-label="mobileOpen ? '关闭菜单' : '打开菜单'"
        @click="mobileOpen = !mobileOpen"
      >
        <X v-if="mobileOpen" :size="20" />
        <Menu v-else :size="20" />
      </button>
    </div>

    <!-- 移动端抽屉导航：仅汉堡按钮展开时渲染 -->
    <div v-if="mobileOpen" class="public-header__drawer">
      <button
        v-for="item in navItems"
        :key="`m-${item.key}`"
        type="button"
        class="public-header__drawer-link"
        :class="{ 'is-active': isNavActive(item, route.path) }"
        @click="go(item.path)"
      >
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.public-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
  height: 64px;
  padding: 0 24px;
}

.public-header__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}

.public-header__logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(232, 121, 169, 0.4));
}

.public-header__titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.public-header__name {
  font-size: 18px;
  font-weight: 600;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
  white-space: nowrap;
}

.public-header__sub {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.public-header__nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.public-header__link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.public-header__link:hover {
  color: var(--color-text-primary);
  background: var(--color-primary-12);
}

.public-header__link.is-active {
  color: #fff;
  background: var(--color-primary-20);
}

.public-header__link :deep(svg) {
  transition: transform 0.2s ease;
}

.public-header__link:hover :deep(svg) {
  transform: scale(1.1);
}

.public-header__link.is-active :deep(svg) {
  transform: scale(1.12);
  stroke-width: 2.6;
  filter: drop-shadow(0 0 6px var(--color-primary-35));
}

@media (prefers-reduced-motion: reduce) {
  .public-header__link :deep(svg),
  .public-header__link:hover :deep(svg),
  .public-header__link.is-active :deep(svg) {
    transition: none;
    transform: none;
  }
}

.public-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.public-header__user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-primary);
  font-family: inherit;
  cursor: pointer;
}

.public-header__user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.public-header__burger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary);
  cursor: pointer;
}

.public-header__drawer {
  display: none;
  position: absolute;
  top: 64px;
  left: 12px;
  right: 12px;
  padding: 8px;
  border-radius: var(--radius-lg);
  background: rgba(18, 24, 32, 0.96);
  border: 1px solid var(--color-border);
  backdrop-filter: blur(16px);
  z-index: 50;
  flex-direction: column;
  gap: 4px;
}

.public-header__drawer-link {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
  text-align: left;
}

.public-header__drawer-link.is-active,
.public-header__drawer-link:hover {
  background: var(--color-primary-12);
  color: var(--color-text-primary);
}

.menu-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .public-header {
    padding: 0 12px;
  }

  .public-header__nav {
    display: none;
  }

  .public-header__sub,
  .public-header__user-name {
    display: none;
  }

  .public-header__burger,
  .public-header__drawer {
    display: flex;
  }
}
</style>
