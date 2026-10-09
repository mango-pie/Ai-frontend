<script setup lang="ts">
/**
 * 全站设置 · 依赖健康
 * 路由：/admin/settings/health
 * 仅使用 health API，不调用 integration/test
 */
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  bootstrapSiteSettings,
  listSiteSettingHealth,
  testSiteSettingHealth,
} from '@/api/siteSettings'
import SiteSettingsNav from '@/components/admin/SiteSettingsNav.vue'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import '@/assets/admin-theme.css'

const TARGET_LABELS: Record<string, string> = {
  redis: 'Redis',
  vector: '向量库',
  knowledge_ai: '知识库 AI',
  codegen: '代码生成',
  jina: 'Jina',
  astrbot: 'AstrBot',
  minio: 'MinIO',
}

const bootLoading = ref(false)
const loading = ref(false)
const testingTarget = ref('')
const bootstrap = ref<API.SiteSettingsBootstrapVO | null>(null)
const results = ref<API.IntegrationTestResultVO[]>([])

const sidebarModules = computed(() => bootstrap.value?.modules ?? [])

function targetLabel(target?: string): string {
  if (!target) return '未知'
  return TARGET_LABELS[target] || target
}

async function loadBootstrap() {
  bootLoading.value = true
  try {
    const res = await bootstrapSiteSettings()
    if (res.data.code === 0 && res.data.data) {
      bootstrap.value = res.data.data
    } else {
      message.error(res.data.message || '加载设置引导失败')
    }
  } catch {
    message.error('加载设置引导失败')
  } finally {
    bootLoading.value = false
  }
}

async function loadAll() {
  loading.value = true
  try {
    const res = await listSiteSettingHealth()
    if (res.data.code === 0 && res.data.data) {
      results.value = res.data.data
    } else {
      message.error(res.data.message || '健康检测失败')
    }
  } catch {
    message.error('健康检测失败')
  } finally {
    loading.value = false
  }
}

async function retestOne(target?: string) {
  if (!target) return
  testingTarget.value = target
  try {
    const res = await testSiteSettingHealth(target)
    if (res.data.code === 0 && res.data.data) {
      const next = res.data.data
      const idx = results.value.findIndex((r) => r.target === target)
      if (idx >= 0) {
        results.value[idx] = next
      } else {
        results.value = [...results.value, next]
      }
      message.success(next.ok ? `${targetLabel(target)} 正常` : `${targetLabel(target)} 异常`)
    } else {
      message.error(res.data.message || '重测失败')
    }
  } catch {
    message.error('重测失败')
  } finally {
    testingTarget.value = ''
  }
}

onMounted(async () => {
  await loadBootstrap()
  await loadAll()
})
</script>

<template>
  <StationRoomShell brand-path="/" note-label="Station · 依赖健康" room="settings">
  <div class="site-settings-page admin-theme-page">
    <a-breadcrumb class="admin-breadcrumb">
      <a-breadcrumb-item>
        <router-link to="/">首页</router-link>
      </a-breadcrumb-item>
      <a-breadcrumb-item>管理</a-breadcrumb-item>
      <a-breadcrumb-item>
        <router-link to="/admin/settings">站点设置</router-link>
      </a-breadcrumb-item>
      <a-breadcrumb-item>依赖健康</a-breadcrumb-item>
    </a-breadcrumb>

    <div class="admin-page-hero">
      <div class="hero-left">
        <div class="hero-title">依赖健康</div>
        <div class="hero-subtitle">探测 Redis、向量库、外部 AI 与对象存储等依赖连通性</div>
      </div>
      <div class="hero-right">
        <a-button type="primary" :loading="loading" @click="loadAll">全部重新检测</a-button>
      </div>
    </div>

    <a-spin :spinning="bootLoading || loading">
      <div class="settings-layout">
        <SiteSettingsNav :modules="sidebarModules" active-key="health" />

        <section class="settings-main">
          <a-empty v-if="!results.length && !loading" description="暂无探测结果" />
          <div v-else class="health-grid">
            <div
              v-for="item in results"
              :key="item.target"
              class="health-card"
              :class="{ ok: item.ok, fail: item.ok === false }"
            >
              <div class="health-card-head">
                <div class="health-title">{{ targetLabel(item.target) }}</div>
                <a-tag :color="item.ok ? 'success' : 'error'">
                  {{ item.ok ? '正常' : '异常' }}
                </a-tag>
              </div>
              <div class="health-meta">
                <span>target: {{ item.target || '-' }}</span>
                <span>延迟: {{ item.latencyMs != null ? `${item.latencyMs} ms` : '-' }}</span>
              </div>
              <div class="health-message">{{ item.message || '无附加信息' }}</div>
              <div class="health-actions">
                <a-button
                  size="small"
                  :loading="testingTarget === item.target"
                  @click="retestOne(item.target)"
                >
                  重测
                </a-button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </a-spin>
  </div>
  </StationRoomShell>
</template>

<style scoped>
.site-settings-page {
  max-width: 1280px;
}

.admin-page-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  align-items: start;
}

.settings-main {
  min-width: 0;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.health-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
  background: var(--color-bg-card);
}

.health-card.ok {
  border-color: rgba(82, 196, 26, 0.35);
}

.health-card.fail {
  border-color: rgba(255, 77, 79, 0.4);
}

.health-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.health-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.health-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.health-message {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  min-height: 40px;
  word-break: break-word;
  margin-bottom: 12px;
}

.health-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .admin-page-hero {
    flex-direction: column;
  }
}
</style>
