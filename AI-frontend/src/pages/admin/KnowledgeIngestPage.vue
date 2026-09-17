<script setup lang="ts">
/**
 * AI 精读 · 内容采集（V2：DeepSeek 搜索 + 合蒸一篇）
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { clearMaterialCache } from '@/api/learning'
import {
  getKnowledgeReadingJob,
  ingestKnowledgeBatchUrl,
  ingestKnowledgeFile,
  ingestKnowledgeUrl,
  submitKnowledgeReadingSearch,
} from '@/api/knowledge'
import {
  clearKnowledgeSearchDraft,
  isReadingJobAwaitingSelect,
  isReadingJobInProgress,
  isReadingJobSearching,
  loadKnowledgeSearchDraft,
  readingJobProgressLabel,
  readingJobWorkbenchStep,
  saveKnowledgeSearchDraft,
} from '@/composables/useKnowledgeSearchDraft'
import { recordReadingJob, updateReadingJob } from '@/composables/useReadingJobTracker'
import { isAllowedKbUploadFile, KB_UPLOAD_ACCEPT } from '@/utils/knowledgeFormat'
import {
  candidateHasRisk,
  formatIngestFailReason,
  formatSearchRiskFlag,
} from '@/utils/knowledgeSearchLabels'
import ReadingRoomShell from '@/components/reading/ReadingRoomShell.vue'

// 采集约束与节奏常量：单次合蒸上限 8 条，建议勾选 2～5 条，任务轮询间隔 2s
const BATCH_MAX = 8
const SELECT_HINT_MIN = 2
const SELECT_HINT_MAX = 5
const JOB_POLL_MS = 2000

const router = useRouter()
const route = useRoute()
// 当前采集模式：url（单链接精炼）/ file（本地文件）/ agent（搜索合蒸）
const activeTab = ref('url')
const submitting = ref(false)
const searchLoading = ref(false)
const batchLoading = ref(false)
/** 挂载恢复草稿期间跳过 watch 写回 */
const hydratingDraft = ref(true)
/** 本轮是否从 sessionStorage 恢复（用于提示） */
const draftRestored = ref(false)
/** 合蒸异步任务轮询 timer */
let jobPollTimer: ReturnType<typeof setInterval> | null = null
/** 当前轮询中的任务 ID（断线/切页回来后重新挂接） */
let activePollJobId: string | number | null = null
let reconnectNotified = false

// URL 模式表单：链接 + 可选标题/标签
const urlForm = reactive({
  url: '',
  title: '',
  tags: '',
})

// 文件模式表单：可选标题/标签（文件本体放在 selectedFile）
const fileForm = reactive({
  title: '',
  tags: '',
})
const fileList = ref<UploadProps['fileList']>([])
const selectedFile = ref<File | null>(null)

// 搜索合蒸模式表单：学习目标/偏好/标签/手动 URL/自定义精读 Prompt
const agentForm = reactive({
  goal: '',
  preference: '',
  tags: '',
  manualUrls: '',
  distillPrompt: '',
})
// 搜索阶段产出的大纲与候选网页，selectedUrls 为用户勾选的来源
const outline = ref('')
const candidates = ref<API.KnowledgeSearchCandidate[]>([])
const selectedUrls = ref<string[]>([])
const searchDone = ref(false)
// 合蒸异步任务快照（jobId/progress/noteId 等），驱动整个工作台状态机
const batchResult = ref<API.KnowledgeReadingJobVO | null>(null)
/** 组件是否仍挂载：离页后停止自动跳转详情，任务由服务端 + 任务页接续 */
let pageAlive = true

// 任务状态派生：是否进行中、进度文案、工作台步骤（1～4）、是否待勾选/搜索中/已成功
const batchJobInProgress = computed(() => isReadingJobInProgress(batchResult.value))
const batchProgressLabel = computed(() => readingJobProgressLabel(batchResult.value?.progress))
const workbenchStep = computed(() => readingJobWorkbenchStep(batchResult.value))
const awaitingSelect = computed(() => isReadingJobAwaitingSelect(batchResult.value))
const searchingJob = computed(() => isReadingJobSearching(batchResult.value))
const batchJobSucceeded = computed(() => {
  const data = batchResult.value
  if (!data || data.noteId == null) return false
  return data.success === true || String(data.status || '').toUpperCase() === 'SUCCESS'
})

/** 从任务快照恢复候选列表：默认勾选无风险来源（最多 5 条） */
function applyCandidatesFromJob(data: API.KnowledgeReadingJobVO) {
  if (data.outline) outline.value = data.outline
  if (Array.isArray(data.candidates) && data.candidates.length) {
    const list = data.candidates.filter((c) => !!c.url)
    candidates.value = list
    searchDone.value = true
    if (!selectedUrls.value.length) {
      const safe = list.filter((c) => !candidateHasRisk(c)).map((c) => c.url!)
      selectedUrls.value = safe.slice(0, SELECT_HINT_MAX)
    }
  }
}

/** 收集当前工作台全量状态，用于草稿持久化 */
function snapshotDraft() {
  return {
    goal: agentForm.goal,
    preference: agentForm.preference,
    tags: agentForm.tags,
    manualUrls: agentForm.manualUrls,
    distillPrompt: agentForm.distillPrompt,
    outline: outline.value,
    candidates: candidates.value,
    selectedUrls: selectedUrls.value,
    searchDone: searchDone.value,
    batchResult: batchResult.value,
    activeTab: activeTab.value,
  }
}

function persistDraftNow() {
  if (hydratingDraft.value) return
  saveKnowledgeSearchDraft(snapshotDraft())
}

function stopJobPoll() {
  if (jobPollTimer) {
    clearInterval(jobPollTimer)
    jobPollTimer = null
  }
  activePollJobId = null
}

function resetAgentDraftLocal() {
  stopJobPoll()
  agentForm.goal = ''
  agentForm.preference = ''
  agentForm.tags = ''
  agentForm.manualUrls = ''
  agentForm.distillPrompt = ''
  outline.value = ''
  candidates.value = []
  selectedUrls.value = []
  searchDone.value = false
  batchResult.value = null
  batchLoading.value = false
}

function clearAgentDraft() {
  clearKnowledgeSearchDraft()
  resetAgentDraftLocal()
  draftRestored.value = false
  message.success('已清空搜索草稿')
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersistDraft() {
  if (hydratingDraft.value) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistDraftNow()
  }, 300)
}

watch(
  [
    () => agentForm.goal,
    () => agentForm.preference,
    () => agentForm.tags,
    () => agentForm.manualUrls,
    () => agentForm.distillPrompt,
    outline,
    candidates,
    selectedUrls,
    searchDone,
    batchResult,
    activeTab,
  ],
  () => {
    if (!searchDone.value && batchResult.value == null) return
    schedulePersistDraft()
  },
  { deep: true },
)

onMounted(async () => {
  pageAlive = true
  window.addEventListener('online', onWindowOnline)
  document.addEventListener('visibilitychange', onWindowVisibility)
  activeTab.value = 'agent'
  const routeJobId = typeof route.query.jobId === 'string' ? route.query.jobId : null

  if (routeJobId) {
    hydratingDraft.value = false
    try {
      const res = await getKnowledgeReadingJob(routeJobId)
      if (res.data.code === 0 && res.data.data) {
        const data = res.data.data
        batchResult.value = data
        if (data.goal) agentForm.goal = data.goal
        else if (data.title) agentForm.goal = data.title
        const outcome = handleJobSnapshot(data, { navigateOnSuccess: false })
        if (outcome === 'continue') {
          startJobPoll(routeJobId, { navigateOnSuccess: false })
        }
        draftRestored.value = true
        return
      }
    } catch (e) {
      console.warn(apiErrorMessage(e, '恢复任务失败'))
    }
  }

  const draft = loadKnowledgeSearchDraft()
  if (draft) {
    agentForm.goal = draft.goal
    agentForm.preference = draft.preference
    agentForm.tags = draft.tags
    agentForm.manualUrls = draft.manualUrls
    agentForm.distillPrompt = draft.distillPrompt
    outline.value = draft.outline
    candidates.value = draft.candidates
    selectedUrls.value = draft.selectedUrls
    searchDone.value = draft.searchDone
    batchResult.value = draft.batchResult
    draftRestored.value = true
  }
  hydratingDraft.value = false
  const job = batchResult.value
  if (job?.jobId != null) {
    if (isReadingJobAwaitingSelect(job)) {
      applyCandidatesFromJob(job)
    } else if (isReadingJobInProgress(job) && !isReadingJobAwaitingSelect(job)) {
      startJobPoll(job.jobId, { navigateOnSuccess: false })
    }
  }
})

onBeforeUnmount(() => {
  pageAlive = false
  window.removeEventListener('online', onWindowOnline)
  document.removeEventListener('visibilitychange', onWindowVisibility)
  stopJobPoll()
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!hydratingDraft.value) {
    persistDraftNow()
  }
})

const selectedCount = computed(() => selectedUrls.value.length)

const candidateRowSelection = computed(() => ({
  selectedRowKeys: selectedUrls.value,
  onChange: (keys: (string | number)[]) => {
    const urls = keys.map(String)
    if (urls.length > BATCH_MAX) {
      message.warning(`最多勾选 ${BATCH_MAX} 条（去重后上限）`)
      selectedUrls.value = urls.slice(0, BATCH_MAX)
      return
    }
    selectedUrls.value = urls
  },
  getCheckboxProps: (record: API.KnowledgeSearchCandidate) => ({
    disabled: !record.url,
  }),
}))

const feedbackMode = computed(() => {
  if (batchJobSucceeded.value) return 'success'
  if (batchResult.value && String(batchResult.value.status || '').toUpperCase() === 'FAILED') {
    return 'fail'
  }
  // 待勾选：显示候选，不锁在 progress
  if (awaitingSelect.value || (searchDone.value && candidates.value.length && !batchLoading.value)) {
    return 'candidates'
  }
  if (searchingJob.value || batchLoading.value) return 'progress'
  if (batchJobInProgress.value && !awaitingSelect.value) return 'progress'
  if (searchDone.value) return 'candidates'
  return 'idle'
})

const toggleCandidate = (url?: string) => {
  if (!url) return
  if (selectedUrls.value.includes(url)) {
    selectedUrls.value = selectedUrls.value.filter((item) => item !== url)
    return
  }
  if (selectedUrls.value.length >= BATCH_MAX) {
    message.warning(`最多勾选 ${BATCH_MAX} 条（去重后上限）`)
    return
  }
  selectedUrls.value = [...selectedUrls.value, url]
}

const apiErrorMessage = (e: unknown, fallback: string) => {
  const err = e as {
    message?: string
    response?: { data?: { message?: string; code?: number } }
  }
  return err?.response?.data?.message || err?.message || fallback
}

const goDetail = (noteId?: number | string | null) => {
  if (noteId == null) {
    message.error('未返回精读 ID')
    return
  }
  router.push(`/admin/knowledge/notes/${noteId}`)
}

/** URL 模式：抓取单个网页正文并精炼为精读笔记，成功后跳详情页 */
const submitUrl = async (sourceType: 'URL' | 'AGENT' = 'URL') => {
  if (!urlForm.url.trim()) {
    message.warning('请填写文章 URL')
    return
  }
  if (submitting.value) return
  submitting.value = true
  const hide = message.loading('正在抓取并精炼，可能需要一两分钟…', 0)
  try {
    const res = await ingestKnowledgeUrl({
      url: urlForm.url.trim(),
      title: urlForm.title.trim() || undefined,
      tags: urlForm.tags.trim() || undefined,
      sourceType,
    })
    if (res.data.code === 0 && res.data.data?.note?.id != null) {
      message.success('精炼完成')
      goDetail(res.data.data.note.id)
    } else {
      message.error(res.data.message || '精炼失败')
    }
  } catch (e) {
    message.error(apiErrorMessage(e, '精炼超时或失败'))
  } finally {
    hide()
    submitting.value = false
  }
}

/** 上传前置校验：类型/大小不符合要求直接拦截；返回 false 阻止组件自动上传 */
const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  const check = isAllowedKbUploadFile(file as File)
  if (!check.ok) {
    message.error(check.message || '文件不符合要求')
    return false
  }
  selectedFile.value = file as File
  fileList.value = [
    {
      uid: String(Date.now()),
      name: file.name,
      status: 'done',
    },
  ]
  if (!fileForm.title) fileForm.title = file.name
  return false
}

const removeFile = () => {
  selectedFile.value = null
  fileList.value = []
}

/** 文件模式：上传本地文件（PDF/DOCX/TXT/MD）并由后端提取精炼 */
const submitFile = async () => {
  if (!selectedFile.value) {
    message.warning('请先选择本地文件（PDF / DOCX / TXT / Markdown）')
    return
  }
  if (submitting.value) return
  submitting.value = true
  const hide = message.loading('正在上传并精炼，可能需要一两分钟…', 0)
  try {
    const res = await ingestKnowledgeFile(selectedFile.value, {
      title: fileForm.title.trim() || undefined,
      tags: fileForm.tags.trim() || undefined,
    })
    if (res.data.code === 0 && res.data.data?.note?.id != null) {
      message.success('精炼完成')
      goDetail(res.data.data.note.id)
    } else {
      message.error(res.data.message || '上传精炼失败')
    }
  } catch (e) {
    message.error(apiErrorMessage(e, '上传精炼超时或失败'))
  } finally {
    hide()
    submitting.value = false
  }
}

const selectedRiskyCount = computed(
  () =>
    candidates.value.filter(
      (c) => c.url && selectedUrls.value.includes(c.url) && candidateHasRisk(c),
    ).length,
)

/** 搜索候选：异步建 Job，立刻可跟踪 */
const searchCandidates = async () => {
  if (!agentForm.goal.trim()) {
    message.warning('请填写学习目标')
    return
  }
  stopJobPoll()
  searchLoading.value = true
  batchLoading.value = true
  batchResult.value = null
  candidates.value = []
  selectedUrls.value = []
  searchDone.value = false
  draftRestored.value = false
  try {
    const res = await submitKnowledgeReadingSearch({
      goal: agentForm.goal.trim(),
      preference: agentForm.preference.trim() || undefined,
    })
    const jobId = res.data.data?.jobId ?? null
    if (res.data.code === 0 && jobId != null && res.data.data) {
      const data = res.data.data
      batchResult.value = data
      recordReadingJob({
        jobId,
        title: agentForm.goal.trim() || data.title || `任务 #${data.jobId}`,
        status: data.status,
        progress: data.progress,
      })
      message.info('已创建任务，可在「我的文章」中跟踪；也可留在本页等待候选', 4)
      activeTab.value = 'agent'
      startJobPoll(jobId, { navigateOnSuccess: false })
    } else {
      searchLoading.value = false
      batchLoading.value = false
      message.error(res.data.message || '创建搜索任务失败')
    }
  } catch (e) {
    searchLoading.value = false
    batchLoading.value = false
    message.error(apiErrorMessage(e, '创建搜索任务失败'))
  } finally {
    searchLoading.value = false
  }
}

/** 将手动粘贴 URL 追加进候选并勾选 */
const appendManualCandidates = () => {
  const lines = agentForm.manualUrls
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) {
    message.warning('请先粘贴至少一个 URL（每行一个）')
    return
  }
  const existing = new Set(candidates.value.map((c) => c.url).filter(Boolean) as string[])
  const added: API.KnowledgeSearchCandidate[] = []
  for (const url of lines) {
    if (existing.has(url)) continue
    existing.add(url)
    added.push({
      url,
      title: url,
      summary: '手动添加',
      source: 'manual',
      recommendReason: '手动粘贴',
    })
  }
  if (!added.length) {
    message.info('这些 URL 已在候选列表中')
    return
  }
  candidates.value = [...candidates.value, ...added]
  const nextKeys = [...selectedUrls.value]
  for (const c of added) {
    if (c.url && nextKeys.length < BATCH_MAX) nextKeys.push(c.url)
  }
  selectedUrls.value = nextKeys
  searchDone.value = true
  message.success(`已追加 ${added.length} 条`)
}

/** 任务成功收尾：合并来源统计提示，并按需自动跳转笔记详情 */
const applyJobSuccess = (data: API.KnowledgeReadingJobVO, navigate: boolean) => {
  batchResult.value = data
  draftRestored.value = false
  const used = data.usedCount ?? 0
  const fail = data.failCount ?? 0
  if (data.warning) {
    message.warning(data.warning, 5)
  }
  const ok =
    data.noteId != null &&
    (data.success === true || String(data.status || '').toUpperCase() === 'SUCCESS')
  if (ok) {
    if (fail > 0) {
      message.warning(`已合并生成 1 篇精读（采用 ${used} 源，失败 ${fail} 源）`, 4)
    } else {
      message.success(`已合并生成 1 篇精读（${used} 个来源）`)
    }
    for (const src of data.failedSources || []) {
      const code = src.reasonCode ? `[${formatIngestFailReason(src.reasonCode)}] ` : ''
      message.error(`来源失败：${src.url} — ${code}${src.errorMessage || '未知错误'}`, 4)
    }
    if (navigate && pageAlive) goDetail(data.noteId)
  } else {
    message.error(data.errorMsg || '合并精炼失败（全部来源失败）')
  }
}

const applyJobFailure = (data: API.KnowledgeReadingJobVO) => {
  batchResult.value = data
  draftRestored.value = false
  message.error(data.errorMsg || '合蒸任务失败')
}

/** 处理一次 job 快照：终态停轮询；待勾选停轮询并填候选；搜索/合蒸中继续 */
const handleJobSnapshot = (
  data: API.KnowledgeReadingJobVO,
  opts: { navigateOnSuccess: boolean },
): 'continue' | 'done' | 'await_select' => {
  batchResult.value = data
  if (data.jobId != null) {
    updateReadingJob(data.jobId, {
      status: data.status,
      progress: data.progress,
      noteId: data.noteId,
      success: data.success,
      errorMsg: data.errorMsg,
      title: data.title || undefined,
      total: data.total,
    })
  }
  const status = String(data.status || '').toUpperCase()
  const progress = String(data.progress || '').toUpperCase()

  if (status === 'SUCCESS' || (data.success && data.noteId != null && status !== 'FAILED')) {
    stopJobPoll()
    batchLoading.value = false
    searchLoading.value = false
    applyJobSuccess(data, opts.navigateOnSuccess)
    return 'done'
  }
  if (status === 'FAILED') {
    stopJobPoll()
    batchLoading.value = false
    searchLoading.value = false
    applyJobFailure(data)
    return 'done'
  }
  if (status === 'WAITING' || progress === 'AWAITING_SELECT') {
    stopJobPoll()
    batchLoading.value = false
    searchLoading.value = false
    applyCandidatesFromJob(data)
    if (!candidates.value.length) {
      message.warning('搜索完成但未返回候选，可手动粘贴 URL 后生成文章')
    } else {
      message.success(`已找到 ${candidates.value.length} 条候选，请勾选后生成文章`)
    }
    return 'await_select'
  }
  if (progress === 'SEARCHING') {
    batchLoading.value = true
    searchLoading.value = true
    return 'continue'
  }
  if (status === 'PENDING' || status === 'RUNNING' || isReadingJobInProgress(data)) {
    batchLoading.value = true
    return 'continue'
  }
  if (data.noteId != null && data.success) {
    stopJobPoll()
    batchLoading.value = false
    applyJobSuccess(data, opts.navigateOnSuccess)
    return 'done'
  }
  return 'continue'
}

/** 单次轮询任务状态；失败仅告警不终止，等待下一轮 */
const pollJobOnce = async (jobId: number | string, opts: { navigateOnSuccess: boolean }) => {
  try {
    const res = await getKnowledgeReadingJob(jobId)
    if (res.data.code === 0 && res.data.data) {
      handleJobSnapshot(res.data.data, opts)
    } else {
      message.error(res.data.message || '查询合蒸任务失败')
    }
  } catch (e) {
    // 单次轮询失败不立刻终止，下一次再试；连续失败由用户看进度区
    console.warn(apiErrorMessage(e, '轮询合蒸任务失败'))
  }
}

/** 启动定时轮询：立即查一次，随后每 2s 拉取任务快照 */
const startJobPoll = (jobId: number | string, opts: { navigateOnSuccess: boolean }) => {
  stopJobPoll()
  activePollJobId = jobId
  batchLoading.value = true
  void pollJobOnce(jobId, opts)
  jobPollTimer = setInterval(() => {
    void pollJobOnce(jobId, opts)
  }, JOB_POLL_MS)
}

/** 断线/切页恢复：重新挂接进行中的 job（轮询兜底，不依赖 SSE） */
const resumeJobPollIfNeeded = () => {
  if (!pageAlive || jobPollTimer) return
  const job = batchResult.value
  const jobId = activePollJobId ?? job?.jobId ?? null
  if (jobId != null && isReadingJobInProgress(job) && !isReadingJobAwaitingSelect(job)) {
    startJobPoll(jobId, { navigateOnSuccess: false })
    if (!reconnectNotified) {
      reconnectNotified = true
      message.info('网络已恢复，正在重新连接进行中的任务…', 3)
      setTimeout(() => {
        reconnectNotified = false
      }, 6000)
    }
  }
}

const onWindowOnline = () => resumeJobPollIfNeeded()

const onWindowVisibility = () => {
  if (document.visibilityState === 'visible') resumeJobPollIfNeeded()
}

async function refreshMaterialCache() {
  Modal.confirm({
    title: '强制刷新材料缓存',
    content:
      '将清空 30 天材料包缓存（learning:material:*）。下次采集同一 URL 会重新读取网页，可能更慢、多烧一次模型。确定？',
    okText: '清空并刷新',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await clearMaterialCache()
        if (res.data.code === 0) {
          message.success(`已清空材料缓存（${res.data.data ?? 0} 条）`)
        } else {
          message.error(res.data.message || '清空材料缓存失败')
          return Promise.reject(new Error(res.data.message || 'clear failed'))
        }
      } catch (e) {
        message.error(String((e as Error)?.message || '清空材料缓存失败'))
        return Promise.reject(e)
      }
    },
  })
}

/** 合蒸主流程：去重校验 → 提交勾选来源 → 建任务/复用待勾选任务 → 轮询跟踪 */
const runBatchIngest = async (urls: string[]) => {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))]
  if (!unique.length) {
    message.warning('请至少勾选一条候选')
    return
  }
  if (unique.length > BATCH_MAX) {
    message.warning(`最多 ${BATCH_MAX} 条，请减少勾选`)
    return
  }
  if (unique.length < SELECT_HINT_MIN || unique.length > SELECT_HINT_MAX) {
    message.info(
      `建议勾选 ${SELECT_HINT_MIN}～${SELECT_HINT_MAX} 条；当前 ${unique.length} 条，将合蒸为 1 篇精读`,
    )
  }
  if (selectedRiskyCount.value > 0) {
    message.warning(
      `当前勾选含 ${selectedRiskyCount.value} 条风险来源（课程页/登录墙等），合蒸时可能被质量门拒绝`,
      4,
    )
  }
  stopJobPoll()
  batchLoading.value = true
  try {
    const reuseJobId = batchResult.value?.jobId
    const res = await ingestKnowledgeBatchUrl({
      urls: unique,
      sourceType: 'AGENT',
      agentQuery: agentForm.goal.trim() || undefined,
      distillPrompt: agentForm.distillPrompt.trim() || undefined,
      tags: agentForm.tags.trim() || undefined,
      jobId: isReadingJobAwaitingSelect(batchResult.value) ? reuseJobId ?? undefined : undefined,
    })
    if (res.data.code === 0 && res.data.data) {
      const data = res.data.data
      if (data.jobId != null) {
        recordReadingJob({
          jobId: data.jobId,
          title: agentForm.goal.trim() || data.title || `任务 #${data.jobId}`,
          total: data.total ?? unique.length,
          status: data.status,
          progress: data.progress,
          noteId: data.noteId,
          success: data.success,
        })
      }
      const outcome = handleJobSnapshot(data, { navigateOnSuccess: true })
      if (outcome === 'continue' && data.jobId != null) {
        message.info('正在合并网页生成文章，可离开本页查看进度', 3)
        startJobPoll(data.jobId, { navigateOnSuccess: true })
      } else if (outcome === 'continue' && data.jobId == null) {
        batchLoading.value = false
        message.error('未返回任务 ID，无法跟踪合蒸进度')
      }
    } else {
      batchLoading.value = false
      message.error(res.data.message || '合并精炼失败')
    }
  } catch (e) {
    batchLoading.value = false
    message.error(apiErrorMessage(e, '合并精炼超时或失败'))
  }
}

const submitBatch = () => runBatchIngest(selectedUrls.value)

/** 去掉失败源后按当前勾选重新合并 */
const retryMergeWithoutFailed = () => {
  const failed = new Set(
    (batchResult.value?.failedSources || []).map((s) => s.url).filter(Boolean) as string[],
  )
  const next = selectedUrls.value.filter((u) => !failed.has(u))
  if (!next.length) {
    message.warning('没有可合并的成功候选，请重新勾选')
    return
  }
  selectedUrls.value = next
  runBatchIngest(next)
}
</script>

<template>
  <ReadingRoomShell>
    <section id="page-ingest" class="ingest-page" aria-label="内容采集">
      <div class="page-title">
        <h1 class="font-display">内容采集</h1>
        <span class="sub">搜索 → 勾选网页 → 生成一篇 Markdown → 去审阅</span>
      </div>

      <div class="layout-3 ingest-layout">
      <!-- 左栏：流水线步骤 / 当前模式 / 本轮任务日志 -->
      <aside class="side anim" style="animation-delay: 0.06s">
        <div class="side-card glass">
          <span class="tape"></span>
          <h3 class="font-display">流水线</h3>
          <ol class="pipe-steps">
            <li :class="{ on: workbenchStep === 1, done: workbenchStep > 1 }">
              <span class="n">01</span>目标
            </li>
            <li :class="{ on: workbenchStep === 2, done: workbenchStep > 2 }">
              <span class="n">02</span>候选
            </li>
            <li :class="{ on: workbenchStep === 3, done: workbenchStep > 3 }">
              <span class="n">03</span>勾选
            </li>
            <li :class="{ on: workbenchStep >= 4, done: batchJobSucceeded }">
              <span class="n">04</span>生成
            </li>
          </ol>
        </div>
        <div class="side-card glass">
          <h3 class="font-display">当前模式</h3>
          <p class="about text-pretty">
            {{
              activeTab === 'agent'
                ? '搜索 → 勾选 → 合蒸一篇'
                : activeTab === 'url'
                  ? 'URL：抓取网页正文并精炼'
                  : '文件：提取本地文本并精炼'
            }}
          </p>
        </div>
        <div class="side-card glass">
          <h3 class="font-display">本轮</h3>
          <div class="log-list">
            <div class="log-line">
              <span class="t">MODE</span><span class="m">{{ activeTab }}</span><span class="dot"></span>
            </div>
            <div class="log-line mint">
              <span class="t">SRC</span><span class="m">候选 · {{ candidates.length }}</span><span class="dot"></span>
            </div>
            <div class="log-line sun">
              <span class="t">JOB</span
              ><span class="m">{{
                batchResult?.jobId != null ? `#${batchResult.jobId} · ${batchProgressLabel}` : '待命'
              }}</span
              ><span class="dot"></span>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中栏：模式切换 + 三种输入面板（URL / 文件 / 搜索合蒸，按 activeTab 条件渲染） -->
      <main class="mid-bay anim" style="animation-delay: 0.14s">
        <div class="ingest-top">
          <div class="ingest-controls">
            <div class="band mode-bar" role="tablist" aria-label="采集模式">
              <button
                v-for="mode in [
                  { key: 'url', label: 'URL' },
                  { key: 'file', label: '文件' },
                  { key: 'agent', label: '搜索合蒸' },
                ]"
                :key="mode.key"
                type="button"
                :class="{ on: activeTab === mode.key }"
                @click="activeTab = mode.key"
              >
                {{ mode.label }}
              </button>
            </div>
            <div class="band input-card glass">
              <div class="head">
                <h2 class="font-display">
                  {{
                    activeTab === 'agent'
                      ? '告诉 AI'
                      : activeTab === 'url'
                        ? '贴入链接'
                        : '送入文件'
                  }}
                </h2>
                <span class="cap">INPUT · COMPACT</span>
              </div>
              <div v-if="activeTab === 'url'" class="field on">
                <label for="ingest-url">文章 URL</label
                ><input
                  id="ingest-url"
                  v-model="urlForm.url"
                  class="inp"
                  type="url"
                  placeholder="https://example.com/article"
                  @keyup.enter="submitUrl('URL')"
                />
                <div class="row">
                  <input v-model="urlForm.title" class="inp" placeholder="标题（可选）" /><input
                    v-model="urlForm.tags"
                    class="inp"
                    placeholder="标签（可选）"
                  />
                </div>
                <div class="actions">
                  <button
                    class="chip-btn primary font-display"
                    type="button"
                    :disabled="submitting"
                    @click="submitUrl('URL')"
                  >
                    {{ submitting ? '精炼中…' : '开始精炼' }}
                  </button>
                </div>
              </div>
              <div v-else-if="activeTab === 'file'" class="field on">
                <label>本地文件</label
                ><a-upload-dragger
                  :accept="KB_UPLOAD_ACCEPT"
                  :before-upload="beforeUpload"
                  :file-list="fileList"
                  :max-count="1"
                  class="dropzone"
                  @remove="removeFile"
                  ><strong>点击或拖拽上传</strong
                  ><span>PDF / DOCX / TXT / Markdown</span></a-upload-dragger
                >
                <div class="row">
                  <input v-model="fileForm.title" class="inp" placeholder="标题（可选）" /><input
                    v-model="fileForm.tags"
                    class="inp"
                    placeholder="标签（可选）"
                  />
                </div>
                <div class="actions">
                  <button
                    class="chip-btn primary font-display"
                    type="button"
                    :disabled="submitting || !selectedFile"
                    @click="submitFile"
                  >
                    {{ submitting ? '上传中…' : '上传并精炼' }}
                  </button>
                </div>
              </div>
              <div v-else class="field on">
                <label for="ingest-goal">学习目标</label
                ><input
                  id="ingest-goal"
                  v-model="agentForm.goal"
                  class="inp"
                  placeholder="例如：我想学 Spring Security 6"
                  @keyup.enter="searchCandidates"
                />
                <div class="row">
                  <input
                    v-model="agentForm.preference"
                    class="inp"
                    placeholder="偏好说明（可选）"
                  /><input v-model="agentForm.tags" class="inp" placeholder="标签（可选）" />
                </div>
                <label for="ingest-prompt">精读 Prompt（可选）</label
                ><textarea
                  id="ingest-prompt"
                  v-model="agentForm.distillPrompt"
                  class="area"
                  placeholder="留空则使用站点 distill.system_prompt"
                ></textarea>
                <div class="actions">
                  <button
                    class="chip-btn primary font-display"
                    type="button"
                    :disabled="searchLoading || searchingJob"
                    @click="searchCandidates"
                  >
                    {{ searchLoading || searchingJob ? '搜索中…' : '开始搜索' }}</button
                  ><button
                    class="chip-btn"
                    type="button"
                    :disabled="!selectedCount || batchLoading || searchingJob"
                    @click="submitBatch"
                  >
                    {{ batchLoading && !searchingJob ? '生成中…' : `生成文章（${selectedCount}）` }}</button
                  ><button
                    v-if="searchDone || batchResult"
                    class="chip-btn sm danger"
                    type="button"
                    @click="clearAgentDraft"
                  >
                    清空草稿
                  </button>
                </div>
              </div>
              <p v-if="activeTab === 'agent' && draftRestored" class="draft-notice">
                已恢复搜索草稿与候选勾选。
              </p>
            </div>
            <div v-if="activeTab === 'agent'" class="band work-bar glass">
              <span class="meta"
                >已选 <b>{{ selectedCount }}</b> / 建议 {{ SELECT_HINT_MIN }}～{{
                  SELECT_HINT_MAX
                }}
                · 上限 {{ BATCH_MAX }}</span
              ><span v-if="selectedRiskyCount" class="warn"
                >{{ selectedRiskyCount }} 条风险来源</span
              ><span v-if="batchJobInProgress && !awaitingSelect" class="job-chip"
                ><i></i>{{ batchProgressLabel }}</span
              ><button
                class="chip-btn sm primary"
                type="button"
                :disabled="!selectedCount || searchingJob || (batchLoading && !awaitingSelect)"
                @click="submitBatch"
              >
                生成文章
              </button>
            </div>
          </div>
        </div>

        <!-- 反馈区：按 feedbackMode 在 空态引导/候选列表/进度/成功/失败 五种面板间切换 -->
        <div class="ingest-bottom">
          <section class="band feedback glass">
            <div class="fb-head">
              <h3 class="font-display">
                {{
                  feedbackMode === 'progress'
                    ? '合蒸进度'
                    : feedbackMode === 'success'
                      ? '精读已生成'
                      : feedbackMode === 'fail'
                        ? '合蒸结果'
                        : '搜索候选'
                }}
              </h3>
              <span class="hint"
                >建议 {{ SELECT_HINT_MIN }}～{{ SELECT_HINT_MAX }} 条 · 限 {{ BATCH_MAX }} 条</span
              >
            </div>
            <div class="fb-body">
              <div v-if="feedbackMode === 'idle'" class="fb-panel on">
                <div class="idle-box">
                  <div class="step">
                    <div class="n">01</div>
                    <div class="t">写学习目标，或贴 URL / 文件</div>
                  </div>
                  <div class="step">
                    <div class="n">02</div>
                    <div class="t">搜索候选网页</div>
                  </div>
                  <div class="step">
                    <div class="n">03</div>
                    <div class="t">勾选 2～5 条来源</div>
                  </div>
                  <div class="step">
                    <div class="n">04</div>
                    <div class="t">合蒸一篇 Markdown 再去审阅</div>
                  </div>
                </div>
              </div>
              <div v-else-if="feedbackMode === 'candidates'" class="fb-panel on">
                <pre v-if="outline" class="outline-box">{{ outline }}</pre>
                <div v-if="!candidates.length" class="empty-copy">
                  暂无候选。请检查 DeepSeek Key，或手动追加 URL。
                </div>
                <label
                  v-for="candidate in candidates"
                  :key="candidate.url"
                  class="cand"
                  :class="{
                    on: candidate.url && selectedUrls.includes(candidate.url),
                    risk: candidateHasRisk(candidate),
                  }"
                  ><input
                    class="ck"
                    type="checkbox"
                    :checked="!!candidate.url && selectedUrls.includes(candidate.url)"
                    :disabled="!candidate.url"
                    @change="toggleCandidate(candidate.url)"
                  /><span
                    ><span class="title">{{ candidate.title || candidate.url }}</span
                    ><span class="sum">{{ candidate.summary || '暂无摘要' }}</span
                    ><span class="meta"
                      ><span class="tag src">{{ candidate.source || 'web' }}</span
                      ><span v-for="flag in candidate.riskFlags" :key="flag" class="tag risk">{{
                        formatSearchRiskFlag(flag)
                      }}</span></span
                    ><span class="reason">{{ candidate.recommendReason }}</span></span
                  ><a
                    class="url"
                    :href="candidate.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click.stop
                    >查看来源</a
                  ></label
                >
                <div class="cand cand-manual">
                  <span class="ck">+</span>
                  <div>
                    <div class="title">手动追加 URL</div>
                    <div class="hint-open">每行一个链接，将自动勾选</div>
                    <textarea
                      v-model="agentForm.manualUrls"
                      class="area"
                      rows="3"
                      placeholder="https://docs.spring.io/...&#10;https://..."
                    ></textarea>
                    <div class="actions">
                      <button class="chip-btn sm" type="button" @click="appendManualCandidates">
                        追加到候选并勾选
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else-if="feedbackMode === 'progress'" class="fb-panel on">
                  <div class="progress-steps">
                  <div class="s" :class="{ done: workbenchStep > 1, on: workbenchStep === 1 }">
                    <div class="n">01</div>
                    <div class="v">搜索</div>
                  </div>
                  <div class="s" :class="{ done: workbenchStep > 2, on: workbenchStep === 2 }">
                    <div class="n">02</div>
                    <div class="v">候选</div>
                  </div>
                  <div class="s" :class="{ done: workbenchStep > 3, on: workbenchStep === 3 }">
                    <div class="n">03</div>
                    <div class="v">勾选</div>
                  </div>
                  <div class="s" :class="{ done: workbenchStep >= 4, on: workbenchStep === 4 }">
                    <div class="n">04</div>
                    <div class="v">生成文章</div>
                  </div>
                </div>
                <p class="about">
                  {{ batchProgressLabel }}。{{
                    batchResult?.jobId != null
                      ? `任务 #${batchResult.jobId}，可离开本页，稍后回来继续。`
                      : '正在提交任务…'
                  }}
                </p>
              </div>
              <div v-else-if="feedbackMode === 'success' && batchResult" class="fb-panel on">
                <div class="result-card">
                  <div class="t font-display">
                    {{ batchResult.title || `精读笔记 #${batchResult.noteId}` }}
                  </div>
                  <div class="m">
                    已采用 {{ batchResult.usedCount ?? 0 }} 源合蒸 1 篇 · 失败
                    {{ batchResult.failCount ?? 0 }} 源
                  </div>
                  <div class="actions">
                    <button
                      class="chip-btn primary sm"
                      type="button"
                      @click="goDetail(batchResult.noteId)"
                    >
                      打开详情</button
                    ><button
                      class="chip-btn sm"
                      type="button"
                      @click="
                        router.push(`/admin/knowledge/notes/${batchResult.noteId}?action=publish`)
                      "
                    >
                      去发博客</button
                    ><button
                      class="chip-btn sm"
                      type="button"
                      @click="
                        router.push(`/admin/knowledge/notes/${batchResult.noteId}?action=index`)
                      "
                    >
                      去入知识库
                    </button>
                  </div>
                </div>
                <div v-if="(batchResult.usedSources || []).length" class="source-summary">
                  <b>采用来源</b
                  ><span v-for="source in batchResult.usedSources" :key="source.url">{{
                    source.title || source.url
                  }}</span>
                </div>
              </div>
              <div v-else-if="batchResult" class="fb-panel on">
                <div class="result-card">
                  <div class="t font-display">合蒸未完成</div>
                  <div class="m">
                    {{ batchResult.errorMsg || batchResult.warning || '部分来源未能通过质量门。' }}
                  </div>
                  <div class="fail-list">
                    <div
                      v-for="source in batchResult.failedSources || []"
                      :key="source.url"
                      class="f"
                    >
                      [{{ formatIngestFailReason(source.reasonCode) }}] {{ source.url }} —
                      {{ source.errorMessage || '未知错误' }}
                    </div>
                  </div>
                  <div class="actions">
                    <button
                      v-if="(batchResult.failedSources || []).length"
                      class="chip-btn primary sm"
                      type="button"
                      :disabled="batchLoading"
                      @click="retryMergeWithoutFailed"
                    >
                      去掉失败源重试
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <!-- 右栏：本轮统计 / 快捷入口（我的文章、精读设置、清缓存）/ 最近任务 -->
      <aside class="deck anim" style="animation-delay: 0.22s">
        <div class="deck-panel glass">
          <span class="tape alt"></span>
          <h3 class="font-display">概览</h3>
          <div class="stat-row">
            <div class="stat-pill">
              <div class="n">{{ candidates.length }}</div>
              <div class="l">本轮候选</div>
            </div>
            <div class="stat-pill">
              <div class="n">{{ selectedCount }}</div>
              <div class="l">已选来源</div>
            </div>
          </div>
        </div>
        <div class="deck-panel glass">
          <h3 class="font-display">快捷</h3>
          <div class="col-stack">
            <button
              class="chip-btn sm"
              type="button"
              @click="router.push('/admin/knowledge/notes')"
            >
              我的文章</button
            ><button
              class="chip-btn sm"
              type="button"
              @click="router.push('/admin/settings/reading')"
            >
              精读设置
            </button>
            <button
              class="chip-btn sm"
              type="button"
              @click="refreshMaterialCache"
            >
              强制刷新材料缓存
            </button>
          </div>
        </div>
        <div class="deck-panel glass">
          <h3 class="font-display">最近源</h3>
          <div class="recent-line">
            <div class="k">MODE</div>
            {{
              activeTab === 'agent'
                ? agentForm.goal || '等待学习目标'
                : activeTab === 'url'
                  ? urlForm.url || '等待链接'
                  : selectedFile?.name || '等待文件'
            }}
          </div>
          <div v-if="batchResult?.jobId != null" class="recent-line">
            <div class="k">JOB</div>
            #{{ batchResult.jobId }} · {{ batchProgressLabel }}
          </div>
        </div>
        <div class="cta-foot">
          <div>
            <div class="lbl font-display">我的文章</div>
            <div class="sub">审阅已生成的精读</div>
          </div>
          <button
            class="chip-btn primary sm"
            type="button"
            @click="router.push('/admin/knowledge/notes')"
          >
            →
          </button>
        </div>
      </aside>
      </div>
    </section>
  </ReadingRoomShell>
</template>

<style scoped>
#page-ingest {
  min-height: 0;
}
.field .dropzone :deep(.ant-upload) {
  padding: 0;
  color: inherit;
}
.field .dropzone :deep(.ant-upload-drag) {
  border: 0;
  background: transparent;
  padding: 0;
}
.field .dropzone :deep(.ant-upload-list) {
  text-align: left;
  margin-top: 8px;
}
.field .dropzone span {
  display: block;
}
.draft-notice {
  margin: 10px 0 0;
  font-size: 12px;
  color: #2a8a6e;
}
.empty-copy {
  padding: 24px;
  text-align: center;
  color: var(--ink-faint);
}
.source-summary {
  display: grid;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--ink-soft);
}
.source-summary span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cand .title,
.cand .sum,
.cand .reason {
  display: block;
}
.cand .area {
  margin-top: 8px;
  width: 100%;
}
@media (max-width: 1100px) {
  #page-ingest {
    overflow: auto;
  }
  #page-ingest .shell {
    grid-template-columns: 220px minmax(560px, 1fr) 240px;
  }
}
</style>
