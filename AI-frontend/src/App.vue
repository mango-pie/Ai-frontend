<script setup lang="ts">
/**
 * 应用根组件：
 * - 通过 ant-design-vue ConfigProvider 全局注入中文语言包与主题 token（字体、字号、配色、圆角）
 * - 依据路由 meta.shell 在「工作台外壳 WorkspaceLayout」与「门户外壳 PublicLayout」之间切换
 * - 挂载全局悬浮组件：鼠标拖尾、悬浮播放器/歌词、气泡菜单、桌宠
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ConfigProvider } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import PublicLayout from './layouts/PublicLayout.vue'
import WorkspaceLayout from './layouts/WorkspaceLayout.vue'
import MouseTrail from '@/components/MouseTrail.vue'
import { useLoginUserStore } from '@/stores/loginUser.ts'
import FloatingPlayer from '@/design/FloatingPlayer.vue'
import FloatingLyric from '@/design/FloatingLyric.vue'
import FloatingBubbleMenu from '@/components/FloatingBubbleMenu.vue'
import { PetDango } from '@/pet'
import { siteConfig } from '@/config/site'
import { usePulsePlayer } from '@/composables/usePulsePlayer'

// 全局音乐播放状态（Pulse 单例）在根组件初始化一次，所有页面共享
usePulsePlayer()

// 悬浮歌词弹层的显隐，由悬浮播放器的“打开歌词”事件触发
const showLyric = ref(false)
const route = useRoute()

// 路由 meta.shell === 'workspace' 时使用工作台外壳，否则用门户外壳
const isWorkspace = computed(() => route.meta.shell === 'workspace')

// antd 全局主题 token：粉色系主色、柔和背景、12px 圆角与站酷快乐体字号梯度
const antdTheme = computed(() => ({
  token: {
    fontFamily: "'ZCOOL KuaiLe', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: 15,
    fontSizeLG: 17,
    fontSizeSM: 13,
    fontSizeXL: 20,
    fontSizeHeading1: 40,
    fontSizeHeading2: 32,
    fontSizeHeading3: 26,
    fontSizeHeading4: 22,
    fontSizeHeading5: 18,
    colorPrimary: '#e879a9',
    colorText: '#4c5570',
    colorTextSecondary: '#8a91a8',
    colorBgBase: '#f6f2fb',
    colorBgContainer: 'rgba(255, 255, 255, 0.86)',
    colorBorder: 'rgba(155, 140, 232, 0.24)',
    borderRadius: 12,
    wireframe: false,
  },
}))

// 应用启动即预取登录用户信息（未登录时静默忽略），供导航栏等全局 UI 使用
const loginUserStore = useLoginUserStore()
loginUserStore.fetchLoginUser().catch(() => {})
</script>

<template>
  <ConfigProvider :locale="zhCN" :theme="antdTheme">
    <!-- 鼠标拖尾特效（全局装饰，不参与布局） -->
    <MouseTrail />
    <!-- 按路由 meta.shell 决定页面外壳：工作台 / 门户 -->
    <WorkspaceLayout v-if="isWorkspace" />
    <PublicLayout v-else />
  </ConfigProvider>
  <!-- Pulse 单例在 App 挂载时 bootstrap，出 /music 不停播。首页用 HomeSkyWindow，房间自有底栏，这两处不叠悬浮条。 -->
  <!-- 悬浮播放器/气泡菜单在首页与 /music 独立播放页隐藏（这两处自带播放 UI，避免叠加） -->
  <FloatingPlayer v-if="route.path !== '/' && route.path !== '/music'" @open-lyric="showLyric = true" />
  <FloatingLyric :visible="showLyric" @close="showLyric = false" />
  <FloatingBubbleMenu v-if="siteConfig.effects.bubbleMenu.enabled && route.path !== '/' && route.path !== '/music'" />
  <!-- 桌宠开关由站点配置 effects.petDango 控制 -->
  <PetDango v-if="siteConfig.effects.petDango.enabled" />
</template>
