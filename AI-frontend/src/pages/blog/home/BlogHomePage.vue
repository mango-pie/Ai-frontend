<script setup lang="ts">
/**
 * 博客列表首页
 * 职责：已发布文章的默认入口 —— 服务端分页列表 + 标题搜索 + 最新/热门排序，
 * 支持卡片与时间线两种布局（全局 layoutMode）；侧栏分类/标签点击跳筛选页。
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { queryBlogPostPage, incrementLikeCount } from '@/api/blogPostController'
import { getAllCategories } from '@/api/blogCategoryController'
import { getTagCloud } from '@/api/blogTagController'
import { useLoginUserStore } from '@/stores/loginUser'
import { siteConfig } from '@/config/site'
import { useBlogLayoutMode } from '@/composables/useBlogLayoutMode'
import type { BlogLayoutMode } from '@/composables/useBlogLayoutMode'
import {
  loadBlogSettings,
  markBlogLikeDisabled,
  type BlogUxSettings,
} from '@/utils/blogSettings'
import { buildFilterQuery } from '@/utils/blogFilterQuery'
import BlogRoomShell from '@/components/blog/BlogRoomShell.vue'
import BlogPostCard from '@/components/blog/BlogPostCard.vue'
import BlogMagazineDeck from '@/components/blog/BlogMagazineDeck.vue'

const router = useRouter()
const loginUserStore = useLoginUserStore()
const { layoutMode, setLayoutMode } = useBlogLayoutMode()

// 站点 UX 配置；layoutMode 为跨页共享的布局偏好
const blogUx = ref<BlogUxSettings>({
  pageSizeDefault: 10,
  summaryMaxLength: 200,
  allowLike: true,
  viewCountEnabled: true,
  defaultStatus: 0,
  defaultStatusKey: 'DRAFT',
})

// 搜索词（标题模糊匹配）与排序；排序切换由 watch 自动触发重新拉取
const searchQuery = ref('')
const sortBy = ref<'latest' | 'popular'>('latest')
const loading = ref(false)
const allPosts = ref<API.BlogPostVO[]>([])
const categories = ref<API.BlogCategoryVO[]>([])
const tags = ref<API.BlogTagVO[]>([])

// 服务端分页状态：pageSize=0 表示由后端决定，回填后再用于计算页码点
const pagination = reactive({
  current: 1,
  pageSize: 0,
  total: 0,
})

const totalPages = computed(() => {
  const size = pagination.pageSize || blogUx.value.pageSizeDefault || 10
  if (size <= 0) return 1
  return Math.max(1, Math.ceil(pagination.total / size))
})

// 页码点窗口：最多显示 7 个页码，并尽量让当前页居中
const pageDots = computed(() => {
  const n = totalPages.value
  const cur = pagination.current
  const max = Math.min(n, 7)
  const start = Math.max(1, Math.min(cur - 3, n - max + 1))
  return Array.from({ length: max }, (_, i) => start + i)
})

// 时间线布局：把当前页文章按"年-月"分组（无法解析日期的归入"未知"）
const monthGroups = computed(() => {
  const map = new Map<string, API.BlogPostVO[]>()
  for (const p of allPosts.value) {
    const d = p.createdTime ? new Date(p.createdTime) : null
    const key =
      d && !Number.isNaN(d.getTime())
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : '未知'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return [...map.entries()].map(([month, posts]) => ({ month, posts }))
})

// 组装列表查询参数：只查已发布（status=1），热门排序按浏览量降序
const buildQueryParams = (): API.BlogPostQueryRequest => ({
  pageNum: pagination.current,
  pageSize: 0,
  status: 1,
  title: searchQuery.value.trim() || undefined,
  sortField: sortBy.value === 'popular' ? 'view_count' : undefined,
  sortOrder: 'descend',
})

// 拉取当前页文章，并回填总数/页大小（优先用后端返回值，其次站点配置）
const fetchPosts = async () => {
  loading.value = true
  try {
    const res = await queryBlogPostPage(buildQueryParams())
    if (res.data.code === 0 && res.data.data) {
      allPosts.value = res.data.data.records || []
      pagination.total = Number(res.data.data.totalRow || 0)
      const size = Number(res.data.data.pageSize || 0)
      if (size > 0) pagination.pageSize = size
      else if (blogUx.value.pageSizeDefault > 0) pagination.pageSize = blogUx.value.pageSizeDefault
    } else {
      message.error('获取文章列表失败：' + (res.data.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取文章列表失败:', error)
    message.error('获取文章列表失败')
  } finally {
    loading.value = false
  }
}

const fetchCategories = async () => {
  try {
    const res = await getAllCategories()
    if (res.data.code === 0 && res.data.data) {
      categories.value = res.data.data as API.BlogCategoryVO[]
    }
  } catch (error) {
    console.error('获取分类列表失败:', error)
  }
}

const fetchTags = async () => {
  try {
    const res = await getTagCloud()
    if (res.data.code === 0 && res.data.data) {
      tags.value = res.data.data
    }
  } catch (error) {
    console.error('获取标签列表失败:', error)
  }
}

const goPost = (id: number) => router.push(`/blog/${id}`)

// 打开筛选页：无具体 id 时退化为"任选第一个分类/标签"作为初始条件
const goFilterOpen = () => {
  const firstCat = categories.value.find((c) => c.id != null)?.id
  if (firstCat) {
    router.push({ path: '/blog/filter', query: buildFilterQuery([firstCat], []) })
    return
  }
  const firstTag = tags.value.find((t) => t.id != null)?.id
  if (firstTag) {
    router.push({ path: '/blog/filter', query: buildFilterQuery([], [firstTag]) })
    return
  }
  message.info('暂无分类或标签可筛选')
}

const goFilterCats = (id?: number) => {
  if (!id) {
    goFilterOpen()
    return
  }
  router.push({ path: '/blog/filter', query: buildFilterQuery([id], []) })
}

const goFilterTags = (id?: number) => {
  if (!id) {
    goFilterOpen()
    return
  }
  router.push({ path: '/blog/filter', query: buildFilterQuery([], [id]) })
}

// 搜索/翻页：均重置页码后重新拉取
const handleSearch = () => {
  pagination.current = 1
  fetchPosts()
}

const clearSearch = () => {
  searchQuery.value = ''
  pagination.current = 1
  fetchPosts()
}

// 发布入口：未登录先跳登录页并带好回跳地址
const handleCreatePost = () => {
  if (!loginUserStore.loginUser?.id) {
    message.warning('请先登录')
    router.push(`/user/login?redirect=${encodeURIComponent('/blog/create')}`)
    return
  }
  router.push('/blog/create')
}

const goPage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === pagination.current) return
  pagination.current = page
  fetchPosts()
}

// 点赞：成功后本地 +1；后端提示"已关闭"时同步关闭本页点赞能力
const handleLike = async (post: API.BlogPostVO) => {
  if (!post.id || !blogUx.value.allowLike) return
  try {
    const res = await incrementLikeCount({ id: post.id })
    if (res.data.code === 0) {
      post.likeCount = (post.likeCount || 0) + 1
      message.success('点赞成功')
    } else {
      const msg = res.data.message || '点赞失败'
      if (String(msg).includes('已关闭')) {
        markBlogLikeDisabled()
        blogUx.value = { ...blogUx.value, allowLike: false }
        message.warning(msg)
      } else {
        message.error(msg)
      }
    }
  } catch (error) {
    console.error('点赞失败:', error)
    message.error('点赞失败')
  }
}

const setLayout = (mode: BlogLayoutMode) => setLayoutMode(mode)

onMounted(async () => {
  // 先加载站点配置确定默认页大小，再并行拉列表/分类/标签
  blogUx.value = await loadBlogSettings()
  if (blogUx.value.pageSizeDefault > 0) {
    pagination.pageSize = blogUx.value.pageSizeDefault
  }
  fetchPosts()
  fetchCategories()
  fetchTags()

  // 监听自定义事件：其它模块（如 AI 助手）发布/编辑文章后通知本页刷新列表
  if (typeof window !== 'undefined') {
    window.addEventListener('agent-ui-action', (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d?.type === 'refresh' && (d.module === 'blog_list' || d.module === 'blog_editor')) {
        fetchPosts()
      }
    })
  }
})

// 切换排序时回到第一页并重新拉取
watch(sortBy, () => {
  pagination.current = 1
  fetchPosts()
})
</script>

<template>
  <BlogRoomShell :layout-mode="layoutMode">
    <div class="list-shell">
      <aside class="list-side anim" style="animation-delay: 0.15s">
        <div class="side-card glass">
          <span class="tape" />
          <h3 class="font-display">关于</h3>
          <p class="about-text text-pretty">
            {{ siteConfig.blogSubtitle }}。学习、灵感与一点点生活碎碎念。
          </p>
        </div>
        <div class="side-card glass">
          <h3 class="font-display">搜索</h3>
          <div class="search-compact" :class="{ 'has-q': !!searchQuery.trim() }">
            <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" stroke-linecap="round" />
            </svg>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="搜标题…"
              autocomplete="off"
              @keydown.enter.prevent="handleSearch"
            />
            <button type="button" class="search-clear" aria-label="清除搜索" @click="clearSearch">×</button>
          </div>
        </div>
        <div class="side-card glass">
          <div class="side-h">
            <h3 class="font-display">分类</h3>
            <button type="button" class="more" @click="goFilterOpen">筛选 ›</button>
          </div>
          <p class="filter-hint">点击进入筛选页 · 分类与标签可同选</p>
          <div class="cat-list">
            <button type="button" class="cat-item on" title="显示全部" @click="router.push('/blog')">
              <span class="chk" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="lab">全部</span>
              <span class="n">{{ pagination.total || 0 }}</span>
            </button>
            <button
              v-for="cat in categories.slice(0, 8)"
              :key="cat.id"
              type="button"
              class="cat-item"
              :title="`进入筛选：${cat.name}`"
              @click="goFilterCats(cat.id)"
            >
              <span class="chk" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="lab">{{ cat.name }}</span>
              <span v-if="cat.postCount != null" class="n">{{ cat.postCount }}</span>
              <span class="go-hint">›</span>
            </button>
          </div>
        </div>
        <div class="side-card glass" style="flex: 1; min-height: 0">
          <div class="side-h">
            <h3 class="font-display">标签</h3>
            <button type="button" class="more" @click="goFilterOpen">筛选 ›</button>
          </div>
          <p class="filter-hint">点击进入筛选页 · 与分类合并筛选</p>
          <div class="tag-cloud">
            <button
              v-for="tag in tags.slice(0, 12)"
              :key="tag.id"
              type="button"
              class="tag-pill check"
              title="进入筛选页"
              @click="goFilterTags(tag.id)"
            >
              <span class="chk" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>#{{ tag.name }}</span>
            </button>
          </div>
        </div>
      </aside>

      <div class="list-main anim" style="animation-delay: 0.22s">
        <div class="list-head">
          <div>
            <div class="eyebrow">JOURNAL</div>
            <h1 class="font-display">
              {{ siteConfig.blogTitle
              }}<span class="sticker font-display">Vol.{{ pagination.total || '—' }}</span>
            </h1>
            <div class="sub">把日子写成一页页小故事</div>
          </div>
          <div class="list-actions">
            <div class="seg-mini">
              <button type="button" :class="{ on: layoutMode === 'card' }" @click="setLayout('card')">
                卡片
              </button>
              <button
                type="button"
                :class="{ on: layoutMode === 'timeline' }"
                @click="setLayout('timeline')"
              >
                时间线
              </button>
            </div>
            <div class="seg-mini list-sort">
              <button type="button" :class="{ on: sortBy === 'latest' }" @click="sortBy = 'latest'">
                最新
              </button>
              <button type="button" :class="{ on: sortBy === 'popular' }" @click="sortBy = 'popular'">
                热门
              </button>
            </div>
            <button type="button" class="chip-btn primary font-display" @click="handleCreatePost">
              发布
            </button>
          </div>
        </div>

        <!-- 卡片布局：首张卡片放大为 featured -->
        <div v-show="layoutMode === 'card'" class="bento">
          <template v-if="!loading && allPosts.length">
            <BlogPostCard
              v-for="(post, i) in allPosts"
              :key="post.id"
              :post="post"
              :featured="i === 0"
              :allow-like="blogUx.allowLike"
              :show-view-count="blogUx.viewCountEnabled"
              @open="goPost"
              @like="handleLike"
              @tag="goFilterTags"
              @category="goFilterCats"
            />
          </template>
        </div>

        <!-- 时间线布局：按月份分组渲染当前页文章 -->
        <div v-show="layoutMode === 'timeline'" class="timeline-wrap">
          <div class="tl-scroll">
            <div class="tl-line" />
            <template v-for="group in monthGroups" :key="group.month">
              <div class="tl-month">{{ group.month }}</div>
              <div v-for="post in group.posts" :key="post.id" class="tl-row">
                <button type="button" class="tl-card glass" @click="goPost(post.id!)">
                  <div class="t font-display">{{ post.title }}</div>
                  <div class="s text-pretty">{{ post.summary }}</div>
                  <div class="m">{{ post.categoryName }} · {{ post.likeCount || 0 }} 赞</div>
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- 空状态：搜索无结果时提示并可一键清空搜索 -->
        <div v-if="!loading && allPosts.length === 0" class="empty-state show">
          <div class="t font-display">没有找到相关随笔</div>
          <button type="button" class="chip-btn" style="margin-top: 10px" @click="clearSearch">
            清除搜索
          </button>
        </div>

        <div class="list-foot">
          <div class="page-dots">
            <button
              v-for="p in pageDots"
              :key="p"
              type="button"
              class="page-dot"
              :class="{ on: p === pagination.current }"
              @click="goPage(p)"
            >
              {{ p }}
            </button>
          </div>
          <div class="snap-hint">单屏构图 · 分页翻页</div>
        </div>
      </div>

      <BlogMagazineDeck :posts="allPosts" @open="goPost" />
    </div>
  </BlogRoomShell>
</template>
