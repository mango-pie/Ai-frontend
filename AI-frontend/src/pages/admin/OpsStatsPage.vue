<script setup lang="ts">
/**
 * 运维中心 · 业务日统计
 * 路由：/admin/ops/stats
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { getSiteSettingValues } from '@/api/siteSettings'
import { getOpsBizStatsOverview, getOpsBizStatsSeries } from '@/api/opsObservability'
import OpsCenterNav from '@/components/admin/OpsCenterNav.vue'
import {
  formatOpsBizMetric,
  isOpsSwitchOn,
  OPS_BIZ_METRIC_KEYS,
} from '@/utils/opsLabels'
import '@/assets/admin-theme.css'

const switchLoading = ref(false)
const overviewLoading = ref(false)
const seriesLoading = ref(false)
const bizStatsEnabled = ref(true)

const dateRange = ref<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()])
const selectedMetric = ref(OPS_BIZ_METRIC_KEYS[0] || 'blog.post.view')
const totals = ref<Record<string, number>>({})
const series = ref<API.OpsBizStatsPointVO[]>([])

const fromStr = computed(() => dateRange.value[0]?.format('YYYY-MM-DD'))
const toStr = computed(() => dateRange.value[1]?.format('YYYY-MM-DD'))

const metricCards = computed(() =>
  OPS_BIZ_METRIC_KEYS.map((metric) => ({
    metric,
    label: formatOpsBizMetric(metric),
    value: totals.value[metric] ?? 0,
  })),
)

/** SVG 折线路径 */
const chartPaths = computed(() => {
  const points = series.value
  const w = 640
  const h = 220
  const padX = 36
  const padY = 24
  if (!points.length) {
    return { line: '', area: '', dots: [] as { x: number; y: number; label: string; value: number }[], w, h }
  }
  const values = points.map((p) => p.value ?? 0)
  const maxV = Math.max(...values, 1)
  const minV = 0
  const span = maxV - minV || 1
  const n = points.length
  const dots = points.map((p, i) => {
    const x = padX + (n === 1 ? (w - padX * 2) / 2 : (i / (n - 1)) * (w - padX * 2))
    const y = padY + (1 - ((p.value ?? 0) - minV) / span) * (h - padY * 2)
    return { x, y, label: p.date || '', value: p.value ?? 0 }
  })
  const line = dots.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x.toFixed(1)} ${d.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${dots[dots.length - 1]!.x.toFixed(1)} ${(h - padY).toFixed(1)} L ${dots[0]!.x.toFixed(1)} ${(h - padY).toFixed(1)} Z`
  return { line, area, dots, w, h, maxV }
})

async function loadSwitch() {
  switchLoading.value = true
  try {
    const res = await getSiteSettingValues('ops')
    if (res.data.code === 0 && res.data.data) {
      const raw = res.data.data.values?.biz_stats_enabled
      bizStatsEnabled.value = raw === undefined ? true : isOpsSwitchOn(raw)
    }
  } catch {
    /* ignore */
  } finally {
    switchLoading.value = false
  }
}

async function fetchOverview() {
  overviewLoading.value = true
  try {
    const res = await getOpsBizStatsOverview({ from: fromStr.value, to: toStr.value })
    if (res.data.code === 0 && res.data.data) {
      totals.value = res.data.data.totals ?? {}
    } else {
      message.error(res.data.message || '加载业务统计失败')
    }
  } catch {
    message.error('加载业务统计失败')
  } finally {
    overviewLoading.value = false
  }
}

async function fetchSeries() {
  if (!selectedMetric.value) return
  seriesLoading.value = true
  try {
    const res = await getOpsBizStatsSeries({
      metric: selectedMetric.value,
      from: fromStr.value,
      to: toStr.value,
    })
    if (res.data.code === 0 && res.data.data) {
      series.value = res.data.data
    } else {
      message.error(res.data.message || '加载趋势失败')
      series.value = []
    }
  } catch {
    message.error('加载趋势失败')
    series.value = []
  } finally {
    seriesLoading.value = false
  }
}

async function reloadAll() {
  await Promise.all([fetchOverview(), fetchSeries()])
}

function setRangeDays(days: number) {
  dateRange.value = [dayjs().subtract(days - 1, 'day'), dayjs()]
  reloadAll()
}

function selectMetric(metric: string) {
  if (selectedMetric.value === metric) return
  selectedMetric.value = metric
  fetchSeries()
}

function onRangeChange() {
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
      <OpsCenterNav active-key="业务统计" />
    </template>
  <div class="ops-center-page admin-theme-page">
      <section class="ops-main">
        <a-alert
          v-if="!switchLoading && !bizStatsEnabled"
          type="warning"
          show-icon
          class="ops-alert"
          message="当前未累计业务统计"
        >
          <template #description>
            请在
            <router-link to="/admin/settings/ops">站点设置 → 运维开关</router-link>
            开启
            <code>biz_stats_enabled</code>
            。
          </template>
        </a-alert>

        <a-card :bordered="false" title="筛选">
          <div class="filter-row">
            <a-range-picker
              v-model:value="dateRange"
              :allow-clear="false"
              @change="onRangeChange"
            />
            <a-button @click="setRangeDays(7)">近 7 日</a-button>
            <a-button @click="setRangeDays(30)">近 30 日</a-button>
            <a-button type="primary" @click="reloadAll">刷新</a-button>
          </div>
        </a-card>

        <a-spin :spinning="overviewLoading">
          <div class="metric-grid">
            <button
              v-for="card in metricCards"
              :key="card.metric"
              type="button"
              class="metric-card"
              :class="{ active: selectedMetric === card.metric }"
              @click="selectMetric(card.metric)"
            >
              <div class="metric-label">{{ card.label }}</div>
              <div class="metric-value">{{ card.value }}</div>
              <div class="metric-code">{{ card.metric }}</div>
            </button>
          </div>
        </a-spin>

        <a-card
          :bordered="false"
          :title="`趋势 · ${formatOpsBizMetric(selectedMetric)}`"
        >
          <a-spin :spinning="seriesLoading">
            <div v-if="!series.length" class="empty-hint">暂无序列数据</div>
            <div v-else class="chart-wrap">
              <svg
                class="series-chart"
                :viewBox="`0 0 ${chartPaths.w} ${chartPaths.h}`"
                role="img"
                :aria-label="`${formatOpsBizMetric(selectedMetric)} 趋势`"
              >
                <defs>
                  <linearGradient id="opsSeriesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="currentColor" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="currentColor" stop-opacity="0.02" />
                  </linearGradient>
                </defs>
                <path :d="chartPaths.area" fill="url(#opsSeriesFill)" />
                <path
                  :d="chartPaths.line"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <circle
                  v-for="(d, i) in chartPaths.dots"
                  :key="i"
                  :cx="d.x"
                  :cy="d.y"
                  r="3.5"
                  fill="currentColor"
                >
                  <title>{{ d.label }}: {{ d.value }}</title>
                </circle>
              </svg>
              <div class="chart-axis">
                <span>{{ series[0]?.date }}</span>
                <span v-if="series.length > 1">{{ series[series.length - 1]?.date }}</span>
              </div>
              <div class="chart-meta">
                共 {{ series.length }} 个点 · 峰值 {{ chartPaths.maxV ?? 0 }}
              </div>
            </div>
          </a-spin>
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

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  text-align: left;
  border: 1px solid var(--color-border);
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
  color: inherit;
}

.metric-card:hover {
  border-color: var(--color-primary-20);
  background: var(--color-primary-08);
}

.metric-card.active {
  border-color: var(--color-primary-20);
  background: var(--color-primary-12);
  box-shadow: 0 0 0 1px var(--color-primary-20);
}

.metric-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.metric-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-text-primary);
}

.metric-code {
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}

.chart-wrap {
  color: var(--color-primary-light, #3b82f6);
}

.series-chart {
  width: 100%;
  height: auto;
  max-height: 260px;
  display: block;
}

.chart-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.chart-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.empty-hint {
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}

@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .ops-layout {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
