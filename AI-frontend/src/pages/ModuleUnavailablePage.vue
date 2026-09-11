<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getModuleLabel } from '@/config/modules'

const route = useRoute()
const router = useRouter()

const moduleKey = computed(() => String(route.query.module || ''))
const moduleLabel = computed(() => (moduleKey.value ? getModuleLabel(moduleKey.value) : ''))

const title = computed(() =>
  moduleLabel.value ? `${moduleLabel.value}功能暂未开放` : '该功能暂未开放',
)

const subtitle = computed(() =>
  moduleLabel.value
    ? `${moduleLabel.value}模块当前未启用。入口已从菜单隐藏，你也可以返回首页继续浏览。`
    : '该模块当前未启用。你可以返回首页继续浏览。',
)
</script>

<template>
  <div class="module-unavailable">
    <div class="module-unavailable__card">
      <a-result status="warning" :title="title" :sub-title="subtitle">
        <template #extra>
          <a-button type="primary" class="module-unavailable__btn" @click="router.push('/')">
            返回首页
          </a-button>
        </template>
      </a-result>
    </div>
  </div>
</template>

<style scoped>
.module-unavailable {
  max-width: 720px;
  margin: 48px auto 80px;
  padding: 0 20px;
}

.module-unavailable__card {
  background: var(--color-bg-card);
  backdrop-filter: blur(16px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: 24px 16px 32px;
  box-shadow: var(--shadow-lg);
}

.module-unavailable__btn {
  background: var(--gradient-primary) !important;
  border: none !important;
}

.module-unavailable :deep(.ant-result-title),
.module-unavailable :deep(.ant-result-subtitle) {
  color: var(--color-text-primary);
}

.module-unavailable :deep(.ant-result-subtitle) {
  color: var(--color-text-secondary);
}
</style>
