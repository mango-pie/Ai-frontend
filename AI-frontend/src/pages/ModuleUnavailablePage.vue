<script setup lang="ts">
/**
 * 模块未开放提示页：
 * 当站点关闭了某个功能模块（如博客、日记等）而用户通过历史链接/深链访问时，
 * 路由统一兜底跳转到本页，展示"暂未开放"提示并提供返回首页/上一页的出口。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getModuleLabel } from '@/config/modules'

const route = useRoute()
const router = useRouter()

// 从查询参数 module 中取模块标识，用于匹配模块名称与主题色
const moduleKey = computed(() => String(route.query.module || ''))
// 未匹配到模块名时退化为通用文案，避免展示空白标签
const moduleLabel = computed(() => (moduleKey.value ? getModuleLabel(moduleKey.value) : ''))

const title = computed(() =>
  moduleLabel.value ? `${moduleLabel.value}功能暂未开放` : '该功能暂未开放',
)

const subtitle = computed(() =>
  moduleLabel.value
    ? `${moduleLabel.value}模块当前未启用。入口已从菜单隐藏，你也可以返回首页继续浏览。`
    : '该模块当前未启用。你可以返回首页继续浏览。',
)

/** 模块 → 房间强调色（与各房间 data-room 主题一致） */
const MODULE_ROOM_COLOR: Record<string, string> = {
  blog: '#f08cb0',
  chat: '#9b8ce8',
  diary: '#c79ae0',
  knowledge: '#6aaee8',
  reading: '#9b8ce8',
  study: '#6aaee8',
  worklog: '#5fc4a5',
  'app-lab': '#c79ae0',
}
const roomColor = computed(() => MODULE_ROOM_COLOR[moduleKey.value] || '')

/** 返回上一页；没有来路（直接深链进入）时回落首页 */
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<template>
  <div class="module-unavailable">
    <div class="module-unavailable__card">
      <!-- 标题前的小圆点使用对应模块的主题色，帮助用户识别是哪个模块未开放 -->
      <a-result status="warning" :sub-title="subtitle">
        <template #title>
          <span class="module-unavailable__title">
            <i
              v-if="roomColor"
              class="module-unavailable__dot"
              :style="{ background: roomColor }"
              aria-hidden="true"
            />
            {{ title }}
          </span>
        </template>
        <template #extra>
          <a-button type="primary" class="module-unavailable__btn" @click="router.push('/')">
            返回首页
          </a-button>
          <a-button class="module-unavailable__btn module-unavailable__btn--ghost" @click="goBack">
            返回上一页
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

.module-unavailable__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-primary);
}

.module-unavailable__dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent);
}

.module-unavailable__btn {
  background: var(--gradient-primary) !important;
  border: none !important;
}
.module-unavailable__btn--ghost {
  background: transparent !important;
  border: 1px solid var(--color-border) !important;
  color: var(--color-text-secondary);
}

.module-unavailable :deep(.ant-result-title),
.module-unavailable :deep(.ant-result-subtitle) {
  color: var(--color-text-primary);
}

.module-unavailable :deep(.ant-result-subtitle) {
  color: var(--color-text-secondary);
}
</style>
