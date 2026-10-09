/**
 * SSE 分段流式输出的「打字机」呈现层。
 * 把后端按段推送的文本以逐字打字效果写进聊天气泡或桌宠回复区，
 * 统一处理节流滚动、中断信号与「替换末条 / 追加新条」等落位策略。
 */
import type { Ref } from 'vue'
import { chatSseLog, revealTextWithTypewriter } from '@/utils/sseChatStream'

/** 打字机选项：逐字间隔、中断信号与每帧进度回调 */
export type SegmentTypewriterOptions = {
  charDelayMs?: number
  signal?: AbortSignal
  onProgress?: () => void
}

/** rAF 节流，避免打字机每帧多次触发滚动等副作用 */
export function createThrottledProgress(onProgress: () => void): () => void {
  let scheduled = false
  return () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      onProgress()
    })
  }
}

/** 聊天页单条气泡消息（含流式标记与客户端临时 id） */
export interface ChatPageBubbleMessage {
  role: 'ai' | 'user'
  content: string
  isStreaming?: boolean
  _clientId?: string
  mode?: 'ask' | 'agent'
  tools?: unknown[]
}

/**
 * 聊天页的分段处理器：面向「消息气泡数组」的打字机落位。
 * 返回 revealReplace（重打最后一条 AI 气泡）/ revealAppend（新气泡逐字打出）/
 * revealIntoLast（在最后一条 AI 气泡上继续打）/ replaceLast / append（无动画直写）。
 */
export function createChatPageSegmentHandlers(deps: {
  messages: Ref<ChatPageBubbleMessage[]>
  nextClientId: (prefix?: string) => string
  chatMode: 'ask' | 'agent'
  /** 打字机滚动用，避免 nextTick 堆积造成卡顿 */
  onScroll?: () => void
  options?: SegmentTypewriterOptions
}) {
  const throttledScroll = deps.onScroll
    ? createThrottledProgress(deps.onScroll)
    : () => {}

  const typewriterOpts = {
    charDelayMs: deps.options?.charDelayMs ?? 18,
    maxCharsPerFrame: 8,
    signal: deps.options?.signal,
    onProgress: () => {
      throttledScroll()
      deps.options?.onProgress?.()
    },
  }

  /** 对单个气泡执行打字机：先露首字再逐帧揭示，结束后关闭流式标记并触发一次滚动 */
  async function typewriteBubble(msg: ChatPageBubbleMessage, text: string) {
    if (!text) return
    msg.isStreaming = true
    if (text.length <= 1) {
      msg.content = text
      msg.isStreaming = false
      throttledScroll()
      return
    }
    msg.content = text.charAt(0)
    await revealTextWithTypewriter(
      (visible) => { msg.content = visible },
      text,
      { ...typewriterOpts, clearBefore: false, prefixLength: 1 },
    )
    msg.isStreaming = false
    throttledScroll()
  }

  /** 重打最后一条 AI 气泡；末条不是 AI 时先新建一条空 AI 气泡承接 */
  const revealReplace = async (text: string) => {
    const last = deps.messages.value[deps.messages.value.length - 1]
    const msg =
      last?.role === 'ai'
        ? last
        : (() => {
            const created: ChatPageBubbleMessage = {
              role: 'ai',
              content: '',
              isStreaming: true,
              _clientId: deps.nextClientId('a'),
              mode: deps.chatMode,
            }
            deps.messages.value.push(created)
            return created
          })()
    await typewriteBubble(msg, text)
  }

  /** 新建一条 AI 气泡并逐字打出（每个流式分段一条气泡） */
  const revealAppend = async (text: string) => {
    const msg: ChatPageBubbleMessage = {
      role: 'ai',
      content: '',
      isStreaming: true,
      _clientId: deps.nextClientId('a'),
      mode: deps.chatMode,
    }
    deps.messages.value.push(msg)
    await typewriteBubble(msg, text)
  }

  const revealIntoLast = async (text: string) => {
    const last = deps.messages.value[deps.messages.value.length - 1]
    if (last?.role !== 'ai' || !text) return
    await typewriteBubble(last, text)
  }

  const replaceLast = (text: string) => {
    const last = deps.messages.value[deps.messages.value.length - 1]
    if (last?.role === 'ai') {
      chatSseLog('UI replaceLastAiBubble', { from: last.content, to: text })
      last.content = text
    }
  }

  const append = (text: string) => {
    chatSseLog('UI appendAiBubble (new bubble)', text)
    deps.messages.value.push({
      role: 'ai',
      content: text,
      isStreaming: false,
      _clientId: deps.nextClientId('a'),
      mode: deps.chatMode,
    })
    throttledScroll()
  }

  return { revealReplace, revealAppend, revealIntoLast, replaceLast, append }
}

/**
 * 桌宠的分段处理器：面向「字符串分段数组」的打字机落位（每段独立逐字打出）。
 * 与聊天页版本同构，只是数据源从消息气泡换成 replySegments 数组。
 */
export function createPetSegmentHandlers(deps: {
  replySegments: Ref<string[]>
  options?: SegmentTypewriterOptions
}) {
  const throttledProgress = deps.options?.onProgress
    ? createThrottledProgress(deps.options.onProgress)
    : undefined

  const typewriterOpts = {
    charDelayMs: deps.options?.charDelayMs ?? 18,
    maxCharsPerFrame: 8,
    signal: deps.options?.signal,
    onProgress: throttledProgress,
  }

  /** 对指定下标的分段执行打字机（首字先出，再逐帧揭示剩余文本） */
  async function typewriteSegment(lastIdx: number, text: string) {
    if (!text) return
    if (text.length <= 1) {
      deps.replySegments.value[lastIdx] = text
      throttledProgress?.()
      return
    }
    deps.replySegments.value[lastIdx] = text.charAt(0)
    await revealTextWithTypewriter(
      (visible) => { deps.replySegments.value[lastIdx] = visible },
      text,
      { ...typewriterOpts, clearBefore: false, prefixLength: 1 },
    )
    throttledProgress?.()
  }

  /** 重打最后一个分段；分段数组为空时先占位一个空串 */
  const revealReplace = async (text: string) => {
    if (!deps.replySegments.value.length) {
      deps.replySegments.value.push('')
    }
    const lastIdx = deps.replySegments.value.length - 1
    await typewriteSegment(lastIdx, text)
  }

  const revealAppend = async (text: string) => {
    deps.replySegments.value.push('')
    const lastIdx = deps.replySegments.value.length - 1
    await typewriteSegment(lastIdx, text)
  }

  const replaceLast = (text: string) => {
    if (!deps.replySegments.value.length) {
      deps.replySegments.value.push(text)
      return
    }
    deps.replySegments.value[deps.replySegments.value.length - 1] = text
  }

  const append = (text: string) => {
    deps.replySegments.value.push(text)
    throttledProgress?.()
  }

  return { revealReplace, revealAppend, replaceLast, append }
}
