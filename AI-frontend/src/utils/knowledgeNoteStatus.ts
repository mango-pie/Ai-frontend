/**
 * 知识库笔记的状态字典：把后端的发布 / 入库（向量化）枚举映射为中文标签与徽标颜色，
 * 并集中收口各操作按钮（发布、同步、入库、重建）的可用性判断。
 */
/* 联合类型末尾兜底 string：后端未来新增枚举值时前端不至于类型报错 */
export type PublishStatus =
  | 'NOT_PUBLISHED'
  | 'DRAFT_CREATED'
  | 'PUBLISHED'
  | 'SYNC_REQUIRED'
  | 'SYNC_FAILED'
  | string

export type IndexStatus =
  | 'NOT_INDEXED'
  | 'INDEXED'
  | 'REINDEX_REQUIRED'
  | 'INDEX_FAILED'
  | string

/** 发布状态 → 中文标签；未知值原样透出，空值显示占位符 */
export function publishStatusLabel(status?: string): string {
  switch (status) {
    case 'NOT_PUBLISHED':
      return '未发布'
    case 'DRAFT_CREATED':
      return '草稿'
    case 'PUBLISHED':
      return '已发布'
    case 'SYNC_REQUIRED':
      return '需同步'
    case 'SYNC_FAILED':
      return '同步失败'
    default:
      return status || '-'
  }
}

/** 发布状态 → antd 徽标语义色 */
export function publishStatusColor(status?: string): string {
  switch (status) {
    case 'NOT_PUBLISHED':
      return 'default'
    case 'DRAFT_CREATED':
      return 'processing'
    case 'PUBLISHED':
      return 'success'
    case 'SYNC_REQUIRED':
      return 'warning'
    case 'SYNC_FAILED':
      return 'error'
    default:
      return 'default'
  }
}

/** 入库（向量化）状态 → 中文标签；未知值原样透出 */
export function indexStatusLabel(status?: string): string {
  switch (status) {
    case 'NOT_INDEXED':
      return '未入库'
    case 'INDEXED':
      return '已入库'
    case 'REINDEX_REQUIRED':
      return '需重建'
    case 'INDEX_FAILED':
      return '入库失败'
    default:
      return status || '-'
  }
}

/** 入库状态 → antd 徽标语义色 */
export function indexStatusColor(status?: string): string {
  switch (status) {
    case 'NOT_INDEXED':
      return 'default'
    case 'INDEXED':
      return 'success'
    case 'REINDEX_REQUIRED':
      return 'warning'
    case 'INDEX_FAILED':
      return 'error'
    default:
      return 'default'
  }
}

/** 笔记来源类型 → 中文标签 */
export function sourceTypeLabel(type?: string): string {
  switch ((type || '').toUpperCase()) {
    case 'URL':
      return 'URL'
    case 'FILE':
      return '文件'
    case 'AGENT':
      return 'AI 搜索'
    default:
      return type || '-'
  }
}

/** 只有未发布（或无状态）的笔记才允许发起首次发布 */
export function canPublishBlog(publishStatus?: string): boolean {
  return !publishStatus || publishStatus === 'NOT_PUBLISHED'
}

/** 需同步或曾同步失败时才允许重新同步到博客 */
export function canSyncBlog(publishStatus?: string): boolean {
  return publishStatus === 'SYNC_REQUIRED' || publishStatus === 'SYNC_FAILED'
}

/** 未入库或入库失败的笔记才允许发起入库 */
export function canIndexKb(indexStatus?: string): boolean {
  return !indexStatus || indexStatus === 'NOT_INDEXED' || indexStatus === 'INDEX_FAILED'
}

/** 需重建或入库失败时才允许重建索引 */
export function canReindexKb(indexStatus?: string): boolean {
  return indexStatus === 'REINDEX_REQUIRED' || indexStatus === 'INDEX_FAILED'
}
