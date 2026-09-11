<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { listMyAppByPage } from '@/api/appController'
import { getPublishedBlogPostPage } from '@/api/blogPostController'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { siteConfig } from '@/config/site'
import { CalendarOutlined } from '@ant-design/icons-vue'
import HomeClock from '@/components/home/HomeClock.vue'
import DailyHitokoto from '@/components/home/DailyHitokoto.vue'

function formatPostDate(str: string | undefined) {
  if (!str) return ''
  const d = new Date(str)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const siteLaunch = new Date('2025-01-01')
const uptimeDays = computed(() => {
  const diff = Date.now() - siteLaunch.getTime()
  return Math.max(1, Math.floor(diff / 86400000))
})

const router = useRouter()
const loginUserStore = useLoginUserStore()
const capabilitiesStore = useCapabilitiesStore()
const blogEnabled = computed(() => capabilitiesStore.enabled('blog'))
const labEnabled = computed(() => capabilitiesStore.enabled('app-lab'))

const latestPosts = ref<API.BlogPostVO[]>([])
const postTotal = ref(0)
const postsLoading = ref(false)
const myTotal = ref(0)

const fetchLatestPosts = async () => {
  postsLoading.value = true
  try {
    const res = await getPublishedBlogPostPage({ pageNum: 1, pageSize: 6 })
    if (res.data.code === 0 && res.data.data) {
      latestPosts.value = res.data.data.records || []
      postTotal.value = res.data.data.totalRow || 0
    }
  } finally {
    postsLoading.value = false
  }
}

const fetchMyTotal = async () => {
  if (!loginUserStore.loginUser.id) {
    myTotal.value = 0
    return
  }
  const res = await listMyAppByPage({ pageNum: 1, pageSize: 1 })
  if (res.data.code === 0 && res.data.data) {
    myTotal.value = res.data.data.totalRow || 0
  }
}

onMounted(async () => {
  await capabilitiesStore.ensureLoaded()
  if (blogEnabled.value) {
    fetchLatestPosts()
  }
  if (labEnabled.value) {
    fetchMyTotal()
  }
})
</script>

<template>
  <div id="homePage">
    <div class="home-top">
      <section class="home-card intro-card">
        <div class="intro-card__body">
          <a-avatar :size="88" :src="siteConfig.avatar" class="intro-card__avatar" />
          <div class="intro-card__content">
            <h1 class="intro-card__name">{{ siteConfig.ownerName }}</h1>
            <p class="intro-card__site">{{ siteConfig.siteName }}</p>
            <p class="intro-card__bio">{{ siteConfig.bio }}</p>
          </div>
        </div>
        <div class="intro-card__stats">
          <div v-if="blogEnabled" class="stat-chip" @click="router.push('/blog')">
            <span class="stat-chip__num">{{ postTotal }}</span>
            <span class="stat-chip__label">{{ siteConfig.statsLabels.posts }}</span>
          </div>
          <div v-if="loginUserStore.loginUser.id && labEnabled" class="stat-chip" @click="router.push('/lab')">
            <span class="stat-chip__num">{{ myTotal }}</span>
            <span class="stat-chip__label">{{ siteConfig.statsLabels.experiments }}</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip__num">{{ uptimeDays }}</span>
            <span class="stat-chip__label">{{ siteConfig.statsLabels.uptime }}天</span>
          </div>
        </div>
      </section>

      <section class="home-card clock-card">
        <HomeClock variant="plain" />
      </section>
    </div>

    <section class="home-card hitokoto-card">
      <DailyHitokoto variant="plain" />
    </section>

    <section v-if="blogEnabled" class="content-section">
      <div class="content-section__header">
        <span class="content-section__title">{{ siteConfig.sections.latestPosts }}</span>
        <a class="content-section__more" @click="router.push('/blog')">全部随笔 →</a>
      </div>
      <a-spin :spinning="postsLoading">
        <a-empty v-if="!latestPosts.length && !postsLoading" description="暂无随笔，去博客写第一篇吧" />
        <div v-else class="home-post-grid">
          <article
            v-for="post in latestPosts"
            :key="post.id"
            class="home-post"
            @click="router.push('/blog/' + post.id)"
          >
            <div class="home-post__cover" :class="{ 'home-post__cover--empty': !post.coverUrl }">
              <img v-if="post.coverUrl" :src="post.coverUrl" :alt="post.title || '随笔封面'" />
            </div>
            <div class="home-post__body">
              <div class="home-post__meta">
                <CalendarOutlined />
                <span>{{ formatPostDate(post.createdTime) }}</span>
                <span v-if="post.categoryName" class="home-post__category">{{ post.categoryName }}</span>
              </div>
              <h3 class="home-post__title">{{ post.title || '无标题' }}</h3>
              <p class="home-post__summary">{{ post.summary || '暂无摘要' }}</p>
            </div>
          </article>
        </div>
      </a-spin>
    </section>
  </div>
</template>

<style scoped>
#homePage {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px 80px;
  position: relative;
  z-index: 1;
}

.home-card {
  background: var(--color-bg-card);
  backdrop-filter: blur(16px);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
}

.home-top {
  display: grid;
  grid-template-columns: 1fr min(280px, 32%);
  gap: 20px;
  margin-top: 16px;
}

.intro-card {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.intro-card__body {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}

.intro-card__avatar {
  flex-shrink: 0;
  border: 3px solid rgba(232, 121, 169, 0.4);
  box-shadow: var(--shadow-glow);
}

.intro-card__name {
  font-size: 32px;
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 4px;
}

.intro-card__site {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.intro-card__bio {
  font-size: 15px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 0;
}

.intro-card__stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}

.stat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-normal);
  min-width: 80px;
}

.stat-chip:hover {
  border-color: var(--color-border-hover);
  background: rgba(232, 121, 169, 0.08);
  transform: translateY(-2px);
}

.stat-chip__num {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-chip__label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.clock-card {
  position: relative;
  padding: 20px;
  padding-top: 52px;
  display: block;
}

.clock-card :deep(.clock-card__header) {
  position: absolute;
  top: 16px;
  right: 16px;
  margin: 0;
  justify-content: flex-end;
}

.hitokoto-card {
  margin-top: 20px;
  padding: 24px 28px;
}

.content-section {
  margin-top: 40px;
}

.content-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.content-section__title {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.content-section__more {
  font-size: 13px;
  color: var(--color-primary);
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.content-section__more:hover {
  opacity: 0.8;
}

.home-post-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.home-post {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-bg-card);
  backdrop-filter: blur(12px);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-normal);
}

.home-post:hover {
  border-color: rgba(232, 121, 169, 0.35);
  transform: translateY(-4px);
  box-shadow: var(--shadow-glow);
}

.home-post__cover {
  width: 100%;
  height: 160px;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--blog-cover-fallback);
}

.home-post__cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.home-post__cover--empty::after {
  content: '♪';
  font-size: 36px;
  color: rgba(255, 255, 255, 0.35);
}

.home-post__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}

.home-post:hover .home-post__cover img {
  transform: scale(1.06);
}

.home-post__body {
  flex: 1;
  padding: 16px 18px 18px;
  min-width: 0;
}

.home-post__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}

.home-post__category {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary-08);
  color: var(--color-primary-light);
}

.home-post__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-post__summary {
  font-size: 13px;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.6;
  margin: 0;
}

@media (max-width: 900px) {
  .home-top {
    grid-template-columns: 1fr;
  }

  .clock-card {
    order: -1;
    padding: 48px 16px 16px;
  }

  .home-post-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .intro-card {
    padding: 24px 20px;
  }

  .intro-card__body {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .intro-card__stats {
    justify-content: center;
  }

  .intro-card__name {
    font-size: 26px;
  }

  .hitokoto-card {
    padding: 20px;
  }

  .home-post-grid {
    grid-template-columns: 1fr;
  }

  .home-post__cover {
    height: 180px;
  }
}
</style>
