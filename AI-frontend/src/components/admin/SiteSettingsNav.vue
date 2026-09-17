<script setup lang="ts">
/**
 * 全站设置侧栏：业务模块（bootstrap）+ 固定「运维」分组
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'

const props = defineProps<{
  modules: API.SettingModuleVO[]
  /** 当前激活：模块 code，或 audit / health */
  activeKey: string
}>()

const router = useRouter()

/** ops / modules 放在运维分组，上半侧栏不再重复展示 */
const formModules = computed(() =>
  (props.modules || []).filter((m) => m.code && m.code !== 'ops' && m.code !== 'modules'),
)

// 固定的"运维"分组入口，不随模块配置变化
const opsLinks = [
  { key: 'modules', label: '业务模块', path: '/admin/settings/modules' },
  { key: 'audit', label: '变更审计', path: '/admin/settings/audit' },
  { key: 'health', label: '依赖健康', path: '/admin/settings/health' },
  { key: 'ops', label: '运维开关', path: '/admin/settings/ops' },
] as const

// 点击业务模块：不可写的模块仅提示"即将接入"，可写的跳转到对应设置页
function selectModule(mod: API.SettingModuleVO) {
  if (!mod.code) return
  if (!mod.writable) {
    message.info(`${mod.displayName || mod.code}（${mod.phase || ''}）即将接入`)
    return
  }
  if (mod.code === props.activeKey) return
  router.push(`/admin/settings/${mod.code}`)
}

function goOps(path: string, key: string) {
  if (key === props.activeKey) return
  router.push(path)
}
</script>

<template>
  <aside class="settings-nav">
    <!-- 业务模块分组：不可写的模块置灰并标记"即将接入" -->
    <div class="nav-section-title">模块</div>
    <button
      v-for="mod in formModules"
      :key="mod.code"
      type="button"
      class="nav-item"
      :class="{
        active: mod.code === activeKey && mod.writable,
        disabled: !mod.writable,
      }"
      @click="selectModule(mod)"
    >
      <span class="nav-label">{{ mod.displayName || mod.code }}</span>
      <span v-if="!mod.writable" class="nav-badge">即将接入</span>
      <span v-else-if="mod.phase" class="nav-phase">{{ mod.phase }}</span>
    </button>

    <!-- 固定运维分组入口 -->
    <div class="nav-section-title nav-section-ops">运维</div>
    <button
      v-for="link in opsLinks"
      :key="link.key"
      type="button"
      class="nav-item"
      :class="{ active: link.key === activeKey }"
      @click="goOps(link.path, link.key)"
    >
      <span class="nav-label">{{ link.label }}</span>
    </button>
  </aside>
</template>

<style scoped>
.settings-nav {
  background: rgba(255, 255, 255, 0.82);
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 18px;
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

.nav-section-ops {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
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

.nav-item:hover:not(.disabled) {
  background: var(--color-primary-08);
  color: var(--color-primary-light);
}

.nav-item.active {
  background: var(--color-primary-12);
  border-color: var(--color-primary-20);
  color: var(--color-primary-light);
}

.nav-item.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.nav-label {
  font-size: 14px;
}

.nav-badge,
.nav-phase {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

@media (max-width: 900px) {
  .settings-nav {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .nav-section-title {
    width: 100%;
  }

  .nav-section-ops {
    margin-top: 4px;
    padding-top: 8px;
  }

  .nav-item {
    width: auto;
    margin-bottom: 0;
  }
}
</style>
