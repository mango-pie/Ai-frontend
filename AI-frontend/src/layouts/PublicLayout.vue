<script setup lang="ts">
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

const STATION_ROOMS = new Set(['blog', 'diary', 'knowledge', 'library', 'reading', 'worklog', 'lab', 'chat', 'auth', 'settings', 'about', 'admin', 'study', 'profile'])

const room = computed(() => (route.meta.room as string) || 'public')
/** 主页与各房间自管 chrome，跳过公开壳的顶栏/页脚/暗色背景 */
const isStationChrome = computed(
  () =>
    route.path === '/' || (route.meta.shell === 'public' && STATION_ROOMS.has(String(route.meta.room))),
)

/** 音乐播放器：全屏自管，无公开顶栏/页脚 */
const isMusicChrome = computed(() => route.path === '/music' || route.meta.room === 'music')

const onScroll = () => {
  isScrolled.value = window.scrollY > 20
}

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
