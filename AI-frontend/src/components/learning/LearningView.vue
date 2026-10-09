<script setup lang="ts">
/**
 * 领域知识树学习工作台（Learning 主视图）
 * 三栏布局：左侧领域切换与树脉日志、中间知识树（枝）+ 内容面板（叶/门闩提问）、
 * 右侧当前枝摘要与领域星图。
 * 核心业务流：门闩提问（gate）→ 搜文/批量 URL 合蒸（异步 job 轮询）→ 挂叶确认，
 * 另有树的编辑（改名/合并/删除/建枝）、空枝补学、AI 复习自测题、快捷键盘流与断线恢复轮询。
 * 状态主要集中在 useLearningWorkbenchStore，本组件负责编排与弹窗交互。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Modal } from 'ant-design-vue'
import { message } from 'ant-design-vue'
import { Plus, FolderTree, Share2, Paperclip, Pencil, GraduationCap } from 'lucide-vue-next'
import type { GateResponse, LearningReviewQuizVO } from '@/api/learning.types'
import type { LearningBranchTreeNode, LearningLeafVO, AttachRequest } from '@/api/learning.types'
import * as learningKnowledgeApi from '@/api/knowledge'
import { getBranchReviewQuiz } from '@/api/learning'
import DomainTree from './DomainTree.vue'
import ContentPanel from './ContentPanel.vue'
import AttachConfirm from './AttachConfirm.vue'
import ReattachNotesModal from './ReattachNotesModal.vue'
import TreeVizOverlay from './TreeVizOverlay.vue'
import IconAction from '@/components/ui/IconAction.vue'
import { useLearningWorkbenchStore } from '@/stores/learning-workbench.store'
import ReadingRoomShell from '@/components/reading/ReadingRoomShell.vue'

import '@/assets/learning-tokens.css'
import './learning-view.css'

const router = useRouter()
const store = useLearningWorkbenchStore()
// 内容面板引用：用于快捷键 "/" 时聚焦其提问输入框
const contentPanelRef = ref<InstanceType<typeof ContentPanel> | null>(null)

// 触发 DomainTree 进入“新建 L1 枝”输入态的开关（由工具栏按钮置起、由树组件回写复位）
const createL1Trigger = ref(false)

// ── computed bindings ──
const currentDomainId = computed({
  get: () => store.currentDomainId,
  set: (v: number | string | null) => store.setCurrentDomainId(v),
})

const currentDomainName = computed(() => store.currentDomainName)
const treeLoading = computed(() => store.treeLoading)
const branches = computed<LearningBranchTreeNode[]>(() => store.branches)
const snapshotTruncated = computed(() => store.snapshotTruncated)
const snapshotMessage = computed(() => store.snapshotMessage)

const selectedBranchId = computed(() => store.selectedBranchId)
const selectedBranchTitle = computed(() => store.selectedBranchTitle)
const selectedBranch = computed(() => store.selectedBranch)
const selectedBranchDepth = computed(() => selectedBranch.value?.depth ?? null)
const selectedBranchLeafCount = computed(() => selectedBranch.value?.leafCount ?? branchLeaves.value.length)
const branchDensity = computed(() => {
  // 以挂载叶最多的枝为满格基准，取前 5 条生成右侧“叶密度”柱状条的高度
  const highest = Math.max(...branches.value.map((branch) => branch.leafCount), 1)
  return branches.value.slice(0, 5).map((branch) => ({
    id: branch.id,
    title: branch.title,
    leafCount: branch.leafCount,
    height: `${Math.max(18, Math.round((branch.leafCount / highest) * 100))}%`,
  }))
})
const skyNodes = computed(() =>
  // 取前 6 条枝映射为星图节点：按预设散点坐标摆位，标题截断为短标签
  branches.value.slice(0, 6).map((branch, index) => {
    // 320×240 右栏星图坐标（原 640×320 缩放一半）
    const positions: Array<{ x: number; y: number }> = [
      { x: 60, y: 71 }, { x: 125, y: 56 }, { x: 195, y: 71 },
      { x: 260, y: 56 }, { x: 95, y: 118 }, { x: 225, y: 118 },
    ]
    const position = positions[index] ?? { x: 160, y: 110 }
    return { ...branch, ...position, shortTitle: branch.title.slice(0, 5) }
  }),
)

const selectedBranchPath = computed(() => {
  const b = store.selectedBranch
  return b?.path || b?.title || ''
})

const leavesLoading = computed(() => store.leavesLoading)
const branchLeaves = computed<LearningLeafVO[]>(() => store.branchLeaves)
// 复习状态统计：当前枝下“复习中 / 已掌握”的叶数量（默认视为 NEW）
const leavesReviewing = computed(
  () => branchLeaves.value.filter((l) => String(l.reviewStatus || 'NEW') === 'REVIEWING').length,
)
const leavesMastered = computed(
  () => branchLeaves.value.filter((l) => String(l.reviewStatus || 'NEW') === 'MASTERED').length,
)

const gateLoading = computed(() => store.gateLoading)
const gateResult = computed<GateResponse | null>(() => store.gateResult)
const gateError = computed(() => store.gateError)
const searchBlocked = computed(() => store.searchBlocked)
const v2Phase = computed(() => store.v2Phase)
const skipGateContext = computed(() => store.skipGateContext)

const attachVisible = computed(() => store.attachVisible)
const attachSubmitting = computed(() => store.attachSubmitting)
const pendingAttach = computed(() => store.pendingAttach)

// ── local modal state ──
const createDomainVisible = ref(false)
const createDomainName = ref('')
const createDomainSubmitting = ref(false)

const reattachOpen = ref(false)
const treeEditMode = ref(false)
const treeVizOpen = ref(false)

const mergeVisible = ref(false)
const mergeSourceId = ref<number | string | null>(null)
const mergeTargetId = ref<number | string | null>(null)
const mergeSubmitting = ref(false)

// ── 复习 UI ──
const reviewOpen = ref(false)
const reviewLoading = ref(false)
const reviewQuiz = ref<LearningReviewQuizVO | null>(null)
const revealedAnswers = ref<Record<number, boolean>>({})

// 打开复习弹窗：需先选中枝；请求后端按枝下笔记生成自测题，逐题可展开/收起答案
async function openReview() {
  if (selectedBranchId.value == null) {
    message.warning('请先选择一个枝')
    return
  }
  reviewLoading.value = true
  reviewOpen.value = true
  reviewQuiz.value = null
  revealedAnswers.value = {}
  try {
    const res = await getBranchReviewQuiz(selectedBranchId.value)
    if (res.data.code === 0 && res.data.data) {
      reviewQuiz.value = res.data.data
    } else {
      message.error(res.data.message || '生成复习题失败')
    }
  } catch {
    message.error('生成复习题失败（请检查后端与 Key 配置）')
  } finally {
    reviewLoading.value = false
  }
}

function toggleAnswer(index: number) {
  revealedAnswers.value = { ...revealedAnswers.value, [index]: !revealedAnswers.value[index] }
}

// ── 键盘流：/ 聚焦提问 · R 复习当前枝 · ? 查看快捷键 ──
function onGlobalKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const tag = target?.tagName || ''
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
  if (typing) return
  if (e.key === '/') {
    e.preventDefault()
    contentPanelRef.value?.focusInput()
  } else if (e.key.toLowerCase() === 'r' && selectedBranchId.value != null) {
    e.preventDefault()
    void openReview()
  } else if (e.key === '?') {
    message.info('键盘流：/ 聚焦提问 · R 复习当前枝', 3)
  }
}

// ── 断线恢复：网络恢复 / 回到前台时重新挂接进行中的合蒸 job ──
function resumeLearningJobPoll() {
  if (currentJobId == null || jobPollTimer) return
  const goalTitle = store.gateResult?.answer || selectedBranchTitle.value || ''
  message.info('网络已恢复，正在重新连接进行中的合蒸任务…', 3)
  void pollJobOnce(currentJobId, goalTitle)
  jobPollTimer = setInterval(() => {
    if (currentJobId != null) void pollJobOnce(currentJobId, goalTitle)
  }, JOB_POLL_MS)
}

const onWindowOnline = () => resumeLearningJobPoll()
const onWindowVisibility = () => {
  if (document.visibilityState === 'visible') resumeLearningJobPoll()
}

// ── handlers ──
function onSelectBranch(branchId: number | string | null) {
  store.selectedBranchId = branchId
}

// 空枝补学：记录目标枝上下文并清空旧的门闩结果，让内容面板进入免门闩的补学模式
function onLearnEmpty(payload: { branchId: number | string; branchTitle: string }) {
  store.setSkipGateContext(payload.branchId, payload.branchTitle)
  store.gateResult = null
}

async function onGateSubmit(question: string) {
  return store.submitGate(question)
}

async function onGateReSubmit(question: string) {
  return store.submitGate(question)
}

async function onConfirmBranch(payload: { title: string; parentBranchId: number | string }) {
  try {
    await store.confirmBranch(payload)
    message.success(`已创建枝「${payload.title}」`)
  } catch (e) {
    message.error(String((e as Error)?.message || '建枝失败'))
  }
}

function onOpenNote(noteId: number | string) {
  router.push(`/admin/knowledge/notes/${noteId}`)
}

// 取消挂载：仅把笔记从树上摘下（不删除笔记本体），需二次确认
async function onDetachLeaf(noteId: number | string) {
  Modal.confirm({
    title: '取消挂载',
    content: '仅解除树上挂载，不会删除精读笔记。确定？',
    okText: '取消挂载',
    cancelText: '返回',
    async onOk() {
      try {
        await store.detachLeaf(noteId)
        message.success('已取消挂载')
      } catch (e) {
        message.error(String((e as Error)?.message || '取消挂载失败'))
        return Promise.reject(e)
      }
    },
  })
}

async function onMoveLeaf(noteId: number | string, targetBranchId: number | string) {
  try {
    await store.moveLeaf(noteId, targetBranchId)
    message.success('已移叶')
  } catch (e) {
    message.error(String((e as Error)?.message || '移叶失败'))
  }
}

async function onRenameBranch(branchId: number | string, title: string) {
  try {
    await store.renameBranch(branchId, title)
    message.success('已改名')
  } catch (e) {
    message.error(String((e as Error)?.message || '改名失败'))
  }
}

// 删除枝：有叶的枝禁止删除（先移叶或取消挂载），空枝删除前二次确认
async function onDeleteBranch(branchId: number | string) {
  const branch = store.branches.find((b) => String(b.id) === String(branchId))
  if (!branch) return
  if (branch.leafCount > 0) {
    message.warning('有叶枝不可删，请先移叶或取消挂载')
    return
  }
  Modal.confirm({
    title: '删除空枝',
    content: `确定删除枝「${branch.title}」？`,
    okText: '删除',
    okType: 'danger',
    async onOk() {
      try {
        await store.deleteBranch(branchId)
        message.success('已删除')
      } catch (e) {
        message.error(String((e as Error)?.message || '删除失败'))
        return Promise.reject(e)
      }
    },
  })
}

// 打开合并枝弹窗：默认目标为除源枝外的第一条枝
function onMergeBranch(sourceBranchId: number | string) {
  mergeSourceId.value = sourceBranchId
  mergeTargetId.value = branches.value.filter((b) => String(b.id) !== String(sourceBranchId))[0]?.id ?? null
  mergeVisible.value = true
}

async function submitMergeBranch() {
  if (mergeSourceId.value == null || mergeTargetId.value == null) {
    message.warning('请选择目标枝')
    return Promise.reject(new Error('no target'))
  }
  mergeSubmitting.value = true
  try {
    await store.mergeBranch(mergeSourceId.value, mergeTargetId.value)
    mergeVisible.value = false
    message.success('已合并')
  } catch (e) {
    message.error(String((e as Error)?.message || '合并失败'))
    return Promise.reject(e)
  } finally {
    mergeSubmitting.value = false
  }
}

// 创建 L1 枝（parentBranchId = 0 表示根级）
async function onCreateL1Branch(title: string) {
  try {
    await store.confirmBranch({ title, parentBranchId: 0 })
    message.success(`已创建「${title}」`)
  } catch (e) {
    message.error(String((e as Error)?.message || '建枝失败'))
  }
}

// 创建 L2 子枝：必须挂在某个 L1 之下，缺少父枝 ID 时给出错误提示
async function onCreateL2Branch(parentBranchId: number | string, title: string) {
  const parent = parentBranchId != null && String(parentBranchId) !== '' && String(parentBranchId) !== '0'
    ? String(parentBranchId)
    : ''
  if (!parent) {
    message.error('缺少父枝 ID，无法创建子枝（请从某条 L1 上添加子枝）')
    return
  }
  try {
    await store.confirmBranch({ title, parentBranchId: parent })
    message.success(`已创建「${title}」`)
  } catch (e) {
    message.error(String((e as Error)?.message || '建枝失败'))
  }
}

// ── domain CRUD ──
function onCreateDomain() {
  createDomainName.value = ''
  createDomainVisible.value = true
}

async function submitCreateDomain() {
  const name = createDomainName.value.trim()
  if (!name) {
    message.warning('请填写领域名称，例如 Java')
    return Promise.reject(new Error('empty name'))
  }
  createDomainSubmitting.value = true
  try {
    await store.createDomain(name)
    createDomainVisible.value = false
    createDomainName.value = ''
    message.success(`已创建领域「${name}」`)
  } catch (e) {
    message.error(String((e as Error)?.message || '创建领域失败'))
    return Promise.reject(e)
  } finally {
    createDomainSubmitting.value = false
  }
}

// ── reattach ──
function onOpenReattach() {
  if (!store.currentDomainId) {
    message.warning('请先选择领域')
    return
  }
  reattachOpen.value = true
}

async function onReattachDone() {
  if (store.currentDomainId) {
    await store.loadTree(store.currentDomainId)
    if (store.selectedBranchId) await store.loadLeaves(store.selectedBranchId)
  }
}

// ── V2 batch-url pipeline ──
// 批量 URL 合蒸的异步任务轮询：提交后端返回 jobId，前端每 2s 轮询一次任务状态，
// 成功则弹出挂叶确认，失败则提示错误；切领域/卸载时停止轮询
const JOB_POLL_MS = 2000
let jobPollTimer: ReturnType<typeof setInterval> | null = null
let currentJobId: string | number | null = null

// 停止轮询并清空当前任务 ID
function stopJobPoll() {
  if (jobPollTimer) {
    clearInterval(jobPollTimer)
    jobPollTimer = null
  }
  currentJobId = null
}

// 状态统一转大写，兼容后端不同的大小写返回
function normalizeStatus(data: API.KnowledgeReadingJobVO) {
  return String(data.status || '').toUpperCase()
}

// 任务成功判定：显式 SUCCESS，或 success=true 且已产出 noteId 且未失败
function isJobSuccess(data: API.KnowledgeReadingJobVO) {
  const status = normalizeStatus(data)
  return status === 'SUCCESS' || (data.success === true && data.noteId != null && status !== 'FAILED')
}

// 任务失败判定：显式 FAILED 或 success=false
function isJobFailed(data: API.KnowledgeReadingJobVO) {
  const status = normalizeStatus(data)
  return status === 'FAILED' || data.success === false
}

// 单次轮询：成功则停止轮询并打开挂叶确认（带笔记标题兜底）；失败则停止并提示
async function pollJobOnce(jobId: number | string, goalTitle: string) {
  try {
    const res = await learningKnowledgeApi.getKnowledgeReadingJob(jobId)
    if (res.data.code !== 0 || !res.data.data) return
    const data = res.data.data as API.KnowledgeReadingJobVO

    if (isJobSuccess(data)) {
      stopJobPoll()
      store.v2Phase = 'idle'
      const noteId = data.noteId
      if (noteId == null) {
        message.error('合并成功但未返回 noteId')
        return
      }
      store.openAttachConfirm(noteId, data.title || goalTitle)
      return
    }

    if (isJobFailed(data)) {
      stopJobPoll()
      store.v2Phase = 'idle'
      message.error(data.errorMsg || '合并精炼失败')
      return
    }
  } catch (e) {
    console.warn(e)
  }
}

// 提交批量 URL 合蒸：去重过滤后按“空枝补学 / 门闩通行证”两种上下文组参，
// 同步完成则直接弹挂叶确认，否则进入 jobId 轮询阶段
async function onBatchUrlSubmit(payload: { urls: string[]; goal: string }) {
  if (!store.currentDomainId) return
  stopJobPoll()

  store.v2Phase = 'ingest'

  const domainId = store.currentDomainId
  const goal = payload.goal
  const unique = [...new Set(payload.urls.map((u) => u.trim()).filter(Boolean))]
  if (!unique.length) {
    message.warning('请至少勾选一条候选')
    store.v2Phase = 'idle'
    return
  }

  try {
    const body: Record<string, unknown> = {
      urls: unique,
      sourceType: 'AGENT',
      agentQuery: goal,
      domainId,
    }
    if (store.skipGateContext?.branchId) {
      body.skipGate = true
      body.branchId = store.skipGateContext.branchId
    } else if (store.gatePassId) {
      body.gatePassId = store.gatePassId
    }

    const res = await learningKnowledgeApi.ingestKnowledgeBatchUrl(body as any)
    if (res.data.code !== 0 || !res.data.data) {
      store.v2Phase = 'idle'
      message.error(res.data.message || '合并精炼失败')
      return
    }

    const data = res.data.data as API.KnowledgeReadingJobVO

    if (isJobSuccess(data)) {
      store.v2Phase = 'idle'
      const noteId = data.noteId
      if (noteId == null) {
        message.error('合并成功但未返回 noteId')
        return
      }
      store.openAttachConfirm(noteId, data.title || goal)
      return
    }

    if (isJobFailed(data)) {
      store.v2Phase = 'idle'
      message.error(data.errorMsg || '合并精炼失败')
      return
    }

    if (data.jobId == null) {
      store.v2Phase = 'idle'
      message.error('未返回任务 ID，无法跟踪合蒸进度')
      return
    }

    currentJobId = data.jobId
    store.v2Phase = 'job'
    await pollJobOnce(data.jobId, goal)
    jobPollTimer = setInterval(() => {
      if (currentJobId != null) void pollJobOnce(currentJobId, goal)
    }, JOB_POLL_MS)
  } catch (e) {
    store.v2Phase = 'idle'
    message.error(String((e as any)?.message || '合并精炼超时或失败'))
  }
}

// ── attach ──
// 挂叶确认：把合蒸产出的笔记挂到已有枝，或先新建子枝再挂载
async function onAttachConfirm(
  payload: { branchId: number | string } | { newBranchTitle: string; parentBranchId: number | string },
) {
  if (!store.currentDomainId) return
  const domainId = store.currentDomainId
  const noteId = pendingAttach.value.noteId
  if (!noteId) {
    message.error('缺少 noteId')
    return
  }

  const req: AttachRequest = { domainId, noteId }
  if ('branchId' in payload) {
    req.branchId = payload.branchId
  } else {
    req.newBranchTitle = payload.newBranchTitle
    req.parentBranchId = payload.parentBranchId
  }

  await store.attachLeaf(req)
}

// 取消挂叶：关闭弹窗并复位待挂载笔记与 V2 阶段
function onAttachCancel() {
  store.attachVisible = false
  store.pendingAttach = { noteId: 0, title: '' }
  store.v2Phase = 'idle'
}

// ── lifecycle ──
// 挂载：注册网络/可见性/键盘监听，加载领域列表并恢复上次的领域树
onMounted(async () => {
  window.addEventListener('online', onWindowOnline)
  document.addEventListener('visibilitychange', onWindowVisibility)
  window.addEventListener('keydown', onGlobalKeydown)
  try {
    await store.loadDomains()
    if (store.currentDomainId) {
      await store.loadTree(store.currentDomainId)
    }
  } catch (e) {
    message.error('加载领域失败')
  }
})

// 切换领域：停止轮询、重置门闩与挂载状态，并加载新领域的树（清空领域则清空树数据）
watch(
  () => store.currentDomainId,
  async (next) => {
    stopJobPoll()
    store.resetGate()
    store.attachVisible = false
    store.pendingAttach = { noteId: 0, title: '' }
    if (next != null) {
      await store.loadTree(next)
    } else {
      store.branches = []
      store.branchLeaves = []
      store.selectedBranchId = null
    }
  },
)

// 切换选中枝：加载枝下挂载的叶列表，取消选中则清空
watch(
  () => store.selectedBranchId,
  async (next) => {
    if (next != null) await store.loadLeaves(next)
    else store.branchLeaves = []
  },
)

watch(skipGateContext, (ctx) => {
  if (ctx) { /* gate context set — ContentPanel will show skip banner */ }
})

// 卸载：移除全局监听并停止任务轮询
onBeforeUnmount(() => {
  window.removeEventListener('online', onWindowOnline)
  document.removeEventListener('visibilitychange', onWindowVisibility)
  window.removeEventListener('keydown', onGlobalKeydown)
  stopJobPoll()
})
</script>

<template>
  <ReadingRoomShell>
    <div id="page-learning" class="learning-domain">
      <div class="page-title">
        <h1 class="font-display">领域知识树</h1>
        <span class="sub">门闩 → 搜文 → 挂叶 · 空枝可补学</span>
      </div>

      <!-- 工具栏：回挂笔记 / 编辑树 / 新建 L1 / 树图 / 复习，右侧展示快照截断提示或快捷键说明 -->
      <div v-if="currentDomainId" class="learn-toolbar">
        <button type="button" class="chip-btn sm" @click="onOpenReattach"><Paperclip :size="13" /> 回挂笔记</button>
        <button type="button" class="chip-btn sm" :class="{ on: treeEditMode }" @click="treeEditMode = !treeEditMode"><Pencil :size="13" /> {{ treeEditMode ? '完成编辑' : '编辑树' }}</button>
        <button type="button" class="chip-btn sm" @click="createL1Trigger = true"><Plus :size="13" /> 新建 L1</button>
        <button type="button" class="chip-btn sm" @click="treeVizOpen = !treeVizOpen"><Share2 :size="13" /> 树图</button>
        <button type="button" class="chip-btn sm primary" :disabled="selectedBranchId == null" @click="openReview"><GraduationCap :size="13" /> 复习</button>
        <span v-if="snapshotTruncated" class="snapshot-hint" :title="snapshotMessage">{{ snapshotMessage }}</span>
        <span v-else class="hint">键盘流：/ 聚焦提问 · R 复习当前枝</span>
      </div>

      <div class="layout-3 learning-layout">
        <!-- 左栏：领域切换芯片 + 树脉日志（域/枝/叶三级状态速览） -->
        <aside class="side learning-side" aria-label="领域与房间导航">
          <div class="side-card glass">
            <span class="tape"></span>
            <h3 class="font-display">领域</h3>
            <div class="domain-chips">
              <button
                v-for="domain in store.domains"
                :key="domain.id"
                type="button"
                class="chip-btn sm"
                :class="{ on: String(domain.id) === String(currentDomainId) }"
                @click="currentDomainId = domain.id"
              >
                {{ domain.name }}
              </button>
              <button type="button" class="chip-btn sm" @click="onCreateDomain"><Plus :size="13" /> 新建</button>
            </div>
          </div>
          <div class="side-card glass">
            <h3 class="font-display">树脉日志</h3>
            <div class="log-list">
              <div class="log-line"><span class="t">域</span><span class="m">{{ currentDomainName || '等待选择' }}</span><span class="dot"></span></div>
              <div class="log-line blue"><span class="t">枝</span><span class="m">{{ selectedBranchTitle || '尚未选中' }}</span><span class="dot"></span></div>
              <div class="log-line mint"><span class="t">叶</span><span class="m">挂载 {{ selectedBranchLeafCount }} 篇</span><span class="dot"></span></div>
            </div>
          </div>
        </aside>

        <!-- 中栏：已选领域时展示 知识树(枝) + 内容面板(叶/门闩提问)；否则展示引导创建领域的欢迎页 -->
        <main class="mid-bay learning-mid">
          <template v-if="currentDomainId">
            <div class="learn-row">
              <aside class="tree-box glass" aria-label="知识目录">
                <DomainTree
                  :loading="treeLoading"
                  :domain-name="currentDomainName"
                  :branches="branches"
                  :selected-branch-id="selectedBranchId"
                  :snapshot-truncated="snapshotTruncated"
                  :snapshot-message="snapshotMessage"
                  :edit-mode="treeEditMode"
                  :create-l1-requested="createL1Trigger"
                  @update:create-l1-requested="(v: boolean) => (createL1Trigger = v)"
                  @update:selected-branch-id="onSelectBranch"
                  @learn-empty="onLearnEmpty"
                  @rename-branch="onRenameBranch"
                  @delete-branch="onDeleteBranch"
                  @merge-branch="onMergeBranch"
                  @create-l1-branch="onCreateL1Branch"
                  @create-l2-branch="onCreateL2Branch"
                />
              </aside>
              <section class="leaf-box glass" aria-label="枝叶内容">
                <ContentPanel
                  ref="contentPanelRef"
                  :domain-id="currentDomainId"
                  :domain-name="currentDomainName"
                  :branch-id="selectedBranchId"
                  :branch-title="selectedBranchTitle"
                  :branch-path="selectedBranchPath"
                  :leaves="branchLeaves"
                  :leaves-loading="leavesLoading"
                  :branches="branches"
                  :gate-loading="gateLoading"
                  :gate-result="gateResult"
                  :gate-error="gateError"
                  :search-blocked="searchBlocked"
                  :v2-phase="v2Phase"
                  :skip-gate-context="skipGateContext"
                  @open-note="onOpenNote"
                  @move-leaf="onMoveLeaf"
                  @detach-leaf="onDetachLeaf"
                  @gate-submit="onGateSubmit"
                  @gate-re-submit="onGateReSubmit"
                  @confirm-branch="onConfirmBranch"
                  @batch-url-submit="onBatchUrlSubmit"
                  @skip-gate="(p) => onLearnEmpty(p)"
                />
              </section>
            </div>
          </template>
          <div v-else class="learning-welcome glass">
            <FolderTree :size="54" class="learning-welcome__icon" :stroke-width="1" />
            <div>
              <span class="eyebrow">领域观测站</span>
              <h2 class="font-display">先点亮一座知识塔</h2>
              <p>创建 Java、前端或算法等领域，再把精读笔记挂成可追溯的叶。</p>
            </div>
            <button type="button" class="chip-btn primary" @click="onCreateDomain"><Plus :size="15" /> 创建领域</button>
          </div>
        </main>

        <!-- 右栏：当前枝统计卡 + 领域星图（可点击节点切换枝、点卡片展开完整树图）+ 叶密度柱图 -->
        <aside class="deck learning-deck" aria-label="当前枝摘要">
          <div class="deck-panel glass">
            <span class="tape alt"></span>
            <h3 class="font-display">当前枝</h3>
            <div class="stat-row">
              <div class="stat-pill"><div class="n">{{ selectedBranchLeafCount }}</div><div class="l">叶</div></div>
              <div class="stat-pill"><div class="n font-display">{{ selectedBranchDepth ? `L${selectedBranchDepth}` : '—' }}</div><div class="l">层级</div></div>
            </div>
            <div class="stat-row" style="margin-top: 10px">
              <div class="stat-pill"><div class="n">{{ leavesReviewing }}</div><div class="l">复习中</div></div>
              <div class="stat-pill"><div class="n">{{ leavesMastered }}</div><div class="l">已掌握</div></div>
            </div>
          </div>
          <section
            class="chart-panel sky-panel sky-panel--clickable"
            aria-label="领域星图"
            title="点击展开完整树图"
            role="button"
            tabindex="0"
            @click="treeVizOpen = true"
            @keydown.enter.prevent="treeVizOpen = true"
          >
            <div class="chart-grid"></div>
            <span class="chart-cap">领域星图 · <b>{{ selectedBranchTitle || currentDomainName || '…' }}</b></span>
            <div class="map-body">
              <!-- 领域星图 SVG：中心为领域根节点，射线连接前 6 条枝；选中枝高亮，有叶的节点带数量角标 -->
              <svg viewBox="0 0 260 220" preserveAspectRatio="xMidYMid meet">
                <path
                  v-for="node in skyNodes"
                  :key="`edge-${node.id}`"
                  class="rm-edge"
                  :class="{ lit: String(node.id) === String(selectedBranchId) }"
                  :d="`M130 50 L${Math.round(node.x * 0.8125)} ${Math.round(node.y * 0.916)}`"
                />
                <circle class="rm-node root" cx="130" cy="50" r="18" />
                <text class="rm-lab root-label" x="130" y="54" text-anchor="middle">{{ currentDomainName?.slice(0, 6) || 'DOMAIN' }}</text>
                <g
                  v-for="node in skyNodes"
                  :key="node.id"
                  class="learn-sky__node"
                  @click.stop="onSelectBranch(node.id); treeVizOpen = true"
                >
                  <circle
                    class="rm-node"
                    :class="{ 'is-on': String(node.id) === String(selectedBranchId), empty: !node.leafCount }"
                    :cx="Math.round(node.x * 0.8125)"
                    :cy="Math.round(node.y * 0.916)"
                    :r="node.depth === 1 ? 14 : 11"
                  />
                  <text
                    class="rm-lab"
                    :class="{ on: String(node.id) === String(selectedBranchId) }"
                    :x="Math.round(node.x * 0.8125)"
                    :y="Math.round(node.y * 0.916) + 4"
                    text-anchor="middle"
                  >{{ node.shortTitle }}</text>
                  <circle
                    v-if="node.leafCount"
                    class="rm-badge"
                    :cx="Math.round(node.x * 0.8125) + 12"
                    :cy="Math.round(node.y * 0.916) - 12"
                    r="7"
                  />
                  <text
                    v-if="node.leafCount"
                    class="rm-badge-t"
                    :x="Math.round(node.x * 0.8125) + 12"
                    :y="Math.round(node.y * 0.916) - 9.5"
                    text-anchor="middle"
                  >{{ node.leafCount }}</text>
                </g>
              </svg>
            </div>
            <span class="map-leg">点击展开完整树图 · Esc 关闭</span>
          </section>
          <div class="room-bars chart-panel" data-room-bars title="叶密度">
            <div class="chart-grid"></div>
            <span class="chart-cap">叶密度 · <b>各枝挂载量</b></span>
            <div class="rb-row">
              <b
                v-for="(branch, i) in branchDensity"
                :key="branch.id"
                :class="['mint', 'blue', 'sun', ''][i % 4]"
                :style="{ height: branch.height }"
                :title="`${branch.title} · ${branch.leafCount} 叶`"
              />
            </div>
            <span class="rb-foot">各枝挂载量（真实 leafCount）</span>
          </div>
        </aside>
      </div>

    <!-- ============== 6. 滑出面板 / 弹窗 ============== -->
    <AttachConfirm
      v-if="attachVisible && currentDomainId != null"
      :visible="attachVisible"
      :domain-id="currentDomainId"
      :note-id="pendingAttach.noteId"
      :note-title="pendingAttach.title"
      :note-summary="pendingAttach.summary"
      :branches="branches"
      :suggested-branch-id="gateResult?.suggestedBranchId ?? null"
      :suggested-branch-title="gateResult?.suggestedBranchTitle ?? null"
      :submitting="attachSubmitting"
      @update:visible="(v) => (store.attachVisible = v)"
      @confirm="onAttachConfirm"
      @cancel="onAttachCancel"
    />

    <a-modal
      v-model:open="createDomainVisible"
      title="创建学习领域"
      ok-text="创建"
      cancel-text="取消"
      :confirm-loading="createDomainSubmitting"
      :destroy-on-close="true"
      @ok="submitCreateDomain"
    >
      <p style="margin: 0 0 12px; color: var(--ld-color-text-secondary)">
        领域由你手动创建，AI 不会自动建域。同一用户下领域名不可重复。
      </p>
      <a-input
        v-model:value="createDomainName"
        placeholder="例如：Java、前端、算法"
        :maxlength="128"
        allow-clear
        @pressEnter="submitCreateDomain"
      />
    </a-modal>

    <!-- 复习自测弹窗：加载中 / 题目列表（逐题显隐答案）/ 无可复习笔记 三种形态 -->
    <a-modal
      v-model:open="reviewOpen"
      :title="`复习 · ${reviewQuiz?.branchTitle || selectedBranchTitle || '当前枝'}`"
      width="760px"
      :footer="null"
      destroy-on-close
    >
      <div v-if="reviewLoading" class="review-box review-box--loading">
        正在根据枝下笔记生成自测题…
      </div>
      <template v-else-if="reviewQuiz && reviewQuiz.questions?.length">
        <div v-for="(q, index) in reviewQuiz.questions" :key="index" class="review-card">
          <div class="review-q">
            <b>Q{{ index + 1 }}</b> {{ q.question }}
          </div>
          <button type="button" class="chip-btn sm" @click="toggleAnswer(index)">
            {{ revealedAnswers[index] ? '收起答案' : '显示答案' }}
          </button>
          <div v-if="revealedAnswers[index]" class="review-a">{{ q.answer }}</div>
        </div>
      </template>
      <div v-else class="review-empty">
        {{ reviewQuiz ? '该枝还没有可复习的笔记，先挂叶或空枝补学后再生成自测题。' : '正在出题…' }}
      </div>
    </a-modal>

    <ReattachNotesModal
      v-model:open="reattachOpen"
      :domain-id="currentDomainId"
      :branches="branches"
      @done="onReattachDone"
    />

    <a-modal
      v-model:open="mergeVisible"
      title="合并枝"
      ok-text="确认合并"
      cancel-text="取消"
      :confirm-loading="mergeSubmitting"
      destroy-on-close
      @ok="submitMergeBranch"
    >
      <p style="margin: 0 0 12px; color: var(--ld-color-text-secondary)">
        源枝下的叶会改挂到目标枝，源枝随后删除。
      </p>
      <a-select
        v-model:value="mergeTargetId"
        style="width: 100%"
        :options="branches.filter((b) => String(b.id) !== String(mergeSourceId)).map((b) => ({ value: b.id, label: b.path || b.title }))"
        placeholder="选择目标枝"
      />
    </a-modal>

    <TreeVizOverlay
      v-if="currentDomainId"
      :open="treeVizOpen"
      :domain-name="currentDomainName"
      :branches="branches"
      :selected-branch-id="selectedBranchId"
      @close="treeVizOpen = false"
      @update:selected-branch-id="(id) => { store.selectedBranchId = id }"
      @learn-empty="(p) => { onLearnEmpty(p); treeVizOpen = false }"
    />
  </div>
  </ReadingRoomShell>
</template>
