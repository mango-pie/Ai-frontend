<script setup lang="ts">
/**
 * 首屏「房间」导航卡组：随笔/实验室/手账/知识库/对话/音乐六个入口卡。
 * 每张卡带拟物小场景（杂志封面、烧瓶、手账日期、书架、聊天气泡、音波环）
 * 与 3D 悬停倾斜效果；受模块能力（capsStore）门控的房间未开启时隐藏。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { isGatedEntryVisible } from '@/utils/moduleGate'

const props = defineProps<{
  latestTitle: string
  postTotal: number
  labTotal: number
  diaryDay: string
  diaryYm: string
}>()

const router = useRouter()
const loginUserStore = useLoginUserStore()
const capsStore = useCapabilitiesStore()

// 各房间的可见性：由后端下发的模块能力开关决定（音乐房间默认常开）
const roomVisible = computed(() => ({
  blog: isGatedEntryVisible('blog', { loaded: capsStore.loaded, enabled: capsStore.enabled }),
  lab: isGatedEntryVisible('app-lab', { loaded: capsStore.loaded, enabled: capsStore.enabled }),
  diary: isGatedEntryVisible('diary', { loaded: capsStore.loaded, enabled: capsStore.enabled }),
  knowledge: isGatedEntryVisible('knowledge', { loaded: capsStore.loaded, enabled: capsStore.enabled }),
  chat: isGatedEntryVisible('chat', { loaded: capsStore.loaded, enabled: capsStore.enabled }),
}))

// 进入房间；requireLogin 的房间（手账/知识库/对话）未登录先跳登录页
const enter = (path: string, requireLogin = false) => {
  if (requireLogin && !loginUserStore.loginUser.id) {
    router.push('/user/login')
    return
  }
  router.push(path)
}

// ---- 悬停 3D 倾斜效果：根据鼠标在卡内的位置计算 rotateX/rotateY ----
const onCardMove = (e: MouseEvent) => {
  const card = e.currentTarget as HTMLElement
  const r = card.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5
  const y = (e.clientY - r.top) / r.height - 0.5
  card.style.transform = `rotate(0deg) translateY(-10px) scale(1.03) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg)`
}

const onCardEnter = (e: MouseEvent) => {
  // 进入时只过渡阴影，位移/旋转由 onCardMove 直接设置以保持跟手
  const card = e.currentTarget as HTMLElement
  card.style.transition = 'box-shadow .35s'
}

const onCardLeave = (e: MouseEvent) => {
  // 离开时用弹性曲线复位，500ms 后切回仅过渡阴影，避免下次进入拖影
  const card = e.currentTarget as HTMLElement
  card.style.transition = 'transform .5s cubic-bezier(.34,1.56,.5,1), box-shadow .35s'
  card.style.transform = ''
  setTimeout(() => {
    card.style.transition = 'box-shadow .35s'
  }, 500)
}

// 随笔卡的元信息：有最新标题时突出篇数，无内容时提示引导
const blogMeta = () => {
  if (props.latestTitle) return `共 ${props.postTotal || '—'} 篇随笔`
  if (props.postTotal) return `共 ${props.postTotal} 篇随笔`
  return '还没有随笔'
}

// 实验室烧瓶卡文案：按是否有实验切换引导语（含加粗，配合 v-html）
const labNote = () => {
  if (props.labTotal > 0) return `今日灵感酝酿中……<br><b>${props.labTotal} 个实验</b> 正在咕嘟咕嘟`
  return '今日灵感酝酿中……<br><b>等你来做</b> 第一个实验'
}
</script>

<template>
  <section id="rooms">
    <!-- 随笔房间：杂志封面造型，展示最新一篇标题 -->
    <div
      v-if="roomVisible.blog"
      class="room r-blog room--magazine anim"
      style="animation-delay: 0.6s"
      role="link"
      tabindex="0"
      @click="enter('/blog')"
      @keydown.enter="enter('/blog')"
      @mouseenter="onCardEnter"
      @mousemove="onCardMove"
      @mouseleave="onCardLeave"
    >
      <div class="room-head">
        <div>
          <div class="room-name font-display">{{ siteConfig.rooms.blog.title }}</div>
          <div class="room-en">Journal</div>
        </div>
      </div>
      <div class="cover">
        <span class="masthead">J O U R N A L</span>
        <span class="issue">Vol.{{ new Date().getMonth() + 1 }}</span>
        <span class="latest">{{ latestTitle || '暂无最新' }}</span>
      </div>
      <p class="hintline">{{ siteConfig.rooms.blog.hint }}</p>
      <div class="room-meta">
        <span class="m">{{ blogMeta() }}</span>
        <span class="room-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>

    <!-- 实验室房间：冒泡烧瓶动画 + 实验数量文案 -->
    <div
      v-if="roomVisible.lab"
      class="room r-lab room--flask anim"
      style="animation-delay: 0.68s"
      role="link"
      tabindex="0"
      @click="enter('/lab')"
      @keydown.enter="enter('/lab')"
      @mouseenter="onCardEnter"
      @mousemove="onCardMove"
      @mouseleave="onCardLeave"
    >
      <div class="room-head">
        <div>
          <div class="room-name font-display">{{ siteConfig.rooms.lab.title }}</div>
          <div class="room-en">Lab</div>
        </div>
      </div>
      <div class="flask-stage">
        <div class="flask">
          <div class="neck" />
          <div class="body">
            <div class="liquid" />
            <i class="bubble" /><i class="bubble" /><i class="bubble" />
          </div>
        </div>
        <p class="flask-note" v-html="labNote()" />
      </div>
      <div class="room-meta">
        <span class="m">{{ siteConfig.rooms.lab.hint }}</span>
        <span class="room-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>

    <!-- 手账房间：当日日期贴纸 + 连续打卡点（需登录） -->
    <div
      v-if="roomVisible.diary"
      class="room r-diary room--planner anim"
      style="animation-delay: 0.76s"
      role="link"
      tabindex="0"
      @click="enter('/diary', true)"
      @keydown.enter="enter('/diary', true)"
      @mouseenter="onCardEnter"
      @mousemove="onCardMove"
      @mouseleave="onCardLeave"
    >
      <div class="room-head">
        <div>
          <div class="room-name font-display">{{ siteConfig.rooms.diary.title }}</div>
          <div class="room-en">Diary</div>
        </div>
      </div>
      <div class="datebadge">
        <span class="day">{{ diaryDay }}</span>
        <span class="ym" v-html="diaryYm" />
        <span class="washi" />
      </div>
      <p class="hintline">{{ siteConfig.rooms.diary.hint }}</p>
      <div class="streak">
        <i class="done" /><i class="done" /><i class="done" /><i class="done" /><i class="done" /><i /><i />
        <span>打开今日手账</span>
      </div>
      <div class="room-meta">
        <span class="m">打开今日手账</span>
        <span class="room-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>

    <!-- 知识库房间：书架造型，入口为检索与问答（需登录） -->
    <div
      v-if="roomVisible.knowledge"
      class="room r-know room--shelf anim"
      style="animation-delay: 0.84s"
      role="link"
      tabindex="0"
      @click="enter('/knowledge', true)"
      @keydown.enter="enter('/knowledge', true)"
      @mouseenter="onCardEnter"
      @mousemove="onCardMove"
      @mouseleave="onCardLeave"
    >
      <div class="room-head">
        <div>
          <div class="room-name font-display">{{ siteConfig.rooms.knowledge.title }}</div>
          <div class="room-en">Library</div>
        </div>
      </div>
      <div class="shelf-stage">
        <div class="book b1"><em>笔记</em></div>
        <div class="book b2"><em>文档</em></div>
        <div class="book b3"><em>灵感</em></div>
        <div class="book b4"><em>问答</em></div>
        <div class="book b5"><em>摘录</em></div>
        <div class="book b6"><em>清单</em></div>
      </div>
      <div class="room-meta">
        <span class="m">检索与问答</span>
        <span class="room-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>

    <!-- 对话房间：聊天气泡 + 打字动画（需登录） -->
    <div
      v-if="roomVisible.chat"
      class="room r-chat room--bubbles anim"
      style="animation-delay: 0.92s"
      role="link"
      tabindex="0"
      @click="enter('/chat', true)"
      @keydown.enter="enter('/chat', true)"
      @mouseenter="onCardEnter"
      @mousemove="onCardMove"
      @mouseleave="onCardLeave"
    >
      <div class="room-head">
        <div>
          <div class="room-name font-display">{{ siteConfig.rooms.chat.title }}</div>
          <div class="room-en">Chat</div>
        </div>
      </div>
      <div class="bubble-stage">
        <div class="bubble-msg left">今天过得怎么样？</div>
        <div class="bubble-msg right">
          <span class="typing"><i /><i /><i /></span>
        </div>
      </div>
      <div class="room-meta">
        <span class="m">进入对话工作台</span>
        <span class="room-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>
    <!-- 音乐房间：脉冲光环造型，进入虚拟舞台（不受模块门控） -->
    <div
      class="room r-music room--pulse anim"
      style="animation-delay: 1s"
      role="link"
      tabindex="0"
      @click="enter('/music')"
      @keydown.enter="enter('/music')"
      @mouseenter="onCardEnter"
      @mousemove="onCardMove"
      @mouseleave="onCardLeave"
    >
      <div class="room-head">
        <div>
          <div class="room-name font-display">{{ siteConfig.rooms.music.title }}</div>
          <div class="room-en">Pulse</div>
        </div>
      </div>
      <div class="pulse-stage">
        <span class="pulse-ring" /><span class="pulse-ring" /><span class="pulse-ring" />
        <strong class="pulse-mark">39</strong>
      </div>
      <p class="hintline">{{ siteConfig.rooms.music.hint }}</p>
      <div class="room-meta">
        <span class="m">进入虚拟舞台</span>
        <span class="room-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>
  </section>
</template>
