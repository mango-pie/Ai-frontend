<script setup lang="ts">
/**
 * 精读笔记列表页（我的文章）：
 * 三栏布局——左侧概况统计、中部文章列表（含进行中/失败的合蒸任务）+ 自绘分页、
 * 右侧状态筛选与批量操作入口；任务与统计通过定时轮询保持新鲜。
 */
import { onMounted, onBeforeUnmount, reactive, ref, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  deleteKnowledgeNote,
  listKnowledgeNotes,
  listKnowledgeReadingJobs,
  getKnowledgeReadingJob,
  redistillKnowledgeNote,
} from '@/api/knowledge'
import { sourceTypeLabel } from '@/utils/knowledgeNoteStatus'
import { loadReadingUxSettings } from '@/utils/readingSettings'
import ReadingRoomShell from '@/components/reading/ReadingRoomShell.vue'
import {
  extractPageTotal,
  useKnowledgeNoteStats,
} from '@/composables/useKnowledgeNoteStats'
import {
  isReadingJobInProgress,
  readingJobProgressLabel,
} from '@/composables/useKnowledgeSearchDraft'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
// 文章分页数据与当前选中行（单击选中，双击进详情）
const dataSource = ref<API.KnowledgeNoteVO[]>([])
const total = ref(0)
const selectedId = ref<string | number | null>(null)
// 快捷筛选 tab：全部 / 已发博客 / 已入库
const filterKey = ref<'all' | 'published' | 'saved'>('all')
/** 点搜索后即可在此看到的进行中 / 失败任务 */
const pipelineJobs = ref<API.KnowledgeReadingJobVO[]>([])
let jobPollTimer: ReturnType<typeof setInterval> | null = null
const JOB_POLL_MS = 2000

const {
  total: statsTotal,
  published: statsPublished,
  indexed: statsIndexed,
  refresh: refreshStats,
  refreshRunning,
  syncTotalFromPage,
} = useKnowledgeNoteStats()

// 列表查询条件：关键词 + 来源类型 + 发布状态 + 入库状态
const query = reactive<API.KnowledgeNoteQueryRequest>({
  pageNum: 1,
  pageSize: 12,
  keyword: undefined,
  sourceType: undefined,
  publishStatus: undefined,
  indexStatus: undefined,
})

const hasActiveFilters = computed(
  () => !!(query.keyword || query.sourceType || query.publishStatus || query.indexStatus),
)

// 当前选中行：未显式选中时默认取第一行，保证右侧操作面板始终可用
const selected = computed(() => {
  if (selectedId.value == null) return dataSource.value[0] ?? null
  return dataSource.value.find((x) => String(x.id) === String(selectedId.value)) ?? dataSource.value[0] ?? null
})

// 自绘分页：只展示以当前页为中心的最多 3 个页码
const totalPages = computed(() => Math.max(1, Math.ceil((total.value || 0) / (query.pageSize || 12))))

const pageButtons = computed(() => {
  const cur = query.pageNum || 1
  const max = totalPages.value
  const start = Math.max(1, Math.min(cur - 1, max - 2))
  const pages: number[] = []
  for (let i = start; i <= Math.min(max, start + 2); i++) pages.push(i)
  return pages
})

// 标签云统计：拆分每行标签（每篇最多取 6 个），聚合计数取前 10
const tagStats = computed(() => {
  const map = new Map<string, number>()
  for (const row of dataSource.value) {
    const raw = (row.tags || '').split(/[,，;；\s]+/).map((t) => t.trim()).filter(Boolean)
    for (const t of raw.slice(0, 6)) {
      map.set(t, (map.get(t) || 0) + 1)
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))
})

const sourceStats = computed(() => {
  const map = new Map<string, number>()
  for (const row of dataSource.value) {
    const key = sourceTypeLabel(row.sourceType)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].map(([name, count]) => ({ name, count }))
})

function applyRouteSourceFilter() {
  const st = route.query.sourceType
  if (typeof st === 'string' && st.trim()) query.sourceType = st.trim().toUpperCase()
}

/** 快捷筛选：全部 / 已发博客(PUBLISHED) / 已入库(INDEXED)，切换后回到第一页 */
const applyFilter = (key: 'all' | 'published' | 'saved') => {
  filterKey.value = key
  if (key === 'all') {
    query.publishStatus = undefined
    query.indexStatus = undefined
  } else if (key === 'published') {
    query.publishStatus = 'PUBLISHED'
    query.indexStatus = undefined
  } else {
    query.indexStatus = 'INDEXED'
    query.publishStatus = undefined
  }
  query.pageNum = 1
  fetchData()
}

const syncFilterKeyFromQuery = () => {
  if (query.publishStatus === 'PUBLISHED' && !query.indexStatus) {
    filterKey.value = 'published'
  } else if (query.indexStatus === 'INDEXED' && !query.publishStatus) {
    filterKey.value = 'saved'
  } else if (!query.publishStatus && !query.indexStatus) {
    filterKey.value = 'all'
  } else {
    filterKey.value = 'all'
  }
}

const onSourceTypeChange = (value: string) => {
  query.sourceType = value || undefined
  query.pageNum = 1
  fetchData()
}

const onPublishStatusChange = (value: string) => {
  query.publishStatus = value || undefined
  syncFilterKeyFromQuery()
  query.pageNum = 1
  fetchData()
}

const onIndexStatusChange = (value: string) => {
  query.indexStatus = value || undefined
  syncFilterKeyFromQuery()
  query.pageNum = 1
  fetchData()
}

const onSelectChange = (e: Event, handler: (value: string) => void) => {
  const el = e.target as HTMLSelectElement | null
  handler(el?.value ?? '')
}

const clearFilters = () => {
  query.keyword = undefined
  query.sourceType = undefined
  query.publishStatus = undefined
  query.indexStatus = undefined
  filterKey.value = 'all'
  query.pageNum = 1
  fetchData()
}

const goPage = (n: number) => {
  if (n < 1 || n > totalPages.value || n === query.pageNum) return
  query.pageNum = n
  fetchData()
}

const formatTime = (raw?: string) => {
  if (!raw) return '—'
  const s = raw.replace('T', ' ')
  return s.length >= 16 ? s.slice(5, 16) : s.slice(0, 10)
}

const noteIdChip = (row: API.KnowledgeNoteVO) =>
  row.id != null ? `#N${String(row.id).slice(-4).padStart(4, '0')}` : '#N----'

const pubChip = (row: API.KnowledgeNoteVO) => {
  const p = String(row.publishStatus || '').toUpperCase()
  if (p === 'PUBLISHED') return { text: '已发博客', cls: 'pub' }
  if (p === 'DRAFT_CREATED') return { text: '草稿', cls: 'src' }
  return { text: '未发布', cls: 'none' }
}

const idxChip = (row: API.KnowledgeNoteVO) => {
  const i = String(row.indexStatus || '').toUpperCase()
  if (i === 'INDEXED') return { text: '已入库', cls: 'idx' }
  if (i === 'REINDEX_REQUIRED') return { text: '需重建', cls: 'rev' }
  if (i === 'INDEX_FAILED') return { text: '入库失败', cls: 'fail' }
  return { text: '未入库', cls: 'none' }
}

/** 拉取文章分页列表；无筛选时同步全局统计总数 */
const fetchData = async () => {
  loading.value = true
  try {
    const res = await listKnowledgeNotes({ ...query })
    if (res.data.code === 0 && res.data.data) {
      dataSource.value = res.data.data.records ?? []
      const pageTotal = extractPageTotal(res.data.data)
      total.value = pageTotal
      if (!hasActiveFilters.value) syncTotalFromPage(pageTotal)
      if (selectedId.value == null && dataSource.value[0]?.id != null) {
        selectedId.value = dataSource.value[0].id
      }
    } else message.error(res.data.message || '加载失败')
  } finally {
    loading.value = false
  }
}

/** 任务是否仍展示在列表：成功且已生成笔记的任务视为“已变成文章”，从任务区移除 */
const isJobVisibleInArticles = (job: API.KnowledgeReadingJobVO) => {
  const status = String(job.status || '').toUpperCase()
  if (status === 'SUCCESS' && job.noteId != null) return false
  return true
}

const jobTitle = (job: API.KnowledgeReadingJobVO) =>
  job.title || job.goal || (job.jobId != null ? `任务 #${job.jobId}` : '未命名任务')

const jobStatusText = (job: API.KnowledgeReadingJobVO) => {
  const status = String(job.status || '').toUpperCase()
  if (status === 'FAILED') return job.errorMsg || '失败'
  if (status === 'SUCCESS') return '已完成'
  return readingJobProgressLabel(job.progress) || '进行中'
}

const fetchPipelineJobs = async () => {
  try {
    const res = await listKnowledgeReadingJobs({ pageNum: 1, pageSize: 30 })
    if (res.data.code === 0 && res.data.data) {
      pipelineJobs.value = (res.data.data.records || []).filter(isJobVisibleInArticles)
    }
  } catch {
    /* ignore */
  }
}

/** 轮询任务区：刷新进行中任务快照；有任务转成文章时联动刷新列表与统计 */
const pollPipelineJobs = async () => {
  const active = pipelineJobs.value.filter((j) => isReadingJobInProgress(j))
  if (!active.length) {
    await fetchPipelineJobs()
    return
  }
  await Promise.all(
    active.map(async (job) => {
      if (job.jobId == null) return
      try {
        const res = await getKnowledgeReadingJob(job.jobId)
        if (res.data.code === 0 && res.data.data) {
          const d = res.data.data
          const idx = pipelineJobs.value.findIndex((j) => String(j.jobId) === String(job.jobId))
          if (idx >= 0) pipelineJobs.value[idx] = d
        }
      } catch {
        /* ignore */
      }
    }),
  )
  const before = pipelineJobs.value.length
  pipelineJobs.value = pipelineJobs.value.filter(isJobVisibleInArticles)
  if (pipelineJobs.value.length !== before) {
    void fetchData()
    void refreshStats()
  }
}

/** 点击任务行：已成功的直接进笔记详情，否则跳回采集台继续跟踪 */
const openJob = (job: API.KnowledgeReadingJobVO) => {
  const status = String(job.status || '').toUpperCase()
  if (status === 'SUCCESS' && job.noteId != null) {
    openDetail(job.noteId)
    return
  }
  if (job.jobId == null) return
  router.push({ path: '/admin/knowledge/ingest', query: { jobId: String(job.jobId) } })
}

const openDetail = (id?: number | string) => {
  if (id == null) return
  router.push(`/admin/knowledge/notes/${id}`)
}

const runRedistill = async (row: API.KnowledgeNoteVO) => {
  if (row.id == null) return
  const res = await redistillKnowledgeNote(row.id)
  if (res.data.code === 0 && res.data.data?.note?.id != null) {
    message.success('重新蒸馏完成')
    void refreshStats()
    openDetail(res.data.data.note.id)
  } else message.error(res.data.message || '重新蒸馏失败')
}

/** 再蒸馏（带确认开关）：按站点 UX 设置决定是否弹确认，然后覆盖生成新 Markdown */
const handleRedistill = async (row: API.KnowledgeNoteVO) => {
  const ux = await loadReadingUxSettings()
  if (!ux.redistillConfirmRequired) {
    await runRedistill(row)
    return
  }
  Modal.confirm({
    title: '重新蒸馏',
    content: '重新蒸馏会覆盖当前 Markdown 内容。是否继续？',
    onOk: () => runRedistill(row),
  })
}

const handleDelete = (row: API.KnowledgeNoteVO) => {
  Modal.confirm({
    title: '删除精读',
    content: `确认删除「${row.title || row.id}」？`,
    okType: 'danger',
    onOk: async () => {
      if (row.id == null) return
      const res = await deleteKnowledgeNote(row.id)
      if (res.data.code === 0) {
        message.success('已删除')
        if (String(selectedId.value) === String(row.id)) selectedId.value = null
        fetchData()
        void refreshStats()
      } else message.error(res.data.message || '删除失败')
    },
  })
}

// 两个轮询：统计每 5s、任务区每 2s，离开页面时统一清理
let runningTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  applyRouteSourceFilter()
  void fetchData()
  void fetchPipelineJobs()
  void refreshStats()
  runningTimer = setInterval(() => void refreshRunning(true), 5000)
  jobPollTimer = setInterval(() => void pollPipelineJobs(), JOB_POLL_MS)
})

onBeforeUnmount(() => {
  if (runningTimer) clearInterval(runningTimer)
  if (jobPollTimer) clearInterval(jobPollTimer)
})

watch(
  () => route.query.sourceType,
  () => {
    applyRouteSourceFilter()
    query.pageNum = 1
    void fetchData()
  },
)
</script>

<template>
  <ReadingRoomShell>
    <div id="page-notes" class="notes-page" :aria-busy="loading">
      <div class="page-title">
        <h1 class="font-display">我的文章</h1>
        <span class="sub">关键词 / 来源 / 博客状态 / 入库状态筛选</span>
      </div>

      <div class="layout-3">
        <!-- 左栏：精读概况 KPI + 去采集入口 -->
        <aside class="side" aria-label="笔记侧栏">
          <div class="side-card glass">
            <span class="tape" />
            <h3 class="font-display">精读概况</h3>
            <div class="focus-kpi">
              <div class="stat-pill"><div class="n">{{ statsTotal || total }}</div><div class="l">笔记</div></div>
              <div class="stat-pill"><div class="n">{{ pipelineJobs.length }}</div><div class="l">进行中</div></div>
            </div>
            <div class="focus-kpi" style="margin-top: 8px">
              <div class="stat-pill"><div class="n">{{ statsPublished }}</div><div class="l">已发博客</div></div>
              <div class="stat-pill"><div class="n">{{ statsIndexed }}</div><div class="l">已入库</div></div>
            </div>
          </div>

          <div class="cta-foot">
            <div>
              <div class="lbl font-display">去采集</div>
              <div class="sub">搜索合蒸一篇</div>
            </div>
            <button type="button" class="chip-btn primary sm" @click="router.push('/admin/knowledge/ingest')">→</button>
          </div>
        </aside>

        <!-- 中栏：搜索 + 快捷筛选 tab + 任务区（进行中/失败）+ 文章列表 + 自绘分页 -->
        <main class="mid-bay" aria-label="文章列表">
          <div class="notes-toolbar">
            <div class="search-wrap">
              <input
                v-model="query.keyword"
                placeholder="搜索标题 / 摘要…"
                type="text"
                @keydown.enter="query.pageNum = 1; fetchData()"
              />
            </div>
            <div class="filter-row">
              <button type="button" class="f-btn" :class="{ on: filterKey === 'all' }" @click="applyFilter('all')">全部</button>
              <button type="button" class="f-btn" :class="{ on: filterKey === 'published' }" @click="applyFilter('published')">已发博客</button>
              <button type="button" class="f-btn" :class="{ on: filterKey === 'saved' }" @click="applyFilter('saved')">已入库</button>
            </div>
          </div>

          <div class="note-list-rows">
            <!-- 合蒸任务行：成功生成笔记后自动从该区消失，出现在下方文章列表 -->
            <div
              v-for="job in pipelineJobs"
              :key="`job-${job.jobId}`"
              class="list-row is-job"
              @click="openJob(job)"
            >
              <div class="lr-title">{{ jobTitle(job) }}</div>
              <div class="lr-right">
                <span class="lr-align" :class="{ warn: String(job.status || '').toUpperCase() === 'FAILED' }">
                  {{ isReadingJobInProgress(job) ? '进行中' : '失败' }}
                </span>
              </div>
              <div class="lr-meta">
                <span class="chip src mono">JOB-{{ job.jobId }}</span>
                <span class="chip" :class="String(job.status || '').toUpperCase() === 'FAILED' ? 'fail' : 'job'">
                  {{ jobStatusText(job) }}
                </span>
              </div>
            </div>

            <div
              v-for="row in dataSource"
              :key="String(row.id)"
              class="list-row"
              :class="{ selected: String(row.id) === String(selected?.id) }"
              @click="selectedId = row.id ?? null"
              @dblclick="openDetail(row.id)"
            >
              <div class="lr-title">{{ row.title || `文章 #${row.id}` }}</div>
              <div class="lr-right">
                <span class="lr-time">{{ formatTime(row.updateTime || row.createTime) }}</span>
              </div>
              <div class="lr-meta">
                <span class="chip src mono">{{ noteIdChip(row) }}</span>
                <span class="chip src">{{ sourceTypeLabel(row.sourceType) }}</span>
                <span class="chip" :class="pubChip(row).cls">{{ pubChip(row).text }}</span>
                <span class="chip" :class="idxChip(row).cls">{{ idxChip(row).text }}</span>
              </div>
            </div>

            <div v-if="!pipelineJobs.length && !dataSource.length && !loading" class="notes-empty">
              还没有文章 · 去采集台点「开始搜索」合蒸一篇
              <div style="margin-top: 10px">
                <button type="button" class="chip-btn sm primary" @click="router.push('/admin/knowledge/ingest')">
                  去采集
                </button>
              </div>
            </div>
          </div>

          <div class="pager">
            <span>共 <b>{{ total }}</b> 篇</span>
            <button type="button" class="page-btn" :disabled="(query.pageNum || 1) <= 1" @click="goPage((query.pageNum || 1) - 1)">‹</button>
            <button
              v-for="p in pageButtons"
              :key="p"
              type="button"
              class="page-btn"
              :class="{ on: p === query.pageNum }"
              @click="goPage(p)"
            >
              {{ p }}
            </button>
            <button type="button" class="page-btn" :disabled="(query.pageNum || 1) >= totalPages" @click="goPage((query.pageNum || 1) + 1)">›</button>
          </div>
        </main>

        <!-- 右栏：状态下拉筛选 + 标签/来源统计云 + 选中文章操作（详情/再蒸馏/删除） -->
        <aside class="deck" aria-label="笔记筛选栏">
          <div class="deck-panel glass">
            <span class="tape alt" />
            <h3 class="font-display">状态筛选</h3>
            <div class="col-stack">
              <select
                class="chip-btn sm"
                style="appearance: auto; width: 100%; text-align: left; padding: 0 12px"
                :value="query.publishStatus || ''"
                @change="onSelectChange($event, onPublishStatusChange)"
              >
                <option value="">发布：全部</option>
                <option value="NOT_PUBLISHED">未发布</option>
                <option value="DRAFT_CREATED">草稿已建</option>
                <option value="PUBLISHED">已发博客</option>
                <option value="SYNC_REQUIRED">需同步</option>
                <option value="SYNC_FAILED">同步失败</option>
              </select>
              <select
                class="chip-btn sm"
                style="appearance: auto; width: 100%; text-align: left; padding: 0 12px"
                :value="query.indexStatus || ''"
                @change="onSelectChange($event, onIndexStatusChange)"
              >
                <option value="">入库：全部</option>
                <option value="NOT_INDEXED">未入库</option>
                <option value="INDEXED">已入库</option>
                <option value="REINDEX_REQUIRED">需重建</option>
                <option value="INDEX_FAILED">入库失败</option>
              </select>
              <select
                class="chip-btn sm"
                style="appearance: auto; width: 100%; text-align: left; padding: 0 12px"
                :value="query.sourceType || ''"
                @change="onSelectChange($event, onSourceTypeChange)"
              >
                <option value="">来源：全部</option>
                <option value="URL">URL</option>
                <option value="FILE">文件</option>
                <option value="AGENT">合蒸</option>
              </select>
              <button v-if="hasActiveFilters" type="button" class="chip-btn sm" @click="clearFilters">清除筛选</button>
            </div>
          </div>

          <div class="deck-panel glass">
            <h3 class="font-display">标签统计</h3>
            <div v-if="tagStats.length" class="tag-cloud">
              <span v-for="t in tagStats" :key="t.name" class="t">{{ t.name }}<b>{{ t.count }}</b></span>
            </div>
            <div v-else-if="sourceStats.length" class="tag-cloud">
              <span v-for="t in sourceStats" :key="t.name" class="t">{{ t.name }}<b>{{ t.count }}</b></span>
            </div>
            <p v-else class="about">本页暂无标签</p>
          </div>

          <div class="deck-panel glass">
            <h3 class="font-display">操作</h3>
            <p class="about">选中后可打开审阅、再蒸馏或删除。</p>
            <div class="col-stack" style="margin-top: 8px">
              <button
                type="button"
                class="chip-btn sm primary"
                :disabled="!selected?.id"
                @click="openDetail(selected?.id)"
              >
                打开详情
              </button>
              <button
                type="button"
                class="chip-btn sm"
                :disabled="!selected"
                @click="selected && handleRedistill(selected)"
              >
                再蒸馏
              </button>
              <button
                type="button"
                class="chip-btn sm danger"
                :disabled="!selected"
                @click="selected && handleDelete(selected)"
              >
                删除
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </ReadingRoomShell>
</template>
