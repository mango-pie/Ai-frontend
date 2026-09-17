<script setup lang="ts">
/**
 * 工作台左侧竖向导航栏（全站固定在左上角的玻璃质感 Dock）
 * - 结构：首页按钮 + 快捷入口 + 分组按钮（悬停/聚焦弹出二级浮层菜单）
 * - 导航项由 workspaceNav 统一配置，再按登录角色与站点能力开关过滤
 * - 折叠态只留一颗「展开珠」，折叠状态记忆在 localStorage
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import {
  RAIL_GROUPS,
  RAIL_HOME,
  RAIL_QUICK,
  filterWorkspaceNav,
  isNavActive,
  type NavGroupKey,
  type WorkspaceNavItem,
} from '@/config/workspaceNav'
import { resolveDiaryMenuClickPath } from '@/composables/useDiaryNav'
import { getChatEntryPath } from '@/utils/chatSession'

const router = useRouter()
const route = useRoute()
const loginUserStore = useLoginUserStore()
const capsStore = useCapabilitiesStore()

/** 折叠状态记忆在本地（折叠 = 只留一个展开手柄珠） */
const RAIL_COLLAPSED_KEY = 'station-rail-collapsed'
const collapsed = ref(localStorage.getItem(RAIL_COLLAPSED_KEY) === '1')
watch(collapsed, (v) => localStorage.setItem(RAIL_COLLAPSED_KEY, v ? '1' : '0'))

const user = computed(() => (loginUserStore.loginUser.id ? loginUserStore.loginUser : null))
// 能力开关快照：loaded 表示站点能力已拉取完成，enabled 为各能力是否开启
const gate = computed(() => ({ loaded: capsStore.loaded, enabled: capsStore.enabled }))

// 快捷入口（过滤掉无权限/未开启的项）
const quickItems = computed(() => filterWorkspaceNav(RAIL_QUICK, user.value, gate.value))

// 分组导航：逐组过滤子项，过滤后为空的分组整组隐藏
const groups = computed(() =>
  RAIL_GROUPS.map((g) => ({
    ...g,
    children: filterWorkspaceNav(g.children, user.value, gate.value),
  })).filter((g) => g.children.length > 0),
)

/** 悬停中的分组浮层 */
const hoverGroup = ref<NavGroupKey | null>(null)

/**
 * 解析导航项的真实跳转路径：
 * - /chat：恢复/创建最近一次会话后落到具体会话页
 * - /diary：按当前日记路由上下文决定落点（详见 useDiaryNav）
 */
const resolvePath = (item: WorkspaceNavItem): string => {
  if (item.path === '/chat') return getChatEntryPath()
  if (item.path === '/diary') return resolveDiaryMenuClickPath(route.path)
  return item.path
}

/** 点击导航项：先收起浮层；需登录项未登录时转去登录页；同路径不重复 push */
const go = (item: WorkspaceNavItem) => {
  hoverGroup.value = null
  if (item.requireLogin && !user.value) {
    router.push('/user/login')
    return
  }
  const path = resolvePath(item)
  if (path !== route.path) router.push(path)
}

/** 分组高亮：任一子项（含孙项）命中当前路由即视为激活 */
const isGroupActive = (children: WorkspaceNavItem[]) =>
  children.some(
    (c) => isNavActive(c, route.path) || (c.children ?? []).some((sub) => isNavActive(sub, route.path)),
  )

/** 单项高亮：自身或其任一子项命中当前路由 */
const isItemActive = (item: WorkspaceNavItem) =>
  isNavActive(item, route.path) || (item.children ?? []).some((c) => isNavActive(c, route.path))
</script>

<template>
  <aside class="station-rail" :class="{ 'is-collapsed': collapsed }">
    <!-- 折叠态：仅一颗展开珠 -->
    <button
      v-if="collapsed"
      type="button"
      class="rail-bead"
      title="展开导航"
      aria-label="展开导航"
      @click="collapsed = false"
    >
      <PanelLeftOpen :size="16" :stroke-width="2" />
    </button>

    <template v-else>
      <div class="rail-card">
        <!-- 首页按钮：仅在根路径高亮 -->
        <button
          type="button"
          class="rail-btn rail-btn--home"
          :class="{ 'is-active': route.path === '/' }"
          :title="RAIL_HOME.label"
          @click="go(RAIL_HOME)"
        >
          <component :is="RAIL_HOME.icon" :size="17" :stroke-width="2" />
        </button>

        <span class="rail-sep" />

        <!-- 快捷入口区：常用功能一键直达 -->
        <button
          v-for="item in quickItems"
          :key="item.key"
          type="button"
          class="rail-btn"
          :class="{ 'is-active': isItemActive(item) }"
          :title="item.label"
          @click="go(item)"
        >
          <component :is="item.icon" :size="17" :stroke-width="2" />
        </button>

        <span class="rail-sep" />

        <!-- 分组按钮：悬停/聚焦/点击均可弹出二级浮层；激活分组显示左侧小圆点 -->
        <button
          v-for="group in groups"
          :key="group.key"
          type="button"
          class="rail-btn rail-btn--group"
          :class="{ 'is-active': isGroupActive(group.children) }"
          :title="group.label"
          :aria-haspopup="true"
          :aria-expanded="hoverGroup === group.key"
          @mouseenter="hoverGroup = group.key"
          @mouseleave="hoverGroup = hoverGroup === group.key ? null : hoverGroup"
          @click="hoverGroup = hoverGroup === group.key ? null : group.key"
          @focus="hoverGroup = group.key"
        >
          <component :is="group.icon" :size="17" :stroke-width="2" />
          <span v-if="isGroupActive(group.children)" class="rail-active-dot" />

          <!-- 二级浮层菜单：带进出场过渡；鼠标移入浮层自身可保持展开 -->
          <Transition name="railpop">
            <div
              v-if="hoverGroup === group.key"
              class="rail-flyout"
              role="menu"
              @mouseenter="hoverGroup = group.key"
              @mouseleave="hoverGroup = hoverGroup === group.key ? null : hoverGroup"
            >
              <div class="flyout-title">{{ group.label }}</div>
              <!-- 子项支持再嵌一层孙项：有孙项的渲染成分组标题 + 缩进孙项列表 -->
              <template v-for="child in group.children" :key="child.key">
                <button
                  v-if="!child.children?.length"
                  type="button"
                  role="menuitem"
                  class="flyout-item"
                  :class="{ 'is-current': isNavActive(child, route.path) }"
                  @click="go(child)"
                >
                  <component :is="child.icon" :size="15" :stroke-width="2" />
                  <span class="flyout-label">{{ child.label }}</span>
                </button>
                <template v-else>
                  <div class="flyout-section">{{ child.label }}</div>
                  <button
                    v-for="sub in child.children"
                    :key="sub.key"
                    type="button"
                    role="menuitem"
                    class="flyout-item flyout-item--sub"
                    :class="{ 'is-current': isNavActive(sub, route.path) }"
                    @click="go(sub)"
                  >
                    <component :is="sub.icon" :size="14" :stroke-width="2" />
                    <span class="flyout-label">{{ sub.label }}</span>
                    <ChevronRight v-if="isNavActive(sub, route.path)" :size="12" :stroke-width="2" />
                  </button>
                </template>
              </template>
            </div>
          </Transition>
        </button>

        <span class="rail-flex" />

        <!-- 底部收起按钮：点击后整条导航收成一颗展开珠 -->
        <button
          type="button"
          class="rail-btn rail-btn--fold"
          title="收起导航"
          aria-label="收起导航"
          @click="collapsed = true"
        >
          <PanelLeftClose :size="15" :stroke-width="2" />
        </button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
/* 竖条整体：固定在视口左上角，悬浮于内容之上 */
.station-rail {
  position: fixed;
  top: 16px;
  left: 12px;
  z-index: 70;
}

/* 折叠珠 */
.rail-bead {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--ink, #4c5570);
  background: var(--glass-chip, rgba(255, 255, 255, 0.72));
  border: 1.5px solid var(--glass-border, rgba(255, 255, 255, 0.9));
  box-shadow: var(--shadow-1, 0 8px 22px rgba(96, 116, 168, 0.18));
  backdrop-filter: blur(14px);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.rail-bead:hover {
  transform: scale(1.08);
  box-shadow: var(--shadow-2, 0 14px 32px rgba(96, 116, 168, 0.26));
}

/* 主竖条 */
.rail-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border-radius: 999px;
  background: var(--glass-chip, rgba(255, 255, 255, 0.72));
  border: 1.5px solid var(--glass-border, rgba(255, 255, 255, 0.9));
  box-shadow: var(--shadow-1, 0 10px 28px rgba(96, 116, 168, 0.18));
  backdrop-filter: blur(16px);
}

.rail-btn {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--ink-soft, #6b7390);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.rail-btn:hover {
  background: color-mix(in srgb, var(--c-violet, #9b8ce8) 16%, white);
  color: var(--ink, #4c5570);
  transform: scale(1.06);
}

.rail-btn.is-active {
  background: color-mix(in srgb, var(--c-violet, #9b8ce8) 20%, white);
  color: color-mix(in srgb, var(--c-violet, #9b8ce8) 80%, var(--ink, #4c5570));
}

.rail-active-dot {
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c-violet, #9b8ce8);
}

.rail-sep {
  width: 18px;
  height: 1px;
  margin: 2px 0;
  background: color-mix(in srgb, var(--ink, #4c5570) 14%, transparent);
}

.rail-flex {
  flex: 1;
  min-height: 6px;
}

/* 悬停浮层 */
.rail-flyout {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  min-width: 176px;
  padding: 10px;
  border-radius: 18px;
  background: var(--glass-chip, rgba(255, 255, 255, 0.94));
  border: 1.5px solid var(--glass-border, rgba(255, 255, 255, 0.95));
  box-shadow: var(--shadow-2, 0 18px 44px rgba(96, 116, 168, 0.22));
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.flyout-title {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--ink-faint, #9aa2b8);
  padding: 2px 10px 6px;
}

.flyout-section {
  font-size: 12px;
  color: var(--ink-faint, #9aa2b8);
  padding: 6px 10px 2px;
}

.flyout-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--ink, #4c5570);
  font-size: 13.5px;
  letter-spacing: 1px;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}

.flyout-item:hover {
  background: color-mix(in srgb, var(--c-violet, #9b8ce8) 14%, white);
}

.flyout-item--sub {
  padding-left: 22px;
}

.flyout-item.is-current {
  color: color-mix(in srgb, var(--c-violet, #9b8ce8) 80%, var(--ink, #4c5570));
  font-weight: 600;
}

.flyout-label {
  flex: 1;
  white-space: nowrap;
}

/* 浮层进出场 */
.railpop-enter-active,
.railpop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.railpop-enter-from,
.railpop-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-6px);
}

/* 移动端隐藏竖条，导航入口交给其它布局 */
@media (max-width: 768px) {
  .station-rail {
    display: none;
  }
}
</style>
