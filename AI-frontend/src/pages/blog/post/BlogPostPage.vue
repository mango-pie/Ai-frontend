<script setup lang="ts">
/**
 * 博客文章详情页
 * 职责：展示单篇已发布文章 —— Markdown 渲染正文、目录（TOC）、点赞/分享/浏览计数，
 * 右侧提供相关文章与"下一篇"入口；分类/标签可点击跳筛选页。
 * 编辑入口仅对管理员角色开放。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { renderBlogMarkdown } from '@/utils/blogMarkdown'
import {
  getBlogPostVo,
  incrementLikeCount,
  incrementViewCount,
  getPublishedBlogPostPage,
} from '@/api/blogPostController'
import { getTagCloud } from '@/api/blogTagController'
import { useLoginUserStore } from '@/stores/loginUser'
import { isAdminRole } from '@/config/permission'
import { siteConfig } from '@/config/site'
import { rememberLastBlogPost } from '@/composables/useBlogLastPost'
import {
  loadBlogSettings,
  markBlogLikeDisabled,
  markBlogViewDisabled,
  type BlogUxSettings,
} from '@/utils/blogSettings'
import { buildFilterQuery } from '@/utils/blogFilterQuery'
import BlogRoomShell from '@/components/blog/BlogRoomShell.vue'

type TocItem = { id: string; text: string }

const router = useRouter()
const route = useRoute()
const loginUserStore = useLoginUserStore()

// 文章、相关文章、标签云与站点 UX 配置
const post = ref<API.BlogPostVO | null>(null)
const relatedPosts = ref<API.BlogPostVO[]>([])
const tagCloud = ref<API.BlogTagVO[]>([])
const loading = ref(true)
const blogUx = ref<BlogUxSettings>({
  pageSizeDefault: 10,
  summaryMaxLength: 200,
  allowLike: true,
  viewCountEnabled: true,
  defaultStatus: 0,
  defaultStatusKey: 'DRAFT',
})

// 仅管理员可编辑文章
const canEdit = computed(() => isAdminRole(loginUserStore.loginUser?.userRole))

// 日期格式化为 YYYY-MM-DD，非法值返回空串
const shortDate = (raw?: string) => {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 正文 Markdown 转 HTML（自定义渲染器，含代码高亮等）
const renderedContent = computed(() => {
  if (!post.value?.content) return ''
  return renderBlogMarkdown(post.value.content)
})

// 从渲染后的 HTML 中提取 h2/h3 作为目录项（最多 12 条）
const toc = computed<TocItem[]>(() => {
  const html = renderedContent.value
  if (!html) return []
  const items: TocItem[] = []
  const re = /<h([2-3])[^>]*>(.*?)<\/h\1>/gi
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(html)) && i < 12) {
    const text = (m[2] || '').replace(/<[^>]+>/g, '').trim()
    if (!text) continue
    items.push({ id: `toc-${i}`, text })
    i++
  }
  return items
})

// 预估阅读时长：按每分钟 400 字粗算，至少 1 分钟
const readMinutes = computed(() => {
  const len = (post.value?.content || '').length
  return Math.max(1, Math.round(len / 400))
})

// "下一篇"取相关文章列表的第一篇
const nextPost = computed(() => relatedPosts.value[0] || null)

// 阅读数缩写：超过 999 显示 x.xk
const formatViews = (n?: number) => {
  if (!n) return '0'
  return n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// 拉取文章详情；成功后记一次浏览（站点开启计数时），本地同步 +1
const fetchPost = async () => {
  loading.value = true
  try {
    const currentId = Number(route.params.id)
    const response = await getBlogPostVo({ id: currentId })
    if (response.data?.data) {
      post.value = response.data.data
      rememberLastBlogPost(currentId)
      if (blogUx.value.viewCountEnabled) {
        const viewRes = await incrementViewCount({ id: currentId })
        if (viewRes.data.code === 0) {
          if (post.value.viewCount !== undefined) post.value.viewCount += 1
        } else {
          const msg = viewRes.data.message || ''
          if (String(msg).includes('已关闭')) {
            markBlogViewDisabled()
            blogUx.value = { ...blogUx.value, viewCountEnabled: false }
          }
        }
      }
    } else {
      post.value = null
      message.error('获取文章失败: ' + (response.data?.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取文章失败:', error)
    message.error('获取文章失败')
    post.value = null
  } finally {
    loading.value = false
  }
}

const fetchTagCloud = async () => {
  try {
    const response = await getTagCloud()
    if (response.data?.data) tagCloud.value = response.data.data
  } catch (error) {
    console.error('获取标签云失败:', error)
  }
}

// 相关文章：拉最新已发布列表并排除当前篇（作为"相关/下一篇"数据源）
const fetchRelatedPosts = async () => {
  try {
    const currentId = Number(route.params.id)
    const response = await getPublishedBlogPostPage({ pageNum: 1, pageSize: 8 })
    if (response.data?.data?.records) {
      relatedPosts.value = response.data.data.records.filter((item) => item.id !== currentId)
    }
  } catch (error) {
    console.error('获取相关文章失败:', error)
  }
}

// 点赞：成功本地 +1；后端提示"已关闭"时同步关闭本页点赞能力
const handleLike = async () => {
  if (!blogUx.value.allowLike || !post.value?.id) return
  try {
    const res = await incrementLikeCount({ id: post.value.id })
    if (res.data.code !== 0) {
      const msg = res.data.message || '点赞失败'
      if (String(msg).includes('已关闭')) {
        markBlogLikeDisabled()
        blogUx.value = { ...blogUx.value, allowLike: false }
        message.warning(msg)
      } else {
        message.error(msg)
      }
      return
    }
    if (post.value.likeCount !== undefined) post.value.likeCount++
    message.success('点赞成功')
  } catch {
    message.error('点赞失败')
  }
}

// 分享：把当前页地址复制到剪贴板
const handleShare = async () => {
  try {
    await navigator.clipboard.writeText(window.location.href)
    message.success('链接已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

const goFilterCat = (categoryId?: number) => {
  const id = Number(categoryId)
  if (!id) return
  router.push({ path: '/blog/filter', query: buildFilterQuery([id], []) })
}

const goFilterTag = (tagId?: number) => {
  const id = Number(tagId)
  if (!id) return
  router.push({ path: '/blog/filter', query: buildFilterQuery([], [id]) })
}

const goPost = (id?: number) => {
  if (id) router.push(`/blog/${id}`)
}

const goBack = () => router.push('/blog')

// 编辑：带上来源页 from，保存后可跳回详情
const handleEdit = () => {
  if (post.value?.id) {
    router.push({
      path: `/blog/edit/${post.value.id}`,
      query: { from: route.fullPath },
    })
  }
}

// 统一刷新：详情 + 标签云 + 相关文章
const reload = () => {
  fetchPost()
  fetchTagCloud()
  fetchRelatedPosts()
}

// 同一组件在不同文章间跳转（如"下一篇"）时按 id 重载
watch(() => route.params.id, (id) => {
  if (id) reload()
})

onMounted(async () => {
  blogUx.value = await loadBlogSettings()
  reload()
})
</script>

<template>
  <BlogRoomShell>
    <!-- 三态：加载中 / 文章不存在 / 正常详情 -->
    <div v-if="loading" class="detail-shell" style="align-items: center; justify-content: center">
      <div class="side-card glass" style="padding: 24px">加载中…</div>
    </div>
    <!-- 加载失败或文章已删除：空状态提示 -->
    <div v-else-if="!post" class="detail-shell">
      <aside class="detail-rail">
        <button type="button" class="back-chip" @click="goBack">← 返回列表</button>
      </aside>
      <div class="empty-state" style="display: flex; grid-column: 2">
        <div class="t font-display">文章不存在或已被删除</div>
        <button type="button" class="chip-btn" style="margin-top: 10px" @click="goBack">回列表</button>
      </div>
    </div>
    <div v-else class="detail-shell">
      <aside class="detail-rail">
        <button type="button" class="back-chip" @click="goBack">← 返回列表</button>
        <div class="side-card glass">
          <span class="tape" />
          <h3 class="font-display">本篇目录</h3>
          <button
            v-for="item in toc"
            :key="item.id"
            type="button"
            class="toc-item"
          >
            {{ item.text }}
          </button>
          <p v-if="!toc.length" class="about-text">暂无小节标题</p>
        </div>
        <div class="side-card glass" style="flex: 1">
          <h3 class="font-display">作者</h3>
          <p class="about-text text-pretty">
            {{ siteConfig.ownerName }} · {{ siteConfig.blogSubtitle }}
          </p>
        </div>
      </aside>

      <article class="detail-main glass">
        <div class="detail-cover" :class="{ 'has-img': !!post.coverUrl }">
          <img v-if="post.coverUrl" :src="post.coverUrl" :alt="post.title || ''" />
          <span v-else class="ratio">[image] cover</span>
        </div>
        <div class="detail-body">
          <div class="detail-meta">
            <button
              type="button"
              class="meta-link"
              title="按此分类筛选"
              @click="goFilterCat(post.categoryId)"
            >
              {{ post.categoryName || '随笔' }}
            </button>
            <span>{{ shortDate(post.createdTime) }}</span>
            <span v-if="blogUx.viewCountEnabled">{{ formatViews(post.viewCount) }} 阅读</span>
          </div>
          <h1 class="font-display text-pretty">{{ post.title }}</h1>
          <p class="detail-summary text-pretty">{{ post.summary }}</p>
          <div class="tag-cloud" style="margin-bottom: 4px">
            <button
              v-for="t in post.tags || []"
              :key="t.id"
              type="button"
              class="tag-pill on"
              @click="goFilterTag(t.id)"
            >
              #{{ t.name }}
            </button>
          </div>
          <!-- 操作区：点赞（站点开关控制显隐）、复制链接、编辑（仅管理员可见） -->
          <div class="detail-actions">
            <button
              v-if="blogUx.allowLike"
              type="button"
              class="chip-btn"
              @click="handleLike"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path
                  d="M12 21s-7.2-4.6-9.5-8.2C.7 9.8 2.2 6 5.6 6c1.9 0 3.2 1.1 4 2.2C10.4 7.1 11.7 6 13.6 6c3.4 0 4.9 3.8 3.1 6.8C19.2 16.4 12 21 12 21z"
                />
              </svg>
              {{ post.likeCount || 0 }}
            </button>
            <button type="button" class="chip-btn" @click="handleShare">分享</button>
            <button v-if="canEdit" type="button" class="chip-btn" @click="handleEdit">编辑</button>
          </div>
          <div class="blog-prose text-pretty" v-html="renderedContent" />
        </div>
      </article>

      <aside class="detail-side">
        <div class="side-card glass">
          <h3 class="font-display">相关</h3>
          <button
            v-for="r in relatedPosts.slice(0, 4)"
            :key="r.id"
            type="button"
            class="related-item"
            @click="goPost(r.id)"
          >
            <span class="t">{{ r.title }}</span>
            <span class="d">{{ r.categoryName }}</span>
          </button>
          <p v-if="!relatedPosts.length" class="about-text">暂无相关文章</p>
        </div>
        <div class="side-card glass">
          <h3 class="font-display">标签</h3>
          <div class="tag-cloud">
            <button
              v-for="t in tagCloud.slice(0, 16)"
              :key="t.id"
              type="button"
              class="tag-pill"
              @click="goFilterTag(t.id)"
            >
              #{{ t.name }}
            </button>
          </div>
        </div>
        <div class="deck">
          <div class="deck-cal">
            <div class="mo">READ</div>
            <div class="dy font-display">{{ readMinutes }}</div>
            <div class="wk">分钟</div>
          </div>
          <div class="mag-stack" style="min-height: 180px">
            <div class="mag-stage" style="left: 12px; right: 12px">
              <!-- 下一篇期刊牌：有相关文章时可点击跳转，否则显示"读完"占位 -->
              <button
                v-if="nextPost"
                type="button"
                class="mag-book t-violet is-front"
                aria-label="下一篇"
                @click="goPost(nextPost.id)"
              >
                <span class="mast">NEXT</span>
                <span class="vol font-display" style="font-size: 36px">续</span>
                <span class="latest">
                  <b>下一篇</b>
                  <span>{{ nextPost.title }}</span>
                </span>
              </button>
              <div v-else class="mag-book t-mint is-front" style="cursor: default">
                <span class="mast">END</span>
                <span class="vol font-display" style="font-size: 36px">完</span>
                <span class="latest"><b>本页读完</b><span>回列表看看</span></span>
              </div>
            </div>
          </div>
          <div class="stat-grid">
            <div class="stat-cell">
              <div class="n font-display">{{ formatViews(post.viewCount) }}</div>
              <div class="l">阅读</div>
            </div>
            <div class="stat-cell">
              <div class="n font-display">{{ post.likeCount || 0 }}</div>
              <div class="l">喜欢</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </BlogRoomShell>
</template>
