<script setup lang="ts">
/**
 * 运维中心 · 操作审计
 * 路由：/admin/ops/audit
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { getSiteSettingValues } from '@/api/siteSettings'
import { pageOpsAuditLogs } from '@/api/opsObservability'
import OpsCenterNav from '@/components/admin/OpsCenterNav.vue'
import {
  formatOpsAuditAction,
  isOpsSwitchOn,
  OPS_AUDIT_ACTION_OPTIONS,
} from '@/utils/opsLabels'
import '@/assets/admin-theme.css'

type AuditRow = API.OpsAuditLogVO

const switchLoading = ref(false)
const loading = ref(false)
const opsAuditEnabled = ref(true)

const dateRange = ref<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()])
const expandedIds = ref<Set<string | number>>(new Set())

const searchParams = reactive<{
  action?: string
  operatorId?: string
  pageNum: number
  pageSize: number
}>({
  action: undefined,
  operatorId: undefined,
  pageNum: 1,
  pageSize: 20,
})

const dataSource = ref<AuditRow[]>([])
const total = ref(0)

const fromStr = computed(() => dateRange.value[0]?.format('YYYY-MM-DD'))
const toStr = computed(() => dateRange.value[1]?.format('YYYY-MM-DD'))

const columns = [
  { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180 },
  { title: '操作人', dataIndex: 'operatorId', key: 'operatorId', width: 100 },
  { title: '动作', dataIndex: 'action', key: 'action', width: 160 },
  { title: '资源', key: 'resource', width: 160, ellipsis: true },
  { title: 'IP', dataIndex: 'ip', key: 'ip', width: 130 },
  { title: '结果', dataIndex: 'success', key: 'success', width: 90 },
  { title: '详情', key: 'detail', ellipsis: true },
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

function formatResource(row: AuditRow): string {
  const type = row.resourceType || '-'
  const id = row.resourceId
  if (!id) return type
  return `${type} / ${id}`
}

function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return '-'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function prettyDetail(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function isExpanded(id: string | number | undefined): boolean {
  if (id == null) return false
  return expandedIds.value.has(id)
}

function toggleExpand(id: string | number | undefined) {
  if (id == null) return
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

async function loadSwitch() {
  switchLoading.value = true
  try {
    const res = await getSiteSettingValues('ops')
    if (res.data.code === 0 && res.data.data) {
      const raw = res.data.data.values?.ops_audit_enabled
      // 缺省按后端默认 true 处理
      opsAuditEnabled.value = raw === undefined ? true : isOpsSwitchOn(raw)
    }
  } catch {
    /* 开关探测失败不阻断看板 */
  } finally {
    switchLoading.value = false
  }
}

async function fetchData() {
  loading.value = true
  try {
    const operatorRaw = searchParams.operatorId?.trim()
    const res = await pageOpsAuditLogs({
      action: searchParams.action || undefined,
      operatorId: operatorRaw ? operatorRaw : undefined,
      from: fromStr.value,
      to: toStr.value,
      pageNum: searchParams.pageNum,
      pageSize: Math.min(searchParams.pageSize, 100),
    })
    if (res.data.code === 0 && res.data.data) {
      dataSource.value = res.data.data.records ?? []
      total.value = res.data.data.totalRow ?? 0
    } else {
      message.error(res.data.message || '加载操作审计失败')
    }
  } catch {
    message.error('加载操作审计失败')
  } finally {
    loading.value = false
  }
}

function doSearch() {
  searchParams.pageNum = 1
  fetchData()
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
      <OpsCenterNav active-key="操作审计" />
    </template>
  <div class="ops-center-page admin-theme-page">
      <section class="ops-main">
        <a-alert
          v-if="!switchLoading && !opsAuditEnabled"
          type="warning"
          show-icon
          class="ops-alert"
          message="当前未记录操作审计"
        >
          <template #description>
            请在
            <router-link to="/admin/settings/ops">站点设置 → 运维开关</router-link>
            开启
            <code>ops_audit_enabled</code>
            。
          </template>
        </a-alert>

        <a-card :bordered="false" title="审计记录">
          <div class="filter-row">
            <a-range-picker v-model:value="dateRange" :allow-clear="false" />
            <a-select
              v-model:value="searchParams.action"
              allow-clear
              placeholder="全部动作"
              style="width: 200px"
              :options="OPS_AUDIT_ACTION_OPTIONS"
            />
            <a-input
              v-model:value="searchParams.operatorId"
              allow-clear
              placeholder="操作人 ID"
              style="width: 140px"
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
              <template v-else-if="column.key === 'operatorId'">
                {{ record.operatorId ?? '-' }}
              </template>
              <template v-else-if="column.key === 'action'">
                {{ formatOpsAuditAction(record.action) }}
              </template>
              <template v-else-if="column.key === 'resource'">
                {{ formatResource(record) }}
              </template>
              <template v-else-if="column.key === 'ip'">
                {{ record.ip || '-' }}
              </template>
              <template v-else-if="column.key === 'success'">
                <a-tag :color="record.success ? 'green' : 'red'">
                  {{ record.success ? '成功' : '失败' }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'detail'">
                <div v-if="!record.detailJson" class="muted">-</div>
                <div v-else class="detail-cell">
                  <a-button type="link" size="small" @click="toggleExpand(record.id)">
                    {{ isExpanded(record.id) ? '收起' : '展开' }}
                  </a-button>
                  <pre v-if="isExpanded(record.id)" class="detail-json">{{
                    prettyDetail(record.detailJson)
                  }}</pre>
                  <span v-else class="muted" :title="record.detailJson">
                    {{ truncate(record.detailJson) }}
                  </span>
                </div>
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

.muted {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.detail-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.detail-json {
  margin: 0;
  max-width: 420px;
  max-height: 200px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-bg-muted, rgba(0, 0, 0, 0.04));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 900px) {
  .ops-layout {
    grid-template-columns: 1fr;
  }
}
</style>
