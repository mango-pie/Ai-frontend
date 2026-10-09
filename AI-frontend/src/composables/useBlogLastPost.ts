/**
 * 博客「最近阅读」记忆：用 sessionStorage 记住最后一篇正在阅读的文章，
 * 供导航栏再次进入博客时直接恢复到该文章，而不是每次都落在列表页。
 */
const STORAGE_KEY = 'blog-last-post-id'

/** 读取并校验存储的文章 id，非法值统一回退 null */
function readStoredPostId(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

/** 记录当前阅读的文章，供切换页面后回到该文章 */
export function rememberLastBlogPost(postId: number | undefined | null) {
  if (!postId || postId <= 0) return
  sessionStorage.setItem(STORAGE_KEY, String(postId))
}

/** 导航栏进入博客时：有最近文章则打开文章，否则进入列表 */
export function getBlogMenuPath(): string {
  const id = readStoredPostId()
  return id ? `/blog/${id}` : '/blog'
}

/** 导航栏点击「随笔」：已在文章/编辑/筛选等子页则回列表，否则恢复最近阅读或进列表 */
export function resolveBlogMenuClickPath(currentPath: string): string {
  if (currentPath.startsWith('/blog/') || currentPath.startsWith('/category/') || currentPath.startsWith('/tag/')) {
    return '/blog'
  }
  return getBlogMenuPath()
}

/** 解析编辑页返回地址 */
export function resolveBlogReturnPath(from: unknown, fallback?: string | null): string | null {
  if (typeof from === 'string' && from.startsWith('/blog')) {
    return from
  }
  if (fallback) {
    return fallback
  }
  return null
}
