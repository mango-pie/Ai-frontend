/**
 * 日记模块的共享类型定义，供编辑页、自动保存与后端交互层共用。
 */

/** 日记保存载荷：diaryDate 必填（唯一键），其余为可编辑字段，status 区分草稿/正式 */
export interface DiarySavePayload {
  diaryDate: string
  title?: string
  content?: string
  mood?: string
  weather?: string
  tags?: string[]
  status?: number
  coverUrl?: string
}
