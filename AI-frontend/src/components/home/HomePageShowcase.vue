<script setup lang="ts">
/**
 * 主页第 03 屏「实验室橱窗」：两个拟物浏览器窗口展示实验室小应用示例。
 * 左窗是可交互的待办 Demo（真的能勾选），右窗展示第一个推荐应用。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import type { HomeShowCard } from '@/components/home/homeTypes'
import HomeMiniBar from '@/components/home/HomeMiniBar.vue'
import HomePageDeco from '@/components/home/HomePageDeco.vue'

const props = defineProps<{
  shows: HomeShowCard[]
  pageLabel: string
}>()

defineEmits<{
  home: []
}>()

const router = useRouter()

// 待办 Demo 的演示数据：纯前端交互展示，不落库
const todos = ref([
  { text: '给主页换上新衣服', done: true },
  { text: '写一篇动效笔记', done: false },
  { text: '给薄荷浇水', done: false },
])

// 已完成数文案与进度条宽度（百分比）
const todoCnt = computed(() => {
  const done = todos.value.filter((t) => t.done).length
  return `${done} / ${todos.value.length}`
})
const todoBar = computed(() => {
  const done = todos.value.filter((t) => t.done).length
  return `${(done / todos.value.length) * 100}%`
})

// 右窗展示第一个应用，没有数据时模板用默认示例兜底
const featuredApp = computed(() => props.shows[0] || null)

const openApp = () => {
  if (featuredApp.value?.path) router.push(featuredApp.value.path)
  else router.push('/lab')
}
</script>

<template>
  <section class="home-page home-page--lab" data-screen-label="03 Lab">
    <HomePageDeco variant="lab" />
    <HomeMiniBar :page-label="pageLabel" @home="$emit('home')" />

    <div class="labwin-layout">
      <header class="labwin-head">
        <span class="page-sticker page-sticker--demo font-display">DEMO</span>
        <p class="labwin-eyebrow">LAB WINDOW</p>
        <h2 class="labwin-title font-display">{{ siteConfig.sections.inspiration }}</h2>
        <p class="labwin-sub">实验室里跑出来的小应用</p>
        <button type="button" class="labwin-enter" @click="router.push('/lab')">进入实验室</button>
      </header>

      <!-- 左窗：待办清单 Demo，勾选行可切换完成态并联动进度条 -->
      <div class="labwin-pane labwin-pane--demo">
        <div class="labwin-chrome">
          <i /><i /><i />
          <span>lab.local / todo-list</span>
        </div>
        <div class="labwin-stage labwin-stage--mint">
          <div class="demo-todo demo-todo--lg">
            <h5>今日待办 <span class="cnt">{{ todoCnt }} 完成</span></h5>
            <div
              v-for="(row, idx) in todos"
              :key="idx"
              class="todo-row"
              :class="{ done: row.done }"
              @click="row.done = !row.done"
            >
              <span class="todo-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 12.5l5 5L20 6.5" />
                </svg>
              </span>
              <span class="tx">{{ row.text }}</span>
            </div>
            <div class="todo-progress"><i :style="{ width: todoBar }" /></div>
          </div>
        </div>
        <div class="labwin-caption">
          <div>
            <div class="t font-display">待办清单</div>
            <div class="d">示例 Demo · 勾选是真的可以点的</div>
          </div>
        </div>
      </div>

      <!-- 右窗：第一个推荐应用的仪表盘预览，无数据时用默认示例 -->
      <div class="labwin-pane labwin-pane--app">
        <div class="labwin-chrome">
          <i /><i /><i />
          <span>{{ featuredApp?.url || 'lab.local / mood-dashboard' }}</span>
        </div>
        <div class="labwin-stage labwin-stage--violet">
          <div class="demo-dash demo-dash--lg">
            <div class="head">
              <div>
                <b>{{ featuredApp ? featuredApp.title.slice(0, 2) : '87' }}</b>
                <span>{{ featuredApp?.desc || '本周心情指数' }}</span>
              </div>
              <span>LAB APP</span>
            </div>
            <div class="dash-bars"><i /><i /><i /><i /><i /><i /></div>
          </div>
        </div>
        <div class="labwin-caption">
          <div>
            <div class="t font-display">{{ featuredApp?.title || '心情仪表盘' }}</div>
            <div class="d">
              {{ featuredApp?.desc || `${siteConfig.sections.recommendedAuthor} · 示例 Demo` }}
            </div>
          </div>
          <button type="button" class="labwin-open" @click="openApp">打开应用</button>
        </div>
      </div>
    </div>
  </section>
</template>
