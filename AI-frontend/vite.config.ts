import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'

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

// 网易云 / meting 相关代理：dev 与 preview 共用一份，避免两处重复维护
const musicProxies: Record<string, ProxyOptions> = {
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
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const standaloneMusic = mode === 'music-standalone'

  return {
    base: standaloneMusic ? './' : '/',
    plugins: [
      mediaProxyPlugin(),
      vue(),
      // 模板中的 a-xxx 组件按需自动注册（仅 antd，不扫描本地组件目录）；antd v4 为 CSS-in-JS，无需按组件引样式
      Components({
        dirs: [],
        dts: 'src/components.d.ts',
        resolvers: [AntDesignVueResolver({ importStyle: false })],
      }),
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
            // Twemoji 开源表情图素材（CC-BY 4.0）：该包 exports 为空对象，用别名放行深层 SVG 引用
            {
              find: /^@twemoji\/svg\//,
              replacement: fileURLToPath(new URL('./node_modules/@twemoji/svg/', import.meta.url)),
            },
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
        '/hitokoto-api': {
          target: 'https://v1.hitokoto.cn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hitokoto-api/, ''),
        },
        ...musicProxies,
      },
    },
    preview: {
      port: 4173,
      strictPort: false,
      proxy: {
        ...musicProxies,
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
      : {
          rollupOptions: {
            output: {
              // 主站 vendor 预分组：vue 全家桶 / antd 全家桶各成一块，别再挤进首屏 index。
              // 只按 node_modules 路径归组已进依赖图的模块；页面级重依赖（music-metadata 等）不强行并入。
              manualChunks(id: string) {
                if (!id.includes('node_modules')) return undefined
                if (/[\\/]node_modules[\\/](vue|@vue|vue-router|pinia)[\\/]/.test(id)) return 'vendor-vue'
                if (/[\\/]node_modules[\\/](ant-design-vue|@ant-design)[\\/]/.test(id)) return 'vendor-antd'
                return undefined
              },
            },
          },
        },
  }
})
