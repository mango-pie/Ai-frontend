<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import WorkspaceRail from '@/components/workspace/WorkspaceRail.vue'
import { useLoginUserStore } from '@/stores/loginUser'
import { siteConfig } from '@/config/site'
import { themeByHour } from '@/composables/useHomeTheme'

const route = useRoute()
const loginUserStore = useLoginUserStore()

const room = computed(() => (route.meta.room as string) || 'workspace')
const year = new Date().getFullYear()

/** 时段氛围：工作台保留夜航底色，但背景辉光随时段偏移色温 */
const period = ref(themeByHour(new Date().getHours()))
let periodTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loginUserStore.fetchLoginUser()
  periodTimer = setInterval(() => {
    period.value = themeByHour(new Date().getHours())
  }, 60_000)
})
onUnmounted(() => {
  if (periodTimer) clearInterval(periodTimer)
})
</script>

<template>
  <div class="workspace-layout" :data-room="room" :data-period="period">
    <div class="workspace-layout__bg" />
    <WorkspaceRail />
    <div class="workspace-layout__main">
      <div class="workspace-layout__content">
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
      </div>
      <div class="workspace-layout__bar">
        © {{ year }} {{ siteConfig.siteName }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-layout {
  min-height: 100vh;
  display: flex;
  position: relative;
  background: var(--color-bg-primary);
}

/* 房间强调色：侧栏选中态与页面 accent 随所在房间变化 */
.workspace-layout[data-room='reading'] {
  --ws-accent: #9b8ce8;
}
.workspace-layout[data-room='study'] {
  --ws-accent: #6aaee8;
}
.workspace-layout[data-room='profile'] {
  --ws-accent: #f490ad;
}
.workspace-layout[data-room='admin'] {
  --ws-accent: #8f9bb3;
}
.workspace-layout[data-room='lab'] {
  --ws-accent: #c79ae0;
}

.workspace-layout__bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 60% 40% at 10% 0%, rgba(232, 121, 169, 0.1), transparent 60%),
    radial-gradient(ellipse 50% 35% at 90% 100%, rgba(124, 156, 224, 0.08), transparent 55%),
    linear-gradient(160deg, #1a1625 0%, #2d2438 50%, #1a1625 100%);
  transition: background 1.2s ease;
}
/* 时段辉光：晨偏樱粉 · 午偏薄荷 · 昏偏琥珀 · 夜为默认星紫 */
.workspace-layout[data-period='morning'] .workspace-layout__bg {
  background:
    radial-gradient(ellipse 60% 40% at 10% 0%, rgba(244, 144, 173, 0.14), transparent 60%),
    radial-gradient(ellipse 50% 35% at 90% 100%, rgba(244, 200, 144, 0.08), transparent 55%),
    linear-gradient(160deg, #221a26 0%, #38283a 50%, #221a26 100%);
}
.workspace-layout[data-period='noon'] .workspace-layout__bg {
  background:
    radial-gradient(ellipse 60% 40% at 10% 0%, rgba(95, 196, 165, 0.1), transparent 60%),
    radial-gradient(ellipse 50% 35% at 90% 100%, rgba(124, 156, 224, 0.1), transparent 55%),
    linear-gradient(160deg, #161c26 0%, #22303c 50%, #161c26 100%);
}
.workspace-layout[data-period='dusk'] .workspace-layout__bg {
  background:
    radial-gradient(ellipse 60% 40% at 10% 0%, rgba(240, 164, 94, 0.12), transparent 60%),
    radial-gradient(ellipse 50% 35% at 90% 100%, rgba(155, 140, 232, 0.1), transparent 55%),
    linear-gradient(160deg, #241a1e 0%, #3a2a30 50%, #241a1e 100%);
}

.workspace-layout__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  min-height: 100vh;
}

.workspace-layout__content {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  overflow: auto;
}

.workspace-layout__bar {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  border-top: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .workspace-layout__content {
    padding: 12px 12px 72px;
  }

  .workspace-layout__bar {
    display: none;
  }
}
</style>
