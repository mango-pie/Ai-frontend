<script setup lang="ts">
/**
 * 每日工作日志页（路由 /worklog，worklog 模块）
 * - 左列：四段式编辑器（做了什么/问题/总结/明日计划）+ 分栏 Markdown 预览 + 月度补写日历
 * - 右列：历史日志归档，支持关键词/年月/类别/标签筛选，右键单篇复制导出
 * - 本地优先（useWorkLog 管理 IndexedDB）；登录且模块开启时同步云端，并支持 MD/JSON 导入导出与备份提醒
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { marked } from 'marked'
import './worklog.css'
import {
  Bold,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Code,
  Columns2,
  Copy,
  Download,
  Eye,
  FileJson,
  PencilLine,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import {
  appendCategoryLine,
  categorySummary,
  defaultWorkLogTitle,
  dismissBackupReminder,
  extractLineCategory,
  getBackupIntervalDays,
  getLastExportAt,
  normalizeTags,
  parseTagInput,
  parseWorkLogJson,
  parseWorkLogMarkdown,
  setBackupIntervalDays,
  shouldShowBackupReminder,
  todayDateString,
  useWorkLog,
  wordCount,
  WORKLOG_CATEGORIES,
  WORKLOG_DEFAULT_BACKUP_DAYS,
  workLogExcerpt,
  type WorkLogDraft,
  type WorkLogEntry,
} from '@/composables/useWorkLog'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { listWorkLogs } from '@/api/worklogController'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'

type DraftField = 'done' | 'problem' | 'summary' | 'plan'
type PreviewMode = 'edit' | 'split' | 'preview'
type ImportKind = 'md' | 'json'

const FIELD_LABEL: Record<DraftField, string> = {
  done: '今天做了什么',
  problem: '遇到的问题与解决',
  summary: '总结',
  plan: '明日计划',
}

const wl = useWorkLog()
const loginUserStore = useLoginUserStore()
const capsStore = useCapabilitiesStore()

// ===== 云端同步 =====
// 顶栏云端状态提示语（未开启 / 同步中 / 正常 / 异常降级本地）
const cloudHint = computed(() => {
  if (!wl.cloudEnabled.value) return '仅本机缓存'
  if (wl.cloudStatus.value === 'syncing') return '云端同步中…'
  if (wl.cloudStatus.value === 'ok') return '已连云端'
  if (wl.cloudStatus.value === 'error') return '云端异常 · 使用本地缓存'
  return '云端待命'
})

/** 本地全量上传云端后立即回拉一次，保持两侧一致 */
async function pushLocalToCloud() {
  const res = await wl.pushAllToCloud(true)
  if (!res) {
    message.error('上传失败，请确认已登录且工作日志模块已开启')
    return
  }
  message.success(`已上传云端：导入 ${res.imported} 篇，跳过 ${res.skipped} 篇`)
  await wl.pullFromCloud()
}

async function pullCloudNow() {
  const ok = await wl.pullFromCloud()
  if (ok) message.success('已从云端拉取')
  else message.warning('拉取失败，仍显示本地数据')
}

// ===== 列表筛选与搜索 =====
/** 月份筛选用 */
const filterYear = ref(String(new Date().getFullYear()))
const filterMonth = ref('') // '' = 全部，「YYYY-MM」= 指定月
const tagFilter = ref('')

const years = computed(() => {
  const set = new Set<string>(wl.entries.value.map((e) => e.date.slice(0, 4)))
  set.add(new Date().getFullYear().toString())
  return [...set].sort((a, b) => (a < b ? 1 : -1))
})

/** 关键词搜索（标题 + 全部正文 + 标签） */
const searchKeyword = ref('')

/** 类别筛选（'' = 全部；点击类别分布条切换） */
const categoryFilter = ref('')

/** 类别筛选：逐行提取行首 [类别] 标记判断命中 */
function entryMatchesCategory(e: WorkLogEntry, cat: string): boolean {
  if (!cat) return true
  for (const section of [e.done, e.problem, e.summary, e.plan]) {
    for (const line of section.split('\n')) {
      if (extractLineCategory(line) === cat) return true
    }
  }
  return false
}

/** 先筛全集，再按 limit 切片（搜索/类别不受「最近 60 篇」截断） */
const filteredAll = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  return wl.sorted.value.filter((e) => {
    if (filterYear.value && e.date.slice(0, 4) !== filterYear.value) return false
    if (filterMonth.value && !e.date.startsWith(filterMonth.value)) return false
    if (categoryFilter.value && !entryMatchesCategory(e, categoryFilter.value)) return false
    if (tagFilter.value && !normalizeTags(e.tags).includes(tagFilter.value)) return false
    if (kw) {
      const hay = `${e.title} ${e.done} ${e.problem} ${e.summary} ${e.plan} ${(e.tags ?? []).join(' ')}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})
// 分批渲染：先展示 limit 篇，「加载更多」逐步放大，避免长列表卡顿
const filteredList = computed(() => filteredAll.value.slice(0, wl.limit.value))
const filteredHasMore = computed(() => filteredAll.value.length > wl.limit.value)

/** 类别分布（当前筛选范围内；点 chip 切换筛选） */
const categoryDist = computed(() => categorySummary(filteredAll.value))
const categoryOrder = computed(() => {
  const dist = categoryDist.value
  const known = WORKLOG_CATEGORIES.filter((c) => dist[c])
  const rest = Object.keys(dist)
    .filter((k) => !(WORKLOG_CATEGORIES as readonly string[]).includes(k))
    .sort()
  return [...known, ...rest]
})
const maxCategoryCount = computed(() => {
  const max = Math.max(0, ...Object.values(categoryDist.value))
  return max || 1
})
function toggleCategoryFilter(cat: string) {
  categoryFilter.value = categoryFilter.value === cat ? '' : cat
}
function toggleTagFilter(tag: string) {
  tagFilter.value = tagFilter.value === tag ? '' : tag
}

const monthLabels = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

/* ── 月度日历（补写视图） ───────────────────────────────── */
const calYear = ref(Number(filterYear.value))
const calMonth = ref(Number(monthLabels[new Date().getMonth()]))
const calTitle = computed(() => `${calYear.value} 年 ${calMonth.value} 月`)
const CAL_WEEK = ['一', '二', '三', '四', '五', '六', '日']
const calCells = computed(() => {
  const y = calYear.value
  const m = calMonth.value - 1
  const first = new Date(y, m, 1)
  const days = new Date(y, m + 1, 0).getDate()
  const offset = (first.getDay() + 6) % 7 // 周一开头
  const has = new Set(wl.entries.value.map((e) => e.date))
  const cells: Array<{ day?: number; date?: string; has?: boolean; today?: boolean; isDraft?: boolean }> = []
  for (let i = 0; i < offset; i++) cells.push({})
  for (let d = 1; d <= days; d++) {
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, date, has: has.has(date), today: date === todayDateString(), isDraft: date === draft.date })
  }
  return cells
})
function calPrev() {
  if (calMonth.value === 1) {
    calMonth.value = 12
    calYear.value -= 1
  } else calMonth.value -= 1
}
function calNext() {
  if (calMonth.value === 12) {
    calMonth.value = 1
    calYear.value += 1
  } else calMonth.value += 1
}
function calGoToday() {
  const t = todayDateString()
  calYear.value = Number(t.slice(0, 4))
  calMonth.value = Number(t.slice(5, 7))
}
function openCalDate(date: string) {
  void navigateToDate(date)
}

/* ── 编辑区 ─────────────────────────────────────────────── */
const saving = ref(false)
const saveState = ref<'idle' | 'dirty' | 'saving' | 'saved'>('idle')
// 当前编辑的草稿（一篇日志按日期唯一），切换日期时整体回填
const draft = reactive<WorkLogDraft>({
  date: todayDateString(),
  title: '',
  done: '',
  problem: '',
  summary: '',
  plan: '',
  tags: ['worklog'],
})
const tagDraft = ref('')
const draftLoaded = ref(false)
// 自动保存防抖定时器（卸载/切换日期时需清理）
let saveTimer: ReturnType<typeof setTimeout> | null = null

const draftExists = computed(() => wl.entries.value.some((e) => e.date === draft.date))
const editorTitle = computed(() => draft.title.trim() || defaultWorkLogTitle(draft.date))
const customTags = computed(() => normalizeTags(draft.tags).filter((t) => t !== 'worklog'))

const activeField = ref<DraftField>('done')
const doneInputRef = ref<HTMLTextAreaElement | null>(null)
const problemInputRef = ref<HTMLTextAreaElement | null>(null)
const summaryInputRef = ref<HTMLTextAreaElement | null>(null)
const planInputRef = ref<HTMLTextAreaElement | null>(null)
const fieldRefs: Record<DraftField, typeof doneInputRef> = {
  done: doneInputRef,
  problem: problemInputRef,
  summary: summaryInputRef,
  plan: planInputRef,
}

function focusField(field: DraftField, cursor?: number) {
  void nextTick(() => {
    const el = fieldRefs[field].value
    if (!el) return
    el.focus()
    const pos = cursor ?? el.value.length
    el.setSelectionRange(pos, pos)
  })
}

function insertCategory(category: string) {
  const field = activeField.value
  draft[field] = appendCategoryLine(draft[field], category)
  saveState.value = 'dirty'
  focusField(field)
}

/** 用选区文本包裹 Markdown 定界符；无选区时插入占位词「文本」并保持焦点 */
function wrapInline(before: string, after: string) {
  const field = activeField.value
  const el = fieldRefs[field].value
  const val = draft[field]
  if (!el) {
    draft[field] = `${val}${before}文本${after}`
    saveState.value = 'dirty'
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = val.slice(start, end) || '文本'
  draft[field] = `${val.slice(0, start)}${before}${selected}${after}${val.slice(end)}`
  saveState.value = 'dirty'
  void nextTick(() => {
    el.focus()
    const from = start + before.length
    el.setSelectionRange(from, from + selected.length)
  })
}

function addTagsFromInput() {
  const next = parseTagInput(tagDraft.value)
  if (!next.length) return
  draft.tags = normalizeTags([...draft.tags, ...next])
  tagDraft.value = ''
  saveState.value = 'dirty'
}
function removeTag(tag: string) {
  if (tag === 'worklog') return
  draft.tags = normalizeTags(draft.tags.filter((t) => t !== tag))
  saveState.value = 'dirty'
}

/* ── 预览：默认分栏 ─────────────────────────────────────── */
const previewMode = ref<PreviewMode>('split')

const draftMarkdown = computed(() => {
  const tags = customTags.value
  const parts = [
    `# ${draft.title.trim() || defaultWorkLogTitle(draft.date)}`,
    '',
    `> 日期：${draft.date}`,
    '',
  ]
  if (tags.length) parts.push(`> 标签：${tags.join('、')}`, '')
  parts.push(
    '## 今天做了什么',
    '',
    draft.done.trim() || '（未记录）',
    '',
    '## 遇到的问题与解决',
    '',
    draft.problem.trim() || '（未记录）',
    '',
    '## 总结',
    '',
    draft.summary.trim() || '（未记录）',
    '',
  )
  if (draft.plan.trim()) parts.push('## 明日计划', '', draft.plan.trim(), '')
  return parts.join('\n')
})
// marked 解析异常时降级为占位段落，避免预览区整块空白
const previewHtml = computed(() => {
  try {
    return marked.parse(draftMarkdown.value, { async: false }) as string
  } catch {
    return '<p>（预览渲染失败）</p>'
  }
})

const previewHeading = computed(() => {
  if (previewMode.value === 'preview') return '预览'
  if (previewMode.value === 'split') return '写今天的日志 · 分栏预览'
  return '写今天的日志'
})

/* ── 快捷键 ─────────────────────────────────────────────── */
function onGlobalKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  const editing =
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
  const hasCtrl = e.ctrlKey || e.metaKey
  if (hasCtrl && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void doSave(true)
    return
  }
  if (hasCtrl && e.key.toLowerCase() === 'b' && editing && tag === 'TEXTAREA') {
    e.preventDefault()
    wrapInline('**', '**')
    return
  }
  if (hasCtrl && e.key === 'e' && editing && tag === 'TEXTAREA') {
    e.preventDefault()
    wrapInline('`', '`')
    return
  }
  if (hasCtrl && e.key === 'Enter' && editing) {
    e.preventDefault()
    void doSave(true).then(() => goDayOffset(1))
  }
}

/* ── 导入（带冲突确认） ──────────────────────────────────── */
const importPending = ref<{ text: string; total: number; conflicted: string[]; kind: ImportKind } | null>(null)
const showBackupBanner = ref(false)
const backupInterval = ref(getBackupIntervalDays())

function refreshBackupBanner() {
  showBackupBanner.value = shouldShowBackupReminder(wl.entries.value.length > 0)
}

async function applyImport(text: string, overwrite: boolean, kind: ImportKind) {
  const res = kind === 'json' ? await wl.importJson(text, { overwrite }) : await wl.importMarkdown(text, { overwrite })
  const parts = [`已导入 ${res.imported} 篇`]
  if (res.skipped) parts.push(`跳过 ${res.skipped} 篇`)
  message.success(parts.join('，'))
  if (res.conflicted.length && overwrite) message.info(`覆盖日期：${res.conflicted.join('、')}`)
  importPending.value = null
  refreshBackupBanner()
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value，否则连续两次选择同一文件不会触发 change
  input.value = ''
  if (!file) return
  const text = await file.text()
  const isJson = /\.json$/i.test(file.name) || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')
  let parsed: WorkLogEntry[] = []
  try {
    parsed = isJson ? parseWorkLogJson(text) : parseWorkLogMarkdown(text)
  } catch {
    message.error('文件解析失败，请确认是工作日志 Markdown 或 JSON 同步包')
    return
  }
  if (!parsed.length) {
    message.warning(isJson ? 'JSON 中未识别到有效日志条目' : '未识别到工作日志条目（需含日期标题）')
    return
  }
  const existing = new Set(wl.entries.value.map((x) => x.date))
  const conflicted = parsed.filter((x) => existing.has(x.date)).map((x) => x.date)
  const kind: ImportKind = isJson ? 'json' : 'md'
  if (conflicted.length) {
    importPending.value = { text, total: parsed.length, conflicted, kind }
    return
  }
  await applyImport(text, true, kind)
}

// ===== 草稿保存与日期导航 =====
const saveHint = computed(() => {
  if (saveState.value === 'saving') return '保存中…'
  if (saveState.value === 'saved') return '已保存'
  if (saveState.value === 'dirty') return '未保存'
  return draftExists.value ? '编辑这天已有日志' : '空白日 · 写一篇'
})

const lastExportLabel = computed(() => {
  const t = getLastExportAt()
  if (!t) return '从未导出'
  return `上次导出 ${new Date(t).toLocaleString('zh-CN', { hour12: false })}`
})

/** 按日期加载已有日志到草稿；没有则回填空白模板 */
async function loadDraft(date: string) {
  const prev = await wl.getByDate(date)
  draft.date = date
  draft.title = prev?.title ?? ''
  draft.done = prev?.done ?? ''
  draft.problem = prev?.problem ?? ''
  draft.summary = prev?.summary ?? ''
  draft.plan = prev?.plan ?? ''
  draft.tags = normalizeTags(prev?.tags)
  tagDraft.value = ''
  draftLoaded.value = true
  saveState.value = 'idle'
}

/** 保存当前草稿；manual=true（按钮/Ctrl+S）才弹成功提示，自动保存保持安静 */
async function doSave(manual = false) {
  if (!draft.date) {
    message.warning('请先选择日期')
    return
  }
  saving.value = true
  saveState.value = 'saving'
  try {
    await wl.save({ ...draft, tags: normalizeTags(draft.tags) })
    saveState.value = 'saved'
    if (manual) message.success(`已保存：${editorTitle.value}`)
    refreshBackupBanner()
  } catch {
    saveState.value = 'dirty'
    message.error('保存失败，可能浏览器存储受限')
  } finally {
    saving.value = false
  }
}

/** 切换编辑日期：先冲掉待执行的防抖保存并强制落盘，避免草稿串到新日期 */
async function navigateToDate(date: string) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (saveState.value === 'dirty') await doSave(false)
  await loadDraft(date)
}

async function onPickDate(ev: Event) {
  const next = (ev.target as HTMLInputElement).value
  if (!next || next === draft.date) return
  await navigateToDate(next)
}

// 草稿任一字段变化 → 标脏并 1.2s 防抖自动保存；draftLoaded 防止回填过程误触发
watch(
  () => [draft.title, draft.done, draft.problem, draft.summary, draft.plan, draft.tags.join('|')] as const,
  () => {
    if (!draftLoaded.value) return
    saveState.value = 'dirty'
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void doSave(false), 1200)
  },
)

function goToday() {
  void navigateToDate(todayDateString())
}

function goDayOffset(offset: number) {
  const d = new Date(`${draft.date || todayDateString()}T12:00:00`)
  d.setDate(d.getDate() + offset)
  void navigateToDate(d.toISOString().slice(0, 10))
}

function chooseEntry(date: string) {
  void navigateToDate(date)
}

async function removeEntry(date: string) {
  await wl.remove(date)
  if (draft.date === date) {
    saveState.value = 'idle'
    draft.title = ''
    draft.done = ''
    draft.problem = ''
    draft.summary = ''
    draft.plan = ''
    draft.tags = ['worklog']
  }
  message.success(`已删除 ${date} 的工作日志`)
  refreshBackupBanner()
}

// ===== 导出与备份提醒 =====
function exportAllMd() {
  wl.downloadMarkdown()
  refreshBackupBanner()
  message.success('已导出 Markdown（可用于文档仓库）')
}
function exportAllJson() {
  wl.downloadJson()
  refreshBackupBanner()
  message.success('已导出 JSON 同步包（换设备请用「导入」）')
}
function onBackupExportNow() {
  exportAllJson()
}
function onBackupDismiss() {
  dismissBackupReminder(24)
  showBackupBanner.value = false
  message.info('已稍后提醒（24 小时内不再提示）')
}
function onBackupIntervalChange() {
  setBackupIntervalDays(backupInterval.value || WORKLOG_DEFAULT_BACKUP_DAYS)
  backupInterval.value = getBackupIntervalDays()
  refreshBackupBanner()
}

// ===== 单篇操作（复制 / 导出 / 右键菜单） =====
async function copyEntry(date: string) {
  const ok = await wl.copyEntryMarkdown(date)
  if (ok) message.success(`已复制 ${date} 的 Markdown`)
  else message.error('复制失败：浏览器未授权剪贴板')
  ctxMenu.value = null
}
function downloadEntry(date: string) {
  if (wl.downloadEntryMarkdown(date)) message.success(`已下载 WORKLOG-${date}.md`)
  else message.warning('未找到该篇日志')
  ctxMenu.value = null
}

const importInput = ref<HTMLInputElement | null>(null)

/** 右键菜单（单篇导出/复制） */
const ctxMenu = ref<{ x: number; y: number; date: string } | null>(null)
function onEntryContextMenu(e: MouseEvent, date: string) {
  e.preventDefault()
  ctxMenu.value = { x: e.clientX, y: e.clientY, date }
}
function closeCtxMenu() {
  ctxMenu.value = null
}

// ===== 列表展示辅助（星期 / 日期徽标 / 字数 / 标签） =====
function weekLabel(date: string) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(`${date}T12:00:00`).getDay()]
}

function dateBadge(date: string) {
  const [, m, d] = date.split('-')
  return { m: Number(m), d: Number(d) }
}

function wordCountFor(e: WorkLogEntry) {
  return wordCount(e)
}

function visibleTags(e: WorkLogEntry) {
  return normalizeTags(e.tags).filter((t) => t !== 'worklog')
}

// ===== 初始化与全局监听 =====
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('click', closeCtxMenu)
  // 首次进入：登录且 worklog 模块开启才启用云端，否则退化为纯本地 IndexedDB
  void (async () => {
    if (!loginUserStore.loginUser?.id) await loginUserStore.fetchLoginUser()
    if (!capsStore.loaded) await capsStore.load()
    const canCloud = !!loginUserStore.loginUser?.id && capsStore.enabled('worklog')
    wl.setCloudEnabled(canCloud)
    await wl.reload()
    // 云端空、本地有 → 自动上传一次，完成首迁
    if (canCloud && wl.cloudStatus.value === 'ok') {
      const cloudProbe = await listWorkLogs(1).catch(() => null)
      const cloudEmpty = cloudProbe?.data?.code === 0 && !(cloudProbe.data.data?.length)
      if (cloudEmpty && wl.entries.value.length) {
        await wl.pushAllToCloud(true)
        await wl.pullFromCloud()
      }
    }
    await loadDraft(todayDateString())
    refreshBackupBanner()
  })()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('click', closeCtxMenu)
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <StationRoomShell brand-path="/worklog" note-label="Worklog · 每日事务" room="worklog">
  <div class="worklog-room">
    <!-- 左栏：关于 / 打卡章 / 本周洞察 -->
    <aside class="worklog-room__side">
      <section class="station-glass room-card">
        <p class="room-eyebrow">DAILY REPORT</p>
        <h3 class="room-card__title font-display">关于工作日志</h3>
        <p class="room-card__text">
          每天一篇，记录做了什么与总结。与「日记」完全独立：
          本机 IndexedDB 随写随存，登录后可同步云端。
        </p>
      </section>

      <section class="station-glass room-card room-card--stamp">
        <p class="room-eyebrow">PUNCH CARD</p>
        <div class="stamp-row">
          <span class="stamp-ring" :class="{ 'is-active': wl.stats.value.streak > 0 }">
            <b class="font-display">{{ wl.stats.value.streak }}</b>
            <small>连续天数</small>
          </span>
          <dl class="stamp-mini">
            <div><dt>累计篇数</dt><dd class="font-display">{{ wl.stats.value.total }}</dd></div>
            <div><dt>本月篇数</dt><dd class="font-display">{{ wl.stats.value.monthCount }}</dd></div>
            <div><dt>累计字数</dt><dd class="font-display">{{ wl.stats.value.words }}</dd></div>
          </dl>
        </div>
        <p v-if="wl.stats.value.gapHint" class="stamp-gap">
          {{ wl.stats.value.gapHint }}
          <button class="text-btn" type="button" @click="goToday">去写今天</button>
        </p>
      </section>

      <section
        v-if="wl.stats.value.topCategory || wl.stats.value.weekKeywords.length"
        class="station-glass room-card"
      >
        <p class="room-eyebrow">THIS WEEK</p>
        <div v-if="wl.stats.value.topCategory" class="room-insight">
          <span class="room-insight-label">最常写的类别</span>
          <button
            class="worklog-category-chip is-static"
            type="button"
            :data-cat="wl.stats.value.topCategory!.name"
            @click="toggleCategoryFilter(wl.stats.value.topCategory!.name)"
          >
            {{ wl.stats.value.topCategory!.name }}
            <em>{{ wl.stats.value.topCategory!.count }}</em>
          </button>
        </div>
        <div v-if="wl.stats.value.weekKeywords.length" class="room-insight">
          <span class="room-insight-label">本周高频词</span>
          <div class="worklog-kw-list">
            <button
              v-for="kw in wl.stats.value.weekKeywords"
              :key="kw.word"
              class="worklog-kw-chip"
              type="button"
              :title="`搜索「${kw.word}」`"
              @click="searchKeyword = kw.word"
            >
              {{ kw.word }} <em>{{ kw.count }}</em>
            </button>
          </div>
        </div>
      </section>
    </aside>

    <!-- 主栏：今日编辑 + 月历 -->
    <main class="worklog-room__main">
      <!-- 导入冲突确认横幅：日期已存在时选择覆盖或仅新增 -->
      <section v-if="importPending" class="station-glass room-banner" role="alertdialog" aria-labelledby="import-conflict-title">
        <div>
          <strong id="import-conflict-title">
            导入 {{ importPending.total }} 篇（{{ importPending.kind === 'json' ? 'JSON' : 'Markdown' }}），其中
            {{ importPending.conflicted.length }} 篇日期已存在
          </strong>
          <p>已存在：{{ importPending.conflicted.join('、') }}。「覆盖导入」会替换这些日期；「仅新增」跳过它们。</p>
        </div>
        <div class="worklog-import-actions">
          <button class="antd-btn primary" type="button" @click="applyImport(importPending!.text, true, importPending!.kind)">
            覆盖导入
          </button>
          <button class="antd-btn" type="button" @click="applyImport(importPending!.text, false, importPending!.kind)">
            仅新增
          </button>
          <button class="antd-btn ghost" type="button" @click="importPending = null">取消</button>
        </div>
      </section>

        <!-- 编辑器：日期/标题/标签/类别工具 + 四段正文与分栏预览 -->
        <section class="worklog-panel worklog-editor">
          <header class="worklog-panel-head">
            <span class="worklog-panel-index">EDIT / {{ draftExists ? '已有' : '新建' }}</span>
            <h2>{{ previewHeading }}</h2>
            <span class="spacer" />
            <div class="worklog-preview-switch" role="group" aria-label="编辑或预览">
              <button
                class="worklog-preview-btn"
                :class="{ 'is-on': previewMode === 'edit' }"
                type="button"
                title="仅编辑"
                @click="previewMode = 'edit'"
              >
                <PencilLine :size="13" /> 编辑
              </button>
              <button
                class="worklog-preview-btn"
                :class="{ 'is-on': previewMode === 'split' }"
                type="button"
                title="输入时半屏预览"
                @click="previewMode = 'split'"
              >
                <Columns2 :size="13" /> 分栏
              </button>
              <button
                class="worklog-preview-btn"
                :class="{ 'is-on': previewMode === 'preview' }"
                type="button"
                title="仅预览"
                @click="previewMode = 'preview'"
              >
                <Eye :size="13" /> 预览
              </button>
            </div>
            <span class="worklog-save-state" :data-state="saveState">{{ saveHint }}</span>
          </header>

          <div v-show="previewMode !== 'preview'" class="worklog-editor-meta">
            <label class="worklog-field worklog-field--date">
              <span>日期</span>
              <input :value="draft.date" type="date" @change="onPickDate" />
            </label>
            <div class="worklog-day-nav">
              <button class="icon-btn" type="button" aria-label="前一天" @click="goDayOffset(-1)"><ChevronLeft :size="14" /></button>
              <button class="text-btn" type="button" @click="goToday">今天</button>
              <button class="icon-btn" type="button" aria-label="后一天" @click="goDayOffset(1)"><ChevronRight :size="14" /></button>
            </div>
            <label class="worklog-field worklog-field--title">
              <span>标题</span>
              <input v-model="draft.title" type="text" placeholder="留空自动生成" />
            </label>
            <button
              class="icon-btn"
              type="button"
              aria-label="复制当天 Markdown"
              title="复制当天 Markdown"
              @click="copyEntry(draft.date)"
            >
              <Copy :size="14" />
            </button>
            <button
              class="icon-btn"
              type="button"
              aria-label="导出当天 Markdown"
              title="导出当天 Markdown"
              @click="downloadEntry(draft.date)"
            >
              <Download :size="14" />
            </button>
            <button class="icon-btn" type="button" aria-label="保存" :disabled="saving" @click="doSave(true)">
              <Save :size="15" />
            </button>
          </div>

          <div v-show="previewMode !== 'preview'" class="worklog-tags-row">
            <span class="worklog-tags-label">标签</span>
            <span class="worklog-tag is-sys">worklog</span>
            <button
              v-for="t in customTags"
              :key="t"
              class="worklog-tag"
              :class="{ 'is-active': tagFilter === t }"
              type="button"
              :title="tagFilter === t ? '取消筛选' : '按此标签筛选'"
              @click="toggleTagFilter(t)"
            >
              {{ t }}
              <span class="worklog-tag-x" title="移除标签" @click.stop="removeTag(t)"><X :size="11" /></span>
            </button>
            <input
              v-model="tagDraft"
              class="worklog-tag-input"
              type="text"
              placeholder="自定义标签，回车添加"
              @keydown.enter.prevent="addTagsFromInput"
            />
          </div>

          <div v-show="previewMode !== 'preview'" class="worklog-toolbar" role="toolbar" aria-label="格式与类别">
            <button class="worklog-fmt-btn" type="button" title="加粗（Ctrl+B）" @click="wrapInline('**', '**')">
              <Bold :size="13" />
            </button>
            <button class="worklog-fmt-btn" type="button" title="行内代码（Ctrl+E）" @click="wrapInline('`', '`')">
              <Code :size="13" />
            </button>
            <span class="worklog-toolbar-hint">插入到「{{ FIELD_LABEL[activeField] }}」</span>
            <span class="worklog-category-tools" role="group" aria-label="插入工作类别">
              <button
                v-for="cat in WORKLOG_CATEGORIES"
                :key="cat"
                class="worklog-cat-btn"
                :data-cat="cat"
                type="button"
                @click="insertCategory(cat)"
              >
                {{ cat }}
              </button>
            </span>
          </div>

          <div class="worklog-split" :class="`is-${previewMode}`">
            <div v-show="previewMode !== 'preview'" class="worklog-fields">
              <label class="worklog-field worklog-field--area">
                <span>今天做了什么</span>
                <textarea
                  ref="doneInputRef"
                  v-model="draft.done"
                  rows="4"
                  placeholder="- [新增] 完成了什么功能 / [修改] 调整了… / [修复] 解决了…（每行一条，可用类别标记）"
                  @focus="activeField = 'done'"
                ></textarea>
              </label>
              <label class="worklog-field worklog-field--area">
                <span>遇到的问题与解决</span>
                <textarea
                  ref="problemInputRef"
                  v-model="draft.problem"
                  rows="3"
                  placeholder="- [修复] 遇到的问题、排查过程、最终结论…"
                  @focus="activeField = 'problem'"
                ></textarea>
              </label>
              <div class="worklog-two">
                <label class="worklog-field worklog-field--area">
                  <span>总结</span>
                  <textarea
                    ref="summaryInputRef"
                    v-model="draft.summary"
                    rows="3"
                    placeholder="- [优化] 今天整体进展 / 收获 / 感悟…"
                    @focus="activeField = 'summary'"
                  ></textarea>
                </label>
                <label class="worklog-field worklog-field--area">
                  <span>明日计划</span>
                  <textarea
                    ref="planInputRef"
                    v-model="draft.plan"
                    rows="3"
                    placeholder="- [新增] 明天准备做的事（可选）"
                    @focus="activeField = 'plan'"
                  ></textarea>
                </label>
              </div>
            </div>
            <div v-show="previewMode !== 'edit'" class="worklog-preview" v-html="previewHtml"></div>
          </div>

          <footer class="worklog-editor-foot">
            <span>
              自动保存 ·
              <kbd>Ctrl</kbd>+<kbd>S</kbd> 保存 ·
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 保存并跳到明天 ·
              <kbd>Ctrl</kbd>+<kbd>B</kbd> 加粗
            </span>
            <button class="antd-btn primary" type="button" :disabled="saving" @click="doSave(true)">
              <Check :size="14" /> 保存这篇
            </button>
          </footer>
        </section>

        <!-- 月度日历：点亮已记录日期，点空白日期直接补写 -->
        <section class="worklog-panel worklog-cal">
          <header class="worklog-panel-head">
            <span class="worklog-panel-index">CALENDAR</span>
            <h2>{{ calTitle }}</h2>
            <span class="spacer" />
            <button class="icon-btn" type="button" aria-label="上个月" @click="calPrev"><ChevronLeft :size="14" /></button>
            <button class="text-btn" type="button" @click="calGoToday">本月</button>
            <button class="icon-btn" type="button" aria-label="下个月" @click="calNext"><ChevronRight :size="14" /></button>
          </header>
          <div class="worklog-cal-grid" role="grid" aria-label="月份日历">
            <span v-for="w in CAL_WEEK" :key="w" class="worklog-cal-week" aria-hidden="true">{{ w }}</span>
            <button
              v-for="(c, i) in calCells"
              :key="i"
              class="worklog-cal-cell"
              :class="{ 'is-empty': !c.day, 'has-log': c.has, 'is-today': c.today, 'is-draft': c.isDraft }"
              type="button"
              :disabled="!c.day"
              :aria-label="c.date ? `${c.date}${c.has ? '（已记录）' : ''}` : ''"
              @click="c.date && openCalDate(c.date)"
            >
              {{ c.day ?? '' }}
            </button>
          </div>
          <p class="worklog-cal-hint"><i class="worklog-cal-dot" aria-hidden="true"></i> 已记录 · 点击空白日期可直接补写</p>
        </section>
      </main>

      <!-- 右栏：云端与备份 / 历史归档 -->
      <aside class="worklog-room__deck">
        <section class="station-glass room-card room-card--cloud">
          <p class="room-eyebrow">CLOUD DESK</p>
          <p class="room-cloud-line">
            <component :is="wl.cloudEnabled.value ? Cloud : CloudOff" :size="14" />
            {{ cloudHint }}
          </p>
          <div class="room-cloud-actions">
            <button
              v-if="wl.cloudEnabled.value"
              class="antd-btn ghost"
              type="button"
              title="从云端拉取"
              @click="pullCloudNow"
            >
              <RefreshCw :size="13" /> 拉取
            </button>
            <button
              v-if="wl.cloudEnabled.value"
              class="antd-btn ghost"
              type="button"
              title="把本地全部上传云端"
              @click="pushLocalToCloud"
            >
              <Cloud :size="13" /> 上传
            </button>
            <button class="antd-btn ghost" type="button" title="导入 Markdown 或 JSON 同步包" @click="importInput?.click()">
              <Upload :size="13" /> 导入
            </button>
            <input
              ref="importInput"
              type="file"
              accept=".md,.markdown,.json,text/markdown,application/json"
              hidden
              @change="onImportFile"
            />
            <button class="antd-btn ghost" type="button" title="跨设备同步推荐" @click="exportAllJson">
              <FileJson :size="13" /> 同步包
            </button>
            <button class="antd-btn primary" type="button" @click="exportAllMd">
              <Download :size="13" /> 导出 MD
            </button>
          </div>
          <div v-if="showBackupBanner" class="room-backup-note" role="status">
            <strong>该备份一下了</strong>
            <p>
              建议每 {{ backupInterval }} 天导出一次 JSON 同步包。{{ lastExportLabel }}。
            </p>
            <label class="worklog-backup-interval">
              提醒间隔
              <input
                v-model.number="backupInterval"
                type="number"
                min="1"
                max="90"
                @change="onBackupIntervalChange"
              />
              天
            </label>
            <div class="worklog-import-actions">
              <button class="antd-btn primary" type="button" @click="onBackupExportNow">立刻导出</button>
              <button class="antd-btn ghost" type="button" @click="onBackupDismiss">稍后</button>
            </div>
          </div>
        </section>

        <!-- 历史归档：搜索 + 年月筛选 + 分批加载，右键单篇操作 -->
        <section class="worklog-panel worklog-history">
          <div v-if="categoryOrder.length || tagFilter" class="worklog-cat-filter">
            <span
              v-for="cat in categoryOrder"
              :key="cat"
              class="worklog-category-chip"
              :class="{ 'is-active': categoryFilter === cat }"
              :data-cat="cat"
              role="button"
              tabindex="0"
              :title="categoryFilter === cat ? '取消筛选' : '只看该类'"
              @click="toggleCategoryFilter(cat)"
              @keydown.enter.prevent="toggleCategoryFilter(cat)"
            >
              {{ cat }}
              <em>{{ categoryDist[cat] }}</em>
            </span>
            <span v-if="tagFilter" class="worklog-category-title">标签：{{ tagFilter }}</span>
            <button v-if="tagFilter" class="text-btn" type="button" @click="tagFilter = ''">清除</button>
          </div>
        <header class="worklog-panel-head">
          <span class="worklog-panel-index">ARCHIVE</span>
          <h2>历史日志</h2>
          <span class="spacer" />
          <div class="worklog-history-search">
            <Search :size="13" aria-hidden="true" />
            <input v-model="searchKeyword" type="search" placeholder="搜索日志…" aria-label="搜索日志" />
          </div>
          <select v-model="filterYear" class="worklog-select" aria-label="年份">
            <option v-for="y in years" :key="y" :value="y">{{ y }} 年</option>
          </select>
          <select v-model="filterMonth" class="worklog-select" aria-label="月份">
            <option value="">全部月份</option>
            <option v-for="m in monthLabels" :key="m" :value="`${filterYear}-${m}`">{{ Number(m) }} 月</option>
          </select>
        </header>

        <div v-if="wl.loading.value" class="worklog-empty">正在读取…</div>
        <div v-else-if="!filteredList.length" class="worklog-empty">
          <p>{{ wl.entries.value.length ? '当前筛选下没有日志。' : '还没有工作日志。从「写今天的日志」开始第一篇。' }}</p>
        </div>
        <div v-else class="worklog-list">
          <article
            v-for="e in filteredList"
            :key="e.date"
            class="worklog-entry"
            :class="{ 'is-today': e.date === wl.today }"
            @click="chooseEntry(e.date)"
            @contextmenu="onEntryContextMenu($event, e.date)"
          >
            <div class="worklog-entry-date">
              <strong>{{ String(dateBadge(e.date).d).padStart(2, '0') }}</strong>
              <small>
                {{ String(dateBadge(e.date).m).padStart(2, '0') }}月 · {{ weekLabel(e.date) }}
              </small>
            </div>
            <div class="worklog-entry-main">
              <strong class="worklog-entry-title">{{ e.title }}</strong>
              <p>{{ workLogExcerpt(e) }}</p>
              <div v-if="visibleTags(e).length" class="worklog-entry-tags">
                <button
                  v-for="t in visibleTags(e)"
                  :key="t"
                  class="worklog-tag is-mini"
                  type="button"
                  @click.stop="toggleTagFilter(t)"
                >
                  {{ t }}
                </button>
              </div>
              <small class="worklog-entry-meta">
                {{ wordCountFor(e) }} 字 ·
                更新 {{ new Date(e.updatedAt).toLocaleString('zh-CN', { hour12: false }) }}
              </small>
            </div>
            <span class="worklog-entry-actions" @click.stop>
              <button class="icon-btn" type="button" aria-label="复制 Markdown" title="复制 Markdown" @click="copyEntry(e.date)">
                <Copy :size="14" />
              </button>
              <button class="icon-btn" type="button" aria-label="导出 Markdown" title="导出 Markdown" @click="downloadEntry(e.date)">
                <Download :size="14" />
              </button>
              <button class="icon-btn danger" type="button" aria-label="删除这篇" @click="removeEntry(e.date)">
                <Trash2 :size="14" />
              </button>
            </span>
          </article>
          <button
            v-if="filteredHasMore"
            class="antd-btn worklog-more-btn"
            type="button"
            @click="wl.loadMore()"
          >
            加载更多（还有 {{ filteredAll.length - wl.limit.value }} 篇）
          </button>
        </div>
      </section>
      </aside>

    <!-- 日志条目右键菜单（复制 / 导出 / 删除单篇） -->
    <div
      v-if="ctxMenu"
      class="worklog-ctx"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @click.stop
    >
      <button type="button" @click="copyEntry(ctxMenu.date)">复制当天 Markdown</button>
      <button type="button" @click="downloadEntry(ctxMenu.date)">导出当天 .md</button>
      <button type="button" class="danger" @click="removeEntry(ctxMenu.date); ctxMenu = null">删除这篇</button>
    </div>
  </div>
  </StationRoomShell>
</template>

<style scoped>
/* ── 房间布局：side 248 | main 1fr | deck 300，站内薄荷 token 重映射 ── */
.worklog-room {
  /* worklog.css 的旧 token 全部映射到站内变量 */
  --worklog-accent: var(--room);
  --worklog-accent-soft: color-mix(in srgb, var(--room) 16%, #fff);
  --color-bg-card: var(--craft-glass);
  --color-bg-surface: rgba(255, 255, 255, 0.65);
  --color-surface-hover: #fff;
  --color-border: color-mix(in srgb, var(--room) 24%, transparent);
  --color-border-hover: color-mix(in srgb, var(--room) 48%, transparent);
  --color-text-primary: var(--ink, #38304a);
  --color-text-secondary: var(--ink-soft, #6c6580);
  --color-text-muted: var(--ink-faint, #9a94ad);

  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 300px;
  gap: 22px;
  align-items: start;
  min-height: 100%;
}

.room-eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 2.5px;
  font-weight: 700;
  color: color-mix(in srgb, var(--room) 78%, #4f6158);
}

.room-card {
  position: relative;
  padding: 18px 18px 16px;
}
.room-card__title {
  margin: 0 0 8px;
  font-size: 18px;
}
.room-card__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-soft, #5f6b64);
}
.station-glass .worklog-category-chip {
  background: rgba(255, 255, 255, 0.7);
}
.station-glass .worklog-kw-chip {
  background: rgba(255, 255, 255, 0.7);
}

/* 打卡章 */
.stamp-row {
  display: flex;
  gap: 14px;
  align-items: center;
}
.stamp-ring {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 86px;
  height: 86px;
  flex-shrink: 0;
  border: 2.5px dashed color-mix(in srgb, var(--room) 55%, transparent);
  border-radius: 50%;
  color: var(--ink-faint, #9a94ad);
  transform: rotate(-6deg);
  transition: transform 0.3s var(--ease-out), color 0.3s, border-color 0.3s;
}
.stamp-ring.is-active {
  color: color-mix(in srgb, var(--room) 82%, #35544a);
  border-color: color-mix(in srgb, var(--room) 75%, transparent);
  background: color-mix(in srgb, var(--room) 10%, transparent);
}
.stamp-ring.is-active:hover {
  transform: rotate(-2deg) scale(1.04);
}
.stamp-ring b {
  font-size: 26px;
  line-height: 1.1;
}
.stamp-ring small {
  font-size: 10px;
  letter-spacing: 1px;
}
.stamp-mini {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  min-width: 0;
}
.stamp-mini > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.stamp-mini dt {
  font-size: 11.5px;
  color: var(--ink-faint, #9a94ad);
}
.stamp-mini dd {
  margin: 0;
  font-size: 16px;
  color: color-mix(in srgb, var(--room) 80%, #35544a);
}
.stamp-gap {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--ink-soft, #5f6b64);
}
.room-insight {
  margin-bottom: 10px;
}
.room-insight:last-child {
  margin-bottom: 0;
}
.room-insight-label {
  display: block;
  font-size: 11.5px;
  color: var(--ink-faint, #9a94ad);
  margin-bottom: 6px;
}

/* 云端台 */
.room-cloud-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--ink-soft, #5f6b64);
}
.room-cloud-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.room-backup-note {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--room) 10%, #fff);
  border: 1px dashed color-mix(in srgb, var(--room) 45%, transparent);
}
.room-backup-note strong {
  font-size: 13px;
  color: var(--ink, #38304a);
}
.room-backup-note p {
  margin: 4px 0 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-soft, #5f6b64);
}

/* 主栏内部：横条避免通栏 */
.worklog-room__main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.worklog-room__main .worklog-panel {
  border-radius: 20px;
}
.worklog-room__main .worklog-split.is-split .worklog-fields {
  max-width: 520px;
}
.worklog-cat-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 0 10px;
}
.worklog-room__deck {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.worklog-room__deck .worklog-history {
  border-radius: 20px;
}

/* 右栏较窄：面板头允许换行，标题不逐字竖排 */
.worklog-room__deck .worklog-panel-head {
  flex-wrap: wrap;
  row-gap: 8px;
}
.worklog-room__deck .worklog-panel-head h2 {
  white-space: nowrap;
  margin-right: auto;
}
.worklog-room__deck .worklog-history-search {
  min-width: 100%;
}

@media (max-width: 1500px) {
  .worklog-room {
    grid-template-columns: 220px minmax(0, 1fr) 270px;
  }
}
</style>
