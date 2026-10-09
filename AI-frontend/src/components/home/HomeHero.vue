<script setup lang="ts">
/**
 * 首页首屏 Hero 区：问候徽标、站点标题、一言纸条。
 * 问候文案与图标随主题（props.theme）切换。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { siteConfig } from '@/config/site'
import { fetchHitokoto } from '@/integrations/hitokoto'
import type { HomeTheme } from '@/composables/useHomeTheme'
import { HOME_GREET } from '@/composables/useHomeTheme'

const props = defineProps<{
  theme: HomeTheme
}>()

// 一言文案（默认占位句，加载成功后替换）
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
  </div>
</template>
