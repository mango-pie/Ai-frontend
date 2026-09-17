<script setup lang="ts">
/**
 * AI 对话入口页（路由 /chat，chat 模块）
 * - 三栏“交换台”布局：左栏使用说明 / 中栏接线员（聊天角色）名片墙 + 输入台 / 右栏最近会话通话牌
 * - 角色列表来自 AstrBot 预设（getConfigs）；会话列表登录后拉取
 * - 输入提示词后 resolveDefault 创建/复用会话并携带 initPrompt 跳转聊天页
 */
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { resolveDefault } from '@/api/chatConversationController'
import { deleteConversation, listConversations } from '@/api/chatConversationController'
import { getConfigs } from '@/api/chatController'
import { useLoginUserStore } from '@/stores/loginUser'
import { getChatConfigStorageKey, saveLastChatConversationId } from '@/utils/chatSession'
import { Headset, History, Radio, Send, Trash2, UserRound } from 'lucide-vue-next'
import IconAction from '@/components/ui/IconAction.vue'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'

const router = useRouter()
const loginUserStore = useLoginUserStore()
// 输入台的提示词与“正在接通”过渡态
const inputValue = ref('')
const enteringChat = ref(false)
interface ChatRole {
  id?: string
  name?: string
  description?: string
}
// 可选的 AI 接线员（对应后端 chat config）
const roles = ref<ChatRole[]>([])
const selectedConfigId = ref<string>('')
const loadingRoles = ref(false)

interface ConversationItem {
  id?: number
  configId?: string
  configName?: string
  title?: string
  lastMessageAt?: string
  messageCount?: number
}
// 最近的会话列表（右栏通话牌）
const conversations = ref<ConversationItem[]>([])
const conversationsLoading = ref(false)

const selectedRole = computed(() => roles.value.find((r) => r.id === selectedConfigId.value))

const fmtTime = (v?: string) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 用输入台的提示词创建（或复用默认）会话，带 initPrompt 跳转聊天页 */
const handleCreateAndChat = async () => {
  if (!inputValue.value.trim()) {
    message.warning('请输入提示词')
    return
  }
  if (!loginUserStore.loginUser.id) {
    message.warning('请先登录')
    router.push('/user/login')
    return
  }
  // 未点选角色时默认取第一个
  if (!selectedConfigId.value && roles.value.length > 0) {
    selectedConfigId.value = roles.value[0]?.id || ''
  }
  if (!selectedConfigId.value) {
    message.warning('暂无可用角色，请稍后重试或联系管理员配置 AstrBot 预设')
    return
  }
  enteringChat.value = true
  try {
    const res = await resolveDefault({ configId: selectedConfigId.value })
    if (res.data.code === 0 && res.data.data?.id != null) {
      const conversationId = String(res.data.data.id)
      // 记住该角色最近使用的会话，供聊天页/下次进入时恢复
      localStorage.setItem(getChatConfigStorageKey(selectedConfigId.value), selectedConfigId.value)
      saveLastChatConversationId(conversationId)
      const init = encodeURIComponent(inputValue.value.trim())
      const cfg = encodeURIComponent(selectedConfigId.value)
      router.push(`/chat/${conversationId}?initPrompt=${init}&configId=${cfg}`)
    } else {
      message.error('进入对话失败，' + (res.data.message || '未知错误'))
    }
  } catch {
    message.error('进入对话失败，请重试')
  } finally {
    enteringChat.value = false
  }
}

const openConversation = (c: ConversationItem) => {
  if (c.id == null) return
  // 打开旧会话时同步刷新角色记忆，保证聊天页使用同一接线员
  if (c.configId) localStorage.setItem(getChatConfigStorageKey(c.configId), c.configId)
  router.push(`/chat/${c.id}`)
}

const removeConversation = (c: ConversationItem) => {
  if (c.id == null) return
  Modal.confirm({
    title: '挂断这通通话？',
    content: `「${c.title || '未命名对话'}」的记录将被删除。`,
    okText: '挂断',
    okType: 'danger',
    onOk: async () => {
      const res = await deleteConversation({ id: c.id! })
      if (res.data.code === 0) {
        conversations.value = conversations.value.filter((x) => x.id !== c.id)
        message.success('已删除')
      } else {
        message.error('删除失败，' + res.data.message)
      }
    },
  })
}

/** 拉取接线员列表；失败仅控制台告警并保持空态，不阻断页面 */
const loadRoles = async () => {
  loadingRoles.value = true
  try {
    const res = await getConfigs()
    if (res.data.code === 0 && res.data.data) {
      roles.value = res.data.data || []
      if (roles.value.length > 0 && !selectedConfigId.value) {
        selectedConfigId.value = roles.value[0]?.id || ''
      }
    }
  } catch (e) {
    console.warn('加载聊天角色列表失败', e)
  } finally {
    loadingRoles.value = false
  }
}

/** 拉取最近会话；未登录直接跳过，失败时静默清空为空态 */
const loadConversations = async () => {
  if (!loginUserStore.loginUser.id) return
  conversationsLoading.value = true
  try {
    const res = await listConversations({})
    if (res.data.code === 0 && Array.isArray(res.data.data)) {
      conversations.value = res.data.data
    }
  } catch {
    conversations.value = []
  } finally {
    conversationsLoading.value = false
  }
}

onMounted(() => {
  void loadRoles()
  void loadConversations()
})
</script>
<template>
  <StationRoomShell brand-path="/chat" note-label="Chat · 未完的交谈" room="chat">
    <div id="chatHomePage" class="chat-room">
      <!-- 左栏：机房须知 -->
      <aside class="chat-room__side">
        <section class="station-glass side-card">
          <p class="eyebrow">EXCHANGE DESK</p>
          <h3 class="side-card__title font-display">关于对话</h3>
          <p class="side-card__text">
            这里是本站的通讯交换台。挑选一位 AI 接线员，说下你想聊的，
            通话记录会留在右侧的通话牌上，随时可以重新接续。
          </p>
        </section>
        <section class="station-glass side-card">
          <p class="eyebrow">HOUSE RULES</p>
          <ul class="side-card__rules">
            <li><b>Enter</b> 立即接通新通话</li>
            <li><b>点名片</b> 选中接线员</li>
            <li><b>通话牌</b> 点任一记录继续聊</li>
            <li><b>Esc</b> 回到门厅</li>
          </ul>
          <span class="side-card__tape" aria-hidden="true" />
        </section>
      </aside>

      <!-- 主栏：接线员名片墙 + 输入台 -->
      <main class="chat-room__main">
        <header class="chat-room__header">
          <p class="eyebrow">CHAT ROOM · 交换台</p>
          <h1 class="chat-room__title font-display">对话</h1>
          <p class="chat-room__sub">选择 AI 接线员，开始新对话</p>
        </header>

        <section class="chat-room__roles">
          <p v-if="loadingRoles" class="chat-room__hint">正在接通接线员名单…</p>
          <p v-else-if="!roles.length" class="chat-room__hint">
            暂无可用角色，请在 AstrBot WebUI 配置预设后刷新
          </p>
          <button
            v-for="(role, i) in roles"
            v-else
            :key="role.id"
            type="button"
            class="role-card"
            :class="{ 'is-selected': role.id === selectedConfigId }"
            @click="selectedConfigId = role.id || ''"
            @dblclick="handleCreateAndChat"
          >
            <span class="role-card__avatar" aria-hidden="true">
              <UserRound :size="22" :stroke-width="1.75" v-if="!role.name" />
              <b v-else>{{ role.name.slice(0, 1) }}</b>
              <span class="role-card__no">NO.{{ String(i + 1).padStart(2, '0') }}</span>
            </span>
            <span class="role-card__name font-display">{{ role.name || '未命名接线员' }}</span>
            <span class="role-card__desc">{{ role.description || '随时待命，等你来电。' }}</span>
          </button>
        </section>

        <section class="station-glass chat-room__desk">
          <div class="chat-room__desk-meta">
            <Radio :size="14" :stroke-width="2" />
            <span v-if="selectedRole">接线员：{{ selectedRole.name }}</span>
            <span v-else>尚未选择接线员</span>
          </div>
          <a-textarea
            v-model:value="inputValue"
            placeholder="输入您的问题或指令..."
            :auto-size="{ minRows: 2, maxRows: 4 }"
            class="chat-room__textarea"
            :disabled="enteringChat"
            @keydown.enter.exact.prevent="handleCreateAndChat"
          />
          <div class="chat-room__desk-actions">
            <IconAction
              :icon="Send"
              label="开始对话"
              variant="primary"
              size="lg"
              motion="send"
              :loading="enteringChat"
              @click="handleCreateAndChat"
            />
          </div>
        </section>
      </main>

      <!-- 右栏：通话牌 -->
      <aside class="chat-room__deck">
        <section class="station-glass deck-card">
          <header class="deck-card__head">
            <History :size="14" :stroke-width="2" />
            <h3 class="font-display">通话牌 · 最近</h3>
          </header>
          <p v-if="conversationsLoading" class="deck-card__hint">翻找记录中…</p>
          <p v-else-if="!conversations.length" class="deck-card__hint">
            还没有通话记录，说完第一句就会出现在这里。
          </p>
          <!-- 最多展示最近 6 条通话 -->
          <ul v-else class="conv-list">
            <li v-for="c in conversations.slice(0, 6)" :key="c.id">
              <button type="button" class="conv-item" @click="openConversation(c)">
                <span class="conv-item__title">{{ c.title || '未命名对话' }}</span>
                <span class="conv-item__meta">
                  <em v-if="c.configName">{{ c.configName }}</em>
                  <span v-if="c.lastMessageAt">{{ fmtTime(c.lastMessageAt) }}</span>
                </span>
              </button>
              <button
                type="button"
                class="conv-item__remove"
                title="删除记录"
                @click.stop="removeConversation(c)"
              >
                <Trash2 :size="13" :stroke-width="2" />
              </button>
            </li>
          </ul>
        </section>

        <section class="station-glass deck-card">
          <header class="deck-card__head">
            <Headset :size="14" :stroke-width="2" />
            <h3 class="font-display">交换台统计</h3>
          </header>
          <dl class="deck-stats">
            <div>
              <dt>接线员</dt>
              <dd class="font-display">{{ roles.length }}</dd>
            </div>
            <div>
              <dt>通话记录</dt>
              <dd class="font-display">{{ conversations.length }}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  </StationRoomShell>
</template>
<style scoped>
/* ── 三栏布局骨架 ── */
.chat-room {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 300px;
  gap: 22px;
  align-items: start;
  min-height: 100%;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 2.5px;
  color: color-mix(in srgb, var(--room) 78%, #5b5470);
  font-weight: 700;
  margin: 0 0 6px;
}

/* ── 左栏 ── */
.chat-room__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.side-card {
  position: relative;
  padding: 18px 18px 16px;
}
.side-card__title {
  margin: 0 0 8px;
  font-size: 18px;
}
.side-card__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-soft, #6c6580);
}
.side-card__rules {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
  color: var(--ink-soft, #6c6580);
}
.side-card__rules b {
  color: color-mix(in srgb, var(--room) 80%, #40384f);
  margin-right: 4px;
}
.side-card__tape {
  position: absolute;
  top: -9px;
  right: 18px;
  width: 74px;
  height: 18px;
  background: color-mix(in srgb, var(--room) 38%, #fff);
  opacity: 0.75;
  transform: rotate(4deg);
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(60, 50, 90, 0.18);
}

/* ── 主栏 ── */
.chat-room__header {
  margin-bottom: 16px;
}
.chat-room__title {
  margin: 0;
  font-size: 34px;
  line-height: 1.15;
}
.chat-room__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-soft, #6c6580);
}
.chat-room__roles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.chat-room__hint {
  margin: 0;
  padding: 18px;
  font-size: 13px;
  color: var(--ink-faint, #9a94ad);
  background: rgba(255, 255, 255, 0.55);
  border: 1.5px dashed color-mix(in srgb, var(--room) 40%, transparent);
  border-radius: 16px;
}
.role-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 14px 12px;
  text-align: left;
  cursor: pointer;
  background: var(--craft-glass);
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 18px;
  box-shadow: var(--shadow-1);
  transition: transform 0.25s var(--ease-out), border-color 0.2s, box-shadow 0.25s;
}
.role-card:hover {
  transform: translateY(-3px);
}
.role-card.is-selected {
  border-color: var(--room);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--room) 30%, transparent);
}
.role-card__avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, var(--room), color-mix(in srgb, var(--room) 55%, #cdb9f5));
  font-size: 17px;
}
.role-card__no {
  position: absolute;
  right: -6px;
  bottom: -6px;
  font-size: 9px;
  letter-spacing: 1px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #fff;
  color: var(--ink-soft, #6c6580);
  box-shadow: var(--shadow-1);
}
.role-card__name {
  font-size: 15px;
  color: var(--ink, #38304a);
}
.role-card__desc {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-faint, #9a94ad);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.chat-room__desk {
  padding: 14px 16px 14px;
}
.chat-room__desk-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-soft, #6c6580);
  margin-bottom: 8px;
}
.chat-room__textarea {
  border: none !important;
  box-shadow: none !important;
  resize: none;
  font-size: 14px;
  padding: 4px 0 0;
  background: transparent !important;
}
.chat-room__desk-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

/* ── 右栏 ── */
.chat-room__deck {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.deck-card {
  padding: 16px;
}
.deck-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  color: color-mix(in srgb, var(--room) 80%, #40384f);
}
.deck-card__head h3 {
  margin: 0;
  font-size: 15px;
}
.deck-card__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-faint, #9a94ad);
}
.conv-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.conv-list li {
  position: relative;
}
.conv-item {
  display: block;
  width: 100%;
  padding: 8px 30px 8px 10px;
  text-align: left;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid color-mix(in srgb, var(--room) 20%, transparent);
  border-radius: 12px;
  transition: border-color 0.2s, background 0.2s;
}
.conv-item:hover {
  background: #fff;
  border-color: color-mix(in srgb, var(--room) 55%, transparent);
}
.conv-item__title {
  display: block;
  font-size: 13px;
  color: var(--ink, #38304a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.conv-item__meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-faint, #9a94ad);
}
.conv-item__meta em {
  font-style: normal;
  color: color-mix(in srgb, var(--room) 75%, #40384f);
}
.conv-item__remove {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: inline-flex;
  padding: 5px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-faint, #9a94ad);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}
.conv-list li:hover .conv-item__remove {
  opacity: 1;
}
.conv-item__remove:hover {
  color: #e5697a;
}
.deck-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
}
.deck-stats > div {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--room) 18%, transparent);
}
.deck-stats dt {
  font-size: 11px;
  color: var(--ink-faint, #9a94ad);
}
.deck-stats dd {
  margin: 2px 0 0;
  font-size: 22px;
  color: color-mix(in srgb, var(--room) 82%, #40384f);
}

/* ── 响应式：窄屏收窄两翼 ── */
@media (max-width: 1500px) {
  .chat-room {
    grid-template-columns: 220px minmax(0, 1fr) 260px;
  }
}
</style>
