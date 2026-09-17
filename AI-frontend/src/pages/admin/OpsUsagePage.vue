<script setup lang="ts">
/**
 * 运维中心 · AI 用量
 * 路由：/admin/ops/usage
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { getSiteSettingValues } from '@/api/siteSettings'
import { getOpsUsageMonthly, getOpsUsageSummary, pageOpsUsageLogs } from '@/api/opsObservability'
import OpsCenterNav from '@/components/admin/OpsCenterNav.vue'
import {
  formatOpsUsageScene,
  isOpsSwitchOn,
  OPS_USAGE_SCENE_OPTIONS,
} from '@/utils/opsLabels'
import { estimateModelCost, formatCostYuan } from '@/utils/modelCost'
import '@/assets/admin-theme.css'

type UsageRow = API.OpsUsageLogVO

const switchLoading = ref(false)
const summaryLoading = ref(false)
const tableLoading = ref(false)
const monthlyLoading = ref(false)
const usageLogEnabled = ref(false)

const dateRange = ref<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()])
const summary = ref<API.OpsUsageSummaryVO | null>(null)
const viewMode = ref<'week' | 'month'>('week')
const monthValue = ref<Dayjs>(dayjs())
const monthly = ref<API.OpsUsageMonthlyVO | null>(null)

const searchParams = reactive<{
  scene?: string
  userId?: string
  jobId?: string
  pageNum: number
  pageSize: number
}>({
  scene: undefined,
  userId: undefined,
  jobId: undefined,
  pageNum: 1,
  pageSize: 20,
})

const dataSource = ref<UsageRow[]>([])
const total = ref(0)

const fromStr = computed(() => dateRange.value[0]?.format('YYYY-MM-DD'))
const toStr = computed(() => dateRange.value[1]?.format('YYYY-MM-DD'))

const bySceneEntries = computed(() =>
  Object.entries(summary.value?.byScene || {}).sort((a, b) => b[1] - a[1]),
)
const byModelEntries = computed(() =>
  Object.entries(summary.value?.byModel || {}).sort((a, b) => b[1] - a[1]),
)
const monthStr = computed(() => monthValue.value.format('YYYY-MM'))
const monthlyBySceneEntries = computed(() =>
  Object.entries(monthly.value?.byScene || {}).sort((a, b) => b[1] - a[1]),
)
const monthlyByModelRows = computed(() =>
  Object.entries(monthly.value?.byModel || {})
    .map(([model, stat]) => ({
      model,
      requestCount: stat?.requestCount ?? 0,
      totalTokens: stat?.totalTokens ?? 0,
      cost: estimateModelCost(model, stat?.totalTokens ?? null),
    }))
    .sort((a, b) => b.requestCount - a.requestCount),
)
const monthlyDayRows = computed(() =>
  (monthly.value?.days || []).map((d) => ({
    ...d,
    max: Math.max(
      ...(monthly.value?.days || []).map((x) => x.requestCount ?? 0),
      1,
    ),
  })),
)
const monthlyTotalCost = computed(() => {
  let sum = 0
  for (const row of monthlyByModelRows.value) {
    if (row.cost != null) sum += row.cost
  }
  return sum
})

const columns = [
  { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180 },
  { title: '场景', dataIndex: 'scene', key: 'scene', width: 120 },
  { title: '模型', dataIndex: 'modelName', key: 'modelName', width: 140, ellipsis: true },
  { title: '任务', dataIndex: 'jobId', key: 'jobId', width: 100 },
  { title: 'Tokens', key: 'tokens', width: 100 },
  { title: '成本估算', key: 'cost', width: 100 },
  { title: '耗时', key: 'latency', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '用户', dataIndex: 'userId', key: 'userId', width: 90 },
  { title: '摘要 / 错误', key: 'detail', ellipsis: true },
]

const modelCostColumns = [
  { title: '模型', dataIndex: 'model', key: 'model' },
  { title: '调用', dataIndex: 'requestCount', key: 'requestCount', width: 80 },
  { title: 'Tokens', dataIndex: 'totalTokens', key: 'totalTokens', width: 110 },
  { title: '成本估算', dataIndex: 'cost', key: 'cost', width: 110 },
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

function formatNullableNumber(v: number | null | undefined, suffix = ''): string {
  if (v == null || Number.isNaN(v)) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) {
    return `${v.toFixed(1)}${suffix}`
  }
  return `${v}${suffix}`
}

function statusColor(status?: string): string {
  if (status === 'success') return 'green'
  if (status === 'error') return 'red'
  return 'default'
}

function truncate(text: string | null | undefined, max = 80): string {
  if (!text) return '-'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

async function loadSwitch() {
  switchLoading.value = true
  try {
    const res = await getSiteSettingValues('ops')
    if (res.data.code === 0 && res.data.data) {
      usageLogEnabled.value = isOpsSwitchOn(res.data.data.values?.usage_log_enabled)
    }
  } catch {
    /* 开关探测失败不阻断看板 */
  } finally {
    switchLoading.value = false
  }
}

async function fetchSummary() {
  summaryLoading.value = true
  try {
    const res = await getOpsUsageSummary({ from: fromStr.value, to: toStr.value })
    if (res.data.code === 0 && res.data.data) {
      summary.value = res.data.data
    } else {
      message.error(res.data.message || '加载用量汇总失败')
    }
  } catch {
    message.error('加载用量汇总失败')
  } finally {
    summaryLoading.value = false
  }
}

async function fetchMonthly() {
  monthlyLoading.value = true
  try {
    const res = await getOpsUsageMonthly({ month: monthStr.value })
    if (res.data.code === 0 && res.data.data) {
      monthly.value = res.data.data
    } else {
      message.error(res.data.message || '加载月度用量失败')
    }
  } catch {
    message.error('加载月度用量失败')
  } finally {
    monthlyLoading.value = false
  }
}

async function fetchLogs() {
  tableLoading.value = true
  try {
    const userIdRaw = searchParams.userId?.trim()
    const jobIdRaw = searchParams.jobId?.trim()
    const res = await pageOpsUsageLogs({
      scene: searchParams.scene || undefined,
      userId: userIdRaw ? userIdRaw : undefined,
      jobId: jobIdRaw ? Number(jobIdRaw) : undefined,
      from: fromStr.value,
      to: toStr.value,
      pageNum: searchParams.pageNum,
      pageSize: Math.min(searchParams.pageSize, 100),
    })
    if (res.data.code === 0 && res.data.data) {
      dataSource.value = res.data.data.records ?? []
      total.value = res.data.data.totalRow ?? 0
    } else {
      message.error(res.data.message || '加载用量明细失败')
    }
  } catch {
    message.error('加载用量明细失败')
  } finally {
    tableLoading.value = false
  }
}

async function reloadAll() {
  if (viewMode.value === 'month') {
    await Promise.all([fetchMonthly(), fetchLogs()])
  } else {
    await Promise.all([fetchSummary(), fetchLogs()])
  }
}

function doSearch() {
  searchParams.pageNum = 1
  reloadAll()
}

function onTableChange(pag: { current?: number; pageSize?: number }) {
  if (pag.current != null) searchParams.pageNum = pag.current
  if (pag.pageSize != null) searchParams.pageSize = Math.min(pag.pageSize, 100)
  fetchLogs()
}

function switchViewMode(mode: 'week' | 'month') {
  viewMode.value = mode
  searchParams.pageNum = 1
  if (mode === 'month') {
    monthValue.value = dayjs()
    dateRange.value = [dayjs().startOf('month'), dayjs().endOf('month')]
    reloadAll()
  } else {
    dateRange.value = [dayjs().subtract(6, 'day'), dayjs()]
    reloadAll()
  }
}

function onViewModeChange(v: string | number) {
  switchViewMode(v === 'month' ? 'month' : 'week')
}

function onMonthChange() {
  searchParams.pageNum = 1
  dateRange.value = [monthValue.value.startOf('month'), monthValue.value.endOf('month')]
  reloadAll()
}

onMounted(async () => {
  await loadSwitch()
  await reloadAll()
})
</script>

<template>
  <AdminRoomShell note-label="Station · 运维中心">
    <template #nav>
      <OpsCenterNav active-key="AI用量" />
    </template>
  <div class="ops-center-page admin-theme-page">
      <section class="ops-main">
        <a-alert
          v-if="!switchLoading && !usageLogEnabled"
          type="warning"
          show-icon
          class="ops-alert"
          message="当前未记录用量"
        >
          <template #description>
            请在
            <router-link to="/admin/settings/ops">站点设置 → 运维开关</router-link>
            开启
            <code>usage_log_enabled</code>
            ，再发起知识库问答或蒸馏后查看。
          </template>
        </a-alert>

        <a-card :bordered="false" title="筛选">
          <div class="filter-row">
            <a-segmented
              :value="viewMode"
              :options="[
                { label: '近 7 天', value: 'week' },
                { label: '月度', value: 'month' },
              ]"
              @change="onViewModeChange"
            />
            <a-range-picker
              v-if="viewMode === 'week'"
              v-model:value="dateRange"
              :allow-clear="false"
            />
            <a-month-picker
              v-else
              v-model:value="monthValue"
              :allow-clear="false"
              @change="onMonthChange"
            />
            <a-select
              v-model:value="searchParams.scene"
              allow-clear
              placeholder="全部场景"
              style="width: 180px"
              :options="OPS_USAGE_SCENE_OPTIONS"
            />
            <a-input
              v-model:value="searchParams.userId"
              allow-clear
              placeholder="用户 ID"
              style="width: 140px"
            />
            <a-input
              v-model:value="searchParams.jobId"
              allow-clear
              placeholder="任务 ID"
              style="width: 130px"
            />
            <a-button type="primary" @click="doSearch">查询</a-button>
          </div>
        </a-card>

        <a-spin v-if="viewMode === 'week'" :spinning="summaryLoading">
          <div class="summary-grid">
            <a-card :bordered="false" class="stat-card">
              <a-statistic title="调用次数" :value="summary?.requestCount ?? 0" />
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <a-statistic title="成功" :value="summary?.successCount ?? 0" />
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <a-statistic title="失败" :value="summary?.errorCount ?? 0" />
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <div class="stat-label">总 Tokens</div>
              <div class="stat-value">{{ formatNullableNumber(summary?.totalTokens) }}</div>
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <div class="stat-label">平均耗时</div>
              <div class="stat-value">{{ formatNullableNumber(summary?.avgLatencyMs, ' ms') }}</div>
            </a-card>
          </div>

          <div class="breakdown-row">
            <a-card :bordered="false" title="按场景" class="breakdown-card">
              <div v-if="bySceneEntries.length === 0" class="empty-hint">暂无数据</div>
              <div v-else class="tag-list">
                <a-tag v-for="[scene, count] in bySceneEntries" :key="scene">
                  {{ formatOpsUsageScene(scene) }} · {{ count }}
                </a-tag>
              </div>
            </a-card>
            <a-card :bordered="false" title="按模型" class="breakdown-card">
              <div v-if="byModelEntries.length === 0" class="empty-hint">暂无数据</div>
              <div v-else class="tag-list">
                <a-tag v-for="[model, count] in byModelEntries" :key="model">
                  {{ model }} · {{ count }}
                </a-tag>
              </div>
            </a-card>
          </div>
        </a-spin>

        <a-spin v-else :spinning="monthlyLoading">
          <div class="summary-grid">
            <a-card :bordered="false" class="stat-card">
              <a-statistic title="调用次数" :value="monthly?.requestCount ?? 0" />
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <a-statistic title="成功" :value="monthly?.successCount ?? 0" />
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <a-statistic title="失败" :value="monthly?.errorCount ?? 0" />
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <div class="stat-label">总 Tokens</div>
              <div class="stat-value">{{ formatNullableNumber(monthly?.totalTokens) }}</div>
            </a-card>
            <a-card :bordered="false" class="stat-card">
              <div class="stat-label">估算成本</div>
              <div class="stat-value" style="color: var(--color-primary-light)">
                {{ formatCostYuan(monthlyTotalCost) }}
              </div>
            </a-card>
          </div>

          <a-card :bordered="false" title="按天分布" class="month-card">
            <div v-if="monthlyDayRows.length === 0" class="empty-hint">本月暂无用量数据</div>
            <div v-else class="day-bars">
              <div
                v-for="day in monthlyDayRows"
                :key="day.date"
                class="day-bar-col"
                :title="`${day.date} · ${day.requestCount ?? 0} 次 · ${formatNullableNumber(day.totalTokens)} tokens`"
              >
                <div
                  class="day-bar"
                  :style="{ height: `${Math.max(4, Math.round(((day.requestCount ?? 0) / day.max) * 120))}px` }"
                />
                <span class="day-label">{{ String(day.date || '').slice(8) }}</span>
              </div>
            </div>
          </a-card>

          <div class="breakdown-row">
            <a-card :bordered="false" title="按场景" class="breakdown-card">
              <div v-if="monthlyBySceneEntries.length === 0" class="empty-hint">暂无数据</div>
              <div v-else class="tag-list">
                <a-tag v-for="[scene, count] in monthlyBySceneEntries" :key="scene">
                  {{ formatOpsUsageScene(scene) }} · {{ count }}
                </a-tag>
              </div>
            </a-card>
            <a-card :bordered="false" title="按模型 · 成本估算" class="breakdown-card">
              <div v-if="monthlyByModelRows.length === 0" class="empty-hint">暂无数据</div>
              <a-table
                v-else
                :columns="modelCostColumns"
                :data-source="monthlyByModelRows"
                :pagination="false"
                size="small"
                row-key="model"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'cost'">
                    {{ formatCostYuan(record.cost) }}
                  </template>
                  <template v-else-if="column.key === 'totalTokens'">
                    {{ formatNullableNumber(record.totalTokens) }}
                  </template>
                </template>
              </a-table>
              <div class="cost-hint">单价为输入/输出混合估算（元 / 1M tokens），仅作参考。</div>
            </a-card>
          </div>
        </a-spin>

        <a-card :bordered="false" title="调用明细">
          <a-table
            row-key="id"
            :loading="tableLoading"
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
              <template v-else-if="column.key === 'scene'">
                {{ formatOpsUsageScene(record.scene) }}
              </template>
              <template v-else-if="column.key === 'tokens'">
                {{ formatNullableNumber(record.totalTokens) }}
              </template>
              <template v-else-if="column.key === 'cost'">
                {{ formatCostYuan(estimateModelCost(record.modelName, record.totalTokens)) }}
              </template>
              <template v-else-if="column.key === 'latency'">
                {{ formatNullableNumber(record.responseTimeMs, ' ms') }}
              </template>
              <template v-else-if="column.key === 'jobId'">
                {{ record.jobId ?? '-' }}
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="statusColor(record.status)">{{ record.status || '-' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'userId'">
                {{ record.userId ?? '-' }}
              </template>
              <template v-else-if="column.key === 'detail'">
                <span
                  v-if="record.status === 'error' && record.errorMessage"
                  class="err-text"
                  :title="record.errorMessage"
                >
                  {{ truncate(record.errorMessage) }}
                </span>
                <span v-else class="muted" :title="record.requestSummary || undefined">
                  {{ truncate(record.requestSummary) }}
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
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.breakdown-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 4px;
}

.month-card {
  margin-bottom: 12px;
}

.day-bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  min-height: 150px;
  overflow-x: auto;
  padding-top: 8px;
}

.day-bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 20px;
  flex: 1;
}

.day-bar {
  width: 16px;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, var(--color-primary-light), var(--color-primary));
  transition: height 0.2s ease;
}

.day-label {
  font-size: 10px;
  color: var(--color-text-muted);
}

.cost-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty-hint {
  color: var(--color-text-muted);
  font-size: 13px;
}

.muted {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.err-text {
  color: #cf1322;
  font-size: 13px;
}

@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .ops-layout {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .breakdown-row {
    grid-template-columns: 1fr;
  }
}
</style>
