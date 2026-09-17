/**
 * 每日工作日志数据层 — IndexedDB 本地缓存 + 可选云端同步
 *
 * 与「日记」完全隔离：独立 /worklog API 与 worklog_entry 表，不共享日记模块。
 * 未登录或模块关闭时仅用 IndexedDB；登录后以云端为准并回写本地。
 */
import { computed, ref } from 'vue'
import {
  deleteWorkLog,
  getWorkLogByDate,
  importWorkLogs,
  listWorkLogs,
  saveWorkLog,
  type WorkLogApiEntry,
} from '@/api/worklogController'

// ===== 常量、类别与备份提醒键 =====
/** IndexedDB 库名 / 对象仓（以 date 为主键）；PAGE_SIZE 即「加载更多」步长 */
export const WORKLOG_DB = 'worklog-db-v1'
export const WORKLOG_STORE = 'entries'
export const WORKLOG_PAGE_SIZE = 60

/** 备份提醒用的 localStorage 键：上次导出时间 / 提醒间隔天数 / 「稍后再提醒」截止时刻 */
export const WORKLOG_BACKUP_AT_KEY = 'worklog-last-export-at'
export const WORKLOG_BACKUP_INTERVAL_KEY = 'worklog-backup-interval-days'
export const WORKLOG_BACKUP_DISMISS_KEY = 'worklog-backup-dismiss-until'
export const WORKLOG_DEFAULT_BACKUP_DAYS = 7

/** 工作项类别（写作时用 `- [类别] 描述` 标记，统计按类别聚合） */
export const WORKLOG_CATEGORIES = [
  '新增',
  '修改',
  '删除',
  '修复',
  '重构',
  '优化',
  '文档',
  '其他',
] as const
export type WorkLogCategory = (typeof WORKLOG_CATEGORIES)[number]

/** 行内类别标记，如 `- [新增] 完成搜索接口` */
const CATEGORY_LINE_RE = /^\s*(?:[-*]\s*)?\[([^\]]{1,10})\]\s*/

/** 关键词统计的停用词：高频虚词、日志套话与类别名，避免污染周热词 */
const STOP_WORDS = new Set([
  '的',
  '了',
  '和',
  '是',
  '在',
  '我',
  '有',
  '就',
  '不',
  '人',
  '都',
  '一',
  '一个',
  '上',
  '也',
  '很',
  '到',
  '说',
  '要',
  '去',
  '你',
  '会',
  '着',
  '没有',
  '看',
  '好',
  '自己',
  '这',
  '那',
  '什么',
  '可以',
  '这个',
  '为了',
  '以及',
  '进行',
  '通过',
  '使用',
  '完成',
  '今天',
  '明天',
  '工作',
  '日志',
  '问题',
  '解决',
  '总结',
  '计划',
  '未记录',
  ...WORKLOG_CATEGORIES,
])

/** 提取行首 `[类别]` 标记；没有标记返回空串 */
export function extractLineCategory(line: string): string {
  const m = line.match(CATEGORY_LINE_RE)
  return m?.[1]?.trim() ?? ''
}

/** 汇总一组日志里各类别的条数（识别不到的归入「其他」） */
export function categorySummary(
  entries: Array<Pick<WorkLogEntry, 'done' | 'problem' | 'summary' | 'plan'>>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  const recognized = new Set(WORKLOG_CATEGORIES)
  for (const e of entries) {
    for (const section of [e.done, e.problem, e.summary, e.plan]) {
      for (const line of section.split('\n')) {
        const cat = extractLineCategory(line)
        if (!cat) continue
        const key = recognized.has(cat as WorkLogCategory) ? cat : '其他'
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
  }
  return counts
}

/** 多个文本段落合并后轮转插入类别标记（追加到现有内容末尾） */
export function appendCategoryLine(current: string, category: string): string {
  const line = `- [${category}] `
  const trimmed = current.trimEnd()
  return trimmed ? `${trimmed}\n${line}` : line
}

export interface WorkLogEntry {
  /** YYYY-MM-DD，每天一篇唯一主键 */
  date: string
  title: string
  /** 今天做了什么 */
  done: string
  /** 遇到的问题与解决 */
  problem: string
  /** 总结 */
  summary: string
  /** 明日计划（可选） */
  plan: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type WorkLogDraft = Pick<
  WorkLogEntry,
  'date' | 'title' | 'done' | 'problem' | 'summary' | 'plan' | 'tags'
>

/** JSON 导入导出包（downloadJson / importJson 的载体） */
export interface WorkLogJsonBundle {
  version: 1
  exportedAt: string
  entries: WorkLogEntry[]
}

/** 本地时区的今天（YYYY-MM-DD） */
export function todayDateString(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 未填标题时的默认标题「工作日志 · 日期」 */
export function defaultWorkLogTitle(date: string): string {
  return `工作日志 · ${date}`
}

/** 四段正文去掉空白后的总字数 */
export function wordCount(entry: Pick<WorkLogEntry, 'done' | 'problem' | 'summary' | 'plan'>): number {
  return (entry.done + entry.problem + entry.summary + entry.plan).replace(/\s/g, '').length
}

/** 标签清洗：去 # 前缀、去空去重，并始终保留内置标签 worklog */
export function normalizeTags(tags: string[] | undefined | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags ?? []) {
    const t = String(raw).trim().replace(/^#/, '')
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  if (!out.includes('worklog')) out.unshift('worklog')
  return out
}

/** 把逗号 / 顿号 / 分号 / 空白分隔的输入拆成标签数组 */
export function parseTagInput(text: string): string[] {
  return text
    .split(/[,，、;\s]+/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)
}

/** 取正文第一处有意义文本（列表摘要） */
export function workLogExcerpt(entry: WorkLogEntry, max = 56): string {
  const candidates = [entry.done, entry.problem, entry.summary, entry.plan]
    .map((s) => s.trim())
    .filter(Boolean)
  const text = candidates[0] ?? ''
  const stripped = text
    .replace(/^[-*#>\d.、\s]+/gm, '')
    .replace(/[*_`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped
}

/** 分词：连续中文 2~8 字或英文/数字词；先剔除类别标记与 Markdown 符号 */
function tokenizeForKeywords(text: string): string[] {
  const cleaned = text
    .replace(CATEGORY_LINE_RE, ' ')
    .replace(/[`*_#>\[\]()（）·|/\\-]/g, ' ')
  const tokens: string[] = []
  const re = /[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9_-]{2,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    const w = m[0].toLowerCase()
    if (STOP_WORDS.has(w) || STOP_WORDS.has(m[0])) continue
    tokens.push(m[0])
  }
  return tokens
}

/** 本周高频词（最近 7 天，含今天） */
export function weekKeywordStats(
  entries: WorkLogEntry[],
  today = todayDateString(),
  topN = 8,
): Array<{ word: string; count: number }> {
  const start = new Date(`${today}T12:00:00`)
  start.setDate(start.getDate() - 6)
  const from = start.toISOString().slice(0, 10)
  const counts = new Map<string, number>()
  for (const e of entries) {
    if (e.date < from || e.date > today) continue
    const blob = `${e.title}\n${e.done}\n${e.problem}\n${e.summary}\n${e.plan}\n${(e.tags ?? []).join(' ')}`
    for (const w of tokenizeForKeywords(blob)) {
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'zh'))
    .slice(0, topN)
}

/** 条数最多的类别；无任何标记时返回 null */
export function topCategoryOf(entries: WorkLogEntry[]): { name: string; count: number } | null {
  const dist = categorySummary(entries)
  let best: { name: string; count: number } | null = null
  for (const [name, count] of Object.entries(dist)) {
    if (!best || count > best.count) best = { name, count }
  }
  return best
}

/** 日期加减天数；固定取正午 12 点构造 Date，避免时区偏移把日期推到前一天/后一天 */
function shiftIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 连续打卡缺口：昨天有写、今天还没写 */
export function streakGapHint(entries: WorkLogEntry[], today = todayDateString()): string | null {
  const dates = new Set(entries.map((e) => e.date))
  if (dates.has(today)) return null
  const yesterday = shiftIsoDate(today, -1)
  if (!dates.has(yesterday)) return null
  return `昨天（${yesterday}）已写，今天还没补 —— 连续打卡可能断掉`
}

/** 读取提醒间隔天数（钳制 1~90，非法回退默认 7 天） */
export function getBackupIntervalDays(): number {
  const n = Number(localStorage.getItem(WORKLOG_BACKUP_INTERVAL_KEY) || WORKLOG_DEFAULT_BACKUP_DAYS)
  return Number.isFinite(n) && n >= 1 ? Math.min(90, Math.floor(n)) : WORKLOG_DEFAULT_BACKUP_DAYS
}

/** 写入提醒间隔天数（钳制 1~90） */
export function setBackupIntervalDays(days: number): void {
  localStorage.setItem(WORKLOG_BACKUP_INTERVAL_KEY, String(Math.max(1, Math.min(90, days))))
}

/** 上次导出时间戳；从未导出返回 null */
export function getLastExportAt(): number | null {
  const raw = localStorage.getItem(WORKLOG_BACKUP_AT_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** 导出成功后记录时间，并清掉「稍后再提醒」 */
export function markExportedNow(): void {
  localStorage.setItem(WORKLOG_BACKUP_AT_KEY, String(Date.now()))
  localStorage.removeItem(WORKLOG_BACKUP_DISMISS_KEY)
}

/** 「稍后再提醒」：hours 小时内不再弹备份提醒 */
export function dismissBackupReminder(hours = 24): void {
  localStorage.setItem(WORKLOG_BACKUP_DISMISS_KEY, String(Date.now() + hours * 3600_000))
}

/** 是否弹备份提醒：有内容、未被暂缓、且距上次导出已超过设定间隔 */
export function shouldShowBackupReminder(hasEntries: boolean): boolean {
  if (!hasEntries) return false
  const dismissUntil = Number(localStorage.getItem(WORKLOG_BACKUP_DISMISS_KEY) || 0)
  if (dismissUntil && Date.now() < dismissUntil) return false
  const last = getLastExportAt()
  if (!last) return true
  const days = getBackupIntervalDays()
  return Date.now() - last >= days * 86400_000
}

// ===== IndexedDB 本地缓存（离线可用；云端开启时作为回写缓存） =====
/** 打开 / 升级 worklog 库（v1：仅建 entries 表，主键 date） */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WORKLOG_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(WORKLOG_STORE)) {
        db.createObjectStore(WORKLOG_STORE, { keyPath: 'date' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** IDB 的 Promise 封装：下面四个函数分别对应全量读 / 按主键读 / 写 / 删 */
async function idbGetAll(): Promise<WorkLogEntry[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKLOG_STORE, 'readonly')
    const req = tx.objectStore(WORKLOG_STORE).getAll()
    req.onsuccess = () => resolve((req.result ?? []) as WorkLogEntry[])
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(date: string): Promise<WorkLogEntry | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKLOG_STORE, 'readonly')
    const req = tx.objectStore(WORKLOG_STORE).get(date)
    req.onsuccess = () => resolve(req.result as WorkLogEntry | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(entry: WorkLogEntry): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKLOG_STORE, 'readwrite')
    tx.objectStore(WORKLOG_STORE).put(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(date: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKLOG_STORE, 'readwrite')
    tx.objectStore(WORKLOG_STORE).delete(date)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ===== Markdown / JSON 导入导出 =====
/** 截取 `## 标题` 到下一个二级标题之间的正文，并去掉代码围栏 */
function grabSection(block: string, heading: string): string {
  const idx = block.indexOf(`## ${heading}`)
  if (idx < 0) return ''
  const rest = block.slice(idx + heading.length + 4)
  const end = rest.indexOf('\n## ')
  const seg = (end < 0 ? rest : rest.slice(0, end)).trim()
  return seg.replace(/^```\w*\s*\n?|\n?```$/g, '').trim()
}

/** 从引用行 `> 标签：…` 解析标签；没有则仅返回内置 worklog */
function extractTagsFromBlock(block: string): string[] {
  const m = block.match(/>\s*标签[：:]\s*(.+)$/m)
  if (!m?.[1]) return ['worklog']
  return normalizeTags(parseTagInput(m[1]))
}

/** 单篇 → Markdown */
export function entryToMarkdown(e: WorkLogEntry): string {
  const tags = normalizeTags(e.tags).filter((t) => t !== 'worklog')
  const lines = [
    `# ${e.title}`,
    '',
    `> 日期：${e.date} · 字数：${wordCount(e)}`,
    '',
  ]
  if (tags.length) {
    lines.push(`> 标签：${tags.join('、')}`, '')
  }
  lines.push(
    '## 今天做了什么',
    '',
    e.done.trim() || '（未记录）',
    '',
    '## 遇到的问题与解决',
    '',
    e.problem.trim() || '（未记录）',
    '',
    '## 总结',
    '',
    e.summary.trim() || '（未记录）',
    '',
  )
  if (e.plan.trim()) {
    lines.push('## 明日计划', '', e.plan.trim(), '')
  }
  return `${lines.join('\n')}\n`
}

/** 解析导出/导入用的 Markdown 块 */
export function parseWorkLogMarkdown(text: string): WorkLogEntry[] {
  const blocks = text.split(/^---\s*$/m).map((b) => b.trim()).filter(Boolean)
  const out: WorkLogEntry[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const date =
      (lines[0]?.match(/^# 工作日志[（(](\d{4}-\d{2}-\d{2})[)）]/) ||
        lines[0]?.match(/^#\s+(\d{4}-\d{2}-\d{2})/) ||
        block.match(/>\s*日期[：:]\s*(\d{4}-\d{2}-\d{2})/))?.[1]
    if (!date) continue
    const title = lines[0]?.replace(/^#\s+/, '').trim() || defaultWorkLogTitle(date)
    out.push({
      date,
      title,
      done: grabSection(block, '今天做了什么'),
      problem: grabSection(block, '遇到的问题与解决'),
      summary: grabSection(block, '总结'),
      plan: grabSection(block, '明日计划'),
      tags: extractTagsFromBlock(block),
      createdAt: Date.parse(`${date}T00:00:00`) || Date.now(),
      updatedAt: Date.now(),
    })
  }
  return out
}

/** 解析 JSON 导入（兼容 {entries} 包与裸数组两种形态），字段缺失时逐项兜底 */
export function parseWorkLogJson(text: string): WorkLogEntry[] {
  const data = JSON.parse(text) as WorkLogJsonBundle | WorkLogEntry[]
  const list = Array.isArray(data) ? data : data?.entries
  if (!Array.isArray(list)) return []
  return list
    .filter((e) => e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .map((e) => ({
      date: e.date,
      title: String(e.title || defaultWorkLogTitle(e.date)),
      done: String(e.done ?? ''),
      problem: String(e.problem ?? ''),
      summary: String(e.summary ?? ''),
      plan: String(e.plan ?? ''),
      tags: normalizeTags(e.tags),
      createdAt: Number(e.createdAt) || Date.parse(`${e.date}T00:00:00`) || Date.now(),
      updatedAt: Number(e.updatedAt) || Date.now(),
    }))
}

/** 触发浏览器下载：临时 <a> + revoke，避免残留 blob 引用 */
function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ===== 云端 API 字段映射 =====
/** 云端记录 → 本地结构（workDate 归一为 date）；日期非法返回 null 供调用方过滤 */
function fromApiEntry(e: WorkLogApiEntry): WorkLogEntry | null {
  const date = (e.date || e.workDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return {
    date,
    title: e.title || defaultWorkLogTitle(date),
    done: e.done ?? '',
    problem: e.problem ?? '',
    summary: e.summary ?? '',
    plan: e.plan ?? '',
    tags: normalizeTags(e.tags),
    createdAt: Number(e.createdAt) || Date.parse(`${date}T00:00:00`) || Date.now(),
    updatedAt: Number(e.updatedAt) || Date.now(),
  }
}

/** 本地结构 → 云端保存 / 导入接口请求体（date 映射为 workDate） */
function toApiBody(e: WorkLogEntry) {
  return {
    workDate: e.date,
    title: e.title,
    done: e.done,
    problem: e.problem,
    summary: e.summary,
    plan: e.plan,
    tags: normalizeTags(e.tags),
  }
}

/**
 * 工作日志数据源（组件单例级）
 */
export function useWorkLog() {
  const entries = ref<WorkLogEntry[]>([])
  const loading = ref(false)
  const error = ref('')
  /** 云端同步：登录且 worklog 模块开启时由页面打开 */
  const cloudEnabled = ref(false)
  const cloudStatus = ref<'offline' | 'syncing' | 'ok' | 'error'>('offline')
  /** 列表展示条数（「加载更多」逐步扩大） */
  const limit = ref(WORKLOG_PAGE_SIZE)

  /** 全量条目按日期倒序 */
  const sorted = computed(() =>
    [...entries.value].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  )

  const today = todayDateString()

  /** 按日期倒序的列表（默认取最近 limit 篇） */
  const list = computed(() => sorted.value.slice(0, limit.value))

  const hasMore = computed(() => sorted.value.length > limit.value)

  function loadMore(step = WORKLOG_PAGE_SIZE) {
    limit.value += step
  }

  function resetLimit() {
    limit.value = WORKLOG_PAGE_SIZE
  }

  /** 页面按登录态与模块开关切换云端能力；关闭时状态复位 offline */
  function setCloudEnabled(on: boolean) {
    cloudEnabled.value = on
    if (!on) cloudStatus.value = 'offline'
  }

  /** 统计面板：总篇数 / 字数 / 本月篇数 / 连续打卡 / 周热词 / 最高频类别 / 断卡提示 */
  const stats = computed(() => {
    const words = entries.value.reduce((acc, e) => acc + wordCount(e), 0)
    const month = today.slice(0, 7)
    const monthCount = entries.value.filter((e) => e.date.startsWith(month)).length
    const dates = new Set(sorted.value.map((e) => e.date))
    // 连续打卡：今天没写则从昨天起算，向前数到第一个断档
    let streak = 0
    const cursor = new Date(`${today}T12:00:00`)
    if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1)
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }
    const weekKeywords = weekKeywordStats(entries.value, today)
    const topCategory = topCategoryOf(entries.value)
    const gapHint = streakGapHint(entries.value, today)
    return { total: entries.value.length, words, monthCount, streak, weekKeywords, topCategory, gapHint }
  })

  /** 只从 IndexedDB 重载列表（云端路径失败时的兜底） */
  /** 云端端点缺失（404 = 功能未部署）按「待命」处理，不算异常 */
  function isCloudMissing(e: unknown): boolean {
    return (e as { response?: { status?: number } } | null)?.response?.status === 404
  }

  async function reloadLocalOnly(): Promise<void> {
    entries.value = (await idbGetAll()).sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  /** 从云端拉取并写入本地缓存（云端空且本地有数据时不覆盖） */
  async function pullFromCloud(): Promise<boolean> {
    if (!cloudEnabled.value) return false
    cloudStatus.value = 'syncing'
    try {
      const res = await listWorkLogs(500)
      if (res.data?.code !== 0 || !Array.isArray(res.data.data)) {
        cloudStatus.value = 'error'
        return false
      }
      const mapped = res.data.data.map(fromApiEntry).filter((e): e is WorkLogEntry => !!e)
      const local = await idbGetAll()
      if (!mapped.length && local.length) {
        // 首次上云：保留本地，由页面自动 push
        entries.value = local.sort((a, b) => (a.date < b.date ? 1 : -1))
        cloudStatus.value = 'ok'
        return true
      }
      // 云端有数据：以云端为准，整表替换本地缓存
      if (mapped.length) {
        for (const old of local) await idbDelete(old.date)
        for (const e of mapped) await idbPut(e)
        entries.value = mapped.sort((a, b) => (a.date < b.date ? 1 : -1))
      } else {
        entries.value = []
      }
      cloudStatus.value = 'ok'
      return true
    } catch (e) {
      // 云端能力未部署（404）视为待命而非异常，页面保持本地模式
      const status = (e as { response?: { status?: number } } | null)?.response?.status
      cloudStatus.value = status === 404 ? 'offline' : 'error'
      return false
    }
  }

  /** 把本地全部推到云端（首次上云 / 手动同步） */
  async function pushAllToCloud(overwrite = true): Promise<{ imported: number; skipped: number } | null> {
    if (!cloudEnabled.value) return null
    cloudStatus.value = 'syncing'
    try {
      const local = await idbGetAll()
      const res = await importWorkLogs(local.map(toApiBody), overwrite)
      if (res.data?.code !== 0) {
        cloudStatus.value = 'error'
        return null
      }
      cloudStatus.value = 'ok'
      return {
        imported: res.data.data?.imported ?? 0,
        skipped: res.data.data?.skipped ?? 0,
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } } | null)?.response?.status
      cloudStatus.value = status === 404 ? 'offline' : 'error'
      return null
    }
  }

  /** 对外统一加载入口：云端开启则先拉云端，失败回退本地 */
  async function reload(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      if (cloudEnabled.value) {
        const ok = await pullFromCloud()
        if (!ok) await reloadLocalOnly()
      } else {
        await reloadLocalOnly()
      }
    } catch {
      error.value = '读取日志失败'
    } finally {
      loading.value = false
    }
  }

  /** 取某天日志：云端命中则回写本地缓存，未开启或失败时用本地 */
  async function getByDate(date: string): Promise<WorkLogEntry | undefined> {
    const local = await idbGet(date)
    if (!cloudEnabled.value) return local
    try {
      const res = await getWorkLogByDate(date)
      if (res.data?.code === 0 && res.data.data) {
        const mapped = fromApiEntry(res.data.data)
        if (mapped) {
          await idbPut(mapped)
          return mapped
        }
      }
    } catch {
      /* fall through */
    }
    return local
  }

  /** 保存（新建或覆盖当天） */
  async function save(draft: WorkLogDraft): Promise<void> {
    const prev = await idbGet(draft.date)
    const now = Date.now()
    const entry: WorkLogEntry = {
      date: draft.date,
      title: draft.title.trim() || defaultWorkLogTitle(draft.date),
      done: draft.done.trim(),
      problem: draft.problem.trim(),
      summary: draft.summary.trim(),
      plan: draft.plan.trim(),
      tags: normalizeTags(draft.tags?.length ? draft.tags : prev?.tags),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }
    await idbPut(entry)
    if (cloudEnabled.value) {
      try {
        const res = await saveWorkLog(toApiBody(entry))
        cloudStatus.value = res.data?.code === 0 ? 'ok' : 'error'
      } catch (e) {
        cloudStatus.value = isCloudMissing(e) ? 'offline' : 'error'
      }
    }
    await reloadLocalOnly()
  }

  /** 删除某天：本地必删，云端开启时同步删并刷新状态 */
  async function remove(date: string): Promise<void> {
    await idbDelete(date)
    if (cloudEnabled.value) {
      try {
        await deleteWorkLog(date)
        cloudStatus.value = 'ok'
      } catch (e) {
        cloudStatus.value = isCloudMissing(e) ? 'offline' : 'error'
      }
    }
    await reloadLocalOnly()
  }

  /** 全部条目合成 Markdown（含每天的做了什么 / 总结） */
  function toMarkdown(): string {
    const head = [
      '# 每日工作日志',
      '',
      `> 共 ${entries.value.length} 篇 · 导出时间 ${new Date().toLocaleString('zh-CN')}`,
      '',
    ].join('\n')
    const body = sorted.value.map((e) => `---\n\n${entryToMarkdown(e).trim()}`).join('\n\n')
    return `${head}\n${body}\n`
  }

  /** 跨设备同步包（保留 tags / 时间戳，配合 downloadJson 导出） */
  function toJsonBundle(): WorkLogJsonBundle {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: sorted.value.map((e) => ({ ...e, tags: normalizeTags(e.tags) })),
    }
  }

  /** 下载导出文件（Markdown） */
  function downloadMarkdown(): void {
    downloadBlob(toMarkdown(), `WORKLOG-${today}.md`, 'text/markdown;charset=utf-8')
    markExportedNow()
  }

  /** 跨设备同步包（JSON，保留 tags / 时间戳） */
  function downloadJson(): void {
    downloadBlob(JSON.stringify(toJsonBundle(), null, 2), `WORKLOG-sync-${today}.json`, 'application/json;charset=utf-8')
    markExportedNow()
  }

  /** 导出单篇 Markdown；当天不存在返回 false */
  function downloadEntryMarkdown(date: string): boolean {
    const e = entries.value.find((x) => x.date === date)
    if (!e) return false
    downloadBlob(entryToMarkdown(e), `WORKLOG-${date}.md`, 'text/markdown;charset=utf-8')
    return true
  }

  /** 复制单篇 Markdown 到剪贴板；环境不支持 clipboard API 返回 false */
  async function copyEntryMarkdown(date: string): Promise<boolean> {
    const e = entries.value.find((x) => x.date === date) ?? (await idbGet(date))
    if (!e) return false
    const md = entryToMarkdown(e)
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(md)
      return true
    }
    return false
  }

  /** 批量写入导入条目（本地 + 云端）；返回导入数、跳过数与冲突日期列表 */
  async function importEntries(
    parsed: WorkLogEntry[],
    opts?: { overwrite?: boolean },
  ): Promise<{ imported: number; skipped: number; conflicted: string[] }> {
    const existing = new Set(entries.value.map((e) => e.date))
    const conflicted = parsed.filter((e) => existing.has(e.date)).map((e) => e.date)
    let imported = 0
    let skipped = 0
    const accepted: WorkLogEntry[] = []
    for (const e of parsed) {
      if (existing.has(e.date) && opts?.overwrite === false) {
        skipped++
        continue
      }
      const row = { ...e, tags: normalizeTags(e.tags) }
      await idbPut(row)
      accepted.push(row)
      imported++
    }
    if (cloudEnabled.value && accepted.length) {
      try {
        await importWorkLogs(accepted.map(toApiBody), opts?.overwrite !== false)
        cloudStatus.value = 'ok'
      } catch (e) {
        cloudStatus.value = isCloudMissing(e) ? 'offline' : 'error'
      }
    }
    await reloadLocalOnly()
    return { imported, skipped, conflicted }
  }

  /** 从 Markdown 文本导入；overwrite=false 时跳过已存在日期 */
  async function importMarkdown(
    text: string,
    opts?: { overwrite?: boolean },
  ): Promise<{ imported: number; skipped: number; conflicted: string[] }> {
    return importEntries(parseWorkLogMarkdown(text), opts)
  }

  /** 从 JSON 同步包导入（行为同 importMarkdown） */
  async function importJson(
    text: string,
    opts?: { overwrite?: boolean },
  ): Promise<{ imported: number; skipped: number; conflicted: string[] }> {
    return importEntries(parseWorkLogJson(text), opts)
  }

  return {
    entries,
    sorted,
    list,
    hasMore,
    limit,
    loadMore,
    resetLimit,
    stats,
    loading,
    error,
    today,
    cloudEnabled,
    cloudStatus,
    setCloudEnabled,
    pullFromCloud,
    pushAllToCloud,
    reload,
    getByDate,
    save,
    remove,
    toMarkdown,
    toJsonBundle,
    downloadMarkdown,
    downloadJson,
    downloadEntryMarkdown,
    copyEntryMarkdown,
    entryToMarkdown,
    importMarkdown,
    importJson,
    importEntries,
  }
}

/** useWorkLog 的返回类型，供组件变量标注复用 */
export type WorkLogApi = ReturnType<typeof useWorkLog>
