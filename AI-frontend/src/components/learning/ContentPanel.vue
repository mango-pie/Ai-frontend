<script setup lang="ts">
/**
 * 内容区 — 以 AI 问答为主交互入口
 * 问题输入框始终可见；内容区根据门闩结果 / 枝选择 / V2 阶段动态切换
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { Send, Sparkles, GitBranch, Leaf, RefreshCw, Loader2, AlertTriangle } from 'lucide-vue-next'
import type { GateResponse, GateIntent } from '@/api/learning.types'
import type { LearningBranchTreeNode, LearningLeafVO } from '@/api/learning.types'
import { searchKnowledgePreview } from '@/api/knowledge'
import NoteList from './NoteList.vue'
import JobProgressBar from './JobProgressBar.vue'
import EmptyState from './EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'

const props = defineProps<{
  domainId: number | string | null
  domainName: string
  branchId: number | string | null
  branchTitle: string
  branchPath: string
  leaves: LearningLeafVO[]
  leavesLoading: boolean
  branches: LearningBranchTreeNode[]
  gateLoading: boolean
  gateResult: GateResponse | null
  gateError: string
  searchBlocked: boolean
  v2Phase: 'idle' | 'preview' | 'ingest' | 'job'
  skipGateContext: { branchId: number | string; branchTitle: string } | null
}>()

const emit = defineEmits<{
  'open-note': [noteId: number | string]
  'move-leaf': [noteId: number | string, targetBranchId: number | string]
  'detach-leaf': [noteId: number | string]
  'gate-submit': [question: string]
  'gate-re-submit': [question: string]
  'confirm-branch': [payload: { title: string; parentBranchId: number }]
  'batch-url-submit': [payload: { urls: string[]; goal: string }]
  'skip-gate': [payload: { branchId: number | string; branchTitle: string }]
}>()

// ── question input ──
/** 用户输入的学习问题（也是 AI 搜索的 goal 来源之一） */
const question = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

/** 供父组件聚焦输入框（如门闩失败后引导用户重新提问） */
async function focusInput() {
  await nextTick()
  textareaRef.value?.focus()
}

defineExpose({ focusInput })

/** 计算搜索目标：优先用用户输入，其次拼"领域+空枝标题"（补学场景），兜底领域名 */
function getGoal(): string {
  const q = question.value.trim()
  if (q) return q
  if (props.skipGateContext?.branchTitle) {
    return props.domainName
      ? `${props.domainName} ${props.skipGateContext.branchTitle}`
      : props.skipGateContext.branchTitle
  }
  return props.domainName || '学习主题'
}

/** 是否允许提交：非判定中、问题非空且已选领域 */
function canSubmit() {
  return !props.gateLoading && question.value.trim().length > 0 && props.domainId != null
}

/** 提交问题给父组件做门闩判定 */
function handleSubmit() {
  const q = question.value.trim()
  if (!q || !canSubmit()) return
  emit('gate-submit', q)
}

/** Enter 提交、Shift+Enter 换行 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

// ── V2 preview (moved from GatePanel) ──
/** 搜索预览状态：加载中 / 候选文章列表 / 已勾选待精读的 URL */
const previewLoading = ref(false)
const previewCandidates = ref<API.KnowledgeSearchCandidate[]>([])
const selectedUrls = ref<string[]>([])

/**
 * 拉取搜索候选（预览阶段）：
 * 按来源附带不同的上下文——空枝补学带 skipGate+branchId，正常流程带 gatePassId，
 * 后端据此免门闩/复用判定结果。
 */
async function runPreview() {
  if (!props.domainId) return
  if (props.searchBlocked) return
  if (props.v2Phase !== 'preview') return

  const goal = getGoal()
  if (!goal) return

  previewLoading.value = true
  previewCandidates.value = []
  selectedUrls.value = []

  try {
    const body: Record<string, unknown> = { goal, domainId: props.domainId }
    if (props.skipGateContext?.branchId) {
      body.skipGate = true
      body.branchId = props.skipGateContext.branchId
    } else if (props.gateResult?.gatePassId) {
      body.gatePassId = props.gateResult.gatePassId
    }
    const res = await searchKnowledgePreview(body as any)
    if (res.data.code !== 0 || !res.data.data) {
      message.error(res.data.message || '搜索候选失败')
      return
    }
    const list = (res.data.data.candidates || []).filter((c: any) => !!c.url)
    previewCandidates.value = list
  } catch (e) {
    message.error('搜索候选失败（请检查后端与 Key 配置）')
  } finally {
    previewLoading.value = false
  }
}

/** 勾选/取消勾选候选 URL（用 Set 去重后回写数组） */
function toggleUrl(url: string, checked: boolean) {
  const set = new Set(selectedUrls.value)
  if (checked) set.add(url)
  else set.delete(url)
  selectedUrls.value = [...set]
}

/** 提交勾选的文章进入批量精读（生成笔记）流程 */
function submitBatch() {
  const urls = selectedUrls.value
  if (!urls.length) {
    message.warning('请至少勾选一条候选')
    return
  }
  emit('batch-url-submit', { urls, goal: getGoal() })
}

/** 进入预览阶段时自动拉取候选 */
watch(
  () => props.v2Phase,
  (v) => { if (v === 'preview') void runPreview() },
)

/** 切换领域时清空上一次的候选与勾选，避免跨领域残留 */
watch(
  () => props.domainId,
  () => {
    previewCandidates.value = []
    selectedUrls.value = []
  },
)

onBeforeUnmount(() => {
  previewCandidates.value = []
  selectedUrls.value = []
})

// ── BRANCH confirm title ──
const branchCreateTitle = ref('')
watch(
  () => props.gateResult,
  (g) => {
    if (g?.intent === 'BRANCH') {
      branchCreateTitle.value = (g.suggestedBranchTitle as string) || ''
    }
  },
)

// ── derived state ──
const gateIntent = computed<GateIntent | null>(() => props.gateResult?.intent ?? null)

type ViewState =
  | 'no-domain'
  | 'empty'
  | 'gate-chat'
  | 'gate-branch'
  | 'gate-leaf'
  | 'preview'
  | 'ingest'
  | 'job'
  | 'notes'

const viewState = computed<ViewState>(() => {
  if (!props.domainId) return 'no-domain'

  if (props.v2Phase === 'ingest') return 'ingest'
  if (props.v2Phase === 'job') return 'job'
  if (props.v2Phase === 'preview') return 'preview'

  if (props.gateResult) {
    if (!props.gateResult.related) return 'gate-chat'
    if (props.gateResult.intent === 'BRANCH') return 'gate-branch'
    if (props.gateResult.intent === 'LEAF') return 'gate-leaf'
  }

  if (props.branchId) return 'notes'

  return 'empty'
})
</script>

<template>
  <section class="ld-content" aria-label="内容区">
    <!-- ================================================================
       1. AI 问题输入栏 — 始终可见（domain 选中时）
       ================================================================ -->
    <div v-if="domainId" class="ld-ask">
      <div class="ld-ask__inner">
        <Sparkles :size="16" class="ld-ask__spark" />
        <textarea
          ref="textareaRef"
          v-model="question"
          class="ld-ask__input"
          :disabled="gateLoading"
          rows="2"
          :placeholder="skipGateContext
            ? `围绕「${skipGateContext.branchTitle}」搜什么？`
            : `例如：HashMap 底层原理？Java 垃圾回收有几种？`"
          @keydown="handleKeydown"
        />
        <button
          type="button"
          class="ld-ask__send"
          :disabled="!canSubmit()"
          :title="gateLoading ? '判断中…' : '提交问题'"
          @click="handleSubmit"
        >
          <Loader2 v-if="gateLoading" :size="16" class="ld-spin" />
          <Send v-else :size="16" />
        </button>
      </div>

      <!-- skip gate banner (card style, matching gate result) -->
      <div v-if="skipGateContext && viewState === 'preview'" class="ld-gate ld-gate--skip">
        <div class="ld-gate__answer">
          <GitBranch :size="16" class="ld-gate__ico" />
          <span>空枝补学：直接从「<strong>{{ skipGateContext.branchTitle }}</strong>」搜文，无需门闩判定</span>
        </div>
      </div>
    </div>

    <!-- ================================================================
       2. 枝上下文头部
       ================================================================ -->
    <div v-if="branchTitle || domainId" class="ld-content__head">
      <div class="ld-content__head-left">
        <h3 v-if="branchTitle" class="ld-content__branch">
          {{ branchPath || branchTitle }}
        </h3>
        <span v-else class="ld-content__branch ld-content__branch--muted">
          输入问题或选择左侧枝浏览笔记
        </span>
      </div>
      <div v-if="gateResult && v2Phase === 'idle'" class="ld-content__head-right">
        <button type="button" class="ld-rejudge-btn" @click="emit('gate-re-submit', question.trim() || getGoal())">
          <RefreshCw :size="14" />
          重新判定
        </button>
      </div>
    </div>

    <!-- ================================================================
       3. Job 进度条
       ================================================================ -->
    <JobProgressBar v-if="v2Phase === 'ingest' || v2Phase === 'job'" :phase="v2Phase" />

    <!-- ================================================================
       4. 内容区 — 根据 viewState 动态切换
       ================================================================ -->
    <div class="ld-content__body" :key="viewState">

      <!-- gate-chat: 不相关 (CHAT_ONLY) -->
      <template v-if="viewState === 'gate-chat'" key="gate-chat">
        <div class="ld-gate ld-gate--chat">
          <div class="ld-gate__answer">
            <Sparkles :size="16" class="ld-gate__ico" />
            <span>{{ gateResult!.answer || '未能判定相关性' }}</span>
          </div>
          <div v-if="gateResult!.hints?.length" class="ld-gate__hints">
            <button
              v-for="(h, idx) in gateResult!.hints"
              :key="idx"
              class="ld-gate__hint"
              type="button"
              @click="question = h; emit('gate-re-submit', h)"
            >
              <RefreshCw :size="12" />
              {{ h }}
            </button>
          </div>
        </div>
      </template>

      <!-- gate-branch: 建枝 (BRANCH) -->
      <template v-else-if="viewState === 'gate-branch'" key="gate-branch">
        <div class="ld-gate ld-gate--branch">
          <div class="ld-gate__answer">
            <GitBranch :size="16" class="ld-gate__ico" />
            <span>{{ gateResult!.reason || '主题级意图：建议建枝或高亮已有枝' }}</span>
          </div>
          <div class="ld-gate__branch-form">
            <a-input
              v-model:value="branchCreateTitle"
              placeholder="枝标题（默认创建 L1 枝）"
              @pressEnter="emit('confirm-branch', { title: branchCreateTitle || '新主题', parentBranchId: 0 })"
            />
            <a-button
              type="primary"
              style="margin-top: 12px"
              @click="emit('confirm-branch', { title: branchCreateTitle || '新主题', parentBranchId: 0 })"
            >
              <template #icon><GitBranch :size="14" /></template>
              确认建枝
            </a-button>
          </div>
        </div>
      </template>

      <!-- gate-leaf: 搜文 (LEAF) + 搜索过渡态 -->
      <template v-else-if="viewState === 'gate-leaf' || viewState === 'preview'" key="preview">
        <div v-if="gateResult" class="ld-gate ld-gate--leaf">
          <div class="ld-gate__answer">
            <Leaf :size="16" class="ld-gate__ico" />
            <span>{{ gateResult.reason || '文章级意图：可以搜索文章生成笔记' }}</span>
          </div>
          <div v-if="previewLoading" class="ld-gate__searching">
            <Loader2 :size="14" class="ld-spin" />
            正在围绕「<strong>{{ getGoal() }}</strong>」搜索文章…
          </div>
        </div>

        <!-- V2 搜索结果列表 -->
        <div v-if="viewState === 'preview'" class="ld-preview">
          <div v-if="!previewLoading" class="ld-preview__head">
            <h4 class="ld-preview__title">搜索结果</h4>
          </div>

          <EmptyState
            v-if="!previewLoading && previewCandidates.length === 0"
            title="暂无搜索结果"
            description="换个问题试试，或者稍后重试"
          />

          <div v-else-if="!previewLoading" class="ld-preview__list">
            <div
              v-for="c in previewCandidates"
              :key="c.url"
              class="ld-preview__item"
            >
              <div class="ld-preview__item-body">
                <h4 class="ld-preview__item-title">{{ c.title || c.url }}</h4>
                <p class="ld-preview__item-desc">{{ c.summary || '' }}</p>
              </div>
              <input
                type="checkbox"
                :checked="selectedUrls.includes(c.url as string)"
                class="ld-preview__check"
                @change="(e) => toggleUrl(c.url as string, (e.target as HTMLInputElement).checked)"
              />
            </div>
          </div>

          <div v-if="!previewLoading && previewCandidates.length > 0" class="ld-preview__submit">
            <a-button type="primary" size="large" block @click="submitBatch">
              <template #icon><Leaf :size="16" /></template>
              合并精炼（生成笔记）
            </a-button>
          </div>
        </div>
      </template>

      <!-- notes: 枝笔记列表 -->
      <template v-else-if="viewState === 'notes'" key="notes">
        <NoteList
          :loading="leavesLoading"
          :branch-id="branchId"
          :branch-title="branchTitle"
          :leaves="leaves"
          :branches="branches"
          @open="(id) => $emit('open-note', id)"
          @move-to="(p) => $emit('move-leaf', p.noteId, p.targetBranchId)"
          @detach="(id) => $emit('detach-leaf', id)"
          @go-search="$emit('skip-gate', { branchId: branchId!, branchTitle: branchTitle || '' })"
        />
      </template>

      <!-- empty / no-domain -->
      <template v-else-if="viewState === 'empty' || viewState === 'no-domain'" key="empty">
        <!-- gate error fallback -->
        <div v-if="gateError" class="ld-gate ld-gate--error">
          <div class="ld-gate__answer">
            <AlertTriangle :size="16" class="ld-gate__ico" style="color: var(--ld-color-warning)" />
            <span>{{ gateError }}</span>
          </div>
          <p class="ld-gate__fallback-hint">
            你可以手动操作：在左侧树编辑器中建枝、或去
            <router-link to="/admin/knowledge/ingest">精读采集页</router-link>
            直接搜文精炼，完成后回到这里挂叶。
          </p>
        </div>
        <EmptyState
          v-else
          :title="domainId ? '输入问题或选择左侧枝' : '请先选择领域'"
          :description="domainId
            ? '在输入框中提问，AI 会判断问题属于枝还是叶，并引导你完成学习流程'
            : '选择或创建一个领域后，才能使用 AI 门闩与知识树功能'"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
/* ================================================================
   Layout
   ================================================================ */
.ld-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--ld-color-bg-elevated);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.2);
}

/* ================================================================
   Question Input
   ================================================================ */
.ld-ask {
  flex-shrink: 0;
}

.ld-ask__inner {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: var(--ld-color-primary-08);
  transition: box-shadow 0.2s ease;
}

.ld-ask__inner:focus-within {
  border-color: var(--ld-color-primary-35);
  box-shadow: 0 0 0 3px var(--ld-color-primary-08);
}

.ld-ask__spark {
  flex-shrink: 0;
  color: var(--ld-color-primary);
  margin-bottom: 6px;
}

.ld-ask__input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--ld-color-text-primary);
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.65;
  resize: none;
  outline: none;
  padding: 0;
  min-height: 42px;
}

.ld-ask__input::placeholder {
  color: var(--ld-color-text-tertiary);
}

.ld-ask__input:disabled {
  opacity: 0.6;
}

.ld-ask__send {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--ld-color-primary);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.ld-ask__send:hover:not(:disabled) {
  background: var(--ld-color-primary-hover);
}

.ld-ask__send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ld-gate--skip {
  background: rgba(124, 156, 224, 0.08);
  border: 1px solid rgba(124, 156, 224, 0.18);
}

.ld-gate--skip .ld-gate__ico {
  color: var(--ld-color-ai);
}

.ld-spin {
  animation: ld-spin 0.8s linear infinite;
}

@keyframes ld-spin {
  to { transform: rotate(360deg); }
}

/* ================================================================
   Context Header
   ================================================================ */
.ld-content__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}

.ld-content__head-left {
  min-width: 0;
}

.ld-content__branch {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.55;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ld-color-text-primary);
}

.ld-content__branch--muted {
  color: var(--ld-color-text-tertiary);
  font-weight: 400;
}

.ld-content__head-right {
  flex-shrink: 0;
}

.ld-rejudge-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ld-color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ld-color-text-secondary);
  padding: 4px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.ld-rejudge-btn:hover {
  color: var(--ld-color-text-primary);
  border-color: var(--ld-color-border-strong);
}

/* ================================================================
   Content Body
   ================================================================ */
.ld-content__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* ================================================================
   Gate Result States
   ================================================================ */
.ld-gate {
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.ld-gate--chat {
  background: rgba(255, 255, 255, 0.03);
}

.ld-gate--branch {
  background: rgba(184, 164, 201, 0.12);
}

.ld-gate--leaf {
  background: rgba(16, 185, 129, 0.1);
}

.ld-gate--error {
  background: rgba(251, 191, 36, 0.06);
  border: 1px solid rgba(251, 191, 36, 0.15);
}

.ld-gate__fallback-hint {
  margin: 10px 0 0;
  font-size: 0.8125rem;
  color: var(--ld-color-text-secondary);
  line-height: 1.65;
}

.ld-gate__fallback-hint a {
  color: var(--ld-color-primary-hover);
  text-decoration: underline;
}

.ld-gate__answer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.ld-gate__ico {
  flex-shrink: 0;
  margin-top: 3px;
}

.ld-gate--chat .ld-gate__ico { color: var(--ld-color-text-secondary); }
.ld-gate--branch .ld-gate__ico { color: var(--ld-color-primary); }
.ld-gate--leaf .ld-gate__ico { color: var(--ld-color-success); }

.ld-gate__searching {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.12);
  font-size: 0.8125rem;
  color: var(--ld-color-text-secondary);
}

.ld-gate__hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ld-gate__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ld-color-border);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  color: var(--ld-color-text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.ld-gate__hint:hover {
  color: var(--ld-color-primary);
  border-color: var(--ld-color-primary-20);
}

.ld-gate__branch-form {
  margin-top: 12px;
}

/* ================================================================
   V2 Preview Candidates
   ================================================================ */
.ld-preview {
  margin-bottom: 16px;
}

.ld-preview__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ld-preview__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ld-color-text-primary);
}

.ld-preview__status {
  font-size: 0.75rem;
  color: var(--ld-color-text-secondary);
}

.ld-preview__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.ld-preview__item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--ld-color-border);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.02);
  padding: 12px 14px;
  transition: border-color 0.15s ease;
}

.ld-preview__item:hover {
  border-color: var(--ld-color-primary-20);
}

.ld-preview__item-body {
  min-width: 0;
  flex: 1;
}

.ld-preview__item-title {
  margin: 0 0 4px;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ld-preview__item-desc {
  margin: 0;
  font-size: 0.75rem;
  color: var(--ld-color-text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.ld-preview__check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--ld-color-primary);
  cursor: pointer;
}

.ld-preview__submit {
  padding-top: 4px;
}

/* ================================================================
   State fade transition — via :key on body
   ================================================================ */
.ld-content__body {
  animation: ld-fade-in 0.2s var(--ld-ease-out, ease);
}

@keyframes ld-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
