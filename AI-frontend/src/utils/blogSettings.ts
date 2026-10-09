/**
 * 博客模块 UX 设置（站点设置 blog 分组）：列表分页默认值、摘要长度、点赞/阅读计数开关、
 * 新建文章默认状态等。读取后端配置并做会话级缓存，失败一律回落默认值。
 */
import { getSiteSettingValues } from '@/api/siteSettings'

/** blog 分组设置的前端视图（后端 key 映射为强类型字段） */
export type BlogUxSettings = {
  pageSizeDefault: number
  summaryMaxLength: number
  allowLike: boolean
  viewCountEnabled: boolean
  /** 新建文章状态：DRAFT=0 / PUBLISHED=1 / OFFLINE=2 */
  defaultStatus: number
  defaultStatusKey: 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
}

const DEFAULTS: BlogUxSettings = {
  pageSizeDefault: 10,
  summaryMaxLength: 200,
  allowLike: true,
  viewCountEnabled: true,
  defaultStatus: 0,
  defaultStatusKey: 'DRAFT',
}

let cache: BlogUxSettings | null = null
let inflight: Promise<BlogUxSettings> | null = null

/** 宽容解析布尔：兼容后端回传的 "true"/"1" 等字符串，非法值回落默认 */
function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value == null) return fallback
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return fallback
}

/** 宽容解析整数：非有限数（空串/乱码）回落默认，取整不四舍五入 */
function toInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/** 状态字符串 → 数据库状态码；大小写不敏感，未知值一律按草稿（0）处理 */
export function blogStatusToInt(status: unknown): number {
  const key = String(status || 'DRAFT').trim().toUpperCase()
  if (key === 'PUBLISHED') return 1
  if (key === 'OFFLINE') return 2
  return 0
}

/**
 * 读取 blog 分组设置；会话内缓存，并发调用共享同一个在途请求。
 * @param force 为 true 时绕过缓存强制刷新
 * @returns 解析后的设置；接口失败或响应异常时返回默认值
 */
export async function loadBlogSettings(force = false): Promise<BlogUxSettings> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    try {
      const res = await getSiteSettingValues('blog')
      if (res.data.code !== 0 || !res.data.data?.values) {
        cache = { ...DEFAULTS }
        return cache
      }
      const values = res.data.data.values
      const statusKeyRaw = String(values['editor.default_status'] || 'DRAFT')
        .trim()
        .toUpperCase()
      const statusKey =
        statusKeyRaw === 'PUBLISHED' || statusKeyRaw === 'OFFLINE' || statusKeyRaw === 'DRAFT'
          ? statusKeyRaw
          : 'DRAFT'
      cache = {
        pageSizeDefault: toInt(values['list.page_size_default'], DEFAULTS.pageSizeDefault),
        summaryMaxLength: toInt(values['post.summary_max_length'], DEFAULTS.summaryMaxLength),
        allowLike: toBool(values['post.allow_like'], DEFAULTS.allowLike),
        viewCountEnabled: toBool(values['post.view_count_enabled'], DEFAULTS.viewCountEnabled),
        defaultStatus: blogStatusToInt(statusKey),
        defaultStatusKey: statusKey as BlogUxSettings['defaultStatusKey'],
      }
      return cache
    } catch {
      cache = { ...DEFAULTS }
      return cache
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** 清空缓存与在途请求（如管理端改完配置后），下次读取会重新拉取 */
export function clearBlogSettingsCache() {
  cache = null
  inflight = null
}

/** 公开页点赞/阅读关闭后本地降级 */
export function markBlogLikeDisabled() {
  if (cache) cache = { ...cache, allowLike: false }
  else cache = { ...DEFAULTS, allowLike: false }
}

/** 阅读计数同理：后端判定关闭后本地降级，避免公开页反复发无效请求 */
export function markBlogViewDisabled() {
  if (cache) cache = { ...cache, viewCountEnabled: false }
  else cache = { ...DEFAULTS, viewCountEnabled: false }
}
