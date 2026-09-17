<script setup lang="ts">
/**
 * 运维中心 · HTTP 访问日志
 * 路由：/admin/ops/access-logs
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { getSiteSettingValues } from '@/api/siteSettings'
import { pageOpsAccessLogs } from '@/api/opsObservability'
import OpsCenterNav from '@/components/admin/OpsCenterNav.vue'
import { isOpsSwitchOn, OPS_HTTP_STATUS_CLASS_OPTIONS } from '@/utils/opsLabels'
import '@/assets/admin-theme.css'

type AccessRow = API.OpsAccessLogVO

const switchLoading = ref(false)
const loading = ref(false)
const httpLogEnabled = ref(false)
const httpLogMode = ref<string>('errors_only')

const dateRange = ref<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()])

const searchParams = reactive<{
  status?: string
  statusClass?: string
  pathPrefix?: string
  pageNum: number
  pageSize: number
}>({
  status: undefined,
  statusClass: undefined,
  pathPrefix: undefined,
  pageNum: 1,
  pageSize: 20,
})

const dataSource = ref<AccessRow[]>([])
const total = ref(0)

const fromStr = computed(() => dateRange.value[0]?.format('YYYY-MM-DD'))
const toStr = computed(() => dateRange.value[1]?.format('YYYY-MM-DD'))

const columns = [
  { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180 },
  { title: '方法', dataIndex: 'method', key: 'method', width: 80 },
  { title: '路径', dataIndex: 'path', key: 'path', ellipsis: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '耗时', key: 'latency', width: 100 },
  { title: '用户', dataIndex: 'userId', key: 'userId', width: 90 },
  { title: 'IP', dataIndex: 'ip', key: 'ip', width: 130 },
  { title: 'Trace', dataIndex: 'traceId', key: 'traceId', width: 140, ellipsis: true },
  { title: '摘要', dataIndex: 'errorSummary', key: 'errorSummary', ellipsis: true },
]

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

function statusColor(status?: number): string {
  if (status == null) return 'default'
  if (status >= 500) return 'red'
  if (status >= 400) return 'orange'
  if (status >= 200 && status < 300) return 'green'
  return 'blue'
}

function truncate(text: string | null | undefined, max = 48): string {
  if (!text) return '-'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

async function loadSwitch() {
  switchLoading.value = true
  try {
    const res = await getSiteSettingValues('ops')
    if (res.data.code === 0 && res.data.data) {
      const values = res.data.data.values || {}
      httpLogEnabled.value = isOpsSwitchOn(values.http_log_enabled)
      const mode = values.http_log_mode
      httpLogMode.value = typeof mode === 'string' && mode ? mode : 'errors_only'
    }
  } catch {
    /* ignore */
  } finally {
    switchLoading.value = false
  }
}

async function fetchData() {
  loading.value = true
  try {
    const statusRaw = searchParams.status?.trim()
    const pathRaw = searchParams.pathPrefix?.trim()
    const res = await pageOpsAccessLogs({
      status: statusRaw || undefined,
      statusClass: statusRaw ? undefined : searchParams.statusClass || undefined,
      pathPrefix: pathRaw || undefined,
      from: fromStr.value,
      to: toStr.value,
      pageNum: searchParams.pageNum,
      pageSize: Math.min(searchParams.pageSize, 100),
    })
    if (res.data.code === 0 && res.data.data) {
      dataSource.value = res.data.data.records ?? []
      total.value = res.data.data.totalRow ?? 0
    } else {
      message.error(res.data.message || '加载访问日志失败')
    }
  } catch {
    message.error('加载访问日志失败')
  } finally {
    loading.value = false
  }
}

function doSearch() {
  searchParams.pageNum = 1
  fetchData()
}

function onStatusChange() {
  if (searchParams.status?.trim()) {
    searchParams.statusClass = undefined
  }
}

function onStatusClassChange() {
  if (searchParams.statusClass) {
    searchParams.status = undefined
  }
}

function onTableChange(pag: { current?: number; pageSize?: number }) {
  if (pag.current != null) searchParams.pageNum = pag.current
  if (pag.pageSize != null) searchParams.pageSize = Math.min(pag.pageSize, 100)
  fetchData()
}

onMounted(async () => {
  await loadSwitch()
  await fetchData()
})
</script>

<template>
  <AdminRoomShell note-label="Station · 运维中心">
    <template #nav>
      <OpsCenterNav active-key="访问日志" />
    </template>
  <div class="ops-center-page admin-theme-page">
      <section class="ops-main">
        <a-alert
          v-if="!switchLoading && !httpLogEnabled"
          type="warning"
          show-icon
          class="ops-alert"
          message="当前尚未开启 HTTP 访问日志"
        >
          <template #description>
            请在
            <router-link to="/admin/settings/ops">站点设置 → 运维开关</router-link>
            开启
            <code>http_log_enabled</code>
            。默认模式
            <code>errors_only</code>
            仅记录 4xx/5xx。
          </template>
        </a-alert>

        <a-alert
          v-else-if="!switchLoading"
          type="info"
          show-icon
          class="ops-alert"
          :message="`当前模式：${httpLogMode}`"
        >
          <template #description>
            可在
            <router-link to="/admin/settings/ops">运维开关</router-link>
            调整
            <code>http_log_mode</code>
            /
            <code>http_log_slow_ms</code>
            。选择
            <code>all</code>
            前请确认磁盘与隐私风险。
          </template>
        </a-alert>

        <a-card :bordered="false" title="访问记录">
          <div class="filter-row">
            <a-range-picker v-model:value="dateRange" :allow-clear="false" />
            <a-input
              v-model:value="searchParams.status"
              allow-clear
              placeholder="状态码 如 404"
              style="width: 130px"
              @change="onStatusChange"
            />
            <a-select
              v-model:value="searchParams.statusClass"
              allow-clear
              placeholder="状态类"
              style="width: 110px"
              :options="OPS_HTTP_STATUS_CLASS_OPTIONS"
              :disabled="!!searchParams.status?.trim()"
              @change="onStatusClassChange"
            />
            <a-input
              v-model:value="searchParams.pathPrefix"
              allow-clear
              placeholder="路径前缀 如 /admin"
              style="width: 200px"
            />
            <a-button type="primary" @click="doSearch">查询</a-button>
          </div>

          <a-table
            row-key="id"
            :loading="loading"
            :columns="columns"
            :data-source="dataSource"
            :pagination="{
              current: searchParams.pageNum,
              pageSize: searchParams.pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (t: number) => `共 ${t} 条`,
            }"
            @change="onTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'createTime'">
                {{ formatTime(record.createTime) }}
              </template>
              <template v-else-if="column.key === 'method'">
                <a-tag>{{ record.method || '-' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'path'">
                <span class="mono" :title="record.path">{{ truncate(record.path, 56) }}</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="statusColor(record.status)">{{ record.status ?? '-' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'latency'">
                {{ record.latencyMs != null ? `${record.latencyMs} ms` : '-' }}
              </template>
              <template v-else-if="column.key === 'userId'">
                {{ record.userId ?? '-' }}
              </template>
              <template v-else-if="column.key === 'ip'">
                {{ record.ip || '-' }}
              </template>
              <template v-else-if="column.key === 'traceId'">
                <span class="mono" :title="record.traceId || undefined">
                  {{ truncate(record.traceId, 16) }}
                </span>
              </template>
              <template v-else-if="column.key === 'errorSummary'">
                <span class="muted" :title="record.errorSummary || undefined">
                  {{ truncate(record.errorSummary, 40) }}
                </span>
              </template>
            </template>
          </a-table>
        </a-card>
      </section>
  </div>
  </AdminRoomShell>
</template>

<style scoped>
.ops-center-page {
  max-width: 1280px;
}

.ops-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  align-items: start;
}

.ops-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ops-alert {
  margin-bottom: 0;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.muted {
  color: var(--color-text-secondary);
  font-size: 13px;
}

@media (max-width: 900px) {
  .ops-layout {
    grid-template-columns: 1fr;
  }
}
</style>
