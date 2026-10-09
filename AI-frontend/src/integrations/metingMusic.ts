/**
 * Meting 风格多平台音乐源封装 — 经 Vite 代理 /meting-api → 本地 meting-lite (:3300)
 * 平台：qq（QQ音乐）、kugou（酷狗）
 * 见 meting-lite/server.js、vite.config.ts
 */

import { parseLrc, type LyricLine } from '@/integrations/neteaseMusic'

export type MetingServer = 'qq' | 'kugou'

export const METING_SERVER_LABEL: Record<MetingServer, string> = {
  qq: 'QQ音乐',
  kugou: '酷狗',
}

/** 各平台常用榜单（发现页热门榜单区块用） */
export const METING_TOPLISTS: Array<{
  server: MetingServer
  id: string
  name: string
}> = [
  { server: 'qq', id: '26', name: 'QQ音乐 · 热歌榜' },
  { server: 'qq', id: '62', name: 'QQ音乐 · 巅峰榜MV' },
  { server: 'kugou', id: '8888', name: '酷狗 · 热歌榜' },
  { server: 'kugou', id: '8889', name: '酷狗 · TOP500' },
]

export interface MetingSong {
  id: string
  name: string
  artist: string
  album: string
  pic: string
  duration: number
  url: string
  lrc: string
  source: MetingServer
}

const BASE = '/meting-api'

/** 单次 meting 请求超时：服务不可达时快速失败，让调用方走网易云降级路径而不是无限等待 */
const METING_TIMEOUT_MS = 8000

async function metingFetch<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), METING_TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}/api?${query}`, {
      headers: { Accept: 'application/json' },
      signal: ac.signal,
    })
    if (!res.ok) throw new Error(`Meting API ${res.status}`)
    return await (res.json() as Promise<T>)
  } finally {
    clearTimeout(timer)
  }
}

/** 搜索（server: qq | kugou） */
export async function searchMeting(server: MetingServer, keywords: string): Promise<MetingSong[]> {
  const data = await metingFetch<{ code: number; data: MetingSong[] }>({
    server,
    type: 'search',
    id: keywords,
  })
  const list = Array.isArray(data.data) ? data.data : []
  return list.map((s) => ({
    ...s,
    duration: s.duration > 10_000 ? Math.round(s.duration / 1000) : s.duration,
  }))
}

/** 获取播放地址 */
export async function getMetingUrl(server: MetingServer, id: string): Promise<string> {
  const data = await metingFetch<{ code: number; data: { url?: string } }>({
    server,
    type: 'url',
    id,
  })
  return data.data?.url || ''
}

/** 获取榜单歌曲列表（duration 归一化为秒） */
export async function getMetingToplist(server: MetingServer, id: string): Promise<MetingSong[]> {
  const data = await metingFetch<{ code: number; data: MetingSong[] }>({
    server,
    type: 'toplist',
    id,
  })
  const list = Array.isArray(data.data) ? data.data : []
  return list.map((s) => ({
    ...s,
    duration: s.duration > 10_000 ? Math.round(s.duration / 1000) : s.duration,
  }))
}

/** 获取歌词原文（LRC 文本） */
export async function getMetingLyricRaw(server: MetingServer, id: string): Promise<string> {
  const data = await metingFetch<{ code: number; data: { lrc?: string } }>({
    server,
    type: 'lyric',
    id,
  })
  return data.data?.lrc ?? ''
}

/** 获取歌词（LRC 文本） */
export async function getMetingLyric(server: MetingServer, id: string): Promise<LyricLine[]> {
  return parseLrc(await getMetingLyricRaw(server, id))
}
