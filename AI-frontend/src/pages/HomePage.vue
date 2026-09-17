<script setup lang="ts">
/**
 * 站点门厅首页（路由 /）
 * - v3 全屏翻页舞台：门厅 → 随笔刊 → 灵感窗 → 落款，翻页交互由 useHomePager 接管
 * - 氛围（主题/季节/粒子/云朵/视差）来自 useHomeTheme 等组合式函数
 * - 数据源：已发布随笔（最新 3 篇 + 总数）、我的应用数、精选应用
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import '@/assets/styles/home-v3.css'
import '@/assets/styles/period-atmosphere.css'
import { listFeaturedAppByPage, listMyAppByPage } from '@/api/appController'
import { getPublishedBlogPostPage } from '@/api/blogPostController'
import { useLoginUserStore } from '@/stores/loginUser'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { isGatedEntryVisible } from '@/utils/moduleGate'
import { siteConfig } from '@/config/site'
import { useHomeStageScale } from '@/composables/useHomeStageScale'
import { useHomeTheme, type HomeSeason } from '@/composables/useHomeTheme'
import { useInkMode } from '@/composables/useInkMode'
import { HOME_PAGE_COUNT, useHomePager } from '@/composables/useHomePager'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import HomeHero from '@/components/home/HomeHero.vue'
import HomeSkyWindow from '@/components/home/HomeSkyWindow.vue'
import HomeRooms from '@/components/home/HomeRooms.vue'
import HomePageJournal from '@/components/home/HomePageJournal.vue'
import HomePageShowcase from '@/components/home/HomePageShowcase.vue'
import HomePageClosing from '@/components/home/HomePageClosing.vue'
import HomePageDots from '@/components/home/HomePageDots.vue'
import HomePetals from '@/components/home/HomePetals.vue'
import StationTweaks from '@/components/shared/StationTweaks.vue'
import BackgroundCarousel from '@/components/shared/BackgroundCarousel.vue'
import PeriodAtmosphere from '@/components/shared/PeriodAtmosphere.vue'
import { useBackgroundMode } from '@/composables/useBackgroundMode'
import type { HomePostCard, HomeShowCard } from '@/components/home/homeTypes'

const loginUserStore = useLoginUserStore()
const capsStore = useCapabilitiesStore()
// blog 模块关闭时整屏隐藏“随笔刊”，总页数随之减一
const blogRoomVisible = computed(() =>
  isGatedEntryVisible('blog', { loaded: capsStore.loaded, enabled: capsStore.enabled }),
)
const tourPageCount = computed(() => (blogRoomVisible.value ? HOME_PAGE_COUNT : HOME_PAGE_COUNT - 1))
// 舞台三件套 ref：交给 useHomeStageScale 做等比缩放适配视口
const stageWrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
useHomeStageScale(stageWrapRef, stageRef)

// 翻页器：pageIndex/轨道位移样式 + 滚轮/键盘/触摸绑定
const {
  pageIndex,
  pageLabel,
  trackStyle,
  goTo,
  goNext,
  bind: bindPager,
} = useHomePager(tourPageCount)
bindPager(rootRef)

// 主题与氛围开关（季节、花瓣、云朵、视差等）
const {
  theme,
  season,
  autoTheme,
  petalsOn,
  cloudsOn,
  parallaxOn,
  seasonCaps,
  setTheme,
  setSeason,
  setAutoTheme,
} = useHomeTheme()

const { inkMode, setInkMode } = useInkMode()
const { mode: bgMode, setMode: setBgMode } = useBackgroundMode()

// 季节切换按钮选项（灵感窗与粒子层据此换肤）
const seasons: { key: HomeSeason; label: string }[] = [
  { key: 'spring', label: '春' },
  { key: 'summer', label: '夏' },
  { key: 'autumn', label: '秋' },
  { key: 'winter', label: '冬' },
]

const weekCN = ['日', '一', '二', '三', '四', '五', '六']
// 门厅挂钟与手账日期卡的时间展示（含 HTML，供冒号/秒数单独着色）
const clockHtml = ref('--<span class="colon">:</span>--')
const clockDate = ref('----年--月--日')
const diaryDay = ref('--')
const diaryYM = ref('---- / --<br>星期-')

// 随笔刊/灵感窗展示数据
const latestTitle = ref('')
const postTotal = ref(0)
const labTotal = ref(0)
const posts = ref<HomePostCard[]>([])
const shows = ref<HomeShowCard[]>([])

// 挂钟每秒刷新定时器，卸载时清理
let clockTimer: ReturnType<typeof setInterval> | null = null

const pad = (n: number) => String(n).padStart(2, '0')

const tick = () => {
  const d = new Date()
  clockHtml.value = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())} <span class="sec">${pad(d.getSeconds())}</span>`
  clockDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekCN[d.getDay()]}`
  diaryDay.value = String(d.getDate())
  diaryYM.value = `${d.getFullYear()} / ${pad(d.getMonth() + 1)}<br>星期${weekCN[d.getDay()]}`
}

const formatPostMeta = (post: API.BlogPostVO) => {
  const raw = post.createdTime || post.updatedTime || ''
  let datePart = ''
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) datePart = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return datePart ? `${datePart} · 阅读` : '阅读全文'
}

/** 拉取门厅展示数据；三块接口互相独立，任一失败都静默降级为占位内容，不阻断首屏 */
const loadData = async () => {
  // 最新随笔 + 总篇数（未登录也可见）
  try {
    const res = await getPublishedBlogPostPage({ pageNum: 1, pageSize: 3 })
    if (res.data.code === 0 && res.data.data) {
      postTotal.value = Number(res.data.data.totalRow) || 0
      const records = res.data.data.records || []
      latestTitle.value = records[0]?.title || ''
      posts.value = records.map((p) => ({
        id: p.id,
        title: p.title || '无标题',
        excerpt: p.summary || '暂无摘要',
        tag: p.categoryName || '随笔',
        meta: formatPostMeta(p),
        path: p.id ? `/blog/${p.id}` : '/blog',
      }))
    }
  } catch {
    /* ignore */
  }

  // 我的实验总数（仅登录后统计）
  try {
    if (loginUserStore.loginUser.id) {
      const res = await listMyAppByPage({ pageNum: 1, pageSize: 1 })
      if (res.data.code === 0 && res.data.data) {
        labTotal.value = Number(res.data.data.totalRow) || 0
      }
    }
  } catch {
    /* ignore */
  }

  // 精选实验：灵感窗只取第一名
  try {
    const res = await listFeaturedAppByPage({ pageNum: 1, pageSize: 1 })
    const app = res.data.code === 0 ? res.data.data?.records?.[0] : undefined
    if (app) {
      shows.value = [
        {
          id: app.id,
          title: app.appName || '精选实验',
          desc: `${siteConfig.sections.recommendedAuthor} · 实验室作品`,
          url: `lab.local / ${(app.appName || 'app').toLowerCase().replace(/\s+/g, '-')}`,
          path: app.id ? `/app/chat/${app.id}` : '/lab',
          kind: 'app',
        },
      ]
    }
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
  loadData()
  // 挂锁类名：禁用页面自身滚动，翻页交给 pager
  document.documentElement.classList.add('home-pager-lock')
  document.body.classList.add('home-pager-lock', 'period-page-bg')
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.documentElement.classList.remove('home-pager-lock')
  document.body.classList.remove('home-pager-lock', 'period-page-bg')
})
</script>

<template>
  <div
    ref="rootRef"
    class="home-v3-root home-v3-root--pager"
    :class="{ 'petals-off': !petalsOn }"
  >
    <div id="stageWrap" ref="stageWrapRef">
      <div id="stage" ref="stageRef" :data-season="season">
        <PeriodAtmosphere />
        <div class="home-pages-track" :style="trackStyle">
          <!-- 01 门厅（锁定） -->
          <section class="home-page home-page--hall" data-screen-label="01 Hall">
            <div class="deco" style="left: 1180px; top: 120px; animation: floaty 6s ease-in-out infinite">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
                  fill="#ffcf6e"
                  opacity=".9"
                />
              </svg>
            </div>
            <div
              class="deco"
              style="left: 80px; top: 640px; animation: floaty 7s ease-in-out infinite; animation-delay: -3s"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
                  fill="#f490ad"
                  opacity=".7"
                />
              </svg>
            </div>

            <HomeTopbar :clock-html="clockHtml" :clock-date="clockDate" />

            <section id="main">
              <HomeHero :theme="theme" />
              <HomeSkyWindow
                :season-caps="seasonCaps"
                :clouds-on="cloudsOn"
                :parallax-on="parallaxOn"
              />
            </section>

            <HomeRooms
              :latest-title="latestTitle"
              :post-total="postTotal"
              :lab-total="labTotal"
              :diary-day="diaryDay"
              :diary-ym="diaryYM"
            />

            <div
              id="scrollHint"
              class="anim"
              style="animation-delay: 1.2s"
              @click="goNext()"
            >
              <span class="v">NEXT</span>
              <span class="track" />
            </div>
          </section>

          <!-- 02 随笔刊（blog 模块关闭时整屏隐藏） -->
          <HomePageJournal
            v-if="blogRoomVisible"
            :posts="posts"
            :page-label="pageLabel"
            @home="goTo(0)"
          />

          <!-- 03 灵感窗 -->
          <HomePageShowcase
            :shows="shows"
            :page-label="pageLabel"
            @home="goTo(0)"
          />

          <!-- 04 落款 -->
          <HomePageClosing :page-label="pageLabel" @home="goTo(0)" />
        </div>

        <!-- 应季粒子层（花瓣/落叶/雪等） -->
        <HomePetals :season="season" :enabled="petalsOn" />
      </div>
    </div>

    <!-- 右侧翻页圆点导航 -->
    <HomePageDots
      :page-index="pageIndex"
      :page-count="tourPageCount"
      @go="goTo"
    />

    <!-- 右下角站点设置面板：主题/水墨/背景 + 季节与特效开关 -->
    <StationTweaks
      :theme="theme"
      :auto-theme="autoTheme"
      :ink-mode="inkMode"
      :bg-mode="bgMode"
      @set-theme="setTheme"
      @set-auto-theme="setAutoTheme"
      @set-ink-mode="setInkMode"
      @set-bg-mode="setBgMode"
    >
      <div class="row">
        <label>季节</label>
        <div class="seg">
          <button
            v-for="s in seasons"
            :key="s.key"
            type="button"
            :class="{ on: season === s.key }"
            @click="setSeason(s.key)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <div class="row">
        <label>粒子特效</label>
        <button
          type="button"
          class="switch"
          :class="{ on: petalsOn }"
          aria-label="粒子开关"
          @click="petalsOn = !petalsOn"
        />
      </div>
      <div class="row">
        <label>云朵</label>
        <button
          type="button"
          class="switch"
          :class="{ on: cloudsOn }"
          aria-label="云朵开关"
          @click="cloudsOn = !cloudsOn"
        />
      </div>
      <div class="row">
        <label>视差</label>
        <button
          type="button"
          class="switch"
          :class="{ on: parallaxOn }"
          aria-label="视差开关"
          @click="parallaxOn = !parallaxOn"
        />
      </div>
    </StationTweaks>

    <BackgroundCarousel />
  </div>
</template>
