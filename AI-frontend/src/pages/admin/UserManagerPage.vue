<script setup lang="ts">
/**
 * 用户管理页（管理员） - 路径：/admin/userManage
 * 表格展示用户列表，支持分页、编辑用户信息、删除；头像、角色、创建时间自定义渲染。
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { deleteUser, listUserVoByPage, updateUser } from '@/api/userController.ts'
import { Modal } from 'ant-design-vue'
import '@/assets/admin-theme.css'
import { Users } from 'lucide-vue-next'
import AdminIdCell from '@/components/admin/AdminIdCell.vue'

/** 表格行数据类型，与后端 UserVO 对应 */
type ManagerRow = API.UserVO

/** 角色选项（与后端一致） */
const ROLE_OPTIONS = [
  { label: '普通用户', value: 'user' },
  { label: '管理员', value: 'admin' },
  { label: '管理人', value: 'administrator' },
]

const dataSource = ref<ManagerRow[]>([])
const total = ref(0)
/** 页内管理人数量（hero 迷你统计用，随当前页数据刷新） */
const adminCountOnPage = computed(() =>
  dataSource.value.filter((row) => row.userRole === 'administrator' || row.userRole === 'admin').length,
)
const loading = ref(false)

// 查询条件：按账号/用户名模糊搜索，无其它筛选维度
const searchParams = reactive<API.UserQueryRequest>({
  pageNum: 1,
  pageSize: 10,
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
      second: '2-digit',
    })
  } catch {
    return str
  }
}

const columns = [
  { title: 'ID', dataIndex: 'id', width: 88 },
  { title: '账号', dataIndex: 'userAccount', width: 120, ellipsis: true },
  { title: '用户名', dataIndex: 'userName', width: 120, ellipsis: true },
  { title: '头像', dataIndex: 'userAvatar', width: 100 },
  { title: '简介', dataIndex: 'userProfile', width: 100, ellipsis: true },
  { title: '角色', dataIndex: 'userRole', width: 100 },
  { title: '创建时间', dataIndex: 'createTime', width: 172 },
  { title: '操作', key: 'action', width: 160, fixed: 'right' },
]

/** 拉取用户分页列表 */
const fetchData = async () => {
  loading.value = true
  try {
    const res = await listUserVoByPage({ ...searchParams })
    const page = res.data.data
    if (page) {
      dataSource.value = page.records ?? []
      total.value = page.totalRow ?? 0
    } else {
      message.error('获取数据失败，' + res.data.message)
    }
  } finally {
    loading.value = false
  }
}

/** 分页页码或每页条数变化后重新请求 */
const onTableChange = (pag: { current?: number; pageSize?: number }) => {
  if (pag.current != null) searchParams.pageNum = pag.current
  if (pag.pageSize != null) searchParams.pageSize = pag.pageSize
  fetchData()
}

// 获取数据
const doSearch = () => {
  // 重置页码
  searchParams.pageNum = 1
  fetchData()
}

/** 清空筛选条件并回到第一页 */
const doReset = () => {
  searchParams.userAccount = undefined
  searchParams.userName = undefined
  searchParams.pageNum = 1
  fetchData()
}

onMounted(() => {
  fetchData()
})

// 删除数据
const doDelete = async (id: number) => {
  Modal.confirm({
    title: '确认删除用户吗？',
    okText: '确认',
    okType: 'danger',
    onOk: async () => {
      if (!id) return
      const res = await deleteUser({ id })
      if (res.data.code === 0) {
        message.success('删除成功')
        fetchData()
      } else {
        message.error('删除失败')
      }
    },
  })
}

// 编辑用户：弹窗与表单
const editModalVisible = ref(false)
const editSubmitting = ref(false)
const editForm = reactive<API.UserUpdateRequest>({
  id: undefined,
  userName: '',
  userAvatar: '',
  userProfile: '',
  userRole: undefined,
})

/** 打开编辑弹窗：把行数据回填到表单 */
const openEdit = (record: ManagerRow) => {
  editForm.id = record.id
  editForm.userName = record.userName ?? ''
  editForm.userAvatar = record.userAvatar ?? ''
  editForm.userProfile = record.userProfile ?? ''
  editForm.userRole = record.userRole ?? 'user'
  editModalVisible.value = true
}

const closeEditModal = () => {
  editModalVisible.value = false
}

/** 提交编辑：空白字段 trim 后转 undefined，避免把空串覆盖到后端 */
const doEditSubmit = async () => {
  if (editForm.id == null) return
  editSubmitting.value = true
  try {
    const res = await updateUser({
      id: editForm.id,
      userName: editForm.userName?.trim() || undefined,
      userAvatar: editForm.userAvatar?.trim() || undefined,
      userProfile: editForm.userProfile?.trim() || undefined,
      userRole: editForm.userRole,
    })
    if (res.data?.code === 0 && res.data?.data) {
      message.success('修改成功')
      closeEditModal()
      fetchData()
    } else {
      message.error('修改失败，' + (res.data?.message ?? '请稍后重试'))
    }
  } finally {
    editSubmitting.value = false
  }
}

/** 角色标签颜色映射 */
const roleColorMap: Record<string, string> = {
  admin: 'processing',
  administrator: 'error',
  user: 'default',
}
</script>

<template>
  <AdminRoomShell note-label="Station · 用户管理">
  <div class="user-manager-page admin-theme-page">
    <!-- 页面头部 -->
    <div class="admin-page-hero">
      <div class="hero-left">
        <div class="hero-title"><Users :size="22" /> 用户管理</div>
        <div class="hero-subtitle">管理平台所有注册用户</div>
      </div>
      <div class="hero-extra admin-hero-stats">
        <div class="stat"><b>{{ total }}</b><span>注册用户</span></div>
        <div class="stat"><b>{{ adminCountOnPage }}</b><span>页内管理人</span></div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="admin-filter-bar">
      <a-input
        v-model:value="searchParams.userAccount"
        allow-clear
        placeholder="搜索账号…"
        style="width: 180px"
        @pressEnter="doSearch"
      />
      <a-input
        v-model:value="searchParams.userName"
        allow-clear
        placeholder="搜索用户名…"
        style="width: 180px"
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
          pageSizeOptions: ['10', '20', '50'],
        }"
        :scroll="{ x: 900 }"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'id'">
            <AdminIdCell :id="record.id" />
          </template>
          <template v-else-if="column.dataIndex === 'userAvatar'">
            <a-avatar
              v-if="record.userAvatar"
              :src="record.userAvatar"
              :size="48"
              shape="square"
            />
            <span v-else class="admin-avatar-fallback">
              {{ (record.userName || record.userAccount || '?').slice(0, 1) }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'userRole'">
            <a-tag :color="roleColorMap[record.userRole ?? 'user']">
              {{ record.userRole === 'admin' ? '管理员' : record.userRole === 'administrator' ? '管理人' : '普通用户' }}
            </a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'createTime'">
            {{ formatTime(record.createTime) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
              <a-button type="link" danger size="small" @click="doDelete(record.id)">删除</a-button>
            </a-space>
          </template>
        </template>
        <template #emptyText>
          <a-empty description="暂无用户数据" />
        </template>
      </a-table>
    </a-card>

    <!-- 编辑用户弹窗 -->
    <a-modal
      v-model:open="editModalVisible"
      title="编辑用户"
      :confirm-loading="editSubmitting"
      ok-text="保存"
      @ok="doEditSubmit"
      @cancel="closeEditModal"
    >
      <a-form layout="vertical" :model="editForm">
        <a-form-item label="用户名">
          <a-input v-model:value="editForm.userName" placeholder="请输入用户名" allow-clear />
        </a-form-item>
        <a-form-item label="头像地址">
          <a-input v-model:value="editForm.userAvatar" placeholder="头像图片 URL" allow-clear />
          <a-avatar
            v-if="editForm.userAvatar"
            :src="editForm.userAvatar"
            :size="48"
            style="display: block; margin-top: 8px; border-radius: 8px"
          />
        </a-form-item>
        <a-form-item label="个人简介">
          <a-textarea
            v-model:value="editForm.userProfile"
            placeholder="请输入个人简介"
            :rows="3"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="角色">
          <a-select v-model:value="editForm.userRole" placeholder="选择角色" style="width: 100%">
            <a-select-option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
  </AdminRoomShell>
</template>

<style scoped>
/* admin-theme.css handles all theming */
</style>
