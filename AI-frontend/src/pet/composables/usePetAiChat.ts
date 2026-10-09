/**
 * 桌宠 AI 对话 composable：负责桌宠专属对话的创建/复用与 SSE 流式问答。
 *
 * 对话 id 持久化在 localStorage；失效（如会话过期被后端拒绝）时自动
 * 重建对话并重试一次。桌宠角色从 /chat/configs 列表中按关键词模糊挑选
 * 并缓存。另提供最近历史的加载，用于打开聊天面板时回填上下文。
 */
import { ref } from 'vue'
import { resolveDefault, listMessages } from '@/api/chatConversationController'
import { parseApiBody } from '@/utils/safeJson'
import { readSseChatEvents } from '@/utils/sseChatStream'

// 当前对话 id 的持久化键，以及两代旧版键（读取时负责清理迁移）
const PET_CHAT_CONVERSATION_ID_KEY = 'pet_chat_conversation_id'
const LEGACY_PET_CHAT_APP_ID_KEY = 'pet_chat_app_id_v2'
const LEGACY_PET_CHAT_APP_ID_V1 = 'pet_chat_app_id_v1'

/** 聊天面板展示的一条消息（用户 / AI） */
export interface PetChatMessage {
  role: 'user' | 'ai'
  content: string
  streaming?: boolean
}

/** 分段消息片段：纯文本或图片附件，走 segment_plan 分段播放协议 */
export interface PetChatSegment {
  type: 'plain' | 'image'
  text?: string
  attachmentId?: string
}

/** 流式问答回调：增量文本、分段播放计划（可带每段延迟）与完成通知 */
export interface PetStreamHandlers {
  onChunk?: (text: string) => void
  onSegmentPlan?: (segments: string[], delays?: number[]) => Promise<void>
  onDone?: () => void
}

/** 会话 id 必须是纯数字字符串才视为合法缓存 */
function isValidConversationId(value: string) {
  return /^\d+$/.test(value)
}

/** 用角色配置 id 向后端换取（或复用）一个桌宠专属对话 */
async function resolvePetConversation(configId: string): Promise<string> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat/conversations/resolve`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ configId }),
  })

  const raw = await response.text()
  const body = parseApiBody(raw)
  const data = body.data as { id?: number } | null | undefined
  if (body.code !== 0 || data?.id == null) {
    throw new Error(body.message || '创建桌宠对话失败')
  }

  return String(data.id)
}

/**
 * 按对话 id 发起 SSE 流式聊天：请求体二选一——带 segments 时走分段协议，
 * 否则发送纯文本 message；边接收边回调，最终返回完整回复文本。
 */
async function streamChatByConversationId(
  currentConversationId: string,
  question: string,
  handlers?: PetStreamHandlers,
  segments?: PetChatSegment[],
): Promise<string> {
  const base = import.meta.env.VITE_API_BASE_URL
  const requestBody: Record<string, unknown> = {
    conversationId: Number(currentConversationId),
  }
  if (segments?.length) {
    requestBody.segments = segments
  } else {
    requestBody.message = question
  }

  const response = await fetch(`${base}/chat/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  if (!response.ok || !response.body) {
    throw new Error('请求失败')
  }

  let fullText = ''
  await readSseChatEvents(response.body, async (payload) => {
    // 兼容两种事件格式：标准 event 字段，或旧协议里直接带 d 的默认 chunk
    const event = payload.event ?? (payload.d ? 'chunk' : undefined)

    if (event === 'chunk' && payload.d) {
      // 增量文本：累积并透传给调用方逐字渲染
      fullText += payload.d
      handlers?.onChunk?.(payload.d)
    } else if (event === 'segment_plan' && payload.segments?.length) {
      // 分段计划：后端已切好句子，交给调用方按延迟逐段播放
      fullText = payload.segments.join('')
      if (handlers?.onSegmentPlan) {
        await handlers.onSegmentPlan(payload.segments, payload.delays)
      }
    } else if (event === 'done') {
      handlers?.onDone?.()
    }
  })

  return fullText.trim()
}

// cached pet persona id (fuzzy matched from /configs)
let cachedPetConfigId: string | null = null

/** 从角色配置列表里按关键词模糊挑出桌宠角色；找不到就退回第一个 */
async function pickPetConfigId(): Promise<string | undefined> {
  if (cachedPetConfigId) return cachedPetConfigId
  const base = import.meta.env.VITE_API_BASE_URL
  try {
    const res = await fetch(`${base}/chat/configs`, { credentials: 'include' })
    if (!res.ok) return undefined
    const body = parseApiBody(await res.text())
    const list: Array<{ id?: string; name?: string }> =
      body?.code === 0 && Array.isArray(body?.data) ? body.data : []
    if (!list.length) return undefined

    const keywords = ['pet', '桌宠', '助手', 'aemeath', 'dango', '宠物', 'companion', 'assistant', 'bot']
    const found = list.find((r) => {
      const n = ((r.name || r.id) || '').toLowerCase()
      return keywords.some((k) => n.includes(k.toLowerCase()))
    })
    const picked = found?.id || list[0]?.id || null
    cachedPetConfigId = picked
    return picked || undefined
  } catch {
    return undefined
  }
}

/** 桌宠对话入口：封装对话 id 的缓存恢复、按需新建与流式问答 */
export function usePetAiChat() {
  const conversationId = ref<string | null>(null)

  /** 彻底清空当前对话：内存 + localStorage（顺带清掉两代旧键） */
  function resetConversationId() {
    conversationId.value = null
    localStorage.removeItem(PET_CHAT_CONVERSATION_ID_KEY)
    localStorage.removeItem(LEGACY_PET_CHAT_APP_ID_KEY)
    localStorage.removeItem(LEGACY_PET_CHAT_APP_ID_V1)
  }

  /** 从 localStorage 恢复对话 id：先清理旧版键，缓存值非法则直接丢弃 */
  function loadCachedConversationId() {
    localStorage.removeItem(LEGACY_PET_CHAT_APP_ID_KEY)
    localStorage.removeItem(LEGACY_PET_CHAT_APP_ID_V1)
    const raw = localStorage.getItem(PET_CHAT_CONVERSATION_ID_KEY)
    if (!raw) return
    const value = raw.trim()
    if (!isValidConversationId(value)) {
      localStorage.removeItem(PET_CHAT_CONVERSATION_ID_KEY)
      return
    }
    conversationId.value = value
  }

  /** 确保拿到可用对话 id：内存 -> localStorage 缓存 -> 挑角色新建，成功后写回缓存 */
  async function ensureConversationId() {
    if (conversationId.value) return conversationId.value
    loadCachedConversationId()
    if (conversationId.value) return conversationId.value

    const configId = await pickPetConfigId()
    if (!configId) {
      throw new Error('暂无可用桌宠角色配置')
    }

    const nextId = await resolvePetConversation(configId)
    conversationId.value = nextId
    localStorage.setItem(PET_CHAT_CONVERSATION_ID_KEY, nextId)
    return nextId
  }

  /** 用指定对话 id 做一次非流式问答（拿到完整文本） */
  async function askByConversationId(currentConversationId: string, question: string): Promise<string> {
    return streamChatByConversationId(currentConversationId, question)
  }

  /** 一次性问答；对话失效时自动重建会话并重试一次 */
  async function ask(question: string): Promise<string> {
    const currentConversationId = await ensureConversationId()
    try {
      return await askByConversationId(currentConversationId, question)
    } catch {
      resetConversationId()
      const newConversationId = await ensureConversationId()
      return askByConversationId(newConversationId, question)
    }
  }

  /** 流式问答（可携带分段消息），同样带一次对话失效后的自动重建重试 */
  async function askStream(
    question: string,
    handlers: PetStreamHandlers,
    segments?: PetChatSegment[],
  ): Promise<string> {
    const currentConversationId = await ensureConversationId()
    try {
      return await streamChatByConversationId(currentConversationId, question, handlers, segments)
    } catch {
      resetConversationId()
      const newConversationId = await ensureConversationId()
      return streamChatByConversationId(newConversationId, question, handlers, segments)
    }
  }

  /** 拉取最近历史：先探测总页数，再取最后一页，映射为面板消息结构 */
  async function loadRecentHistory(limit = 8): Promise<PetChatMessage[]> {
    loadCachedConversationId()
    if (!conversationId.value) return []

    const id = Number(conversationId.value)
    const probe = await listMessages({ id, pageNum: 1, pageSize: limit })
    if (probe.data.code !== 0 || !probe.data.data) return []

    const total = probe.data.data.totalPage ?? 1
    const res =
      total <= 1
        ? probe
        : await listMessages({ id, pageNum: total, pageSize: limit })

    if (res.data.code !== 0 || !res.data.data?.records?.length) return []

    const records = res.data.data.records
    const messages: PetChatMessage[] = records.map((msg) => ({
      role: msg.messageType === 'user' ? 'user' : 'ai',
      content: msg.content || '',
    }))

    return messages
  }

  /** @deprecated 兼容旧调用方 */
  const ensureAppId = ensureConversationId
  /** @deprecated 兼容旧调用方 */
  const resetAppId = resetConversationId

  return {
    ask,
    askStream,
    loadRecentHistory,
    ensureConversationId,
    resetConversationId,
    ensureAppId,
    resetAppId,
  }
}
