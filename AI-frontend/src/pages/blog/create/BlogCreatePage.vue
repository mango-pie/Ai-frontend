<script setup lang="ts">
/**
 * 博客发布/编辑页
 * 职责：新建与编辑文章共用一页 —— 有路由参数 id 即为编辑模式。
 * 布局：左侧写作提示栏 + 中间正文表单 + 右侧元数据（封面/分类/标签）。
 * 支持存草稿与发布两种提交状态，保存后按 from 参数或文章详情页跳回。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  addBlogPost,
  updateBlogPost,
  getBlogPostVo,
} from '@/api/blogPostController'
import { uploadCommonImage } from '@/api/imageUploadController'
import { getAllCategories } from '@/api/blogCategoryController'
import { getAllTags } from '@/api/blogTagController'
import { useLoginUserStore } from '@/stores/loginUser'
import { resolveBlogReturnPath } from '@/composables/useBlogLastPost'
import { loadBlogSettings, type BlogUxSettings } from '@/utils/blogSettings'
import BlogRoomShell from '@/components/blog/BlogRoomShell.vue'

const router = useRouter()
const route = useRoute()
const loginUserStore = useLoginUserStore()

// 编辑模式判定：路由带 id 即编辑已有文章
const isEdit = computed(() => !!route.params.id)
const loading = ref(false)
const submitting = ref(false)
const uploading = ref(false)

// 博客 UX 站点配置（摘要字数上限、默认状态等），挂载时从后端加载
const blogUx = ref<BlogUxSettings>({
  pageSizeDefault: 10,
  summaryMaxLength: 200,
  allowLike: true,
  viewCountEnabled: true,
  defaultStatus: 0,
  defaultStatusKey: 'DRAFT',
})

// 文章状态常量：0 草稿 / 1 已发布
const STATUS_DRAFT = 0
const STATUS_PUBLISHED = 1

// 表单模型：新建与编辑共用，编辑时由 fetchPostDetail 回填
const form = reactive({
  id: null as number | null,
  title: '',
  summary: '',
  content: '',
  categoryId: null as number | null,
  tagIds: [] as number[],
  coverUrl: '',
  status: STATUS_DRAFT as number,
})

// 表单回显：区分"草稿预览 / 将发布"与"草稿 / 已发布"等场景文案
const isDraft = computed(() => form.status !== STATUS_PUBLISHED)
const pageTitle = computed(() => {
  if (!isEdit.value) return '写文章'
  return isDraft.value ? '编辑草稿' : '编辑文章'
})

const statusLabel = computed(() => {
  if (!isEdit.value) return form.status === STATUS_PUBLISHED ? '将发布' : '草稿预览'
  return isDraft.value ? '草稿' : '已发布'
})

// 分类/标签候选项，挂载时一次性拉取
const categoryOptions = ref<API.BlogCategoryVO[]>([])
const tagOptions = ref<API.BlogTagVO[]>([])
// 隐藏的文件输入框引用，由"封面卡片"点击触发
const coverInput = ref<HTMLInputElement | null>(null)

const openCoverPicker = () => coverInput.value?.click()

// 上传前校验：仅允许图片类型且不超过 5MB
const beforeUpload = (file: File) => {
  if (!file.type.startsWith('image/')) {
    message.error('只能上传图片文件!')
    return false
  }
  if (file.size / 1024 / 1024 >= 5) {
    message.error('图片大小不能超过 5MB!')
    return false
  }
  return true
}

// 上传封面图片，成功后把返回的 url 写入表单
const handleImageUpload = async (file: File) => {
  if (!beforeUpload(file)) return
  uploading.value = true
  try {
    const res = await uploadCommonImage(file)
    if (res.data.code === 0 && res.data.data) {
      const uploadData = res.data.data as { url?: string } | string
      form.coverUrl = typeof uploadData === 'string' ? uploadData : uploadData?.url || ''
      message.success('图片上传成功')
    } else {
      message.error('图片上传失败：' + (res.data.message || '未知错误'))
    }
  } catch (error) {
    console.error('图片上传失败:', error)
    message.error('图片上传失败')
  } finally {
    uploading.value = false
  }
}

const onCoverPick = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleImageUpload(file)
  input.value = ''
}

const handleRemoveCover = () => {
  form.coverUrl = ''
}

// 标签多选切换：已在选区则移除，不在则加入
const handleTagToggle = (tagId: number) => {
  const i = form.tagIds.indexOf(tagId)
  if (i === -1) form.tagIds.push(tagId)
  else form.tagIds.splice(i, 1)
}

// 提交前校验：标题/摘要/正文/分类均为必填
const validateForm = () => {
  if (!form.title.trim()) {
    message.warning('请输入文章标题')
    return false
  }
  if (!form.summary.trim()) {
    message.warning('请输入文章摘要')
    return false
  }
  if (!form.content.trim()) {
    message.warning('请输入文章内容')
    return false
  }
  if (!form.categoryId) {
    message.warning('请选择文章分类')
    return false
  }
  return true
}

// 提交：按是否编辑模式调用更新/新增接口；成功后依据来源页优先跳回
const handleSubmit = async (nextStatus: number) => {
  if (!validateForm()) return
  submitting.value = true
  try {
    const payload = {
      title: form.title,
      summary: form.summary,
      content: form.content,
      categoryId: form.categoryId ?? undefined,
      tagIds: form.tagIds,
      coverUrl: form.coverUrl,
      status: nextStatus,
    }
    const res =
      isEdit.value && form.id
        ? await updateBlogPost({ id: form.id, ...payload })
        : await addBlogPost(payload)

    if (res.data.code === 0) {
      form.status = nextStatus
      const asDraft = nextStatus === STATUS_DRAFT
      message.success(
        asDraft
          ? isEdit.value
            ? '草稿已保存'
            : '草稿已创建'
          : isEdit.value
            ? '文章已发布'
            : '文章发布成功',
      )
      const returnPath = resolveBlogReturnPath(
        route.query.from,
        isEdit.value && form.id ? `/blog/${form.id}` : null,
      )
      if (returnPath) router.push(returnPath)
      else if (isEdit.value && form.id) router.push(`/blog/${form.id}`)
      else if (res.data.data) router.push(`/blog/${res.data.data}`)
      else router.push('/blog')
    } else {
      message.error('操作失败：' + res.data.message)
    }
  } catch (error) {
    console.error('提交失败:', error)
    message.error('操作失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

// 重置：编辑模式重新拉取详情还原；新建模式清空表单并恢复默认状态
const handleReset = () => {
  if (isEdit.value) fetchPostDetail()
  else {
    form.title = ''
    form.summary = ''
    form.content = ''
    form.categoryId = null
    form.tagIds = []
    form.coverUrl = ''
    form.status = blogUx.value.defaultStatus
  }
}

// 返回：优先回到来源页（from 参数），否则回博客列表
const handleBack = () => {
  const returnPath = resolveBlogReturnPath(
    route.query.from,
    isEdit.value && form.id ? `/blog/${form.id}` : null,
  )
  if (returnPath) {
    router.push(returnPath)
    return
  }
  router.push('/blog')
}

// 编辑模式：拉取文章详情并回填表单（含分类 id、标签 id 列表）
const fetchPostDetail = async () => {
  if (!route.params.id) return
  loading.value = true
  try {
    const res = await getBlogPostVo({ id: Number(route.params.id) })
    if (res.data.code === 0 && res.data.data) {
      const post = res.data.data
      form.id = post.id || null
      form.title = post.title || ''
      form.summary = post.summary || ''
      form.content = post.content || ''
      form.categoryId = post.categoryId || null
      form.tagIds = (post.tags || []).map((tag) => tag.id!).filter(Boolean) as number[]
      form.coverUrl = post.coverUrl || ''
      form.status = post.status ?? STATUS_DRAFT
    } else {
      message.error('获取文章详情失败：' + res.data.message)
      router.push('/blog')
    }
  } catch (error) {
    console.error('获取文章详情失败:', error)
    message.error('获取文章详情失败')
    router.push('/blog')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 写作需登录：未登录直接带回跳地址去登录页
  if (!loginUserStore.loginUser?.id) {
    message.warning('请先登录')
    router.push(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`)
    return
  }

  // 先加载站点配置（决定默认状态等），再并发拉取分类与标签候选
  blogUx.value = await loadBlogSettings()
  form.status = blogUx.value.defaultStatus

  try {
    const [cRes, tRes] = await Promise.all([getAllCategories(), getAllTags()])
    if (cRes.data.code === 0 && cRes.data.data) {
      categoryOptions.value = cRes.data.data as API.BlogCategoryVO[]
    }
    if (tRes.data.code === 0 && tRes.data.data) {
      tagOptions.value = tRes.data.data as API.BlogTagVO[]
    }
  } catch (e) {
    console.error(e)
  }

  if (isEdit.value) fetchPostDetail()
})
</script>

<template>
  <BlogRoomShell>
    <div class="create-shell">
      <aside class="detail-rail">
        <button type="button" class="back-chip" @click="handleBack">← 返回</button>
        <div class="side-card glass">
          <span class="tape" />
          <h3 class="font-display">写作提示</h3>
          <p class="tip-line text-pretty">
            标题先定方向，摘要留一句钩子，正文用 Markdown。侧栏放元数据，主栏专心写。
          </p>
        </div>
        <div class="side-card glass" style="flex: 1">
          <h3 class="font-display">状态</h3>
          <p class="tip-line">
            当前：{{ statusLabel }}<br />
            {{ loading ? '加载中…' : submitting ? '提交中…' : '就绪' }}
          </p>
        </div>
      </aside>

      <div class="form-panel glass">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px">
          <div>
            <div class="eyebrow">EDITOR</div>
            <div class="font-display" style="font-size: 32px; letter-spacing: 2px">{{ pageTitle }}</div>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="fTitle">标题</label>
          <input id="fTitle" v-model="form.title" class="form-input" maxlength="100" placeholder="给文章起个名字" />
        </div>
        <div class="form-row">
          <label class="form-label" for="fSummary">摘要</label>
          <input
            id="fSummary"
            v-model="form.summary"
            class="form-input"
            :maxlength="blogUx.summaryMaxLength"
            placeholder="一句话介绍"
          />
        </div>
        <div class="form-row">
          <label class="form-label" for="fContent">正文</label>
          <textarea id="fContent" v-model="form.content" class="form-textarea" placeholder="Markdown…" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" :disabled="submitting" @click="handleReset">重置</button>
          <button type="button" class="btn" :disabled="submitting" @click="handleSubmit(STATUS_DRAFT)">
            存草稿
          </button>
          <button
            type="button"
            class="btn primary font-display"
            :disabled="submitting"
            @click="handleSubmit(STATUS_PUBLISHED)"
          >
            发布
          </button>
        </div>
      </div>

      <!-- 右侧元数据栏：封面、分类、标签与发布建议 -->
      <aside class="form-panel glass detail-side">
        <div class="form-row">
          <div class="form-label">封面</div>
          <!-- 封面上传卡片：已有封面显示预览图，否则显示占位提示 -->
          <div
            class="cover-upload"
            role="button"
            tabindex="0"
            @click="openCoverPicker"
            @keydown.enter="openCoverPicker"
          >
            <img v-if="form.coverUrl" :src="form.coverUrl" alt="封面" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px" />
            <template v-else>
              <span>{{ uploading ? '上传中…' : '[image] 16:9' }}</span>
              <span style="font-size: 10px">点击上传</span>
            </template>
          </div>
          <input ref="coverInput" type="file" accept="image/*" hidden @change="onCoverPick" />
          <button
            v-if="form.coverUrl"
            type="button"
            class="chip-btn"
            style="margin-top: 8px"
            @click="handleRemoveCover"
          >
            移除封面
          </button>
        </div>
        <div class="form-row">
          <label class="form-label" for="fCat">分类</label>
          <select
            id="fCat"
            class="form-select"
            :value="form.categoryId ?? ''"
            @change="form.categoryId = Number(($event.target as HTMLSelectElement).value) || null"
          >
            <option value="">选择分类</option>
            <option v-for="cat in categoryOptions" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <!-- 标签多选：点击切换选中态（on 类控制勾选样式） -->
        <div class="form-row">
          <div class="form-label">标签</div>
          <div class="tag-cloud">
            <button
              v-for="tag in tagOptions"
              :key="tag.id"
              type="button"
              class="tag-pill check"
              :class="{ on: form.tagIds.includes(tag.id!) }"
              @click="handleTagToggle(tag.id!)"
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
        <div
          class="side-card"
          style="
            background: rgba(255, 255, 255, 0.55);
            margin-top: 8px;
            padding: 14px;
            border-radius: 14px;
            border: 1.5px dashed rgba(150, 160, 200, 0.35);
          "
        >
          <h3 class="font-display" style="font-size: 14px; margin-bottom: 8px">发布检查</h3>
          <p class="tip-line">封面、分类、至少 1 个标签 —— 建议写完再勾。</p>
        </div>
        <div class="deck" style="flex: 1; min-height: 160px; margin-top: 8px">
          <div class="mag-stack" style="min-height: 0; flex: 1">
            <div class="mag-stage" style="left: 12px; right: 12px; top: 8px; bottom: 8px">
              <div class="mag-book t-sun is-front" style="cursor: default">
                <span class="mast">DRAFT</span>
                <span class="vol font-display" style="font-size: 32px">稿</span>
                <span class="latest"><b>写作区</b><span>元数据在这一侧</span></span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </BlogRoomShell>
</template>
