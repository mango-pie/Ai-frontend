<script setup lang="ts">
/**
 * 首页首屏 Hero 区：问候徽标、站点标题、一言纸条、AI 实验室快捷输入卡。
 * 问候文案与图标随主题（props.theme）切换；实验室输入框可直跳 /lab 并携带 prompt。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import { useLoginUserStore } from '@/stores/loginUser'
import { fetchHitokoto } from '@/integrations/hitokoto'
import type { HomeTheme } from '@/composables/useHomeTheme'
import { HOME_GREET } from '@/composables/useHomeTheme'

const props = defineProps<{
  theme: HomeTheme
}>()

const router = useRouter()
const loginUserStore = useLoginUserStore()

// 实验室快捷输入 + 一言文案（默认占位句，加载成功后替换）
const labPrompt = ref('')
const hitokotoText = ref('风把云揉成棉花糖的形状，落在窗台上的光是今天下午茶。')
const hitokotoFrom = ref('—— 每日一言')
// 透明度用于一言/徽标切换时的淡出淡入过渡
const textOpacity = ref(1)
const badgeOpacity = ref(1)

// 当前主题对应的问候语（图标 + 文案 + 徽标圆点颜色）
const greeting = computed(() => HOME_GREET[props.theme])

// 主题切换时徽标先淡出再淡入，避免图文瞬间跳变
watch(
  () => props.theme,
  () => {
    badgeOpacity.value = 0
    setTimeout(() => {
      badgeOpacity.value = 1
    }, 250)
  },
)

async function loadHitokoto(force = false) {
  // 先淡出旧文案，等拿到新句子后再淡入（失败则恢复旧文案显示）
  textOpacity.value = 0
  try {
    const item = await fetchHitokoto(force)
    setTimeout(() => {
      hitokotoText.value = item.hitokoto
      const who = item.from_who
      const from = item.from
      hitokotoFrom.value =
        who && from ? `—— ${who} · ${from}` : from || who ? `—— ${from || who}` : '—— 每日一言'
      textOpacity.value = 1
    }, 250)
  } catch {
    setTimeout(() => {
      textOpacity.value = 1
    }, 250)
  }
}

// 点击快捷词条：自动拼成「做一个xxx」填入输入框
const onChip = (chip: string) => {
  labPrompt.value = `做一个${chip}`
}

// 跳转实验室；未登录先去登录页，有输入则带 prompt 查询参数
const goLab = () => {
  const prompt = labPrompt.value.trim()
  if (!loginUserStore.loginUser.id) {
    router.push('/user/login')
    return
  }
  if (prompt) router.push({ path: '/lab', query: { prompt } })
  else router.push('/lab')
}

// 点击「生成」按钮：先播放水波纹特效再跳转，提升点击反馈
const onLabGo = (e: MouseEvent) => {
  const btn = e.currentTarget as HTMLElement
  const r = btn.getBoundingClientRect()
  const rip = document.createElement('span')
  rip.className = 'ripple'
  const size = Math.max(r.width, r.height)
  rip.style.width = rip.style.height = `${size}px`
  rip.style.left = `${e.clientX - r.left - size / 2}px`
  rip.style.top = `${e.clientY - r.top - size / 2}px`
  btn.appendChild(rip)
  setTimeout(() => rip.remove(), 650)
  goLab()
}

onMounted(() => loadHitokoto(true))
</script>

<template>
  <div class="hero">
    <!-- 问候徽标：随主题切换文案与圆点颜色 -->
    <span
      class="hero-badge anim"
      :style="{
        animationDelay: '0.15s',
        opacity: badgeOpacity,
        transition: 'opacity .3s',
      }"
    >
      <span class="dot" :style="{ background: greeting.bg }" v-html="greeting.icon" />
      <span>{{ greeting.text }}</span>
    </span>

    <h1 class="hero-title font-display anim" style="animation-delay: 0.25s">
      <span class="jp">{{ siteConfig.brandKana }}</span>
      <span class="grad">{{ siteConfig.siteName }}</span>
      <span class="sticker font-display">{{ siteConfig.heroSticker }}</span>
    </h1>

    <p class="hero-sub anim" style="animation-delay: 0.35s">
      <span class="line" />
      {{ siteConfig.siteSubtitle }}
    </p>

    <!-- 一言纸条：胶带贴纸造型，附手动刷新按钮 -->
    <div class="hitokoto anim" style="animation-delay: 0.45s">
      <span class="tape" />
      <button type="button" class="refresh" aria-label="换一句" @click="loadHitokoto(true)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
        </svg>
      </button>
      <p class="hitokoto-text" :style="{ opacity: textOpacity }">{{ hitokotoText }}</p>
      <p class="hitokoto-from">{{ hitokotoFrom }}</p>
    </div>

    <!-- 实验室快捷卡：输入框 + 快捷词条，回车或点「生成」跳转 /lab -->
    <div class="lab-card anim" style="animation-delay: 0.55s">
      <div class="lab-head">
        <span class="lab-title font-display">{{ siteConfig.heroLabTitle }}</span>
        <span class="lab-desc">{{ siteConfig.heroLabDesc }}</span>
      </div>
      <div class="lab-inputrow">
        <input
          v-model="labPrompt"
          class="lab-input"
          :placeholder="siteConfig.heroLabPlaceholder"
          @keydown.enter.prevent="goLab"
        />
        <button type="button" class="lab-go" @click="onLabGo">生成 ✦</button>
      </div>
      <div class="lab-chips">
        <span v-for="chip in siteConfig.quickPrompts" :key="chip" @click="onChip(chip)">{{ chip }}</span>
      </div>
    </div>
  </div>
</template>
