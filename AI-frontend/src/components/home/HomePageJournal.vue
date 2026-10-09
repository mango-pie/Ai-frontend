<script setup lang="ts">
/**
 * 主页第 02 屏「随笔期刊」：杂志刊头 + 打主刊（第一篇随笔大卡）+ 侧栏次刊。
 * posts 为空时展示占位卡，引导用户去写第一篇。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import type { HomePostCard } from '@/components/home/homeTypes'
import HomeMiniBar from '@/components/home/HomeMiniBar.vue'
import HomePageDeco from '@/components/home/HomePageDeco.vue'

const props = defineProps<{
  posts: HomePostCard[]
  pageLabel: string
}>()

defineEmits<{
  home: []
}>()

const router = useRouter()

// 第一篇做主打刊页，第二、三篇进侧栏
const featured = computed(() => props.posts[0] || null)
const sidePosts = computed(() => props.posts.slice(1, 3))

// 打开随笔：有具体路径跳详情，否则兜底去 /blog 列表
const open = (post: HomePostCard | null) => {
  if (post?.path) router.push(post.path)
  else router.push('/blog')
}
</script>

<template>
  <section class="home-page home-page--journal" data-screen-label="02 Journal">
    <HomePageDeco variant="journal" />
    <HomeMiniBar :page-label="pageLabel" @home="$emit('home')" />

    <!-- 杂志刊头：VOL. 贴纸 + 标题 + 「全部随笔」入口 -->
    <div class="journal-layout">
      <header class="journal-mast">
        <span class="page-sticker page-sticker--vol font-display">VOL.</span>
        <p class="journal-eyebrow">JOURNAL</p>
        <h2 class="journal-title font-display">{{ siteConfig.sections.latestPosts }}</h2>
        <p class="journal-sub">{{ siteConfig.blogSubtitle }}</p>
        <button type="button" class="journal-all" @click="router.push('/blog')">
          全部随笔
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </header>

      <!-- 主打刊页：第一篇随笔的大卡；无内容时降级为占位引导卡 -->
      <article
        v-if="featured"
        class="journal-feature"
        role="link"
        tabindex="0"
        @click="open(featured)"
        @keydown.enter="open(featured)"
      >
        <span class="tape-strip" aria-hidden="true" />
        <div class="journal-feature__cover">
          <span class="journal-feature__no">01</span>
          <span class="journal-feature__tag">{{ featured.tag }}</span>
        </div>
        <div class="journal-feature__body">
          <h3 class="font-display">{{ featured.title }}</h3>
          <p>{{ featured.excerpt }}</p>
          <div class="journal-feature__foot">
            <span>{{ featured.meta }}</span>
            <span class="journal-feature__read">阅读全文</span>
          </div>
        </div>
      </article>

      <div v-else class="journal-feature journal-feature--empty">
        <span class="tape-strip" aria-hidden="true" />
        <div class="journal-feature__cover">
          <span class="journal-feature__no">—</span>
          <span class="journal-feature__tag">占位</span>
        </div>
        <div class="journal-feature__body">
          <h3 class="font-display">还没有随笔</h3>
          <p>发布第一篇后，这里会成为主打刊页。真实内容待写入。</p>
          <button type="button" class="journal-all" @click="router.push('/blog')">去随笔</button>
        </div>
      </div>

      <!-- 侧栏次刊：第 2、3 篇小卡；不足时显示「更多随笔」幽灵卡 -->
      <aside class="journal-side">
        <article
          v-for="(post, i) in sidePosts"
          :key="post.id ?? i"
          class="journal-side-card"
          :class="`is-${i}`"
          role="link"
          tabindex="0"
          @click="open(post)"
          @keydown.enter="open(post)"
        >
          <span class="washi-strip" aria-hidden="true" />
          <span class="journal-side-card__no">{{ String(i + 2).padStart(2, '0') }}</span>
          <span class="journal-side-card__tag">{{ post.tag }}</span>
          <h4 class="font-display">{{ post.title }}</h4>
          <p>{{ post.excerpt }}</p>
          <span class="journal-side-card__meta">{{ post.meta }}</span>
        </article>

        <div v-if="!sidePosts.length && featured" class="journal-side-card journal-side-card--ghost">
          <span class="washi-strip" aria-hidden="true" />
          <span class="journal-side-card__no">··</span>
          <h4 class="font-display">更多随笔</h4>
          <p>继续写下去，侧栏会慢慢填满。</p>
        </div>
      </aside>
    </div>
  </section>
</template>
