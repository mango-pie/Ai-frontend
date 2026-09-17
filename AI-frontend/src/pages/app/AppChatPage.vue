<script setup lang="ts">
/**
 * 应用生成对话页 - /app/chat/:appId
 * 左侧：消息列表 + 输入框；右侧：生成的网页预览
 * 顶部栏右侧：应用详情 + 部署按钮
 * 部署成功后弹出 Modal 展示 URL
 */
import { ref, onMounted, nextTick, h, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { getAppById, deployApp } from '@/api/appController'
import { getLatestChatHistory, listAppChatHistory } from '@/api/chatHistoryController'
import { loadAppSettings, resolveDeployBaseUrl, type AppUxSettings } from '@/utils/appSettings'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import {
  Rocket,
  Send,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Info,
  Copy,
  ExternalLink,
  X,
} from 'lucide-vue-next'
import { readSseChatStream } from '@/utils/sseChatStream'
import { marked, Renderer } from 'marked'
import hljs from 'highlight.js/lib/core'
// 按需注册常用语言
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

// 配置 marked：启用 GFM + 换行，自定义代码块渲染
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
const appId = Number(route.params.appId) || 0
// URL 携带的首条提问（从应用广场等入口跳转进入时自动发送）
const initPrompt = route.query.initPrompt as string | undefined

const appInfo = ref<API.AppVO | null>(null)

/** 聊天消息 UI 模型：区分 user/ai，AI 消息带流式接收标记 */
interface ChatMessage {
  role: 'user' | 'ai'
  content: string
  isStreaming?: boolean
  id?: string
  createTime?: string
}
const messages = ref<ChatMessage[]>([])
const messagesEndRef = ref<HTMLElement | null>(null)
const inputValue = ref('')
const isStreaming = ref(false)

// 对话历史相关
const loadingHistory = ref(false)
const hasMoreHistory = ref(true)
const lastCreateTime = ref<string>('')

// 预览
const previewUrl = ref('')
const deploying = ref(false)
const deployKey = ref('')

// 部署成功弹窗
const deployModalVisible = ref(false)
const deployedUrl = ref('')
const appUx = ref<AppUxSettings>({
  codegenEnabled: true,
  defaultCodeGenType: 'html',
  deployEnabled: true,
  publicHostDisplay: '',
})

/** 解析部署站点根地址：站点设置优先，回退环境变量 */
function deployBase() {
  return resolveDeployBaseUrl(appUx.value, import.meta.env.VITE_DEPLOY_BASE_URL as string)
}

/** 滚动到消息底部（发送 / 流式输出时跟随） */
const scrollToBottom = async () => {
  await nextTick()
  messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
}

/** 滚动到消息顶部（向上加载更早历史后） */
const scrollToTop = async () => {
  await nextTick()
  const messagesContainer = document.querySelector('.chat-messages')
  messagesContainer?.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 渲染 AI 消息的 Markdown（含代码高亮） */
function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

/** 拉取应用信息；已有 deployKey 时拼出右侧预览地址 */
const fetchAppInfo = async () => {
  const res = await getAppById({ id: appId })
  if (res.data.code === 0 && res.data.data) {
    appInfo.value = res.data.data
    if (res.data.data.deployKey) {
      const k = res.data.data.deployKey.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '')
      deployKey.value = k
      previewUrl.value = `${deployBase()}/${k}/`
    }
  }
}

/** 拉取对话历史：首次取最近 10 条，加载更多时以 lastCreateTime 为游标向前翻页 */
const fetchChatHistory = async (isLoadMore = false) => {
  if (loadingHistory.value) return
  
  loadingHistory.value = true
  try {
    const params: API.getLatestChatHistoryParams = {
      appId: appId,
      limit: 10
    }
    
    if (isLoadMore && lastCreateTime.value) {
      const res = await listAppChatHistory({
        appId: appId,
        pageSize: 10,
        lastCreateTime: lastCreateTime.value
      })
      
      if (res.data.code === 0 && res.data.data) {
        const historyMessages = res.data.data.records || []
        if (historyMessages.length < 10) {
          hasMoreHistory.value = false
        }
        
        if (historyMessages.length > 0) {
          lastCreateTime.value = historyMessages[0]?.createTime || ''
          const newMessages: ChatMessage[] = historyMessages.map((msg) => ({
            id: msg.id?.toString(),
            role: msg.messageType === 'user' ? 'user' : 'ai',
            content: msg.message || '',
            createTime: msg.createTime
          }))
          messages.value = [...newMessages, ...messages.value]
          await scrollToTop()
        }
      }
    } else {
      const res = await getLatestChatHistory(params)
      if (res.data.code === 0 && res.data.data) {
        const historyMessages = res.data.data || []
        if (historyMessages.length > 0) {
          lastCreateTime.value = historyMessages[0]?.createTime || ''
          messages.value = historyMessages.map((msg) => ({
            id: msg.id?.toString(),
            role: msg.messageType === 'user' ? 'user' : 'ai',
            content: msg.message || '',
            createTime: msg.createTime
          }))
        }
      }
    }
  } finally {
    loadingHistory.value = false
  }
}

/** "加载更多"入口：还有更早历史时再向上翻一页 */
const loadMoreHistory = async () => {
  if (hasMoreHistory.value) {
    await fetchChatHistory(true)
  }
}

/** 发送消息：本地先入列用户消息与流式占位，fetch SSE 接收生成内容，正常结束后自动部署 */
const sendMessage = async (userMsg: string) => {
  if (!userMsg.trim() || isStreaming.value) return
  messages.value.push({ role: 'user', content: userMsg })
  inputValue.value = ''
  await scrollToBottom()

  const aiMsg: ChatMessage = { role: 'ai', content: '', isStreaming: true }
  messages.value.push(aiMsg)
  isStreaming.value = true

  try {
    const url = `${import.meta.env.VITE_API_BASE_URL}/app/chat/gen/code?appId=${appId}&message=${encodeURIComponent(userMsg)}`
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok || !response.body) throw new Error('请求失败')

    // SSE 读取失败与外层请求失败分开处理：仅前者不触发自动部署
    let streamError = false

    // 逐段读取流式响应，增量追加到最后一条 AI 消息
    try {
      await readSseChatStream(response.body, (text) => {
        const last = messages.value[messages.value.length - 1]
        if (last?.role === 'ai') last.content += text
        void scrollToBottom()
      })
    } catch {
      streamError = true
    }

    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'ai') last.isStreaming = false
    isStreaming.value = false

    if (!streamError) {
      // 流结束后自动部署并展示预览
      await handleDeploy(true)
    }
  } catch {
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'ai') last.isStreaming = false
    isStreaming.value = false
    message.error('发送失败，请重试')
  }
}

const handleSend = () => {
  if (inputValue.value.trim()) sendMessage(inputValue.value.trim())
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/**
 * @param silent - true 时为流结束后自动部署，不弹窗提示失败；false 时为手动点击部署
 */
const handleDeploy = async (silent = false) => {
  if (!appUx.value.deployEnabled) {
    if (!silent) message.warning('一键部署已在站点设置中关闭')
    return
  }
  if (deploying.value) return
  deploying.value = true
  try {
    const res = await deployApp({ appId: appId })
    if (res.data.code === 0 && res.data.data) {
      const raw = res.data.data as string
      // 后端可能返回完整 URL 或纯 key，统一提取最后一段路径作为 key
      const key = raw.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '')
      deployKey.value = key
      const url = `${deployBase()}/${key}/`
      previewUrl.value = url
      deployedUrl.value = url
      // 手动点击部署时弹出成功弹窗
      if (!silent) deployModalVisible.value = true
    } else if (!silent) {
      message.error('部署失败：' + res.data.message)
    }
  } finally {
    deploying.value = false
  }
}

const copyDeployUrl = () => {
  navigator.clipboard.writeText(deployedUrl.value).then(() => message.success('已复制'))
}

const goToDetail = () => router.push(`/app/edit/${appId}`)

onMounted(async () => {
  appUx.value = await loadAppSettings()
  await fetchAppInfo()
  await fetchChatHistory()
  
  // 修改自动发送初始消息的逻辑：如果是自己的 app，并且没有对话历史，才自动将 initPrompt 作为第一条消息触发对话
  if (initPrompt && messages.value.length === 0) {
    await sendMessage(initPrompt)
  }
  
  // 修改网站展示的逻辑：进入页面时，如果 app 有至少 2 条对话记录，也展示对应的网站
  if (messages.value.length >= 2 && appInfo.value?.deployKey) {
    const k = appInfo.value.deployKey.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '')
    deployKey.value = k
    previewUrl.value = `${deployBase()}/${k}/`
  }
})
</script>

<template>
  <StationRoomShell brand-path="/lab" note-label="Lab · 生成中" room="lab" fill="frame">
  <div class="chat-page">
    <!-- 顶部栏 -->
    <div class="chat-header">
      <div class="chat-header__left">
        <a-button type="text" class="chat-icon-btn" :icon="h(ArrowLeft)" @click="router.push('/lab')" />
        <span class="chat-header__title">{{ appInfo?.appName ?? '应用生成' }}</span>
      </div>
      <div class="chat-header__right">
        <a-button style="margin-right: 8px" @click="goToDetail">
          <template #icon><Info :size="15" /></template>
          应用详情
        </a-button>
        <a-button
          v-if="appUx.deployEnabled"
          type="primary"
          class="deploy-btn"
          :icon="h(Rocket)"
          :loading="deploying"
          @click="handleDeploy(false)"
        >
          部署
        </a-button>
      </div>
    </div>

    <!-- 核心内容区 -->
    <div class="chat-body">
      <!-- 左侧对话区 -->
      <div class="chat-left">
        <div class="chat-messages">
          <!-- 加载更多按钮 -->
          <div v-if="hasMoreHistory" class="load-more-container">
            <a-button
              type="link"
              :loading="loadingHistory"
              @click="loadMoreHistory"
            >
              <template #icon><RefreshCw :size="15" /></template>
              加载更多历史消息
            </a-button>
          </div>
          
          <div
            v-for="(msg, idx) in messages"
            :key="msg.id || idx"
            :class="['chat-msg', msg.role === 'user' ? 'chat-msg--user' : 'chat-msg--ai']"
          >
            <div v-if="msg.role === 'ai'" class="chat-msg__avatar">🤖</div>
            <div class="chat-msg__bubble">
              <span v-if="msg.isStreaming && !msg.content" class="chat-msg__typing">
                <span class="dot" /><span class="dot" /><span class="dot" />
              </span>
              <!-- AI 消息用 marked 渲染 Markdown -->
              <div
                v-else-if="msg.role === 'ai'"
                class="chat-msg__markdown"
                v-html="renderMarkdown(msg.content ?? '')"
              />
              <span v-else class="chat-msg__text">{{ msg.content }}</span>
            </div>
            <div v-if="msg.role === 'user'" class="chat-msg__avatar">👤</div>
          </div>
          <div ref="messagesEndRef" />
        </div>

        <!-- 输入框 -->
        <div class="chat-input-area">
          <a-textarea
            v-model:value="inputValue"
            placeholder="描述越详细，页面越具体，可以一步一步完善生成效果"
            :auto-size="{ minRows: 2, maxRows: 5 }"
            :disabled="isStreaming"
            @keydown="handleKeydown"
          />
          <a-button
            type="primary"
            shape="circle"
            :icon="h(Send)"
            :disabled="isStreaming || !inputValue.trim()"
            class="chat-send-btn"
            @click="handleSend"
          />
        </div>
      </div>

      <!-- 右侧预览区 -->
      <div class="chat-right">
        <div v-if="!previewUrl" class="chat-preview-placeholder">
          <div class="chat-preview-placeholder__inner">
            <p>🎨 生成后的网页将在这里展示</p>
            <p class="chat-preview-placeholder__sub">等待 AI 生成完成...</p>
          </div>
        </div>
        <iframe
          v-else
          :src="previewUrl"
          class="chat-preview-iframe"
          sandbox="allow-scripts allow-same-origin"
          title="生成的网页预览"
        />
      </div>
    </div>

    <!-- 部署成功弹窗 -->
    <a-modal
      v-model:open="deployModalVisible"
      :footer="null"
      :closable="false"
      centered
      width="420px"
    >
      <div class="deploy-modal">
        <CheckCircle2 class="deploy-modal__icon" :size="48" />
        <div class="deploy-modal__title">网站部署成功！</div>
        <div class="deploy-modal__url-row">
          <a-input :value="deployedUrl" readonly class="deploy-modal__url-input" />
          <a-button type="primary" @click="copyDeployUrl">
            <template #icon><Copy :size="15" /></template>
            复制
          </a-button>
        </div>
        <div class="deploy-modal__actions">
          <a :href="deployedUrl" target="_blank">
            <a-button type="primary">
              <template #icon><ExternalLink :size="15" /></template>
              访问网站
            </a-button>
          </a>
          <a-button @click="deployModalVisible = false">
            <template #icon><X :size="15" /></template>
            关闭
          </a-button>
        </div>
      </div>
    </a-modal>
  </div>
  </StationRoomShell>
</template>

<style scoped>
@import '@/components/chat/chat-shell.css';

/* 页面级布局补充（基础布局来自 @import 的 chat-shell.css） */
.chat-page {
  padding: 12px;
}

.chat-body {
  min-height: 0;
}

.chat-left {
  width: 430px;
}

.chat-right {
  min-height: 0;
}

.chat-preview-placeholder__inner {
  text-align: center;
  font-size: 15px;
}

.chat-preview-placeholder__inner p:last-child {
  font-size: 13px;
  color: var(--color-text-muted);
}

.chat-preview-placeholder__sub {
  font-size: 13px;
  color: var(--color-text-muted);
}

/* 部署成功弹窗 */
.deploy-modal__icon {
  color: var(--color-success);
}

/* 图标 / 部署按钮悬停动效（遵循系统"减弱动态效果"设置） */
.chat-icon-btn svg {
  transition: transform var(--transition-fast);
}
.chat-icon-btn:hover svg {
  transform: scale(1.12);
}
.deploy-btn svg {
  transition: transform var(--transition-normal);
}
.deploy-btn:hover svg {
  transform: translateY(-2px) rotate(8deg);
}
@media (prefers-reduced-motion: reduce) {
  .chat-icon-btn:hover svg,
  .deploy-btn:hover svg {
    transform: none;
  }
}

.deploy-modal__title {
  color: var(--color-text-primary);
}

.deploy-modal__actions {
  display: flex;
  gap: 12px;
}
</style>
