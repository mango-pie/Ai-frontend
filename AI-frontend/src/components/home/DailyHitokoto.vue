<script setup lang="ts">
/**
 * 今日一言卡片：从 hitokoto.cn 拉取随机句子展示，支持手动「换一句」刷新。
 * variant="plain" 时去掉卡片边框背景，嵌入到其它容器中复用。
 */
import { computed, onMounted, ref } from 'vue'
import { RefreshCw, Quote } from 'lucide-vue-next'
import {
  fetchHitokoto,
  getHitokotoDetailUrl,
  hitokotoTypeLabels,
  type HitokotoItem,
} from '@/integrations/hitokoto'

withDefaults(
  defineProps<{
    variant?: 'default' | 'plain'
  }>(),
  {
    variant: 'default',
  },
)

// 加载态区分：首次进入用骨架屏，手动刷新只转图标不打断已展示内容
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const item = ref<HitokotoItem | null>(null)

// 句子类型（动画/文学/哲学等）的中文标签
const typeLabel = computed(() => {
  if (!item.value) return ''
  return hitokotoTypeLabels[item.value.type] || '一言'
})

// 出处署名：作者与来源都存在时用「·」拼接
const attribution = computed(() => {
  if (!item.value) return ''
  const { from, from_who: fromWho } = item.value
  if (fromWho && from) return `${fromWho} · ${from}`
  return from || fromWho || ''
})

// 点击句子跳转 hitokoto.cn 的句子详情页
const detailUrl = computed(() =>
  item.value ? getHitokotoDetailUrl(item.value.uuid) : 'https://hitokoto.cn',
)

async function loadHitokoto(force = false) {
  error.value = ''
  if (force) refreshing.value = true
  else loading.value = true

  try {
    item.value = await fetchHitokoto(force)
  } catch {
    error.value = '今日一言加载失败，请稍后再试'
    item.value = null
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(() => {
  // force=true 绕过集成层的缓存，保证每次进入页面拿到新句子
  loadHitokoto(true)
})
</script>

<template>
  <section class="daily-hitokoto" :class="{ 'daily-hitokoto--plain': variant === 'plain' }">
    <!-- 头部：标签 + 类型徽标 + 刷新按钮 -->
    <div class="daily-hitokoto__header">
      <span class="daily-hitokoto__label">
        <Quote :size="14" class="daily-hitokoto__label-icon" />
        今日一言
      </span>
      <a-tag v-if="item" class="daily-hitokoto__type">{{ typeLabel }}</a-tag>
      <button
        type="button"
        class="daily-hitokoto__refresh"
        :class="{ 'is-refreshing': refreshing }"
        :disabled="loading || refreshing"
        aria-label="换一句"
        @click="loadHitokoto(true)"
      >
        <RefreshCw :size="15" />
      </button>
    </div>

    <!-- 三种展示态：骨架屏 / 正常内容 / 错误重试 -->
    <a-skeleton v-if="loading" active :paragraph="{ rows: 2 }" />

    <template v-else-if="item">
      <blockquote class="daily-hitokoto__quote">
        <a :href="detailUrl" target="_blank" rel="noopener noreferrer" class="daily-hitokoto__link">
          {{ item.hitokoto }}
        </a>
      </blockquote>
      <p v-if="attribution" class="daily-hitokoto__from">—— {{ attribution }}</p>
    </template>

    <p v-else class="daily-hitokoto__error">
      {{ error }}
      <a-button type="link" size="small" @click="loadHitokoto(true)">重试</a-button>
    </p>
  </section>
</template>

<style scoped>
.daily-hitokoto {
  margin-top: 20px;
  padding: 16px 18px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.03);
}

.daily-hitokoto--plain {
  margin-top: 0;
  padding: 0;
  border: none;
  background: transparent;
}

.daily-hitokoto__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.daily-hitokoto__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-primary-light);
}

.daily-hitokoto__label-icon {
  flex-shrink: 0;
  opacity: 0.9;
}

.daily-hitokoto__type {
  margin: 0;
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-muted);
  border-radius: 999px;
}

.daily-hitokoto__refresh {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.daily-hitokoto__refresh :deep(svg) {
  transition: transform 0.3s ease;
}

.daily-hitokoto__refresh:hover:not(:disabled) {
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
  background: var(--color-primary-08);
}

.daily-hitokoto__refresh:hover:not(:disabled) :deep(svg) {
  transform: rotate(90deg);
}

.daily-hitokoto__refresh.is-refreshing :deep(svg) {
  animation: hitokotoSpin 0.8s linear infinite;
}

.daily-hitokoto__refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes hitokotoSpin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .daily-hitokoto__refresh :deep(svg),
  .daily-hitokoto__refresh:hover:not(:disabled) :deep(svg) {
    transition: none;
    transform: none;
    animation: none;
  }
}

.daily-hitokoto__quote {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text-primary);
}

.daily-hitokoto__link {
  color: inherit;
  text-decoration: none;
  transition: color var(--transition-fast);
}

.daily-hitokoto__link:hover {
  color: var(--color-primary-light);
}

.daily-hitokoto__from {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--color-text-muted);
  text-align: right;
}

.daily-hitokoto__error {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
</style>
