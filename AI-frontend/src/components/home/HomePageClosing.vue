<script setup lang="ts">
/**
 * 首页全屏轮播的第四屏「谢幕页」
 * - 展示站点名、品牌假名、简介与页脚链接，作为导览的收尾
 * - 页脚链接按模块能力开关（moduleGate）过滤不可用入口
 * - 由 HomePage 引用，点击「回到门厅」可切回首屏
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import HomeMiniBar from '@/components/home/HomeMiniBar.vue'
import HomePageDeco from '@/components/home/HomePageDeco.vue'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { isGatedEntryVisible, moduleForPath } from '@/utils/moduleGate'

/** 左上角迷你导航条展示的当前屏标签 */
defineProps<{
  pageLabel: string
}>()

/** 点击「回到门厅」或迷你栏 HOME 时触发，父级据此切回首屏 */
const emit = defineEmits<{
  home: []
}>()

const router = useRouter()
const capsStore = useCapabilitiesStore()

/** 页脚链接：带 path 的站内链接需通过模块能力校验，未开放模块的入口直接隐藏 */
const footerLinks = computed(() =>
  siteConfig.footer.links.filter((link) => {
    if (!('path' in link) || !link.path) return true
    const requireModule = moduleForPath(link.path)
    if (!requireModule) return true
    return isGatedEntryVisible(requireModule, {
      loaded: capsStore.loaded,
      enabled: capsStore.enabled,
    })
  }),
)

/** 站内 path 走路由跳转，外链 href 新窗口打开（"#" 占位则不动作） */
const footerGo = (link: { label: string; path?: string; href?: string }) => {
  if ('path' in link && link.path) router.push(link.path)
  else if ('href' in link && link.href && link.href !== '#') window.open(link.href, '_blank')
}
</script>

<template>
  <section class="home-page home-page--closing" data-screen-label="04 Closing">
    <HomeMiniBar :page-label="pageLabel" @home="emit('home')" />

    <div class="closing-layout">
      <!-- 装饰层：光晕与和纸胶带 -->
      <div class="closing-glow closing-glow--a" aria-hidden="true" />
      <div class="closing-glow closing-glow--b" aria-hidden="true" />
      <span class="closing-washi closing-washi--l" aria-hidden="true" />
      <span class="closing-washi closing-washi--r" aria-hidden="true" />

      <!-- 品牌印记：圆环 + 圆点 + 谢幕插画 -->
      <div class="closing-mark" aria-hidden="true">
        <span class="closing-mark__ring" />
        <span class="closing-mark__dot" />
        <HomePageDeco variant="closing" />
      </div>

      <span class="page-sticker page-sticker--thanks font-display">谢谢来访 ♪</span>

      <!-- 品牌信息区：站点名 / 假名 / 简介 / 标语 -->
      <p class="closing-eyebrow">END OF TOUR</p>
      <div class="closing-brand-wrap">
        <h2 class="closing-brand font-display">{{ siteConfig.siteName }}</h2>
      </div>
      <p class="closing-kana">{{ siteConfig.brandKana }}</p>
      <p class="closing-bio">{{ siteConfig.bio }}</p>
      <p class="closing-tag">{{ siteConfig.footer.tagline }}</p>

      <!-- 页脚导航：能力过滤后的站内/外链 -->
      <nav class="closing-links">
        <a
          v-for="link in footerLinks"
          :key="link.label"
          href="#"
          @click.prevent="footerGo(link)"
        >
          {{ link.label }}
        </a>
      </nav>

      <!-- 回门厅按钮 + ICP 备案号 -->
      <div class="closing-actions">
        <button type="button" class="closing-back" @click="emit('home')">回到门厅</button>
        <span class="closing-icp">{{ siteConfig.footer.icp }}</span>
      </div>
    </div>
  </section>
</template>
