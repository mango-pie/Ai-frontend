/**
 * 独立音乐播放器入口（music.html / Tauri 桌面壳专用）：
 * - 不加载主站路由与权限体系，只用一个通配路由兜底渲染 MusicStandaloneApp
 * - 浏览器环境注册 PWA Service Worker（支持离线播放）；Tauri 壳内无需 SW，跳过注册
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'

import MusicStandaloneApp from './MusicStandaloneApp.vue'
import { isTauriRuntime } from '@/integrations/musicRuntime'
import { registerSW } from 'virtual:pwa-register'

import '@fontsource/zcool-kuaile'
import '@/assets/base.css'

// 使用 hash 路由：独立页面通常以静态文件（file:// 或 Tauri 自定义协议）打开，hash 模式无需服务端支持
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/:pathMatch(.*)*',
      name: '独立音乐播放器',
      component: MusicStandaloneApp,
    },
  ],
})

const app = createApp(MusicStandaloneApp)

app.use(createPinia())
app.use(router)
app.mount('#app')

// 仅浏览器环境注册 Service Worker；Tauri 运行时由壳自身管理资源加载
if (!isTauriRuntime()) {
  registerSW({ immediate: true })
}
