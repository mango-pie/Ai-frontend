<script setup lang="ts">
/**
 * 公开布局（PublicLayout）
 * 由 App.vue 按 route.meta.shell === 'public' 挂载，包裹公开侧的路由视图：
 * 普通公开页（登录/注册等）渲染公开顶栏、页脚与背景轮播图层；
 * 主页与各房间页（blog/diary/knowledge 等，见 STATION_ROOMS）自管 chrome，
 * 此壳退化为透明容器；音乐播放器页全屏自管。支持 meta.keepAlive 的页面缓存。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import PublicHeader from '@/components/PublicHeader.vue'
import GlobalFooter from '@/components/GlobalFooter.vue'
import { useBackgroundSlideshow } from '@/composables/useBackgroundSlideshow'
import { useLoginUserStore } from '@/stores/loginUser'

const route = useRoute()
const loginUserStore = useLoginUserStore()
const isScrolled = ref(false)
const { layerA, layerB, activeLayer, hasImages, fadeDuration } = useBackgroundSlideshow()

// 自管 chrome 的房间名单：这些路由自带顶栏/页脚/背景，公开壳不再叠加公共外框
const STATION_ROOMS = new Set(['blog', 'diary', 'knowledge', 'library', 'reading', 'worklog', 'auth', 'settings', 'about', 'admin', 'study', 'profile'])

const room = computed(() => (route.meta.room as string) || 'public')
/** 主页与各房间自管 chrome，跳过公开壳的顶栏/页脚/暗色背景 */
const isStationChrome = computed(
  () =>
    route.path === '/' || (route.meta.shell === 'public' && STATION_ROOMS.has(String(route.meta.room))),
)

/** 音乐播放器：全屏自管，无公开顶栏/页脚 */
const isMusicChrome = computed(() => route.path === '/music' || route.meta.room === 'music')

// 页面滚动超过 20px 视为“已滚动”，供顶栏切换紧凑样式
const onScroll = () => {
  isScrolled.value = window.scrollY > 20
}

// 进入公开壳即拉取登录用户信息（未登录亦可浏览公开页），并监听滚动
onMounted(() => {
  loginUserStore.fetchLoginUser()
  window.addEventListener('scroll', onScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div
    class="public-layout"
    :class="{ 'public-layout--home': isStationChrome, 'public-layout--music': isMusicChrome }"
    :data-room="room"
  >
    <template v-if="!isStationChrome && !isMusicChrome">
      <!-- 背景轮播：A/B 双图层交叉淡入实现无缝切换；房间页/音乐页不渲染 -->
      <div class="background-effects" :style="{ '--bg-fade-duration': fadeDuration }">
        <img
          v-if="hasImages && layerA"
          class="background-effects__image"
          :class="{ 'is-active': activeLayer === 'a' }"
          :src="layerA"
          alt=""
        />
        <img
          v-if="hasImages && layerB"
          class="background-effects__image"
          :class="{ 'is-active': activeLayer === 'b' }"
          :src="layerB"
          alt=""
        />
      </div>

      <header class="public-layout__header" :class="{ 'is-scrolled': isScrolled }">
        <PublicHeader />
      </header>
    </template>

    <main
      class="public-layout__content"
      :class="{
        'public-layout__content--home': isStationChrome,
        'public-layout__content--music': isMusicChrome,
      }"
    >
      <!-- 路由视图：meta.keepAlive 的页面（如 ChatPage）走 KeepAlive 缓存，其余按 fullPath 重建 -->
      <RouterView v-slot="{ Component, route: viewRoute }">
        <KeepAlive include="ChatPage">
          <component :is="Component" v-if="viewRoute.meta.keepAlive" :key="viewRoute.path" />
        </KeepAlive>
        <component :is="Component" v-if="!viewRoute.meta.keepAlive" :key="viewRoute.fullPath" />
      </RouterView>
    </main>

    <footer v-if="!isStationChrome && !isMusicChrome" class="public-layout__footer">
      <GlobalFooter />
    </footer>
  </div>
</template>

<style scoped>
.public-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.public-layout--home {
  display: block;
  min-height: 0;
}

.public-layout--music {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.background-effects {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.background-effects__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--bg-fade-duration, 1.2s) ease;
}

.background-effects__image.is-active {
  opacity: 1;
}

.public-layout__header {
  position: relative;
  z-index: 100;
  height: 64px;
  flex-shrink: 0;
}

.public-layout__content {
  flex: 1;
  position: relative;
  z-index: 1;
  padding: 24px;
}

.public-layout__content--home {
  flex: none;
  padding: 0;
  z-index: auto;
}

.public-layout__content--music {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.public-layout__footer {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 12px 16px 20px;
  background: rgba(26, 22, 37, 0.78);
  border-top: 1px solid var(--color-border);
  backdrop-filter: blur(16px);
}

@media (max-width: 768px) {
  .public-layout__content:not(.public-layout__content--home) {
    padding: 12px;
  }
}
</style>
