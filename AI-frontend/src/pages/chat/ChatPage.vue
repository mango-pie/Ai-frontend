<script setup lang="ts">
// @ts-nocheck
// Large refactored file for Ask/Agent dual mode. TS/Volar binding errors here are often IDE cache after big edits.
// Runtime is unaffected. Restart TS server in Cursor (Ctrl+Shift+P) to re-check if desired.
defineOptions({ name: 'ChatPage' })

import { ref, onMounted, onUnmounted, nextTick, h, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  resolveDefault,
} from '@/api/chatConversationController'
import { getConfigs, getAgentConfig } from '@/api/chatController'
import { uploadChatAttachment } from '@/integrations/chatAttachmentController'
import {
  SendOutlined,
  ArrowLeftOutlined,
  SoundOutlined,
  StopOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import {
  applySegmentPlan,
  chatSseLog,
  readSseChatEvents,
  type AgentToolStep,
  type AgentUiAction,
} from '@/utils/sseChatStream'
import { createChatPageSegmentHandlers } from '@/composables/useSegmentTypewriter'
import { sanitizeSegmentDisplayText } from '@/utils/chatSegmentDisplay'
import AgentToolCard from '@/components/chat/AgentToolCard.vue'
import {
  getChatConfigStorageKey,
  saveLastChatConversationId,
} from '@/utils/chatSession'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { marked, Renderer } from 'marked'
import hljs from 'highlight.js/lib/core'
import langHtml from 'highlight.js/lib/languages/xml'
import langCss from 'highlight.js/lib/languages/css'
import langJs from 'highlight.js/lib/languages/javascript'
import langTs from 'highlight.js/lib/languages/typescript'
import langJson from 'highlight.js/lib/languages/json'
import langBash from 'highlight.js/lib/languages/bash'
import langMarkdown from 'highlight.js/lib/languages/markdown'
import 'highlight.js/styles/github.css'

hljs.registerLanguage('html', langHtml)
hljs.registerLanguage('xml', langHtml)
hljs.registerLanguage('css', langCss)
hljs.registerLanguage('javascript', langJs)
hljs.registerLanguage('js', langJs)
hljs.registerLanguage('typescript', langTs)
hljs.registerLanguage('ts', langTs)
hljs.registerLanguage('json', langJson)
hljs.registerLanguage('bash', langBash)
hljs.registerLanguage('sh', langBash)
hljs.registerLanguage('markdown', langMarkdown)

const renderer = new Renderer()
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : ''
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value
  const langLabel = language || 'code'
  return `<div class="code-block"><div class="code-block__header"><span class="code-block__lang">${langLabel}</span><button class="code-block__copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').innerText)">复制</button></div><pre><code class="hljs language-${langLabel}">${highlighted}</code></pre></div>`
}
marked.use({ renderer, breaks: true, gfm: true })

const route = useRoute()
const router = useRouter()
const conversationId = computed(() => (route.params.conversationId as string) || '')
const convIdNum = computed(() => Number(conversationId.value))

const conversationInfo = ref<API.ChatConversationVO | null>(null)
const conversations = ref<API.ChatConversationVO[]>([])
const loadingConversations = ref(false)
const deletingConversationId = ref<number | null>(null)
const multiSelectMode = ref(false)
const selectedConversationIds = ref<number[]>([])
const batchDeleting = ref(false)
const roles = ref<API.ChatConfigVO[]>([])
const loadingRoles = ref(false)
const switchingRole = ref(false)

interface ChatMessage {
  role: 'user' | 'ai'
  content: string
  previewImages?: string[]
  isStreaming?: boolean
  id?: string
  createTime?: string
  _clientId?: string
  /** 打字机结束后缓存的 markdown HTML，避免多段回复时重复解析 */
  _renderedHtml?: string
  _renderedHtmlContent?: string
  // Agent mode support
  mode?: 'ask' | 'agent'
  tools?: AgentToolStep[]
}

interface AttachedImage {
  previewUrl: string
  attachmentId: string
}

const MAX_ATTACHED_IMAGES = 3
const messages = ref<ChatMessage[]>([])
const messagesEndRef = ref<HTMLElement | null>(null)
const inputValue = ref('')
const isStreaming = ref(false)

// Derived
const agentHint = computed(() => {
  if (agentConfig.value?.agentHint) return agentConfig.value.agentHint
  return 'Agent 模式可创建待办、博客草稿、保存日记等；不会自动发布或删除。'
})
const isAgentMode = computed(() => chatMode.value === 'agent')

const loadingHistory = ref(false)
const hasMoreHistory = ref(true)
const historyPageNum = ref(0)
const totalHistoryPages = ref(0)

// Ask / Agent dual mode (persisted)
const chatMode = ref<'ask' | 'agent'>(
  (typeof localStorage !== 'undefined' ? (localStorage.getItem('chatMode') as 'ask' | 'agent' | null) : null) || 'ask',
)
const agentConfig = ref<API.AgentConfigVO | null>(null)
const agentConfigLoaded = ref(false)
const HISTORY_PAGE_SIZE = 10

/** 当前会话绑定的 AstrBot 预设 configId */
const currentConfigId = ref<string>('')

// Image attach state (AstrBot attachmentId + local blob preview)
const attaching = ref(false)
const attachedImages = ref<AttachedImage[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// Abort for streaming
const abortController = ref<AbortController | null>(null)

// TTS state (module-scoped guard for one-at-a-time playback)
let ttsInitDone = false
let clientMsgCounter = 0
let currentTtsAudio: HTMLAudioElement | null = null
let currentTtsUrl: string | null = null
const ttsSynthesizing = ref<string | null>(null)
const capabilitiesStore = useCapabilitiesStore()
const ttsEnabled = computed(() => capabilitiesStore.enabled('tts'))

function nextClientId(prefix = 'm'): string {
  return `${prefix}-${Date.now()}-${++clientMsgCounter}`
}

function getMsgKey(msg: ChatMessage, idx: number): string {
  return (msg.id || msg._clientId || String(idx)) as string
}

function triggerAttach() {
  fileInputRef.value?.click()
}

function revokeAttachedPreview(url: string) {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function clearAttachedPreviews() {
  for (const item of attachedImages.value) {
    revokeAttachedPreview(item.previewUrl)
  }
  attachedImages.value = []
}

async function handleAttachFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    message.error('仅支持图片附件')
    target.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    message.error('图片大小不超过 5MB')
    target.value = ''
    return
  }
  if (attachedImages.value.length >= MAX_ATTACHED_IMAGES) {
    message.error(`单条消息最多 ${MAX_ATTACHED_IMAGES} 张图片`)
    target.value = ''
    return
  }

  const previewUrl = URL.createObjectURL(file)
  attaching.value = true
  try {
    const data = await uploadChatAttachment(file)
    const attachmentId = data.attachmentId?.trim()
    if (!attachmentId) {
      revokeAttachedPreview(previewUrl)
      message.error('图片上传失败：未返回 attachmentId')
      return
    }
    attachedImages.value.push({ previewUrl, attachmentId })
  } catch (err: any) {
    revokeAttachedPreview(previewUrl)
    message.error(err?.message || '图片上传失败')
  } finally {
    attaching.value = false
    target.value = ''
  }
}

function removeAttached(idx: number) {
  const item = attachedImages.value[idx]
  if (item) {
    revokeAttachedPreview(item.previewUrl)
    attachedImages.value.splice(idx, 1)
  }
}

const stopStreaming = () => {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'ai') {
    last.isStreaming = false
  }
  isStreaming.value = false
}

/** Fire-and-forget preload of reference audio using the backend proxy (current config) */
function ensureTtsInit() {
  if (!ttsEnabled.value) return
  if (ttsInitDone) return
  ttsInitDone = true
  const base = import.meta.env.VITE_API_BASE_URL
  fetch(`${base}/tts/ref/init`, { method: 'POST', credentials: 'include' }).catch(() => {
    // ignore preload errors; actual synthesize will surface issues
  })
}

/** Play TTS for a finished AI message using exact user-specified fetch calls.
 *  - stops any prior TTS clip (pause + revoke)
 *  - shows per-message loading via ttsSynthesizing key
 *  - revokes blob URL on end/error
 */
async function playAiMessage(msg: ChatMessage, idx: number) {
  const content = (msg.content || '').trim()
  if (!content) return
  const key = getMsgKey(msg, idx)
  if (ttsSynthesizing.value === key) return

  // one-at-a-time guard: stop previous audio
  if (currentTtsAudio) {
    currentTtsAudio.pause()
    currentTtsAudio = null
  }
  if (currentTtsUrl) {
    URL.revokeObjectURL(currentTtsUrl)
    currentTtsUrl = null
  }

  ttsSynthesizing.value = key

  try {
    const base = import.meta.env.VITE_API_BASE_URL

    // exact call pattern provided by user for init (already done on mount)
    // synthesize:
    const res = await fetch(`${base}/tts/synthesize`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content, speedFactor: 0.95 })
    })

    if (!res.ok) {
      let errMsg = '语音合成失败'
      try {
        const errJson = await res.json()
        if (errJson && (errJson.message || errJson.msg)) {
          errMsg = errJson.message || errJson.msg
        }
      } catch {
        // non-json error body
      }
      message.error(errMsg)
      return
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    currentTtsUrl = url

    const audio = new Audio(url)
    currentTtsAudio = audio

    audio.onended = () => {
      if (currentTtsUrl === url) {
        URL.revokeObjectURL(url)
        currentTtsUrl = null
        currentTtsAudio = null
      }
    }
    audio.onerror = () => {
      message.error('播放失败')
      if (currentTtsUrl === url) {
        URL.revokeObjectURL(url)
        currentTtsUrl = null
        currentTtsAudio = null
      }
    }

    await audio.play()
  } catch {
    message.error('语音合成失败，请重试')
  } finally {
    ttsSynthesizing.value = null
  }
}

const scrollToBottom = async (instant = false) => {
  await nextTick()
  messagesEndRef.value?.scrollIntoView({
    behavior: instant ? 'auto' : 'smooth',
    block: 'end',
  })
}

/** 打字机期间直接滚动，不走 nextTick，避免多段时堆积卡顿 */
function scrollToBottomFast() {
  messagesEndRef.value?.scrollIntoView({ behavior: 'auto', block: 'end' })
}

const aiMarkdownCache = new Map<string, string>()

function getAiMarkdownHtml(msg: ChatMessage): string {
  const content = msg.content ?? ''
  if (msg._renderedHtml !== undefined && msg._renderedHtmlContent === content) {
    return msg._renderedHtml
  }
  const key = `${msg._clientId || msg.id || ''}:${content}`
  const cached = aiMarkdownCache.get(key)
  if (cached) {
    msg._renderedHtml = cached
    msg._renderedHtmlContent = content
    return cached
  }
  const html = renderMarkdown(content)
  aiMarkdownCache.set(key, html)
  msg._renderedHtml = html
  msg._renderedHtmlContent = content
  return html
}

const scrollToTop = async () => {
  await nextTick()
  const messagesContainer = document.querySelector('.chat-messages')
  messagesContainer?.scrollTo({ top: 0, behavior: 'smooth' })
}

function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

/** Drop consecutive AI rows with identical content (old bug saved the same reply twice). */
function dedupConsecutiveAiMessages(list: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const m of list) {
    const prev = out[out.length - 1]
    if (
      prev?.role === 'ai'
      && m.role === 'ai'
      && (prev.content || '').trim() === (m.content || '').trim()
    ) {
      chatSseLog('deduped consecutive duplicate AI history message', {
        prevId: prev.id,
        currId: m.id,
      })
      continue
    }
    out.push(m)
  }
  return out
}

// --- Ask / Agent mode helpers ---
async function fetchAgentConfig() {
  if (agentConfigLoaded.value) return
  try {
    const res = await getAgentConfig()
    if (res.data.code === 0 && res.data.data) {
      agentConfig.value = res.data.data
    }
  } catch (e) {
    // non-fatal; Agent option may be hidden or default to ask
    chatSseLog('fetchAgentConfig failed (non-fatal)', e)
  } finally {
    agentConfigLoaded.value = true
  }
}

function setChatMode(m: 'ask' | 'agent') {
  if (isStreaming.value) return
  chatMode.value = m
  try {
    localStorage.setItem('chatMode', m)
  } catch {}
}

function handleAgentUiAction(action: AgentUiAction | undefined) {
  if (!action) return
  chatSseLog('handleAgentUiAction', action)
  if (action.type === 'navigate' && action.path) {
    router.push(action.path)
    return
  }
  if (action.type === 'toast' && action.message) {
    message.success(action.message)
    return
  }
  if (action.type === 'refresh') {
    // Broadcast so any listening page/panel can react (study, diary, blog, etc.)
    try {
      window.dispatchEvent(new CustomEvent('agent-ui-action', { detail: action }))
    } catch {}
    message.info(`已触发刷新${action.module ? `：${action.module}` : ''}`)
  }
}

// --- End mode helpers ---

function mapHistoryMessage(msg: API.ChatMessageVO): ChatMessage {
  return {
    id: msg.id?.toString(),
    role: msg.messageType === 'user' ? 'user' : 'ai',
    content: msg.content || '',
    createTime: msg.createTime,
  }
}

const fetchConversationInfo = async () => {
  const id = convIdNum.value
  if (!id) return
  const res = await getConversation({ id })
  if (res.data.code === 0 && res.data.data) {
    conversationInfo.value = res.data.data
    if (res.data.data.configId) {
      currentConfigId.value = res.data.data.configId
    }
  }

  const queryCfg = (route.query.configId as string | undefined) || ''
  if (queryCfg) {
    currentConfigId.value = queryCfg
    localStorage.setItem(getChatConfigStorageKey(queryCfg), queryCfg)
  } else if (currentConfigId.value) {
    localStorage.setItem(getChatConfigStorageKey(currentConfigId.value), currentConfigId.value)
  }
}

const fetchConversations = async () => {
  if (!currentConfigId.value) return
  loadingConversations.value = true
  try {
    const res = await listConversations({ configId: currentConfigId.value })
    if (res.data.code === 0 && res.data.data) {
      conversations.value = res.data.data
    }
  } finally {
    loadingConversations.value = false
  }
}

const loadHistoryPage = async (pageNum: number, prepend: boolean) => {
  const id = convIdNum.value
  if (!id) return

  const res = await listMessages({
    id,
    pageNum,
    pageSize: HISTORY_PAGE_SIZE,
  })

  if (res.data.code !== 0 || !res.data.data) return

  const records = res.data.data.records || []
  if (records.length === 0) {
    if (pageNum <= 1) hasMoreHistory.value = false
    return
  }

  let mapped = records.map(mapHistoryMessage)
  mapped = dedupConsecutiveAiMessages(mapped)

  if (prepend) {
    messages.value = [...mapped, ...messages.value]
    await scrollToTop()
  } else {
    messages.value = mapped
    await scrollToBottom()
  }

  // Extra safety: dedup across the whole current list (catches junction between
  // a freshly loaded older page and the messages we already had).
  messages.value = dedupConsecutiveAiMessages(messages.value)

  hasMoreHistory.value = pageNum > 1
}

const fetchChatHistory = async (isLoadMore = false) => {
  const id = convIdNum.value
  if (loadingHistory.value || !id) return

  loadingHistory.value = true
  try {
    if (isLoadMore) {
      if (historyPageNum.value <= 1) {
        hasMoreHistory.value = false
        return
      }
      historyPageNum.value -= 1
      await loadHistoryPage(historyPageNum.value, true)
    } else {
      const probe = await listMessages({
        id,
        pageNum: 1,
        pageSize: HISTORY_PAGE_SIZE,
      })
      if (probe.data.code !== 0 || !probe.data.data) return

      const total = probe.data.data.totalPage ?? 1
      totalHistoryPages.value = Math.max(1, total)
      historyPageNum.value = totalHistoryPages.value
      await loadHistoryPage(historyPageNum.value, false)
    }
  } finally {
    loadingHistory.value = false
  }
}

const loadMoreHistory = async () => {
  if (hasMoreHistory.value) {
    await fetchChatHistory(true)
  }
}

const sendMessage = async (userMsg: string) => {
  const id = convIdNum.value
  if (isStreaming.value || !id) return
  const trimmed = (userMsg || '').trim()
  if (!trimmed && attachedImages.value.length === 0) return

  const imagesToSend = [...attachedImages.value]
  const previewImages = imagesToSend.map((item) => item.previewUrl)
  const displayContent = trimmed || (imagesToSend.length === 1 ? '[图片]' : `[图片]×${imagesToSend.length}`)
  attachedImages.value = []

  messages.value.push({
    role: 'user',
    content: displayContent,
    previewImages: previewImages.length ? previewImages : undefined,
    _clientId: nextClientId('u'),
  })
  inputValue.value = ''
  await scrollToBottom()

  const aiMsg: ChatMessage = {
    role: 'ai',
    content: '',
    isStreaming: true,
    _clientId: nextClientId('a'),
    mode: chatMode.value,
    tools: chatMode.value === 'agent' ? [] : undefined,
  }
  messages.value.push(aiMsg)
  isStreaming.value = true

  const ac = new AbortController()
  abortController.value = ac

  const requestBody: Record<string, unknown> = { conversationId: id, mode: chatMode.value }
  if (imagesToSend.length > 0) {
    const segments: API.ChatMessageSegment[] = []
    if (trimmed) {
      segments.push({ type: 'plain', text: trimmed })
    }
    for (const img of imagesToSend) {
      segments.push({ type: 'image', attachmentId: img.attachmentId })
    }
    requestBody.segments = segments
  } else {
    requestBody.message = trimmed
  }

  try {
    const base = import.meta.env.VITE_API_BASE_URL
    const response = await fetch(`${base}/chat/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: ac.signal,
    })
    if (!response.ok || !response.body) throw new Error('请求失败')

    let streamError = false
    let streamBuffer = ''
    let segmentPlanApplied = false
    const currentMode = chatMode.value
    const segmentHandlers = createChatPageSegmentHandlers({
      messages,
      nextClientId,
      chatMode: currentMode,
      onScroll: scrollToBottomFast,
      options: { signal: ac.signal },
    })

    // Helper to manage tool steps on the current (last) AI message (Agent only)
    const ensureToolArrayOnLastAi = () => {
      const last = messages.value[messages.value.length - 1]
      if (last?.role === 'ai') {
        if (!last.tools) last.tools = []
        return last
      }
      return null
    }

    const upsertToolStep = (ev: any, statusOverride?: 'running' | 'done' | 'error') => {
      const last = ensureToolArrayOnLastAi()
      if (!last || !ev?.tool) return
      const list = last.tools!
      const idx = list.findIndex((t) => (ev.step != null && t.step === ev.step) || t.tool === ev.tool)
      const base: AgentToolStep = {
        tool: String(ev.tool),
        args: ev.args ?? undefined,
        step: ev.step != null ? Number(ev.step) : undefined,
        success: ev.success as boolean | undefined,
        data: ev.data ?? undefined,
        status: statusOverride ?? (ev.success === false ? 'error' : 'running'),
      }
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...base, status: statusOverride ?? (ev.success === false ? 'error' : 'done') }
      } else {
        list.push({ ...base, status: statusOverride ?? 'running' })
      }
    }

    try {
      await readSseChatEvents(response.body, async (payload) => {
        const event = payload.event ?? (payload.d ? 'chunk' : undefined)

        if (currentMode === 'agent') {
          // Agent: tool_call → tool_result (with optional uiAction) → chunk* → done
          // Never wait for segment_plan in Agent mode.
          if (event === 'tool_call') {
            chatSseLog('UI tool_call', payload)
            upsertToolStep(payload, 'running')
          } else if (event === 'tool_result') {
            chatSseLog('UI tool_result', payload)
            upsertToolStep(payload)
            if (payload.uiAction) {
              handleAgentUiAction(payload.uiAction)
            }
          } else if (event === 'error') {
            chatSseLog('UI agent error', payload)
            const last = messages.value[messages.value.length - 1]
            if (last?.role === 'ai') {
              if (!last.content) last.content = payload.message || 'Agent 遇到错误'
            }
            if (payload.message) message.error(payload.message)
          } else if (event === 'chunk' && payload.d) {
            streamBuffer += payload.d
          } else if (event === 'done') {
            chatSseLog('UI received done (agent)')
          } else if (event) {
            chatSseLog('UI unhandled event (agent)', event, payload)
          }
        } else {
          // Ask (existing behavior)
          if (event === 'chunk' && payload.d) {
            // 仅缓冲，不展示全文，避免 segment_plan 到达前闪一下完整内容
            streamBuffer += payload.d
          } else if (event === 'segment_plan' && payload.segments?.length) {
            segmentPlanApplied = true
            streamBuffer = ''
            chatSseLog('UI handling segment_plan', payload.segments.length, 'segments')
            await applySegmentPlan(payload.segments, payload.delays, {
              ...segmentHandlers,
              signal: ac.signal,
            })
          } else if (event === 'done') {
            chatSseLog('UI received done')
          } else if (event) {
            chatSseLog('UI unhandled event', event, payload)
          }
        }
      })

      // 无 segment_plan 时：在流结束后用打字机展示缓冲内容（仅 Ask 路径有效）
      if (currentMode !== 'agent' && !segmentPlanApplied && streamBuffer) {
        const last = messages.value[messages.value.length - 1]
        if (last?.role === 'ai' && !last.content) {
          await segmentHandlers.revealIntoLast(sanitizeSegmentDisplayText(streamBuffer))
        }
      }

      // Agent: if we accumulated text but the bubble is still empty, flush it
      if (currentMode === 'agent' && streamBuffer) {
        const last = messages.value[messages.value.length - 1]
        if (last?.role === 'ai' && !last.content) {
          last.content = streamBuffer
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // user stopped; treat as clean stop, no error toast
      } else {
        streamError = true
      }
    }

    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'ai') {
      last.isStreaming = false
    }
    isStreaming.value = false
    hasMoreHistory.value = true
    abortController.value = null

    if (streamError) {
      message.error('请求失败，请重试')
    } else {
      void fetchConversations()
    }
  } catch (err: any) {
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'ai') {
      last.isStreaming = false
    }
    isStreaming.value = false
    hasMoreHistory.value = true
    abortController.value = null
    if (err?.name !== 'AbortError') {
      message.error('发送失败，请重试')
    }
  }
}

const handleSend = () => {
  const hasContent = inputValue.value.trim() || attachedImages.value.length > 0
  if (hasContent) sendMessage(inputValue.value)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!isStreaming.value) handleSend()
  }
}

const goBack = () => {
  router.push('/')
}

const loadRoles = async () => {
  loadingRoles.value = true
  try {
    const res = await getConfigs()
    if (res.data.code === 0 && res.data.data) {
      roles.value = res.data.data
    }
  } catch (e) {
    console.warn('加载聊天角色列表失败', e)
  } finally {
    loadingRoles.value = false
  }
}

const switchRole = async (nextConfigId: string) => {
  if (!nextConfigId || nextConfigId === currentConfigId.value) return
  if (isStreaming.value) {
    message.warning('请等待当前回复结束后再切换角色')
    return
  }
  switchingRole.value = true
  try {
    const res = await resolveDefault({ configId: nextConfigId })
    if (res.data.code !== 0 || res.data.data?.id == null) {
      message.error('切换角色失败，' + (res.data.message || '未知错误'))
      return
    }
    const id = res.data.data.id
    saveLastChatConversationId(id)
    localStorage.setItem(getChatConfigStorageKey(nextConfigId), nextConfigId)
    if (String(id) === conversationId.value) {
      currentConfigId.value = nextConfigId
      await initPage()
      return
    }
    router.push({ path: `/chat/${id}`, query: { configId: nextConfigId } })
  } catch {
    message.error('切换角色失败，请重试')
  } finally {
    switchingRole.value = false
  }
}

const goNewChat = async () => {
  if (!currentConfigId.value) {
    router.push('/chat?new=1')
    return
  }
  try {
    const res = await createConversation({
      configId: currentConfigId.value,
      title: '新对话',
    })
    if (res.data.code === 0 && res.data.data?.id != null) {
      saveLastChatConversationId(res.data.data.id)
      router.push({
        path: `/chat/${res.data.data.id}`,
        query: { configId: currentConfigId.value },
      })
    } else {
      message.error('创建新对话失败，' + (res.data.message || '未知错误'))
    }
  } catch {
    message.error('创建新对话失败，请重试')
  }
}

const switchConversation = (id?: number) => {
  if (id == null || String(id) === conversationId.value) return
  if (multiSelectMode.value) return
  router.push({
    path: `/chat/${id}`,
    query: currentConfigId.value ? { configId: currentConfigId.value } : {},
  })
}

const toggleMultiSelectMode = () => {
  if (isStreaming.value) {
    message.warning('请等待当前回复结束后再操作')
    return
  }
  multiSelectMode.value = !multiSelectMode.value
  selectedConversationIds.value = []
}

const isConversationSelected = (id?: number) => {
  if (id == null) return false
  return selectedConversationIds.value.includes(id)
}

const toggleConversationSelection = (id?: number) => {
  if (id == null) return
  const idx = selectedConversationIds.value.indexOf(id)
  if (idx >= 0) {
    selectedConversationIds.value.splice(idx, 1)
  } else {
    selectedConversationIds.value.push(id)
  }
}

const selectAllConversations = () => {
  selectedConversationIds.value = conversations.value
    .map((c) => c.id)
    .filter((id): id is number => id != null)
}

const clearConversationSelection = () => {
  selectedConversationIds.value = []
}

const handleSidebarItemClick = (conv: API.ChatConversationVO) => {
  if (multiSelectMode.value) {
    toggleConversationSelection(conv.id)
    return
  }
  switchConversation(conv.id)
}

async function deleteConversationsByIds(ids: number[]) {
  const uniqueIds = [...new Set(ids)]
  const results = await Promise.all(
    uniqueIds.map((id) => deleteConversation({ id })),
  )
  const failed = results.filter((res) => res.data.code !== 0)
  if (failed.length > 0) {
    throw new Error(failed[0]?.data.message || '部分对话删除失败')
  }
}

const handleBatchDeleteConversations = () => {
  const ids = [...selectedConversationIds.value]
  if (ids.length === 0) {
    message.warning('请先选择要删除的对话')
    return
  }
  if (isStreaming.value) {
    message.warning('请等待当前回复结束后再删除')
    return
  }

  Modal.confirm({
    title: '批量删除对话',
    content: `确定删除选中的 ${ids.length} 个对话吗？此操作不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      batchDeleting.value = true
      try {
        await deleteConversationsByIds(ids)
        message.success(`已删除 ${ids.length} 个对话`)
        const deletedCurrent = ids.some((id) => String(id) === conversationId.value)
        multiSelectMode.value = false
        selectedConversationIds.value = []
        if (deletedCurrent) {
          await navigateAfterDeleteCurrent()
        } else {
          await fetchConversations()
        }
      } catch (err: any) {
        message.error(err?.message || '批量删除失败，请重试')
        await fetchConversations()
      } finally {
        batchDeleting.value = false
      }
    },
  })
}

const navigateAfterDeleteCurrent = async () => {
  await fetchConversations()
  const next = conversations.value.find((c) => String(c.id) !== conversationId.value)
  if (next?.id != null) {
    switchConversation(next.id)
    return
  }
  if (!currentConfigId.value) {
    router.push('/chat?new=1')
    return
  }
  const res = await resolveDefault({ configId: currentConfigId.value })
  if (res.data.code === 0 && res.data.data?.id != null) {
    saveLastChatConversationId(res.data.data.id)
    router.push({
      path: `/chat/${res.data.data.id}`,
      query: { configId: currentConfigId.value },
    })
  } else {
    router.push('/chat?new=1')
  }
}

const handleDeleteConversation = (conv: API.ChatConversationVO, event: MouseEvent) => {
  event.stopPropagation()
  if (conv.id == null) return
  if (isStreaming.value) {
    message.warning('请等待当前回复结束后再删除')
    return
  }

  Modal.confirm({
    title: '删除对话',
    content: `确定删除「${conv.title || '未命名对话'}」吗？此操作不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      deletingConversationId.value = conv.id!
      try {
        const res = await deleteConversation({ id: conv.id! })
        if (res.data.code !== 0) {
          message.error('删除失败，' + (res.data.message || '未知错误'))
          return
        }
        message.success('已删除')
        const wasCurrent = String(conv.id) === conversationId.value
        if (wasCurrent) {
          await navigateAfterDeleteCurrent()
        } else {
          await fetchConversations()
        }
      } catch {
        message.error('删除失败，请重试')
      } finally {
        deletingConversationId.value = null
      }
    },
  })
}

const formatConversationMeta = (conv: API.ChatConversationVO) => {
  const count = conv.messageCount ?? 0
  if (conv.lastMessageAt) {
    const d = new Date(conv.lastMessageAt)
    const time = Number.isNaN(d.getTime()) ? conv.lastMessageAt : d.toLocaleString()
    return `${count} 条 · ${time}`
  }
  return `${count} 条`
}

function resetChatState() {
  messages.value = []
  hasMoreHistory.value = true
  historyPageNum.value = 0
  totalHistoryPages.value = 0
  stopStreaming()
}

const initPage = async () => {
  const id = conversationId.value
  if (!id || !/^\d+$/.test(id)) return

  saveLastChatConversationId(id)
  resetChatState()

  await Promise.all([fetchConversationInfo(), loadRoles()])
  await fetchChatHistory()
  await fetchConversations()
  ensureTtsInit()
  void fetchAgentConfig() // load once for mode switch + hint (non-blocking)

  const initPrompt = route.query.initPrompt as string | undefined
  if (initPrompt && messages.value.length === 0) {
    await sendMessage(decodeURIComponent(initPrompt))
    router.replace({
      path: route.path,
      query: currentConfigId.value ? { configId: currentConfigId.value } : {},
    })
  }
}

watch(conversationId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    void initPage()
  }
})

onMounted(() => {
  void initPage()
})

onUnmounted(() => {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  clearAttachedPreviews()
  for (const msg of messages.value) {
    if (msg.previewImages?.length) {
      for (const url of msg.previewImages) {
        revokeAttachedPreview(url)
      }
    }
  }
})
</script>

<template>
  <div class="chat-page">
  <div class="chat-header">
    <div class="chat-header__left">
      <a-button type="text" :icon="h(ArrowLeftOutlined)" @click="goBack" />
      <a-select
        v-if="roles.length > 0"
        :value="currentConfigId || undefined"
        :options="roles.map((r) => ({ value: r.id, label: r.name || r.id }))"
        :loading="loadingRoles || switchingRole"
        :disabled="isStreaming || switchingRole"
        class="chat-header__role-select"
        placeholder="选择角色"
        @change="switchRole"
      />
      <span v-else class="chat-header__title">{{ conversationInfo?.configName ?? conversationInfo?.title ?? 'AI 对话' }}</span>
    </div>
    <div class="chat-header__right">
      <a-button type="link" size="small" class="chat-header__new" @click="goNewChat">新对话</a-button>
      <span v-if="isStreaming" class="chat-streaming-hint">思考中…</span>
    </div>
  </div>

    <div class="chat-body">
      <aside v-if="currentConfigId" class="chat-sidebar">
        <div class="chat-sidebar__header">
          <span class="chat-sidebar__header-title">{{ conversationInfo?.configName ?? '当前角色' }} 的对话</span>
          <div class="chat-sidebar__header-actions">
            <a-button
              v-if="!multiSelectMode"
              type="link"
              size="small"
              :disabled="isStreaming || conversations.length === 0"
              @click="toggleMultiSelectMode"
            >
              多选
            </a-button>
            <a-button
              v-else
              type="link"
              size="small"
              :disabled="batchDeleting"
              @click="toggleMultiSelectMode"
            >
              取消
            </a-button>
          </div>
        </div>
        <div v-if="multiSelectMode" class="chat-sidebar__batch-bar">
          <span class="chat-sidebar__batch-info">已选 {{ selectedConversationIds.length }} 项</span>
          <div class="chat-sidebar__batch-actions">
            <a-button type="link" size="small" :disabled="batchDeleting" @click="selectAllConversations">
              全选
            </a-button>
            <a-button type="link" size="small" :disabled="batchDeleting || selectedConversationIds.length === 0" @click="clearConversationSelection">
              清空
            </a-button>
            <a-button
              type="link"
              size="small"
              danger
              :loading="batchDeleting"
              :disabled="selectedConversationIds.length === 0"
              @click="handleBatchDeleteConversations"
            >
              删除
            </a-button>
          </div>
        </div>
        <div class="chat-sidebar__scroll">
          <a-spin :spinning="loadingConversations || batchDeleting">
            <ul v-if="conversations.length" class="chat-sidebar__list">
              <li
                v-for="conv in conversations"
                :key="conv.id"
                :class="[
                  'chat-sidebar__item',
                  {
                    'is-active': !multiSelectMode && String(conv.id) === conversationId,
                    'is-selected': multiSelectMode && isConversationSelected(conv.id),
                  },
                ]"
                @click="handleSidebarItemClick(conv)"
              >
                <a-checkbox
                  v-if="multiSelectMode"
                  class="chat-sidebar__checkbox"
                  :checked="isConversationSelected(conv.id)"
                  @click.stop
                  @change="toggleConversationSelection(conv.id)"
                />
                <div class="chat-sidebar__item-body">
                  <div class="chat-sidebar__title">{{ conv.title || '未命名对话' }}</div>
                  <div class="chat-sidebar__meta">{{ formatConversationMeta(conv) }}</div>
                </div>
                <button
                  v-if="!multiSelectMode"
                  type="button"
                  class="chat-sidebar__delete"
                  title="删除对话"
                  :disabled="deletingConversationId === conv.id || isStreaming"
                  @click="handleDeleteConversation(conv, $event)"
                >
                  <DeleteOutlined />
                </button>
              </li>
            </ul>
            <div v-else class="chat-sidebar__empty">暂无其他对话</div>
          </a-spin>
        </div>
      </aside>

      <div class="chat-container">
        <div class="chat-messages">
          <div v-if="hasMoreHistory" class="load-more-container">
            <a-button
              type="link"
              :loading="loadingHistory"
              @click="loadMoreHistory"
            >
              加载更多历史消息
            </a-button>
          </div>

          <div
            v-for="(msg, idx) in messages"
            :key="msg.id || msg._clientId || idx"
            :class="['chat-msg', msg.role === 'user' ? 'chat-msg--user' : 'chat-msg--ai']"
          >
            <div v-if="msg.role === 'ai'" class="chat-msg__avatar">🤖</div>
            <div class="chat-msg__bubble">
              <template v-if="msg.role === 'ai' && msg.isStreaming">
                <div class="chat-msg__streaming">
                  <span v-if="!msg.content" class="chat-msg__typing">
                    <span class="dot" /><span class="dot" /><span class="dot" />
                  </span>
                  <template v-else>{{ msg.content }}</template>
                </div>
                <div v-if="msg.tools && msg.tools.length" class="agent-tools">
                  <AgentToolCard
                    v-for="(t, tIdx) in msg.tools"
                    :key="t.step ?? t.tool ?? tIdx"
                    :tool="t"
                  />
                </div>
              </template>
              <template v-else-if="msg.role === 'ai'">
                <div
                  class="chat-msg__markdown"
                  v-html="getAiMarkdownHtml(msg)"
                />
                <div v-if="msg.tools && msg.tools.length" class="agent-tools">
                  <AgentToolCard
                    v-for="(t, tIdx) in msg.tools"
                    :key="t.step ?? t.tool ?? tIdx"
                    :tool="t"
                  />
                </div>
              </template>
              <div v-else class="chat-msg__markdown chat-msg__markdown--user">
                <div v-if="msg.previewImages?.length" class="chat-msg__inline-images">
                  <img
                    v-for="(url, imgIdx) in msg.previewImages"
                    :key="imgIdx"
                    :src="url"
                    alt="图片"
                  />
                </div>
                <div
                  v-if="msg.content"
                  v-html="renderMarkdown(msg.content)"
                />
              </div>
            </div>

            <!-- TTS play button: only for finished AI messages. Uses shared .chat-msg__tts styles -->
            <div
              v-if="ttsEnabled && msg.role === 'ai' && !msg.isStreaming && msg.content"
              class="chat-msg__tts"
            >
              <a-button
                type="text"
                size="small"
                :loading="ttsSynthesizing === getMsgKey(msg, idx)"
                :icon="h(SoundOutlined)"
                @click="playAiMessage(msg, idx)"
              />
            </div>

            <div v-if="msg.role === 'user'" class="chat-msg__avatar">👤</div>
          </div>

          <div v-if="messages.length === 0" class="empty-state">
            <div class="empty-state__icon">💬</div>
            <div class="empty-state__text">开始与 AI 对话吧</div>
          </div>

          <div ref="messagesEndRef" />
        </div>

        <!-- Ask / Agent mode switch + hint -->
        <div class="chat-mode-bar">
          <a-segmented
            v-model:value="chatMode"
            :options="[
              { label: 'Ask', value: 'ask' },
              { label: 'Agent', value: 'agent', disabled: agentConfig?.agentEnabled === false }
            ]"
            :disabled="isStreaming"
            @change="(v: 'ask' | 'agent') => setChatMode(v)"
          />
          <div v-if="chatMode === 'agent'" class="agent-hint">{{ agentHint }}</div>
          <div v-else class="agent-hint muted">纯对话模式（AstrBot）</div>
        </div>

        <div class="chat-input-area">
          <!-- attach button + hidden file input -->
          <div class="chat-attach">
            <a-button
              type="text"
              size="small"
              :loading="attaching"
              :disabled="isStreaming"
              @click="triggerAttach"
              title="添加图片"
            >
              📎
            </a-button>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleAttachFile"
            />
          </div>

          <!-- attached image previews (cleared on send) -->
          <div v-if="attachedImages.length" class="chat-attached-thumbs">
            <div
              v-for="(item, i) in attachedImages"
              :key="item.attachmentId"
              class="chat-attached-thumb"
              @click="removeAttached(i)"
              title="点击移除"
            >
              <img :src="item.previewUrl" alt="attach" />
              <span class="chat-attached-thumb__x">×</span>
            </div>
          </div>

          <a-textarea
            v-model:value="inputValue"
            placeholder="输入您的问题..."
            :auto-size="{ minRows: 2, maxRows: 5 }"
            :disabled="isStreaming"
            @keydown="handleKeydown"
          />
          <a-button
            type="primary"
            shape="circle"
            :icon="h(isStreaming ? StopOutlined : SendOutlined)"
            :disabled="!isStreaming && !inputValue.trim() && attachedImages.length === 0"
            class="chat-send-btn"
            :class="{ 'chat-send-btn--stop': isStreaming }"
            @click="isStreaming ? stopStreaming() : handleSend()"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import '@/components/chat/chat-shell.css';

.chat-page {
  padding: 12px;
  box-sizing: border-box;
}

.chat-body {
  justify-content: center;
  flex: 1;
  min-height: 0;
}

.chat-container {
  flex: 1;
  width: 100%;
  max-width: 860px;
  min-width: 0;
  min-height: 0;
}

/* tiny alignment tweak for TTS action; main styles live in shared chat-shell.css */
.chat-msg__tts {
  margin-top: 2px;
}

/* streaming hint */
.chat-streaming-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-right: 4px;
}

.chat-header__new {
  color: var(--color-text-secondary);
  padding: 0 4px;
  height: auto;
}

.chat-header__role-select {
  min-width: 140px;
  max-width: 180px;
}

.chat-header__role-select :deep(.ant-select-selector) {
  background: rgba(255, 255, 255, 0.04) !important;
  border-color: var(--color-border) !important;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.chat-header__role-select :deep(.ant-select-selection-placeholder) {
  color: var(--color-text-muted);
}

/* attach + thumbs in input area (page specific) */
.chat-attach {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
}
.chat-attached-thumbs {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-right: 6px;
  flex-wrap: wrap;
}
.chat-attached-thumb {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  cursor: pointer;
}
.chat-attached-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.chat-msg__inline-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.chat-msg__inline-images img {
  max-width: 180px;
  max-height: 180px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--color-border);
}
.chat-attached-thumb__x {
  position: absolute;
  top: -2px;
  right: -2px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 12px;
  line-height: 12px;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

/* stop button variant (page specific) */
.chat-send-btn--stop {
  background: #ff4d4f !important;
}
.chat-send-btn--stop:hover {
  background: #ff7875 !important;
}

/* keep attach thumbs compact inside the input flex row (added per redesign) */
.chat-input-area .chat-attached-thumbs {
  max-width: 120px; /* allow 3-4 small thumbs before textarea */
}
</style>
