<script setup lang="ts">
/**
 * 博客管理页（管理员） - 路径：/admin/blogManage
 * 表格展示所有博客文章，支持分页、搜索、编辑、删除、状态管理、置顶管理
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { queryBlogPostPage, deleteBlogPost, updateBlogPostStatus, toggleTopStatus } from '@/api/blogPostController'
import AdminIdCell from '@/components/admin/AdminIdCell.vue'
import { getAllCategories } from '@/api/blogCategoryController'
import '@/assets/admin-theme.css'
import { PenTool } from 'lucide-vue-next'

const router = useRouter()
// 表格数据源与分页状态
const dataSource = ref<API.BlogPostVO[]>([])
const total = ref(0)
const loading = ref(false)

// 列表查询条件：标题模糊搜索 + 分类 + 发布状态
const searchParams = reactive<API.BlogPostQueryRequest>({
  pageNum: 1,
  pageSize: 10,
  title: '',
  status: undefined,
  categoryId: undefined,
})

// 分类下拉选项，页面挂载时一次性加载
const categoryOptions = ref<API.BlogCategoryVO[]>([])

function formatTime(str: string | undefined): string {
  if (!str) return '-'
  try {
    return new Date(str).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return str
  }
}

// 文章状态枚举 → 标签文案与颜色（0 草稿 / 1 已发布 / 2 已下线）
const statusMap: Record<number, { text: string; color: string }> = {
  0: { text: '草稿', color: 'default' },
  1: { text: '已发布', color: 'success' },
  2: { text: '已下线', color: 'error' },
}

const columns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '标题', dataIndex: 'title', width: 200, ellipsis: true },
  { title: '作者', dataIndex: 'userName', width: 100 },
  { title: '分类', dataIndex: 'categoryName', width: 100 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '置顶', dataIndex: 'isTop', width: 80 },
  { title: '浏览', dataIndex: 'viewCount', width: 80 },
  { title: '点赞', dataIndex: 'likeCount', width: 80 },
  { title: '创建时间', dataIndex: 'createdTime', width: 160 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' },
]

/** 拉取文章分页列表 */
const fetchData = async () => {
  loading.value = true
  try {
    const res = await queryBlogPostPage({ ...searchParams })
    if (res.data.code === 0 && res.data.data) {
      dataSource.value = res.data.data.records ?? []
      total.value = res.data.data.totalRow ?? 0
    } else {
      message.error('获取数据失败，' + res.data.message)
    }
  } finally {
    loading.value = false
  }
}

/** 加载分类下拉选项（失败仅打日志，不阻塞列表） */
const fetchCategories = async () => {
  try {
    const res = await getAllCategories()
    if (res.data.code === 0 && res.data.data) {
      categoryOptions.value = res.data.data
    }
  } catch (error) {
    console.error('获取分类失败', error)
  }
}

const doSearch = () => {
  searchParams.pageNum = 1
  fetchData()
}

const doReset = () => {
  searchParams.title = ''
  searchParams.status = undefined
  searchParams.categoryId = undefined
  searchParams.pageNum = 1
  fetchData()
}

const onTableChange = (pag: { current?: number; pageSize?: number }) => {
  if (pag.current != null) searchParams.pageNum = pag.current
  if (pag.pageSize != null) searchParams.pageSize = pag.pageSize
  fetchData()
}

const doDelete = (id: number) => {
  Modal.confirm({
    title: '确认删除该文章吗？',
    content: '若由精读发布，精读侧会断开关联，笔记与领域树挂载保留。',
    okText: '确认',
    okType: 'danger',
    onOk: async () => {
      const res = await deleteBlogPost({ id })
      if (res.data.code === 0) {
        message.success('删除成功')
        fetchData()
      } else {
        message.error('删除失败，' + res.data.message)
      }
    },
  })
}

const doEdit = (id: number) => {
  router.push({ path: `/blog/edit/${id}` })
}

/** 发布/下线切换：已发布的置为下线，其余置为发布 */
const doToggleStatus = (record: API.BlogPostVO) => {
  const newStatus = record.status === 1 ? 2 : 1
  const action = newStatus === 1 ? '发布' : '下线'
  Modal.confirm({
    title: `确认${action}该文章吗？`,
    okText: '确认',
    onOk: async () => {
      const res = await updateBlogPostStatus({ id: record.id!, status: newStatus })
      if (res.data.code === 0) {
        message.success(`${action}成功`)
        fetchData()
      } else {
        message.error(`${action}失败，` + res.data.message)
      }
    },
  })
}

/** 置顶/取消置顶切换 */
const doToggleTop = (record: API.BlogPostVO) => {
  const newTopStatus = record.isTop === 1 ? 0 : 1
  const action = newTopStatus === 1 ? '置顶' : '取消置顶'
  Modal.confirm({
    title: `确认${action}该文章吗？`,
    okText: '确认',
    onOk: async () => {
      const res = await toggleTopStatus({ id: record.id!, isTop: newTopStatus })
      if (res.data.code === 0) {
        message.success(`${action}成功`)
        fetchData()
      } else {
        message.error(`${action}失败，` + res.data.message)
      }
    },
  })
}

onMounted(() => {
  fetchData()
  fetchCategories()
})
</script>

<template>
  <AdminRoomShell note-label="Station · 博客管理">
  <div class="blog-manager-page admin-theme-page">
    <!-- 页面头部 -->
    <div class="admin-page-hero">
      <div class="hero-left">
        <div class="hero-title"><PenTool :size="22" /> 博客管理</div>
        <div class="hero-subtitle">共 {{ total }} 篇文章 · 管理平台所有博客内容</div>
      </div>
      <div class="hero-extra">
        <a-button type="primary" ghost @click="router.push('/blog/edit/0')">
          ＋ 写文章
        </a-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="admin-filter-bar">
      <a-input
        v-model:value="searchParams.title"
        allow-clear
        placeholder="搜索文章标题…"
        style="width: 200px"
        @pressEnter="doSearch"
      />
      <a-select
        v-model:value="searchParams.categoryId"
        placeholder="选择分类"
        allow-clear
        style="width: 140px"
      >
        <a-select-option v-for="cat in categoryOptions" :key="cat.id" :value="cat.id">
          {{ cat.name }}
        </a-select-option>
      </a-select>
      <a-select
        v-model:value="searchParams.status"
        placeholder="发布状态"
        allow-clear
        style="width: 120px"
      >
        <a-select-option :value="0">草稿</a-select-option>
        <a-select-option :value="1">已发布</a-select-option>
        <a-select-option :value="2">已下线</a-select-option>
      </a-select>
      <a-button type="primary" @click="doSearch">搜索</a-button>
      <a-button @click="doReset">重置</a-button>
    </div>

    <!-- 数据表格 -->
    <a-card :bordered="false">
      <a-table
        :data-source="dataSource"
        :columns="columns"
        :loading="loading"
        :pagination="{
          current: searchParams.pageNum,
          pageSize: searchParams.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }"
        :scroll="{ x: 1200 }"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'id'">
            <AdminIdCell :id="record.id" />
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <a-tag :color="statusMap[record.status ?? 0]?.color">
              {{ statusMap[record.status ?? 0]?.text ?? '-' }}
            </a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'isTop'">
            <a-tag v-if="record.isTop === 1" color="gold">置顶</a-tag>
            <span v-else style="color: var(--color-text-muted)">-</span>
          </template>
          <template v-else-if="column.dataIndex === 'viewCount'">
            {{ record.viewCount ?? 0 }}
          </template>
          <template v-else-if="column.dataIndex === 'likeCount'">
            {{ record.likeCount ?? 0 }}
          </template>
          <template v-else-if="column.dataIndex === 'createdTime'">
            {{ formatTime(record.createdTime) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="doEdit(record.id!)">编辑</a-button>
              <a-button type="link" size="small" @click="doToggleStatus(record)">
                {{ record.status === 1 ? '下线' : '发布' }}
              </a-button>
              <a-dropdown :trigger="['click']" placement="bottomRight">
                <button class="admin-action-trigger" title="更多操作">···</button>
                <template #overlay>
                  <a-menu @click="({ key }: { key: string }) => {
                    if (key === 'toggleTop') doToggleTop(record)
                    else if (key === 'delete') doDelete(record.id!)
                  }">
                    <a-menu-item key="toggleTop">
                      {{ record.isTop === 1 ? '取消置顶' : '置顶' }}
                    </a-menu-item>
                    <a-menu-divider />
                    <a-menu-item key="delete" danger>
                      <span style="color: var(--color-error)">删除</span>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
        <template #emptyText>
          <a-empty description="暂无文章数据" />
        </template>
      </a-table>
    </a-card>
  </div>
  </AdminRoomShell>
</template>

<style scoped>
/* admin-theme.css handles all theming */
</style>
