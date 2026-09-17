<script setup lang="ts">
/**
 * 对话管理页（管理员） - 路径：/admin/chatHistoryManage
 * 表格展示所有对话历史，支持分页、搜索、删除
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { listChatHistoryByPageForAdmin, deleteByAppId } from '@/api/chatHistoryController.ts'
import AdminIdCell from '@/components/admin/AdminIdCell.vue'
import '@/assets/admin-theme.css'
import { MessagesSquare } from 'lucide-vue-next'

const router = useRouter()
// 表格数据源与分页状态
const dataSource = ref<API.ChatHistoryVO[]>([])
const total = ref(0)
const loading = ref(false)

// 查询条件：按应用/用户/消息类型/消息内容多维度筛选对话记录
const searchParams = reactive<API.ChatHistoryQueryRequest>({
  pageNum: 1,
  pageSize: 10,
  message: '',
  messageType: undefined,
  appId: undefined,
  userId: undefined,
})

/** 格式化时间为本地字符串 */
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

const columns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '应用 ID', dataIndex: 'appId', width: 120 },
  { title: '用户 ID', dataIndex: 'userId', width: 100 },
  { title: '消息类型', dataIndex: 'messageType', width: 100 },
  { title: '消息内容', dataIndex: 'message', width: 400, ellipsis: true },
  { title: '创建时间', dataIndex: 'createTime', width: 160 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
]

/** 拉取对话分页列表 */
const fetchData = async () => {
  loading.value = true
  try {
    const res = await listChatHistoryByPageForAdmin({
      chatHistoryQueryRequest: { ...searchParams }
    })
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

const doSearch = () => {
  searchParams.pageNum = 1
  fetchData()
}

const doReset = () => {
  searchParams.appId = undefined
  searchParams.userId = undefined
  searchParams.messageType = undefined
  searchParams.message = ''
  searchParams.pageNum = 1
  fetchData()
}

/** 分页页码或每页条数变化后重新请求 */
const onTableChange = (pag: { current?: number; pageSize?: number }) => {
  if (pag.current != null) searchParams.pageNum = pag.current
  if (pag.pageSize != null) searchParams.pageSize = pag.pageSize
  fetchData()
}

/** 清空指定应用的全部对话记录（二次确认） */
const doDeleteByAppId = (appId: number) => {
  Modal.confirm({
    title: `确认删除应用 ${appId} 的所有对话记录吗？`,
    okText: '确认',
    okType: 'danger',
    onOk: async () => {
      const res = await deleteByAppId({ appId })
      if (res.data.code === 0) {
        message.success('删除成功')
        fetchData()
      } else {
        message.error('删除失败，' + res.data.message)
      }
    },
  })
}

onMounted(fetchData)
</script>

<template>
  <AdminRoomShell note-label="Station · 对话管理">
  <div class="chat-history-manager-page admin-theme-page">
    <!-- 页面头部 -->
    <div class="admin-page-hero">
      <div class="hero-left">
        <div class="hero-title"><MessagesSquare :size="22" /> 对话管理</div>
        <div class="hero-subtitle">管理平台所有 AI 对话历史</div>
      </div>
      <div class="hero-extra admin-hero-stats">
        <div class="stat"><b>{{ total }}</b><span>对话记录</span></div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="admin-filter-bar">
      <a-input
        v-model:value="searchParams.appId"
        allow-clear
        placeholder="应用 ID…"
        style="width: 150px"
        @pressEnter="doSearch"
      />
      <a-input
        v-model:value="searchParams.userId"
        allow-clear
        placeholder="用户 ID…"
        style="width: 150px"
        @pressEnter="doSearch"
      />
      <a-select
        v-model:value="searchParams.messageType"
        placeholder="消息类型"
        allow-clear
        style="width: 130px"
      >
        <a-select-option value="user">user</a-select-option>
        <a-select-option value="ai">ai</a-select-option>
      </a-select>
      <a-input
        v-model:value="searchParams.message"
        allow-clear
        placeholder="搜索消息内容…"
        style="width: 200px"
        @pressEnter="doSearch"
      />
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
        :scroll="{ x: 1000 }"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'id'">
            <AdminIdCell :id="record.id" />
          </template>
          <template v-else-if="column.dataIndex === 'appId'">
            <AdminIdCell :id="record.appId" />
          </template>
          <template v-else-if="column.dataIndex === 'userId'">
            <AdminIdCell :id="record.userId" />
          </template>
          <template v-else-if="column.dataIndex === 'messageType'">
            <a-tag :color="record.messageType === 'user' ? 'blue' : 'green'">
              {{ record.messageType ?? '-' }}
            </a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'createTime'">
            {{ formatTime(record.createTime) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button size="small" @click="doDeleteByAppId(Number(record.appId ?? 0))">
              清空对话
            </a-button>
          </template>
        </template>
        <template #emptyText>
          <a-empty description="暂无对话数据" />
        </template>
      </a-table>
    </a-card>
  </div>
  </AdminRoomShell>
</template>

<style scoped>
/* admin-theme.css handles all theming */
</style>
