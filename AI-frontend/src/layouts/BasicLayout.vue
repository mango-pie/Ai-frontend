<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import GlobalHeader from '@/components/GlobalHeader.vue'
import GlobalFooter from '@/components/GlobalFooter.vue'
import { useLoginUserStore } from '@/stores/loginUser'
import { MENU_ITEMS, filterMenuItems } from '@/config/permission'
import { useBackgroundSlideshow } from '@/composables/useBackgroundSlideshow'
import { resolveBlogMenuClickPath } from '@/composables/useBlogLastPost'
import { resolveDiaryMenuClickPath } from '@/composables/useDiaryNav'
import { getChatEntryPath } from '@/utils/chatSession'
import { useCapabilitiesStore } from '@/stores/capabilities'

interface MenuItem {
  key: string
  label: string
  path?: string
  children?: MenuItem[]
}

const router = useRouter()
const route = useRoute()
const loginUserStore = useLoginUserStore()
const capabilitiesStore = useCapabilitiesStore()
const isScrolled = ref(false)
const { layerA, layerB, activeLayer, hasImages, fadeDuration } = useBackgroundSlideshow()

onMounted(() => {
  loginUserStore.fetchLoginUser()
  
  const handleScroll = () => {
    isScrolled.value = window.scrollY > 20
  }
  
  window.addEventListener('scroll', handleScroll)
})

const menuItems = computed<MenuItem[]>(() => {
  const user = loginUserStore.loginUser ?? null
  return filterMenuItems(MENU_ITEMS, user, (name) => capabilitiesStore.enabled(name))
})

function getAllPathMap(items: MenuItem[]): Map<string, string> {
  const map = new Map<string, string>()
  const traverse = (list: MenuItem[]) => {
    for (const item of list) {
      if (item.path) {
        map.set(item.key, item.path)
      }
      if (item.children) {
        traverse(item.children)
      }
    }
  }
  traverse(items)
  return map
}

function findMatchedKey(items: MenuItem[], currentPath: string): string | null {
  for (const item of items) {
    if (item.path === currentPath) {
      return item.key
    }
    if (item.children) {
      const childMatch = findMatchedKey(item.children, currentPath)
      if (childMatch) {
        return childMatch
      }
    }
  }
  for (const item of items) {
    if (item.path && item.path !== '/' && currentPath.startsWith(item.path)) {
      return item.key
    }
    if (item.children) {
      const childMatch = findMatchedKey(item.children, currentPath)
      if (childMatch) {
        return childMatch
      }
    }
  }
  return null
}

const selectedKeys = computed(() => {
  const currentPath = route.path
  const matchedKey = findMatchedKey(menuItems.value, currentPath)
  return matchedKey ? [matchedKey] : []
})

const handleMenuClick = (key: string) => {
  const pathMap = getAllPathMap(menuItems.value)
  let targetPath = pathMap.get(key)
  if (targetPath === '/blog') {
    targetPath = resolveBlogMenuClickPath(route.path)
  }
  if (targetPath === '/diary') {
    targetPath = resolveDiaryMenuClickPath(route.path)
  }
  if (targetPath === '/chat') {
    targetPath = getChatEntryPath()
  }
  if (targetPath && targetPath !== route.path) {
    router.push(targetPath)
  }
}
</script>

<template>
  <a-layout class="basic-layout">
    <div
      class="background-effects"
      :style="{ '--bg-fade-duration': fadeDuration }"
    >
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
      <div class="background-effects__overlay"></div>
      <div class="background-effects__blob background-effects__blob--1"></div>
      <div class="background-effects__blob background-effects__blob--2"></div>
    </div>
    
    <a-layout-header :class="['basic-layout__header', { 'basic-layout__header--scrolled': isScrolled }]">
      <GlobalHeader
        :menu-items="menuItems"
        :selected-keys="selectedKeys"
        @menuClick="handleMenuClick"
      />
    </a-layout-header>

    <a-layout-content class="basic-layout__content">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <KeepAlive include="ChatPage">
          <component
            :is="Component"
            v-if="viewRoute.meta.keepAlive"
            :key="viewRoute.path"
          />
        </KeepAlive>
        <component
          :is="Component"
          v-if="!viewRoute.meta.keepAlive"
          :key="viewRoute.fullPath"
        />
      </RouterView>
    </a-layout-content>

    <a-layout-footer class="basic-layout__footer">
      <GlobalFooter />
    </a-layout-footer>
  </a-layout>
</template>

<style scoped>
.basic-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.background-effects {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  opacity: 0.35;
}

.background-effects__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, rgba(26, 22, 37, 0.75) 0%, rgba(45, 36, 56, 0.6) 100%);
}

.background-effects__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.2;
}

.background-effects__blob--1 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #e879a9, #7c9ce0);
  top: -120px;
  left: -80px;
  animation: blobFloat 20s ease-in-out infinite;
}

.background-effects__blob--2 {
  width: 320px;
  height: 320px;
  background: linear-gradient(135deg, #f4b8c1, #7c9ce0);
  bottom: -100px;
  right: -40px;
  animation: blobFloat 24s ease-in-out infinite reverse;
}

@keyframes blobFloat {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.4;
  }
  33% {
    transform: translate(50px, -50px) scale(1.1);
    opacity: 0.5;
  }
  66% {
    transform: translate(-30px, 30px) scale(0.9);
    opacity: 0.3;
  }
}

.basic-layout__header {
  display: flex;
  align-items: center;
  padding: 0;
  height: 64px;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: none;
  box-shadow: none;
  z-index: 100;
  position: relative;
  transition: background 0.3s ease;
}

.basic-layout__header--scrolled {
  background: transparent;
  box-shadow: none;
}

.basic-layout__content {
  flex: 1;
  padding: 24px;
  position: relative;
  z-index: 1;
}

.basic-layout__footer {
  text-align: center;
  padding: 20px 16px;
  background: rgba(26, 22, 37, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--color-border);
  position: relative;
  z-index: 1;
}

@media (max-width: 768px) {
  .basic-layout__content {
    padding: 12px;
  }
  
  .background-effects__blob--1 {
    width: 300px;
    height: 300px;
  }
  
  .background-effects__blob--2 {
    width: 250px;
    height: 250px;
  }
  
}
</style>