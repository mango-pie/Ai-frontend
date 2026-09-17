<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ChevronDown, LogOut, Settings, User } from 'lucide-vue-next'
import { siteConfig } from '@/config/site'
import { isAdminRole } from '@/config/permission'
import { useLoginUserStore } from '@/stores/loginUser'
import { userLogout } from '@/api/userController'
import { resolveBlogMenuClickPath } from '@/composables/useBlogLastPost'
import { getChatEntryPath } from '@/utils/chatSession'
import { useCapabilitiesStore } from '@/stores/capabilities'
import {
  TOP_NAV_GROUPS,
  filterWorkspaceNav,
  isGroupActive,
  isNavActive,
  type NavGroupItem,
  type WorkspaceNavItem,
} from '@/config/workspaceNav'

const props = withDefaults(
  defineProps<{
    clockHtml: string
    clockDate: string
    /** Brand click target; blog room uses `/blog` */
    brandPath?: string
  }>(),
  { brandPath: '/' },
)

const route = useRoute()
const router = useRouter()
const loginUserStore = useLoginUserStore()
const capsStore = useCapabilitiesStore()
const logoSrc = new URL('../../assets/logo.svg', import.meta.url).href

/** 顶栏六组：首页 / 创作▾ / 智能▾ / 实验室 / 音乐 / 管理▾(admin) */
const navGroups = computed<NavGroupItem[]>(() => {
  const user = loginUserStore.loginUser.id ? loginUserStore.loginUser : null
  const isAdmin = isAdminRole(loginUserStore.loginUser.userRole)
  return TOP_NAV_GROUPS.filter((g) => {
    if (g.adminOnly && !isAdmin) return false
    if (g.type === 'link') return true
    const children = filterWorkspaceNav(g.children ?? [], user, {
      loaded: capsStore.loaded,
      enabled: capsStore.enabled,
    })
    return children.length > 0
  })
})

/** 展开的下拉组（分组 key），Escape/点击外部关闭 */
const openMenuKey = ref<string | null>(null)

const visibleChildren = (group: NavGroupItem): WorkspaceNavItem[] =>
  filterWorkspaceNav(group.children ?? [], loginUserStore.loginUser.id ? loginUserStore.loginUser : null, {
    loaded: capsStore.loaded,
    enabled: capsStore.enabled,
  })

const navRef = ref<HTMLElement | null>(null)
const avatarWrapRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const pillStyle = ref({ left: '0px', width: '0px', opacity: 0 })

const isLoggedIn = computed(() => !!loginUserStore.loginUser.id)
const isAdmin = computed(() => isAdminRole(loginUserStore.loginUser.userRole))
const avatarLetter = computed(() => {
  const name = loginUserStore.loginUser.userName || siteConfig.ownerName || '某'
  return name.slice(0, 1)
})
const avatarSrc = computed(() => {
  if (isLoggedIn.value && loginUserStore.loginUser.userAvatar) {
    return loginUserStore.loginUser.userAvatar
  }
  return siteConfig.avatar
})

const isActive = (group: NavGroupItem) => isGroupActive(group, route.path)

const movePill = async () => {
  await nextTick()
  const nav = navRef.value
  if (!nav) return
  const activeBtn = nav.querySelector('button.active') as HTMLElement | null
  if (!activeBtn) {
    pillStyle.value = { ...pillStyle.value, opacity: 0 }
    return
  }
  /* 分组容器自带 position:relative，offsetLeft 不再相对 nav，改用视口坐标差值 */
  const navRect = nav.getBoundingClientRect()
  const btnRect = activeBtn.getBoundingClientRect()
  pillStyle.value = {
    left: `${btnRect.left - navRect.left}px`,
    width: `${btnRect.width}px`,
    opacity: 1,
  }
}

const resolvePath = (item: WorkspaceNavItem): string => {
  if (item.path === '/chat' && isLoggedIn.value) return getChatEntryPath()
  if (item.path === '/blog') return resolveBlogMenuClickPath(route.path)
  return item.path
}

const goItem = (item: WorkspaceNavItem) => {
  openMenuKey.value = null
  if (item.requireLogin && !isLoggedIn.value) {
    router.push('/user/login')
    return
  }
  const target = resolvePath(item)
  if (route.path !== target) router.push(target)
}

const goLink = (group: NavGroupItem) => {
  openMenuKey.value = null
  if (!group.path) return
  if (group.path === '/' ? route.path !== '/' : true) router.push(group.path)
}

const toggleMenu = (group: NavGroupItem) => {
  if (group.type !== 'menu') return
  openMenuKey.value = openMenuKey.value === group.key ? null : group.key
}

const closeMenu = () => {
  menuOpen.value = false
}

const onAvatarClick = () => {
  if (!isLoggedIn.value) {
    router.push('/user/login')
    return
  }
  menuOpen.value = !menuOpen.value
}

const goMenu = (path: string) => {
  closeMenu()
  if (route.path !== path) router.push(path)
}

const handleLogout = async () => {
  closeMenu()
  const res = await userLogout()
  if (res.data.code === 0 && res.data.data) {
    loginUserStore.setLoginUser({ userName: '未登录' })
    message.success('已退出登录')
    await router.push('/user/login')
  } else {
    message.error('退出失败，' + res.data.message)
  }
}

const onDocClick = (e: MouseEvent) => {
  if (openMenuKey.value && navRef.value && !navRef.value.contains(e.target as Node)) {
    openMenuKey.value = null
  }
  if (!menuOpen.value) return
  const wrap = avatarWrapRef.value
  if (wrap && !wrap.contains(e.target as Node)) closeMenu()
}

const onDocKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeMenu()
    openMenuKey.value = null
  }
}

onMounted(() => {
  movePill()
  window.addEventListener('resize', movePill)
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)
})
onUnmounted(() => {
  window.removeEventListener('resize', movePill)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
})
watch([() => route.path, navGroups], () => {
  movePill()
  closeMenu()
  openMenuKey.value = null
})
</script>

<template>
  <header id="topbar" class="anim" style="animation-delay: 0.05s">
    <div
      class="brand"
      role="link"
      tabindex="0"
      @click="router.push(props.brandPath)"
      @keydown.enter="router.push(props.brandPath)"
    >
      <div class="brand-mark">
        <img :src="logoSrc" alt="" width="28" height="28" />
      </div>
      <div>
        <div class="brand-name font-display">{{ siteConfig.siteName }}</div>
        <div class="brand-sub">{{ siteConfig.brandRoman }}</div>
      </div>
    </div>

    <nav id="mainnav" ref="navRef" aria-label="主页导航">
      <span id="navPill" :style="pillStyle" />
      <template v-for="group in navGroups" :key="group.key">
        <button
          v-if="group.type === 'link'"
          type="button"
          :class="{ active: isActive(group) }"
          @click="goLink(group)"
        >
          {{ group.label }}
        </button>
        <div
          v-else
          class="nav-group"
          :class="{ 'is-open': openMenuKey === group.key }"
          @mouseenter="openMenuKey = group.key"
          @mouseleave="openMenuKey = openMenuKey === group.key ? null : openMenuKey"
        >
          <button
            type="button"
            :class="{ active: isActive(group) }"
            :aria-expanded="openMenuKey === group.key"
            aria-haspopup="menu"
            @click="toggleMenu(group)"
          >
            {{ group.label }}
            <ChevronDown class="nav-caret" :size="12" :stroke-width="2.2" />
          </button>
          <Transition name="navdrop">
            <div v-if="openMenuKey === group.key" class="nav-dropdown" role="menu">
              <template v-for="child in visibleChildren(group)" :key="child.key">
                <button
                  v-if="!child.children?.length"
                  type="button"
                  role="menuitem"
                  class="nav-drop-item"
                  :class="{ 'is-current': isNavActive(child, route.path) }"
                  @click="goItem(child)"
                >
                  <component :is="child.icon" class="nav-drop-icon" :size="15" :stroke-width="2" />
                  <span class="nav-drop-label">{{ child.label }}</span>
                  <span v-if="isNavActive(child, route.path)" class="nav-drop-dot" />
                </button>
                <!-- 二级分组（如 AI 精读的子页面）：直接平铺展示 -->
                <template v-else>
                  <div class="nav-drop-section">
                    <component :is="child.icon" class="nav-drop-icon" :size="15" :stroke-width="2" />
                    <span class="nav-drop-label">{{ child.label }}</span>
                  </div>
                  <button
                    v-for="sub in child.children"
                    :key="sub.key"
                    type="button"
                    role="menuitem"
                    class="nav-drop-item nav-drop-item--sub"
                    :class="{ 'is-current': isNavActive(sub, route.path) }"
                    @click="goItem(sub)"
                  >
                    <component :is="sub.icon" class="nav-drop-icon" :size="14" :stroke-width="2" />
                    <span class="nav-drop-label">{{ sub.label }}</span>
                    <span v-if="isNavActive(sub, route.path)" class="nav-drop-dot" />
                  </button>
                </template>
              </template>
            </div>
          </Transition>
        </div>
      </template>
    </nav>

    <div class="top-right">
      <div class="clock-chip">
        <div class="clock-time" v-html="props.clockHtml" />
        <div class="clock-date">{{ props.clockDate }}</div>
      </div>
      <div ref="avatarWrapRef" class="avatar-wrap">
        <button
          type="button"
          class="avatar"
          :aria-label="isLoggedIn ? '账户菜单' : '登录'"
          :aria-expanded="isLoggedIn ? menuOpen : undefined"
          :aria-haspopup="isLoggedIn ? 'menu' : undefined"
          @click="onAvatarClick"
        >
          <img v-if="avatarSrc" :src="avatarSrc" alt="" class="avatar-img" />
          <span v-else>{{ avatarLetter }}</span>
        </button>
        <div v-if="isLoggedIn && menuOpen" class="avatar-menu" role="menu">
          <button type="button" role="menuitem" class="avatar-menu__item" @click="goMenu('/user/profile')">
            <User :size="14" :stroke-width="2" />
            个人信息
          </button>
          <button
            v-if="isAdmin"
            type="button"
            role="menuitem"
            class="avatar-menu__item"
            @click="goMenu('/admin/settings/site')"
          >
            <Settings :size="14" :stroke-width="2" />
            站点设置
          </button>
          <button type="button" role="menuitem" class="avatar-menu__item avatar-menu__item--danger" @click="handleLogout">
            <LogOut :size="14" :stroke-width="2" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.brand {
  cursor: pointer;
}
.brand-mark img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

/* ===== 顶栏分组下拉 ===== */
.nav-group {
  position: relative;
  display: inline-flex;
}

.nav-caret {
  margin-left: 4px;
  opacity: 0.65;
  transition: transform 0.2s ease;
}

.nav-group.is-open .nav-caret {
  transform: rotate(180deg);
}

.nav-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  min-width: 176px;
  padding: 8px;
  border-radius: 18px;
  background: var(--glass-chip, rgba(255, 255, 255, 0.94));
  border: 1.5px solid var(--glass-border, rgba(255, 255, 255, 0.95));
  box-shadow: var(--shadow-2, 0 18px 44px rgba(96, 116, 168, 0.22));
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-drop-item,
.nav-drop-section {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--ink, #4c5570);
  font-size: 14px;
  letter-spacing: 1px;
  text-align: left;
}

.nav-drop-section {
  cursor: default;
  padding-bottom: 4px;
  font-size: 12px;
  opacity: 0.72;
}

.nav-drop-item {
  cursor: pointer;
  transition: background 0.16s ease;
}

.nav-drop-item:hover {
  background: color-mix(in srgb, var(--c-violet, #9b8ce8) 14%, white);
}

.nav-drop-item--sub {
  padding-left: 26px;
  font-size: 13px;
}

.nav-drop-item.is-current {
  color: color-mix(in srgb, var(--c-violet, #9b8ce8) 80%, var(--ink, #4c5570));
  font-weight: 600;
}

.nav-drop-icon {
  flex: none;
  opacity: 0.8;
}

.nav-drop-label {
  flex: 1;
  white-space: nowrap;
}

.nav-drop-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-violet, #9b8ce8);
  flex: none;
}

.navdrop-enter-active,
.navdrop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.navdrop-enter-from,
.navdrop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}

/* ===== 头像菜单（原有） ===== */
.avatar {
  overflow: hidden;
  padding: 0;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
.avatar-wrap {
  position: relative;
  flex: none;
}
.avatar-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 40;
  min-width: 168px;
  padding: 8px;
  border-radius: 18px;
  background: var(--glass-chip, rgba(255, 255, 255, 0.94));
  border: 1.5px solid var(--glass-border, rgba(255, 255, 255, 0.95));
  box-shadow: var(--shadow-1, 0 10px 28px rgba(96, 116, 168, 0.16));
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.avatar-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--ink, #4c5570);
  font-size: 14px;
  letter-spacing: 1px;
  text-align: left;
  cursor: pointer;
}
.avatar-menu__item:hover {
  background: color-mix(in srgb, var(--c-violet, #9b8ce8) 14%, white);
  color: var(--ink, #4c5570);
}
.avatar-menu__item--danger:hover {
  background: color-mix(in srgb, #e0699b 16%, white);
}
</style>
