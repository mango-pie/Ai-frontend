<script setup lang="ts">
/**
 * 知识库问答页 - /knowledge/:kbId/chat
 * 左栏：会话票根（点选切换 / 右键删除）；中栏：SSE 流式问答；右栏：最近一条 AI 回复的引用切片
 * 数据来源：knowledge API（库 / 会话 / 消息）+ streamKnowledgeChat 流式问答接口
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { marked } from 'marked'
import { getKnowledgeBase } from '@/api/knowledge'
import {
  deleteKnowledgeConversation,
  listKnowledgeConversations,
  listKnowledgeMessages,
} from '@/api/knowledge'
import KnowledgeRoomShell from '@/components/knowledge/KnowledgeRoomShell.vue'
import { streamKnowledgeChat } from '@/utils/knowledgeSseStream'

marked.setOptions({ breaks: true, gfm: true })

/** 将 AI 回复渲染为 Markdown HTML，解析失败时回退原文 */
function renderMarkdown(text: string): string {
  if (!text) return ''
  try {
    return marked.parse(text) as string
  } catch {
    return text
  }
}

/** 消息 UI 模型：在接口消息之上附加流式中 / 出错等展示态 */
type UiMessage = {
  id?: string | number
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | string
  content: string
  references?: API.KnowledgeReferenceVO[]
  streaming?: boolean
  error?: boolean
  time?: string
}

const route = useRoute()
const router = useRouter()
const kbId = computed(() => String(route.params.kbId ?? ''))

const kb = ref<API.KnowledgeBaseVO | null>(null)
const conversations = ref<API.KnowledgeConversationVO[]>([])
const activeConversationId = ref<string | number | null>(null)
const messages = ref<UiMessage[]>([])
const input = ref('')
const sending = ref(false)
const listLoading = ref(false)
const abortRef = ref<AbortController | null>(null)
const scrollEl = ref<HTMLElement | null>(null)

const activeConversation = computed(() =>
  conversations.value.find((c) => String(c.id) === String(activeConversationId.value)),
)

const sessionTitle = computed(() => activeConversation.value?.title || (messages.value.length ? '进行中' : '新会话'))

/** 取最近一条带引用的 AI 回复的引用切片，供右栏索书条展示 */
const latestRefs = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]
    if (m?.role === 'ASSISTANT' && m.references?.length) return m.references
  }
  return [] as API.KnowledgeReferenceVO[]
})

const formatMsgTime = (str?: string) => {
  if (!str) return ''
  try {
    return new Date(str).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const formatConvMeta = (c: API.KnowledgeConversationVO) => {
  const t = c.updateTime || c.createTime
  if (!t) return '—'
  try {
    const d = new Date(t)
    const today = new Date()
    const sameDay = d.toDateString() === today.toDateString()
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return sameDay ? `今天 · ${time}` : `${d.getMonth() + 1}/${d.getDate()} · ${time}`
  } catch {
    return String(t)
  }
}

const scrollBottom = async () => {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

/** 加载知识库基本信息；不存在则提示并退回列表页 */
const loadKb = async () => {
  const res = await getKnowledgeBase(kbId.value)
  if (res.data.code === 0 && res.data.data) kb.value = res.data.data
  else {
    message.error(res.data.message || '知识库不存在')
    router.replace('/knowledge')
  }
}

/** 拉取当前库的会话列表（最新在前） */
const loadConversations = async () => {
  listLoading.value = true
  try {
    const res = await listKnowledgeConversations({ knowledgeBaseId: kbId.value })
    if (res.data.code === 0) conversations.value = res.data.data ?? []
  } finally {
    listLoading.value = false
  }
}

/** 拉取某会话的历史消息并滚动到底部 */
const loadMessages = async (conversationId: string | number) => {
  const res = await listKnowledgeMessages(conversationId, { pageNum: 1, pageSize: 100 })
  if (res.data.code === 0 && res.data.data) {
    messages.value = (res.data.data.records ?? []).map((m) => ({
      id: m.id,
      role: m.role || 'USER',
      content: m.content || '',
      references: m.references,
      time: m.createTime,
    }))
    await scrollBottom()
  }
}

const selectConversation = async (id: string | number) => {
  activeConversationId.value = id
  await loadMessages(id)
}

const startNewChat = () => {
  activeConversationId.value = null
  messages.value = []
}

/** 右键票根：二次确认后删除会话；删除的是当前会话则重置聊天区 */
const removeConversation = (c: API.KnowledgeConversationVO) => {
  if (c.id == null) return
  Modal.confirm({
    title: '删除会话',
    content: `确认删除「${c.title || '未命名会话'}」？`,
    okType: 'danger',
    onOk: async () => {
      const res = await deleteKnowledgeConversation(c.id!)
      if (res.data.code === 0) {
        message.success('已删除')
        if (String(activeConversationId.value) === String(c.id)) startNewChat()
        await loadConversations()
      } else message.error(res.data.message || '删除失败')
    },
  })
}

/** 中断进行中的 SSE 流并复位发送状态 */
const stopStream = () => {
  abortRef.value?.abort()
  abortRef.value = null
  sending.value = false
}

/** 发送提问：先本地插入用户消息与占位 AI 消息，再走 SSE 流式接收回复 */
const send = async () => {
  const question = input.value.trim()
  if (!question || sending.value) return
  input.value = ''
  messages.value.push({ role: 'USER', content: question, time: new Date().toISOString() })
  const assistant: UiMessage = { role: 'ASSISTANT', content: '', streaming: true }
  messages.value.push(assistant)
  await scrollBottom()

  sending.value = true
  const ac = new AbortController()
  abortRef.value = ac

  try {
    await streamKnowledgeChat(
      {
        knowledgeBaseId: kbId.value,
        conversationId: activeConversationId.value ?? undefined,
        question,
        topK: 5,
        mode: 'knowledgeBase',
      },
      {
        // 分片到达：追加到占位 AI 消息并保持滚动在底部
        onMessage: (chunk) => {
          assistant.content += chunk
          scrollBottom()
        },
        // 流结束：回灌会话列表与消息，补齐后端生成的消息 id / 引用 / 时间
        onDone: async () => {
          assistant.streaming = false
          assistant.time = new Date().toISOString()
          await loadConversations()
          if (activeConversationId.value == null && conversations.value.length) {
            const newest = conversations.value[0]
            if (newest?.id != null) activeConversationId.value = newest.id
          }
          if (activeConversationId.value != null) {
            const res = await listKnowledgeMessages(activeConversationId.value, {
              pageNum: 1,
              pageSize: 100,
            })
            if (res.data.code === 0 && res.data.data?.records?.length) {
              messages.value = res.data.data.records.map((m) => ({
                id: m.id,
                role: m.role || 'USER',
                content: m.content || '',
                references: m.references,
                time: m.createTime,
              }))
            }
          }
          await scrollBottom()
        },
        // 流内错误：把该条 AI 消息标记为出错
        onError: (msg) => {
          assistant.streaming = false
          assistant.error = true
          assistant.content = assistant.content || msg
          assistant.time = new Date().toISOString()
          message.error(msg)
        },
      },
      ac.signal,
    )
  } catch (e) {
    // AbortError 是用户主动停止，静默处理；其余才按请求失败提示
    if ((e as Error)?.name !== 'AbortError') {
      assistant.streaming = false
      assistant.error = true
      assistant.content = assistant.content || '请求失败'
      assistant.time = new Date().toISOString()
      message.error((e as Error)?.message || '请求失败')
    }
  } finally {
    sending.value = false
    abortRef.value = null
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}

// 同页路由切换库（kbId 变化）时重置会话并重新加载
watch(kbId, async () => {
  startNewChat()
  await loadKb()
  await loadConversations()
})

onMounted(async () => {
  await loadKb()
  await loadConversations()
})

// 离开页面前中断未完成的流
onBeforeUnmount(stopStream)
</script>

<template>
  <KnowledgeRoomShell :note-label="`Knowledge · ${kb?.name || '问答'}`">
    <div class="shell">
      <!-- 左栏：会话票根（切换 / 删除会话） -->
      <aside class="side side-stack anim" style="animation-delay: 0.08s">
        <button class="back-chip" type="button" @click="router.push(`/knowledge/${kbId}`)">
          ← 返回馆藏 · Esc
        </button>
        <div class="side-card glass" style="flex: 1; display: flex; flex-direction: column; min-height: 0">
          <span class="tape" />
          <h3 class="font-display">会话票根</h3>
          <p class="meta" style="margin-bottom: 8px">点票根切换 · 不接通用 Chat</p>
          <div class="session-list" :aria-busy="listLoading">
            <button
              v-for="c in conversations"
              :key="String(c.id)"
              type="button"
              class="session-item"
              :class="{ on: String(c.id) === String(activeConversationId) }"
              @click="c.id != null && selectConversation(c.id)"
              @contextmenu.prevent="removeConversation(c)"
            >
              <div class="t">{{ c.title || '未命名会话' }}</div>
              <div class="m">{{ formatConvMeta(c) }}</div>
            </button>
            <div v-if="!conversations.length && !listLoading" class="session-item" style="cursor: default; opacity: 0.55">
              <div class="t">还没有会话</div>
              <div class="m">发一条问题开始</div>
            </div>
          </div>
          <button class="chip-btn block" type="button" style="margin-top: 10px" @click="startNewChat">＋ 新会话</button>
        </div>
      </aside>

      <!-- 中栏：库内问答主区 -->
      <main class="main room-col anim" style="animation-delay: 0.16s">
        <div class="room-head">
          <div>
            <div class="eyebrow">READING DESK</div>
            <h1 class="font-display">库内问答</h1>
            <p class="sub">SSE 流式 · 引用落在右栏索书条</p>
          </div>
        </div>

        <div class="chat-main folio-room glass">
          <span class="fr-mount" aria-hidden="true" />
          <div class="chat-top">
            <div>
              <div class="ct-title font-display">{{ sessionTitle }}</div>
              <div class="ct-meta">mode: knowledgeBase · topK 5</div>
            </div>
            <div class="kb-badge"><span class="dot" /><span>{{ kb?.name || '知识库' }}</span></div>
          </div>

          <div ref="scrollEl" class="chat-stream">
            <div
              v-if="!messages.length"
              class="chat-bubble bot"
            >
              <span class="when">馆员</span>
              向当前库提问。库内需至少一份 parseStatus=SUCCESS 的文档，否则检索为空。右键票根可删除会话。
            </div>
            <div
              v-for="(m, idx) in messages"
              :key="m.id ?? `m-${idx}`"
              class="chat-bubble"
              :class="m.role === 'USER' ? 'user' : 'bot'"
            >
              <span class="when">
                {{ m.role === 'USER' ? '你' : '馆员' }}
                <template v-if="formatMsgTime(m.time)"> · {{ formatMsgTime(m.time) }}</template>
                <template v-if="m.streaming"> · 书写中</template>
              </span>
              <div v-if="m.role === 'ASSISTANT'" v-html="renderMarkdown(m.content || (m.streaming ? '…' : ''))" />
              <template v-else>{{ m.content }}</template>
            </div>
          </div>

          <div class="chat-input">
            <textarea
              v-model="input"
              rows="2"
              placeholder="向当前库提问… Enter 发送 · Shift+Enter 换行"
              aria-label="问答输入"
              :disabled="sending"
              @keydown="onKeydown"
            />
            <button v-if="sending" class="chip-btn" type="button" @click="stopStream">停止</button>
            <button v-else class="chip-btn primary" type="button" :disabled="!input.trim()" @click="send">发送</button>
          </div>
        </div>
      </main>

      <!-- 右栏：本轮引用出处（索书条） -->
      <aside class="deck anim" style="animation-delay: 0.24s">
        <div class="panel glass">
          <span class="tape sun" />
          <div class="eyebrow">本轮出处</div>
          <p class="meta" style="margin-top: 2px">
            引用 {{ latestRefs.length }} 段
            <template v-if="latestRefs.length"> · 来自最近回复</template>
          </p>
        </div>
        <div class="panel glass" style="flex: 1; overflow: auto; min-height: 0">
          <div v-for="(r, i) in latestRefs" :key="i" class="cite-card">
            <div class="src">
              {{ r.documentName || '文档' }}
              <template v-if="r.chunkIndex != null"> · #{{ r.chunkIndex }}</template>
            </div>
            <div class="ex">「{{ (r.content || '').slice(0, 120) }}{{ (r.content || '').length > 120 ? '…' : '' }}」</div>
          </div>
          <div v-if="!latestRefs.length" class="blotter" style="margin-top: 4px">
            <div class="k">阅览便签</div>
            <div class="v">出处像索书条：有引用时出现在这里，可对照原文切片。</div>
          </div>
          <div v-else class="blotter" style="margin-top: 8px">
            <div class="k">阅览便签</div>
            <div class="v">出处像索书条：可点、可对照，不做通用聊天克隆。</div>
          </div>
        </div>
      </aside>
    </div>
  </KnowledgeRoomShell>
</template>

<style scoped>
/* AI 回复中 Markdown 元素的样式（:deep 穿透 scoped） */
.chat-stream :deep(pre) {
  overflow: auto;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.chat-stream :deep(p) {
  margin: 0 0 0.55em;
}
.chat-stream :deep(p:last-child) {
  margin-bottom: 0;
}
.chat-bubble.bot {
  word-break: break-word;
  overflow-wrap: break-word;
}
.chat-bubble {
  animation: none !important;
}
</style>
