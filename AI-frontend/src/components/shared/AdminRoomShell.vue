<script setup lang="ts">
/**
 * 管理房间壳：站点房间系 chrome（HomeTopbar + rail）+ 房间内二级导航。
 * - 默认二级导航 = 管理分区（用户/应用/博客/对话管理/运维中心/站点设置）
 * - 页面可通过 #nav 插槽替换（如运维中心的子 tab）
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import {
  RAIL_GROUPS,
  filterWorkspaceNav,
  isNavActive,
  type WorkspaceNavItem,
} from '@/config/workspaceNav'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { isAdminRole } from '@/config/permission'

const props = withDefaults(
  defineProps<{
    noteLabel?: string
  }>(),
  { noteLabel: 'Station · 管理台' },
)

const route = useRoute()
const router = useRouter()
const loginUserStore = useLoginUserStore()
const capsStore = useCapabilitiesStore()

// 从工作台导航配置中取「管理」分组，作为默认二级导航的数据源
const adminGroup = RAIL_GROUPS.find((g) => g.key === 'admin')

/** 按登录用户角色与站点能力开关（capsStore）过滤出当前用户可见的管理导航项 */
const navItems = computed<WorkspaceNavItem[]>(() => {
  if (!adminGroup) return []
  const user = loginUserStore.loginUser.id ? loginUserStore.loginUser : null
  return filterWorkspaceNav(adminGroup.children, user, {
    loaded: capsStore.loaded,
    enabled: capsStore.enabled,
  })
})

/** 点击导航项跳转；已在当前页时不重复 push，避免产生多余历史记录 */
const go = (item: WorkspaceNavItem) => {
  if (route.path !== item.path) router.push(item.path)
}

/** 是否管理员角色：非管理员不渲染左侧导航，只保留内容区 */
const isAdmin = computed(() => isAdminRole(loginUserStore.loginUser.userRole))
</script>

<template>
  <StationRoomShell brand-path="/" :note-label="props.noteLabel" room="admin">
    <div class="admin-room">
      <!-- 左侧二级导航：仅管理员可见，当前页高亮 -->
      <aside v-if="isAdmin" class="admin-room__nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="admin-nav-item"
          :class="{ 'is-current': isNavActive(item, route.path) }"
          @click="go(item)"
        >
          <component :is="item.icon" :size="15" :stroke-width="2" />
          <span>{{ item.label }}</span>
        </button>
      </aside>
      <!-- 右侧主内容区：管理页面通过插槽注入 -->
      <section class="admin-room__main">
        <slot />
      </section>
    </div>
  </StationRoomShell>
</template>

<style scoped>
/* 双栏布局：左侧固定宽度导航 sticky 吸顶，右侧内容自适应 */
.admin-room {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  width: 100%;
}

.admin-room__nav {
  flex: none;
  width: 148px;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-radius: 20px;
  background: var(--glass-chip, rgba(255, 255, 255, 0.72));
  border: 1.5px solid var(--glass-border, rgba(255, 255, 255, 0.9));
  box-shadow: var(--shadow-1, 0 10px 28px rgba(96, 116, 168, 0.16));
  backdrop-filter: blur(16px);
}

.admin-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--ink-soft, #6b7390);
  font-size: 13.5px;
  letter-spacing: 1px;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.admin-nav-item:hover {
  background: color-mix(in srgb, var(--c-violet, #9b8ce8) 13%, white);
  color: var(--ink, #4c5570);
}

.admin-nav-item.is-current {
  background: color-mix(in srgb, var(--c-violet, #9b8ce8) 19%, white);
  color: color-mix(in srgb, var(--c-violet, #9b8ce8) 82%, var(--ink, #4c5570));
  font-weight: 600;
}

.admin-room__main {
  flex: 1;
  min-width: 0;
}

@media (max-width: 900px) {
  .admin-room {
    flex-direction: column;
  }

  .admin-room__nav {
    width: 100%;
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
