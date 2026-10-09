<script setup lang="ts">
/**
 * 主页第二屏：波浪过渡 + 最新随笔三连卡 + 实验室应用橱窗 + 页脚。
 * 滚动进入视口的元素（.reveal）由 IntersectionObserver 逐个加 in 类触发入场动画。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'

export interface HomePostCard {
  id?: number
  title: string
  excerpt: string
  tag: string
  meta: string
  path?: string
}

export interface HomeShowCard {
  id?: number
  title: string
  desc: string
  url: string
  path?: string
  kind: 'todo' | 'dash' | 'app'
}

const props = defineProps<{
  posts: HomePostCard[]
  shows: HomeShowCard[]
}>()

const router = useRouter()

// 待办 Demo 演示数据（橱窗左卡，可交互勾选）
const todos = ref([
  { text: '给主页换上新衣服', done: true },
  { text: '写一篇动效笔记', done: false },
  { text: '给薄荷浇水', done: false },
])

// 已完成数文案与进度条宽度（百分比）
const todoCnt = computed(() => {
  const done = todos.value.filter((t) => t.done).length
  return `${done} / ${todos.value.length} 完成`
})
const todoBar = computed(() => {
  const done = todos.value.filter((t) => t.done).length
  return `${(done / todos.value.length) * 100}%`
})

// 随笔卡的三个视觉变体，循环使用形成错落
const postVariants = ['p1', 'p2', 'p3'] as const

// 打开随笔/应用：有具体路径跳详情，否则兜底到列表页
const openPost = (post: HomePostCard) => {
  if (post.path) router.push(post.path)
  else router.push('/blog')
}

const openShow = (show: HomeShowCard) => {
  if (show.path) router.push(show.path)
  else router.push('/lab')
}

const scrollTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 页脚链接跳转：站内 path 用路由，外链 href 新开标签页（# 占位忽略）
const footerGo = (link: { label: string; path?: string; href?: string }) => {
  if (link.path) router.push(link.path)
  else if (link.href && link.href !== '#') window.open(link.href, '_blank')
}

onMounted(() => {
  // 进入视口 12% 即触发入场动画，之后取消观察避免重复
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('in')
          io.unobserve(en.target)
        }
      }
    },
    { threshold: 0.12 },
  )
  document.querySelectorAll('#screen2 .reveal').forEach((el) => io.observe(el))
})
</script>

<template>
  <section id="screen2">
    <!-- 波浪过渡：两条半透明 SVG 曲线衔接上一屏 -->
    <div class="wave">
      <svg viewBox="0 0 1920 110" preserveAspectRatio="none">
        <path
          d="M0,60 C240,110 480,10 720,45 C960,80 1200,20 1440,50 C1680,80 1800,40 1920,55 L1920,0 L0,0 Z"
          fill="rgba(255,255,255,.5)"
        />
        <path
          d="M0,75 C260,115 520,30 780,60 C1040,90 1260,35 1500,62 C1720,86 1840,55 1920,68 L1920,0 L0,0 Z"
          fill="rgba(255,255,255,.35)"
        />
      </svg>
    </div>

    <!-- 最新随笔：有数据渲染三连卡（按 index 错落入场），无数据给占位卡 -->
    <div id="posts">
      <div class="sec-head reveal">
        <span class="sec-title font-display">{{ siteConfig.sections.latestPosts }}</span>
        <span class="sec-sub">{{ siteConfig.blogSubtitle }}</span>
        <button type="button" class="sec-more" @click="router.push('/blog')">
          全部随笔
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div v-if="posts.length" class="post-grid">
        <article
          v-for="(post, i) in posts"
          :key="post.id ?? i"
          class="post reveal"
          :class="postVariants[i % 3]"
          :style="{ transitionDelay: `${0.08 * (i + 1)}s` }"
          role="link"
          tabindex="0"
          @click="openPost(post)"
          @keydown.enter="openPost(post)"
        >
          <div class="post-cover">
            <span class="no">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="tag">{{ post.tag }}</span>
          </div>
          <div class="post-body">
            <h3 class="post-title font-display">{{ post.title }}</h3>
            <p class="post-excerpt">{{ post.excerpt }}</p>
            <div class="post-foot">
              <span>{{ post.meta }}</span>
              <span class="read">
                阅读全文
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="post-grid">
        <article class="post p1 reveal" style="transition-delay: 0.08s">
          <div class="post-cover">
            <span class="no">01</span>
            <span class="tag">占位</span>
          </div>
          <div class="post-body">
            <h3 class="post-title font-display">还没有随笔</h3>
            <p class="post-excerpt">发布第一篇随笔后，这里会展示最新三篇。真实数据待写入。</p>
            <div class="post-foot">
              <span>去写一篇</span>
              <span class="read" @click.stop="router.push('/blog')">前往随笔</span>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- 实验室橱窗：左卡待办 Demo，右卡取第一个应用（无数据用心情仪表盘示例） -->
    <div id="showcase">
      <div class="sec-head reveal">
        <span class="sec-title font-display">{{ siteConfig.sections.inspiration }}</span>
        <span class="sec-sub">实验室里跑出来的小应用</span>
        <button type="button" class="sec-more" @click="router.push('/lab')">
          进入实验室
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div class="show-grid">
        <div class="show s1 reveal" style="transition-delay: 0.08s">
          <div class="show-chrome">
            <i /><i /><i />
            <span class="url">lab.local / todo-list</span>
          </div>
          <div class="show-stage" style="background: linear-gradient(150deg, #e8f8f1, #d6f2e8)">
            <div class="demo-todo">
              <h5>今日待办 <span class="cnt">{{ todoCnt }}</span></h5>
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
          <div class="show-info">
            <div>
              <div class="t font-display">待办清单</div>
              <div class="d">示例 Demo · 勾选是真的可以点的</div>
            </div>
            <button type="button" class="show-open" @click="router.push('/lab')">打开应用</button>
          </div>
        </div>

        <div
          v-for="(show, i) in shows.slice(0, 1)"
          :key="show.id ?? i"
          class="show s2 reveal"
          style="transition-delay: 0.16s"
        >
          <div class="show-chrome">
            <i /><i /><i />
            <span class="url">{{ show.url }}</span>
          </div>
          <div class="show-stage" style="background: linear-gradient(150deg, #e8f1fd, #e4dffd)">
            <div class="demo-dash">
              <div class="head">
                <div><b>{{ show.title.slice(0, 2) }}</b> <span>{{ show.desc }}</span></div>
                <span>LAB APP</span>
              </div>
              <div class="dash-bars"><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
          <div class="show-info">
            <div>
              <div class="t font-display">{{ show.title }}</div>
              <div class="d">{{ show.desc }}</div>
            </div>
            <button type="button" class="show-open" @click="openShow(show)">打开应用</button>
          </div>
        </div>

        <div v-if="!shows.length" class="show s2 reveal" style="transition-delay: 0.16s">
          <div class="show-chrome">
            <i /><i /><i />
            <span class="url">lab.local / mood-dashboard</span>
          </div>
          <div class="show-stage" style="background: linear-gradient(150deg, #e8f1fd, #e4dffd)">
            <div class="demo-dash">
              <div class="head">
                <div><b>87</b> <span>本周心情指数</span></div>
                <span>MOOD DASH</span>
              </div>
              <div class="dash-bars"><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
          <div class="show-info">
            <div>
              <div class="t font-display">心情仪表盘</div>
              <div class="d">示例 Demo · {{ siteConfig.sections.recommendedAuthor }}</div>
            </div>
            <button type="button" class="show-open" @click="router.push('/lab')">打开应用</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 页脚：品牌 / 快捷链接 / 备案号 + 回到顶部 -->
    <footer id="footer" class="reveal">
      <div>
        <div class="footer-brand font-display">{{ siteConfig.siteName }}</div>
        <div class="footer-tag">{{ siteConfig.footer.tagline }}</div>
      </div>
      <nav class="footer-links">
        <a v-for="link in siteConfig.footer.links" :key="link.label" @click.prevent="footerGo(link)">{{
          link.label
        }}</a>
      </nav>
      <span class="footer-icp">{{ siteConfig.footer.icp }}</span>
      <button id="toTop" type="button" aria-label="回到顶部" @click="scrollTop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </footer>
  </section>
</template>
