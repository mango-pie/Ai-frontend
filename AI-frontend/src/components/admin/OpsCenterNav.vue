<script setup lang="ts">
/**
 * 运维中心侧栏：用量 / 操作审计 + 复用 P5 设置审计与健康
 */
import { useRouter } from 'vue-router'

const props = defineProps<{
  /** usage | audit | stats | access | settings-audit | health */
  activeKey: string
}>()

const router = useRouter()

// 侧栏导航链接：覆盖 AI 用量、日志与审计等运维页面；activeKey 由父页面传入用于高亮
const links = [
  { key: 'usage', label: 'AI 用量', path: '/admin/ops/usage' },
  { key: 'logs', label: '实时日志', path: '/admin/ops/logs' },
  { key: 'audit', label: '操作审计', path: '/admin/ops/audit' },
  { key: 'stats', label: '业务统计', path: '/admin/ops/stats' },
  { key: 'access', label: '访问日志', path: '/admin/ops/access-logs' },
  { key: 'settings-audit', label: '设置变更审计', path: '/admin/settings/audit' },
  { key: 'health', label: '依赖健康', path: '/admin/settings/health' },
] as const

function go(path: string, key: string) {
  // 当前页对应的链接不再重复跳转
  if (key === props.activeKey) return
  router.push(path)
}
</script>

<template>
  <!-- 运维中心侧栏：桌面端垂直吸附，窄屏下转为可换行的横向按钮组 -->
  <aside class="ops-nav">
    <div class="nav-section-title">运维中心</div>
    <button
      v-for="link in links"
      :key="link.key"
      type="button"
      class="nav-item"
      :class="{ active: link.key === activeKey }"
      @click="go(link.path, link.key)"
    >
      <span class="nav-label">{{ link.label }}</span>
    </button>
  </aside>
</template>

<style scoped>
.ops-nav {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 12px;
  backdrop-filter: blur(16px);
  position: sticky;
  top: 16px;
}

.nav-section-title {
  font-size: 12px;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 4px 8px 10px;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  margin-bottom: 4px;
  text-align: left;
  transition: all var(--transition-fast);
}

.nav-item:hover {
  background: var(--color-primary-08);
  color: var(--color-primary-light);
}

.nav-item.active {
  background: var(--color-primary-12);
  border-color: var(--color-primary-20);
  color: var(--color-primary-light);
}

.nav-label {
  font-size: 14px;
}

@media (max-width: 900px) {
  .ops-nav {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .nav-section-title {
    width: 100%;
  }

  .nav-item {
    width: auto;
    margin-bottom: 0;
  }
}
</style>
