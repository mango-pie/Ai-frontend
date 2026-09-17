/**
 * V3 领域知识树 — 类型定义
 * 对应后端 LearningAdminController + LearningTreeServiceImpl
 */

/** 领域（知识树顶层）：一个领域对应一棵独立的知识树 */
export interface LearningDomain {
  id: number | string
  userId?: number | string
  name: string
  sortOrder: number
  createTime?: string
  updateTime?: string
}

/** 树枝节点（扁平列表，通过 parentBranchId 组织为两层树） */
export interface LearningBranchTreeNode {
  id: number | string
  domainId: number | string
  parentBranchId: number | string
  depth: 1 | 2
  title: string
  /** 路径展示，如 "Java > 集合" */
  path: string
  leafCount: number
  sortOrder: number
}

/** 知识树快照：领域 + 全部枝节点；超限时置位 snapshotTruncated 提示截断 */
export interface LearningTreeVO {
  domain: LearningDomain
  branches: LearningBranchTreeNode[]
  snapshotTruncated?: boolean
  snapshotMessage?: string
}

/** 叶子（挂在枝上的笔记引用），携带发布/索引/评审状态供树视图展示 */
export interface LearningLeafVO {
  noteId: number | string
  title: string
  /** 后端返回字段（noteTitle），兼容别名 */
  noteTitle?: string
  summary?: string
  publishStatus?: string
  indexStatus?: string
  reviewStatus?: string
  attachedAt?: string
  sortOrder?: number
}

/** AI 门闩提问入参：判断问题与领域的相关性和意图 */
export interface GateRequest {
  domainId: number | string
  question: string
}

/** 门闩意图：仅闲聊 / 建新枝 / 挂叶三种走向 */
export type GateIntent = 'CHAT_ONLY' | 'BRANCH' | 'LEAF'

/** 门闩响应：是否相关、意图、建议挂载的枝及直接回答 */
export interface GateResponse {
  related: boolean
  reason?: string
  intent: GateIntent
  gatePassId?: string
  suggestedBranchId?: number | string | null
  suggestedBranchTitle?: string | null
  answer?: string
  hints?: string[]
}

/** 挂叶请求：可挂到已有枝，或同时新建枝（含父枝） */
export interface AttachRequest {
  domainId: number | string
  noteId: number | string
  branchId?: number | string
  newBranchTitle?: string
  parentBranchId?: number | string
}

/** 挂叶结果：叶子 id 与最终落入的枝 id */
export interface AttachResponse {
  leafId: number | string
  branchId: number | string
}

/** AI 批量挂枝建议项：为单条笔记推荐的目标枝 */
export interface BatchSuggestItem {
  noteId: number | string
  suggestedBranchId?: number | string
  suggestedBranchTitle?: string
}

/** 枝级复习自测（答案折叠，供前端复习 UI 使用） */
export interface LearningReviewQuizVO {
  branchId?: number | string
  branchTitle?: string
  questions: LearningReviewQuestion[]
}

/** 复习自测中的单道问答（答案默认折叠） */
export interface LearningReviewQuestion {
  question: string
  answer: string
}
