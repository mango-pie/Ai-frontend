<script setup lang="ts">
/**
 * 博客文章卡片（杂志风）
 * 博客房间内的单篇文章展示单元：封面、分类、标题、摘要、标签与浏览/点赞数据。
 * 卡片自身不持有业务状态，打开文章、点赞、标签/分类筛选均以事件上抛给父级页面处理。
 */
const props = withDefaults(
  defineProps<{
    post: API.BlogPostVO
    featured?: boolean
    allowLike?: boolean
    showViewCount?: boolean
  }>(),
  { featured: false, allowLike: true, showViewCount: true },
)

const emit = defineEmits<{
  open: [id: number]
  like: [post: API.BlogPostVO]
  tag: [id: number]
  category: [id: number]
}>()

// 按文章 id 稳定映射到 c1~c3 预设封面底色，保证同一篇文章每次渲染配色一致
const coverClass = (id?: number) => {
  const n = ((id || 1) - 1) % 3
  return `c${n + 1}`
}

// 日期压缩为 MM-DD 短格式；解析失败时返回空串，避免卡片上出现 Invalid Date
const shortDate = (raw?: string) => {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 浏览量过千缩写为 x.xk，控制卡片底部统计区的宽度
const formatViews = (n?: number) => {
  if (!n) return '0'
  return n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// 点击卡片任意区域即请求打开文章详情
const onOpen = () => {
  if (props.post.id) emit('open', props.post.id)
}

// 点赞：阻止冒泡，避免误触卡片整体的“打开文章”
const onLike = (e: Event) => {
  e.stopPropagation()
  emit('like', props.post)
}

// 点击标签：阻止冒泡，上抛标签筛选事件
const onTag = (e: Event, id?: number) => {
  e.stopPropagation()
  if (id) emit('tag', id)
}

// 点击分类：阻止冒泡，上抛分类筛选事件
const onCategory = (e: Event) => {
  e.stopPropagation()
  if (props.post.categoryId) emit('category', props.post.categoryId)
}
</script>

<template>
  <article
    class="post-card"
    :class="{ featured: props.featured }"
    :data-id="props.post.id"
    @click="onOpen"
  >
    <!-- 封面区：无真实封面时按 id 落到预设底色并显示 16:9 占位；精选卡片叠加刊头角标 -->
    <div class="cover" :class="[coverClass(props.post.id), { 'has-img': !!props.post.coverUrl }]">
      <img v-if="props.post.coverUrl" :src="props.post.coverUrl" :alt="props.post.title || ''" />
      <span v-if="props.featured" class="masthead">JOURNAL</span>
      <span v-if="!props.post.coverUrl" class="ratio">16:9</span>
    </div>
    <div class="body">
      <!-- 元信息行：分类按钮可点击触发筛选，无分类 id 时降级为纯文本 -->
      <div class="meta">
        <button
          v-if="props.post.categoryId"
          type="button"
          class="meta-cat"
          @click="onCategory"
        >
          {{ props.post.categoryName || '随笔' }}
        </button>
        <span v-else>{{ props.post.categoryName || '随笔' }}</span>
        <span>{{ shortDate(props.post.createdTime) }}</span>
      </div>
      <div class="title font-display">{{ props.post.title || '无标题' }}</div>
      <p class="summary text-pretty">{{ props.post.summary || '' }}</p>
      <div class="foot">
        <!-- 标签数量随卡片形态收紧（精选 2 个 / 普通 1 个），避免撑高卡片 -->
        <div class="tags">
          <button
            v-for="t in (props.post.tags || []).slice(0, props.featured ? 2 : 1)"
            :key="t.id"
            type="button"
            @click="onTag($event, t.id)"
          >
            #{{ t.name }}
          </button>
        </div>
        <!-- 浏览量与点赞的迷你统计 -->
        <div class="stats">
          <span v-if="props.showViewCount" style="display: inline-flex; align-items: center; gap: 3px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {{ formatViews(props.post.viewCount) }}
          </span>
          <button
            v-if="props.allowLike"
            type="button"
            class="like-mini"
            @click="onLike"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                d="M12 21s-7.2-4.6-9.5-8.2C.7 9.8 2.2 6 5.6 6c1.9 0 3.2 1.1 4 2.2C10.4 7.1 11.7 6 13.6 6c3.4 0 4.9 3.8 3.1 6.8C19.2 16.4 12 21 12 21z"
              />
            </svg>
            {{ props.post.likeCount || 0 }}
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
