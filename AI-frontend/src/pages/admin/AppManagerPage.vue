<script setup lang="ts">
/**
 * 应用管理页（管理员） - 路径：/admin/appManage
 * 表格展示所有应用，支持分页、搜索、编辑（新开页面）、删除、精选
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { listAppByPageForAdmin, deleteAppByAdmin, updateAppByAdmin } from '@/api/appController.ts'
import AdminIdCell from '@/components/admin/AdminIdCell.vue'
import '@/assets/admin-theme.css'
import { AppWindowMac } from 'lucide-vue-next'

const router = useRouter()
// 表格数据源与分页状态
const dataSource = ref<API.AppVO[]>([])
const total = ref(0)
const loading = ref(false)

// 列表查询条件（应用名模糊搜索 + 类型筛选），随表格分页联动
const searchParams = reactive<API.AppQueryRequest>({
  pageNum: 1,
  pageSize: 10,
  appName: '',
  codeGenType: undefined,
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
  { title: '应用名称', dataIndex: 'appName', width: 160, ellipsis: true },
  { title: '封面', dataIndex: 'cover', width: 80 },
  { title: '类型', dataIndex: 'codeGenType', width: 100 },
  { title: '优先级', dataIndex: 'priority', width: 80 },
  { title: '创建者', dataIndex: 'userId', width: 80 },
  { title: '创建时间', dataIndex: 'createTime', width: 160 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' },
]

/** 拉取应用分页列表 */
const fetchData = async () => {
  loading.value = true
  try {
    const res = await listAppByPageForAdmin({ ...searchParams })
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

/** 搜索前重置到第一页，避免停留在超出结果范围的页码 */
const doSearch = () => {
  searchParams.pageNum = 1
  fetchData()
}

/** 清空筛选条件并回到第一页重新加载 */
const doReset = () => {
  searchParams.appName = ''
  searchParams.codeGenType = undefined
  searchParams.pageNum = 1
  fetchData()
}

/** 分页页码或每页条数变化后重新请求 */
const onTableChange = (pag: { current?: number; pageSize?: number }) => {
  if (pag.current != null) searchParams.pageNum = pag.current
  if (pag.pageSize != null) searchParams.pageSize = pag.pageSize
  fetchData()
}

/** 删除应用：二次确认后调用管理端删除接口并刷新列表 */
const doDelete = (id: number) => {
  Modal.confirm({
    title: '确认删除该应用吗？',
    okText: '确认',
    okType: 'danger',
    onOk: async () => {
      const res = await deleteAppByAdmin({ id })
      if (res.data.code === 0) {
        message.success('删除成功')
        fetchData()
      } else {
        message.error('删除失败，' + res.data.message)
      }
    },
  })
}

/** 设为精选：将优先级更新为 99 */
const doFeatured = (record: API.AppVO) => {
  Modal.confirm({
    title: `将「${record.appName}」设为精选？`,
    content: '将优先级设置为 99',
    okText: '确认',
    onOk: async () => {
      const res = await updateAppByAdmin({ id: record.id, priority: 99 })
      if (res.data.code === 0) {
        message.success('已设为精选')
        fetchData()
      } else {
        message.error('操作失败，' + res.data.message)
      }
    },
  })
}

/** 应用类型中文标签与颜色映射 */
const codeGenTypeMap: Record<string, { label: string; color: string }> = {
  chat: { label: '对话', color: 'purple' },
  multi_file: { label: '多文件', color: 'cyan' },
  html: { label: 'HTML', color: 'green' },
}
</script>

<template>
  <AdminRoomShell note-label="Station · 应用管理">
  <div class="app-manager-page admin-theme-page">
    <!-- 页面头部 -->
    <div class="admin-page-hero">
      <div class="hero-left">
        <div class="hero-title"><AppWindowMac :size="22" /> 应用管理</div>
        <div class="hero-subtitle">管理平台所有 AI 应用</div>
      </div>
      <div class="hero-extra admin-hero-stats">
        <div class="stat"><b>{{ total }}</b><span>上架应用</span></div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="admin-filter-bar">
      <a-input
        v-model:value="searchParams.appName"
        allow-clear
        placeholder="搜索应用名称…"
        style="width: 200px"
        @pressEnter="doSearch"
      />
      <a-select
        v-model:value="searchParams.codeGenType"
        placeholder="选择类型"
        allow-clear
        style="width: 150px"
      >
        <a-select-option value="chat">chat（对话）</a-select-option>
        <a-select-option value="multi_file">multi_file</a-select-option>
        <a-select-option value="html">html</a-select-option>
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
        :scroll="{ x: 900 }"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'id'">
            <AdminIdCell :id="record.id" />
          </template>
          <template v-else-if="column.dataIndex === 'userId'">
            <AdminIdCell :id="record.userId" />
          </template>
          <template v-else-if="column.dataIndex === 'cover'">
            <a-avatar v-if="record.cover" :src="record.cover" shape="square" :size="48" />
            <span v-else class="admin-avatar-fallback">
              {{ (record.appName || '?').slice(0, 1) }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'codeGenType'">
            <a-tag :color="codeGenTypeMap[record.codeGenType ?? '']?.color || 'default'">
              {{ codeGenTypeMap[record.codeGenType ?? '']?.label || (record.codeGenType ?? '-') }}
            </a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'priority'">
            <a-tag v-if="record.priority >= 99" color="gold">精选</a-tag>
            <span v-else>{{ record.priority ?? 0 }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'createTime'">
            {{ formatTime(record.createTime) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button
                type="link"
                size="small"
                @click="router.push({ path: `/app/edit/${record.id}`, query: { from: 'admin' } })"
              >
                编辑
              </a-button>
              <a-dropdown :trigger="['click']" placement="bottomRight">
                <button class="admin-action-trigger" title="更多操作">···</button>
                <template #overlay>
                  <a-menu @click="({ key }: { key: string }) => {
                    if (key === 'featured') doFeatured(record)
                    else if (key === 'delete') doDelete(record.id)
                  }">
                    <a-menu-item key="featured">设为精选</a-menu-item>
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
          <a-empty description="暂无应用数据" />
        </template>
      </a-table>
    </a-card>
  </div>
  </AdminRoomShell>
</template>

<style scoped>
/* admin-theme.css handles all theming */
</style>
