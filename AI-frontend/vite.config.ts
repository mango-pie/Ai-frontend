import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

function isAllowedMediaHost(host: string) {
  const h = host.toLowerCase()
  return (
    h.endsWith('.126.net') ||
    h === '126.net' ||
    h.endsWith('.qq.com') ||
    h.endsWith('.gtimg.cn') ||
    h.endsWith('.kugou.com') ||
    h.endsWith('.kgimg.com') ||
    h.endsWith('.kuwo.cn')
  )
}

function mediaProxyPlugin(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const parsed = new URL(req.url || '/', 'http://127.0.0.1')
      const target = parsed.searchParams.get('url')
      if (!target) {
        res.statusCode = 400
        res.end('missing url')
        return
      }
      let dest: URL
      try {
        dest = new URL(target)
      } catch {
        res.statusCode = 400
        res.end('bad url')
        return
      }
      if (!/^https?:$/.test(dest.protocol) || !isAllowedMediaHost(dest.hostname)) {
        res.statusCode = 403
        res.end('blocked')
        return
      }
      const referer =
        dest.hostname.includes('qq.com') || dest.hostname.includes('gtimg')
          ? 'https://y.qq.com/'
          : dest.hostname.includes('kugou')
            ? 'https://www.kugou.com/'
            : 'https://music.163.com/'
      const upstream = await fetch(dest, {
        headers: {
          Referer: referer,
          Origin: referer.replace(/\/$/, ''),
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      })
      res.statusCode = upstream.status
      const type = upstream.headers.get('content-type')
      if (type) res.setHeader('Content-Type', type)
      const len = upstream.headers.get('content-length')
      if (len) res.setHeader('Content-Length', len)
      res.setHeader('Cache-Control', 'no-store')
      if (!upstream.body) {
        res.end()
        return
      }
      await pipeline(Readable.fromWeb(upstream.body as never), res)
    } catch {
      if (!res.headersSent) res.statusCode = 502
      try {
        res.end('proxy failed')
      } catch {
        /* ignore */
      }
    }
  }

  return {
    name: 'pulse-media-proxy',
    configureServer(server) {
      server.middlewares.use('/media-proxy', (req, res) => {
        void handle(req, res)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/media-proxy', (req, res) => {
        void handle(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const standaloneMusic = mode === 'music-standalone'

  return {
  base: standaloneMusic ? './' : '/',
  plugins: [
    mediaProxyPlugin(),
    vue(),
    !standaloneMusic && vueDevTools(),
    standaloneMusic && VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['music-icon.svg'],
      manifest: {
        name: 'MIKU PULSE Music Player',
        short_name: 'MIKU PULSE',
        description: '独立的 MIKU PULSE 音乐播放器',
        theme_color: '#071821',
        background_color: '#02070c',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'any',
        scope: './',
        start_url: './music.html',
        icons: [
          {
            src: './icons/128x128@2x.png',
            sizes: '256x256',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: './icons/icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'music.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['icons/ios/**', 'icons/android/**', 'icons/Square*.png', 'icons/StoreLogo.png'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/netease-api') ||
              url.pathname.startsWith('/meting-api') ||
              url.pathname.startsWith('/media-proxy') ||
              url.hostname.endsWith('music.126.net') ||
              url.hostname.endsWith('vod.126.net'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: standaloneMusic
      ? { '@': fileURLToPath(new URL('./src', import.meta.url)) }
      : [
          { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
          // 主站模式兜底：/music 在 dev 会命中根目录 music.html（独立播放器入口），
          // 其 virtual:pwa-register 由替身实现，避免整页编译报错；standalone 构建不受影响。
          {
            find: 'virtual:pwa-register',
            replacement: fileURLToPath(new URL('./src/pwa-register-stub.ts', import.meta.url)),
          },
        ],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    hmr: {
      overlay: true,
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    watch: {
      usePolling: false,
      ignored: ['node_modules', '.git', 'dist'],
    },
    proxy: {
      '/api/uploads': {
        target: 'http://localhost:8123',
        changeOrigin: true,
      },
      '/netease-api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-api/, ''),
      },
      '/meting-api': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/meting-api/, ''),
      },
      '/hitokoto-api': {
        target: 'https://v1.hitokoto.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hitokoto-api/, ''),
      },
      '/netease-img': {
        target: 'https://p1.music.126.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-img/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://music.163.com/')
            proxyReq.setHeader('Origin', 'https://music.163.com')
          })
        },
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: false,
    proxy: {
      '/netease-api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-api/, ''),
      },
      '/meting-api': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/meting-api/, ''),
      },
      '/netease-img': {
        target: 'https://p1.music.126.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-img/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://music.163.com/')
            proxyReq.setHeader('Origin', 'https://music.163.com')
          })
        },
      },
    },
  },
  build: standaloneMusic
    ? {
        outDir: 'dist-music',
        emptyOutDir: true,
        rollupOptions: {
          input: fileURLToPath(new URL('./music.html', import.meta.url)),
        },
      }
    : undefined,
  }
})
