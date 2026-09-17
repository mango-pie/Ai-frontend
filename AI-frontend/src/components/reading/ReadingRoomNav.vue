<script setup lang="ts">
/**
 * 精读工作台的二级导航：采集 / 文章 / 学习 三个入口
 * 高亮态由当前路由反推，进入文章详情页时额外显示一个不可点的「审阅」占位项
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookOpen, GraduationCap, PenLine, Sparkles } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

// 导航项配置：key 与 active 计算属性的取值保持一致
const items = [
  { key: 'ingest', label: '采集', path: '/admin/knowledge/ingest', icon: Sparkles },
  { key: 'notes', label: '文章', path: '/admin/knowledge/notes', icon: BookOpen },
  { key: 'learning', label: '学习', path: '/admin/knowledge/learning', icon: GraduationCap },
] as const

/** 根据路由推断当前激活项；注意 /notes/:id 详情页单独返回 'detail'，用于显示「审阅」态 */
const active = computed(() => {
  const p = route.path
  if (p.includes('/learning')) return 'learning'
  if (/\/notes\/\d+/.test(p)) return 'detail'
  if (p.includes('/notes')) return 'notes'
  return 'ingest'
})
</script>

<template>
  <nav class="reading-subnav" aria-label="精读工作台">
    <!-- 常驻三个入口；当前页高亮，重复点击同页不触发跳转 -->
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      :class="{ on: active === item.key }"
      @click="route.path !== item.path && router.push(item.path)"
    >
      <component :is="item.icon" :size="13" stroke-width="2.1" />
      {{ item.label }}
    </button>
    <!-- 详情页专属的「审阅」态标签：仅指示当前所处页面，禁用点击 -->
    <button v-if="active === 'detail'" type="button" class="on" disabled>
      <PenLine :size="13" stroke-width="2.1" />
      审阅
    </button>
  </nav>
</template>
