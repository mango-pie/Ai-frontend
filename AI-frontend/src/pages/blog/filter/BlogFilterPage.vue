<script setup lang="ts">
/**
 * 博客筛选页
 * 职责：按分类 + 标签组合筛选文章，筛选条件以 URL query（cats/tags 的 id 列表）持久化，
 * 便于分享与后退。筛选模式由 resolveServerFilter 决定：
 * 单分类或单标签可走服务端过滤；多选组合则拉较多数据后在前端取交集。
 * 全部条件取消时自动回到博客列表页。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { queryBlogPostPage, incrementLikeCount } from '@/api/blogPostController'
import { getAllCategories } from '@/api/blogCategoryController'
import { getTagCloud } from '@/api/blogTagController'
import {
  loadBlogSettings,
  markBlogLikeDisabled,
  type BlogUxSettings,
} from '@/utils/blogSettings'
import {
  parseIdList,
  buildFilterQuery,
  matchPostFilters,
  resolveServerFilter,
} from '@/utils/blogFilterQuery'
import BlogRoomShell from '@/components/blog/BlogRoomShell.vue'
import BlogPostCard from '@/components/blog/BlogPostCard.vue'
import BlogFilterChips from '@/components/blog/BlogFilterChips.vue'

// 已选条件的"胶囊"模型，用于顶部展示与单个移除
type FilterChip = {
  key: string
  label: string
  kind: 'cat' | 'tag'
  id: number
}

const route = useRoute()
const router = useRouter()

// 站点 UX 配置（点赞开关等），挂载时加载
const blogUx = ref<BlogUxSettings>({
  pageSizeDefault: 10,
  summaryMaxLength: 200,
  allowLike: true,
  viewCountEnabled: true,
  defaultStatus: 0,
  defaultStatusKey: 'DRAFT',
})

const loading = ref(false)
// 元数据（分类/标签）与原始文章列表；已选 id 均来自 URL
const categories = ref<API.BlogCategoryVO[]>([])
const tags = ref<API.BlogTagVO[]>([])
const rawPosts = ref<API.BlogPostVO[]>([])
const selectedCats = ref<number[]>([])
const selectedTags = ref<number[]>([])

// 把 URL 中的 cats/tags 解析为已选 id 列表
const syncFromRoute = () => {
  selectedCats.value = parseIdList(route.query.cats)
  selectedTags.value = parseIdList(route.query.tags)
}

// 把筛选状态写回 URL（replace 不产生历史记录）；条件为空时直接回列表页
const pushQuery = (cats: number[], tagsIds: number[]) => {
  if (cats.length === 0 && tagsIds.length === 0) {
    router.replace('/blog')
    return
  }
  router.replace({ path: '/blog/filter', query: buildFilterQuery(cats, tagsIds) })
}

// 当前已选条件的胶囊列表（分类名找不到时回退显示 id）
const chips = computed<FilterChip[]>(() => {
  const list: FilterChip[] = []
  for (const id of selectedCats.value) {
    const cat = categories.value.find((c) => c.id === id)
    list.push({
      key: `c-${id}`,
      id,
      kind: 'cat',
      label: cat?.name || `分类#${id}`,
    })
  }
  for (const id of selectedTags.value) {
    const tag = tags.value.find((t) => t.id === id)
    list.push({
      key: `t-${id}`,
      id,
      kind: 'tag',
      label: `#${tag?.name || id}`,
    })
  }
  return list
})

// 最终展示列表：服务端过滤模式直接用返回值；客户端模式（多条件）在本地取交集
const displayPosts = computed(() => {
  const srv = resolveServerFilter(selectedCats.value, selectedTags.value)
  if (srv.mode === 'client') {
    return rawPosts.value.filter((p) =>
      matchPostFilters(p, selectedCats.value, selectedTags.value),
    )
  }
  return rawPosts.value
})

const selectedCount = computed(() => selectedCats.value.length + selectedTags.value.length)

// 右侧期刊牌上的条件摘要，过长时截断
const filterBadge = computed(() => {
  if (!chips.value.length) return '—'
  return chips.value.map((c) => c.label).join(' · ').slice(0, 18)
})

const isCatOn = (id?: number) => id != null && selectedCats.value.includes(Number(id))
const isTagOn = (id?: number) => id != null && selectedTags.value.includes(Number(id))

// 切换分类/标签选中态后统一走 pushQuery，让 URL 成为唯一数据源
const toggleCat = (id?: number) => {
  if (id == null) return
  const nid = Number(id)
  const next = selectedCats.value.includes(nid)
    ? selectedCats.value.filter((x) => x !== nid)
    : [...selectedCats.value, nid]
  pushQuery(next, selectedTags.value)
}

const toggleTag = (id?: number) => {
  if (id == null) return
  const nid = Number(id)
  const next = selectedTags.value.includes(nid)
    ? selectedTags.value.filter((x) => x !== nid)
    : [...selectedTags.value, nid]
  pushQuery(selectedCats.value, next)
}

// 移除单个胶囊：按类型从对应数组剔除后重写 URL
const removeChip = (chip: FilterChip) => {
  if (chip.kind === 'cat') {
    pushQuery(
      selectedCats.value.filter((x) => x !== chip.id),
      selectedTags.value,
    )
  } else {
    pushQuery(
      selectedCats.value,
      selectedTags.value.filter((x) => x !== chip.id),
    )
  }
}

const clearAll = () => router.push('/blog')

const goPost = (id: number) => router.push(`/blog/${id}`)

// 从卡片上的标签/分类点击进入筛选：替换为对应的单一条件
const goCardTag = (id: number) => pushQuery(selectedCats.value, [id])
const goCardCat = (id: number) => pushQuery([id], selectedTags.value)

// 并发拉取分类与标签云（用于侧栏勾选列表与胶囊命名）
const fetchMeta = async () => {
  const [cRes, tRes] = await Promise.all([getAllCategories(), getTagCloud()])
  if (cRes.data.code === 0 && cRes.data.data) {
    categories.value = cRes.data.data as API.BlogCategoryVO[]
  }
  if (tRes.data.code === 0 && tRes.data.data) {
    tags.value = tRes.data.data
  }
}

// 拉取文章：服务端模式按单条件查询；客户端模式需要拉更多数据（pageSize 100）再本地过滤
const fetchPosts = async () => {
  loading.value = true
  try {
    const srv = resolveServerFilter(selectedCats.value, selectedTags.value)
    const pageSize = srv.mode === 'client' ? 100 : 0
    const res = await queryBlogPostPage({
      pageNum: 1,
      pageSize,
      status: 1,
      categoryId: srv.categoryId,
      tagId: srv.tagId,
      sortOrder: 'descend',
    })
    if (res.data.code === 0 && res.data.data) {
      rawPosts.value = res.data.data.records || []
    } else {
      message.error('获取筛选结果失败：' + (res.data.message || '未知错误'))
    }
  } catch (e) {
    console.error(e)
    message.error('获取筛选结果失败')
  } finally {
    loading.value = false
  }
}

// 点赞成功后本地 +1；若后端提示"已关闭"，则同步关闭本页点赞能力
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
  } catch {
    message.error('点赞失败')
  }
}

onMounted(async () => {
  blogUx.value = await loadBlogSettings()
  // 直接访问 /blog/filter 且无任何条件时，重定向回列表页
  syncFromRoute()
  if (selectedCats.value.length === 0 && selectedTags.value.length === 0) {
    await router.replace('/blog')
    return
  }
  await fetchMeta()
  await fetchPosts()
})

// 监听 URL 变化（侧栏勾选/后退/分享链接都会触发），重新同步条件并拉数据
watch(
  () => [route.query.cats, route.query.tags] as const,
  async () => {
    syncFromRoute()
    if (selectedCats.value.length === 0 && selectedTags.value.length === 0) {
      await router.replace('/blog')
      return
    }
    await fetchPosts()
  },
)
</script>

<template>
  <BlogRoomShell>
    <div class="sub-shell">
      <!-- 左侧栏：分类/标签多选勾选列表，选中态由 URL 派生 -->
      <aside class="detail-rail">
        <button type="button" class="back-chip" @click="clearAll">← 全部随笔</button>
        <div class="side-card glass">
          <span class="tape" />
          <h3 class="font-display">筛选说明</h3>
          <p class="about-text text-pretty">
            分类与标签在同一页勾选。类内匹配任一，类与签之间取交集；全部取消后回到列表首页。
          </p>
        </div>
        <div class="side-card glass">
          <h3 class="font-display">分类</h3>
          <p class="filter-hint">可多选 · 匹配任一</p>
          <div class="cat-list">
            <label
              v-for="cat in categories"
              :key="cat.id"
              class="cat-item"
              :class="{ on: isCatOn(cat.id) }"
              @click.prevent="toggleCat(cat.id)"
            >
              <input type="checkbox" :checked="isCatOn(cat.id)" tabindex="-1" />
              <span class="chk" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="lab">{{ cat.name }}</span>
              <span v-if="cat.postCount != null" class="n">{{ cat.postCount }}</span>
            </label>
          </div>
        </div>
        <div class="side-card glass" style="flex: 1; min-height: 0; overflow: auto">
          <h3 class="font-display">标签</h3>
          <p class="filter-hint">可多选 · 与分类同时生效</p>
          <div class="tag-cloud">
            <label
              v-for="tag in tags"
              :key="tag.id"
              class="tag-pill check"
              :class="{ on: isTagOn(tag.id) }"
              @click.prevent="toggleTag(tag.id)"
            >
              <input type="checkbox" :checked="isTagOn(tag.id)" tabindex="-1" />
              <span class="chk" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>#{{ tag.name }}</span>
            </label>
          </div>
        </div>
      </aside>

      <div class="sub-main">
        <div class="sub-hero glass">
          <div style="min-width: 0; flex: 1">
            <div class="eyebrow">FILTER</div>
            <h1 class="font-display">筛选结果</h1>
            <div class="count">共 {{ displayPosts.length }} 篇</div>
            <BlogFilterChips :chips="chips" @remove="removeChip" />
          </div>
          <button type="button" class="chip-btn" style="flex: none; margin-top: 4px" @click="clearAll">
            清空回列表
          </button>
        </div>
        <!-- 结果区：卡片网格；加载完且无匹配时展示空状态 -->
        <div class="sub-grid">
          <BlogPostCard
            v-for="post in displayPosts"
            :key="post.id"
            :post="post"
            :featured="false"
            :allow-like="blogUx.allowLike"
            :show-view-count="blogUx.viewCountEnabled"
            @open="goPost"
            @like="handleLike"
            @tag="goCardTag"
            @category="goCardCat"
          />
          <div v-if="!loading && displayPosts.length === 0" class="empty-state show">
            <div class="t font-display">没有匹配的随笔</div>
            <button type="button" class="chip-btn" style="margin-top: 10px" @click="clearAll">
              清空回列表
            </button>
          </div>
        </div>
      </div>

      <aside class="sub-deck-stack">
        <div class="side-card glass">
          <h3 class="font-display">当前</h3>
          <div class="stat-grid">
            <div class="stat-cell">
              <div class="n font-display">{{ displayPosts.length }}</div>
              <div class="l">篇数</div>
            </div>
            <div class="stat-cell">
              <div class="n font-display">{{ selectedCount }}</div>
              <div class="l">已选</div>
            </div>
          </div>
        </div>
        <div class="deck">
          <div class="mag-stack" style="min-height: 0; flex: 1">
            <div class="mag-stage" style="left: 12px; right: 12px; top: 8px; bottom: 8px">
              <div class="mag-book t-violet is-front" style="cursor: default">
                <span class="mast">MIX</span>
                <span class="vol font-display" style="font-size: 36px">筛</span>
                <span class="latest"><b>当前条件</b><span>{{ filterBadge }}</span></span>
              </div>
            </div>
          </div>
          <div class="deck-foot" style="margin-top: auto" role="button" tabindex="0" @click="clearAll">
            <div>
              <div class="k">清空条件</div>
              <div class="v font-display" style="font-size: 16px">回列表首页</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </BlogRoomShell>
</template>
