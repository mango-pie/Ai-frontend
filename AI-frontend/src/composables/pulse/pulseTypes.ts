/**
 * Pulse 音乐房的共享类型、常量与纯工具函数。
 * 集中定义视图/播放模式/MV 等枚举、曲库持久化的 localStorage 键名，
 * 以及歌词对齐、封面展示、曲目判定等无状态辅助逻辑，供播放引擎与各视图复用。
 */
import type { LyricLine, Song } from '@/integrations/neteaseMusic'
import { toCoverDisplayUrl } from '@/utils/musicCover'

/** 音乐房主视图（舞台/发现/搜索/曲库/本地文件/歌单/音频实验室/设置） */
export type PulseView = 'stage' | 'discover' | 'search' | 'library' | 'files' | 'playlists' | 'audio' | 'settings'
/** 曲库分组标签页 */
export type LibraryTab = 'tracks' | 'albums' | 'artists'
/** 搜索状态机 */
export type SearchState = 'idle' | 'results' | 'loading' | 'empty' | 'error'
/** 搜索类型 */
export type SearchKind = 'song' | 'artist' | 'album' | 'playlist'
/** 播放模式（顺序/单曲循环/列表循环/随机） */
export type PlayModeLabel = 'order' | 'single-loop' | 'list-loop' | 'shuffle'
/** MV 展示形态：关闭 / 画中画 / 嵌入舞台 / 全屏影院 */
export type MvMode = 'off' | 'pip' | 'stage' | 'theater'
/** 全屏影院的布局倾向：偏 MV / 均衡 / 偏歌词 */
export type TheaterView = 'mv' | 'balanced' | 'lyrics'
/** 歌词字号档位 */
export type LyricSize = 'md' | 'large' | 'xlarge'
/** 字体预设 */
export type PulseFontPreset = 'pulse' | 'zcool'
/** 房间昼夜模式 */
export type PulseRoomMode = 'night' | 'day'
/** 房间背景：设计稿背景 / 动漫图轮播 */
export type PulseRoomBg = 'design' | 'anime'
/** 主题色预设 */
export type PulseAccentPreset = 'iris' | 'amber' | 'rose' | 'mint' | 'custom'
/** 本地曲目的持久化通道：会话内 / 文件系统句柄 / Tauri 磁盘 / blob */
export type LocalPersistKind = 'session' | 'fsa' | 'tauri' | 'blob'

/** 展示用歌词行：原文 + 可选翻译 */
export interface LyricDisplayLine {
  time: number
  text: string
  translation?: string
}

/** 曲库中统一的歌曲记录：本地/网易云/QQ/酷狗等来源共用一套字段 */
export interface PulseTrack {
  id: string
  title: string
  shortTitle: string
  artist: string
  album: string
  source: string
  duration: number
  url: string
  coverUrl?: string
  tone?: string
  favorite: boolean
  lyrics?: LyricLine[]
  lyricsTranslated?: LyricLine[]
  neteaseId?: string
  /** 网易云 MV id；undefined=未查，''=无，非空=有 */
  mvId?: string
  artistId?: string
  /** 多平台音乐源（qq/kugou），配合 remoteId 使用 */
  remoteServer?: string
  /** 多平台音乐源曲目 id（QQ songmid / 酷狗 FileHash） */
  remoteId?: string
  file?: File
  /** Tauri 绝对路径，跨进程可再打开 */
  localPath?: string
  /** 原始 LRC 文本，本地曲跨刷新保留 */
  lrcText?: string
  /** 译文 LRC 文本 */
  lrcTransText?: string
  persistKind?: LocalPersistKind
  /** FSA 权限未授予，列表可见但暂不可播 */
  localNeedsPermission?: boolean
  /** 本地下载的 MV 路径（Tauri） */
  localMvPath?: string
  /** 本地下载的 MV 可播地址（blob / asset） */
  localMvUrl?: string
}

/** 内置/账号歌单在侧栏的展示定义 */
export interface PlaylistDef {
  key: string
  name: string
  description: string
  meta: string
  label: string
  tone?: string
}

/** 本地自建歌单（仅存曲目 id 列表） */
export interface UserPlaylist {
  id: string
  name: string
  trackIds: string[]
}

/** 曲库页当前聚焦的分组（某张专辑或某位歌手） */
export interface LibraryFocus {
  kind: 'album' | 'artist'
  name: string
}

/** 各视图的编号/标题/路由短名（顶栏与快捷键提示用） */
export const VIEW_META: Record<PulseView, { code: string; title: string; route: string }> = {
  stage: { code: 'LIVE DESK / 01', title: 'Virtual Stage · 正在播放', route: '舞台' },
  discover: { code: 'LIVE DESK / 02', title: 'Discover · 发现音乐', route: '发现' },
  search: { code: 'LIVE DESK / 03', title: 'Search · 全局搜索', route: '搜索' },
  library: { code: 'LIVE DESK / 04', title: 'Library · 我的曲库', route: '曲库' },
  files: { code: 'LIVE DESK / 05', title: 'Local Files · 本地文件', route: '本地' },
  playlists: { code: 'LIVE DESK / 06', title: 'Playlists · 歌单与电台', route: '歌单' },
  audio: { code: 'LIVE DESK / 07', title: 'Audio Lab · 音频实验室', route: '音频实验室' },
  settings: { code: 'LIVE DESK / 08', title: 'System · 系统设置', route: '设置' },
}

// 曲库持久化键名集中定义（v1 版本号便于将来迁移）
export const STORAGE_KEY = 'pulse-music-library-v1'
export const FAV_KEY = 'pulse-music-favs-v1'
export const HIST_KEY = 'pulse-music-history-v1'
export const QUEUE_KEY = 'pulse-music-queue-v1'
export const SEARCH_HIST_KEY = 'pulse-music-search-hist-v1'
export const PREFS_KEY = 'pulse-music-prefs-v1'
export const USER_PL_KEY = 'pulse-music-user-playlists-v1'
export const STATS_KEY = 'pulse-music-stats-v1'
export const SEARCH_PAGE_SIZE = 30

/** 主歌词是否偏外语（拉丁 / 假名 / 韩文等），用于决定是否露出翻译开关 */
export function isForeignPrimaryLyrics(lines: LyricLine[]): boolean {
  const sample = lines
    .slice(0, 48)
    .map((l) => l.text)
    .join('')
  const letters = sample.replace(/\s/g, '')
  if (!letters.length) return false
  const foreign =
    (letters.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/g) || [])
      .length
  const han = (letters.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length
  if (foreign === 0) return false
  return foreign >= Math.max(4, han * 0.4) || foreign / letters.length > 0.22
}

/** 按时间戳把译文对齐到原文行（容差内取最近一句；对不上/与原文相同则不展示） */
export function alignLyricTranslation(
  primary: LyricLine[],
  translated: LyricLine[],
  tolerance = 0.35,
): LyricDisplayLine[] {
  if (!primary.length) return []
  if (!translated.length) {
    return primary.map((line) => ({ time: line.time, text: line.text }))
  }
  return primary.map((line) => {
    let best: LyricLine | undefined
    let bestDist = tolerance
    for (const t of translated) {
      const d = Math.abs(t.time - line.time)
      if (d <= bestDist) {
        bestDist = d
        best = t
      }
    }
    const tr = best?.text?.trim()
    return {
      time: line.time,
      text: line.text,
      translation: tr && tr !== line.text.trim() ? tr : undefined,
    }
  })
}

/** 秒数 → mm:ss 展示文本 */
export function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

/** 去掉标题里「／」或「/」后的副标题部分，得到短标题 */
export function shortOf(title: string) {
  return title.split(/[／/]/)[0]?.trim() || title
}

/** 网易云歌曲 → 统一的 PulseTrack（id 用 net- 前缀，播放 URL 留空待取） */
export function songToPulseTrack(song: Song, favorite = false): PulseTrack {
  return {
    id: `net-${song.id}`,
    title: song.title,
    shortTitle: shortOf(song.title),
    artist: song.artist,
    album: song.album,
    source: '网易云',
    duration: song.duration,
    url: '',
    coverUrl: song.coverUrl,
    favorite,
    neteaseId: song.id,
    mvId: song.mvId,
    artistId: song.artistId,
  }
}

/** 当前曲来源角标（NETEASE/LOCAL/QQ/KG…） */
export function qualityLabel(track: PulseTrack | null) {
  if (!track) return 'IDLE'
  if (track.source === '网易云') return 'NETEASE'
  if (track.source === '本地' || track.file || track.localPath) return 'LOCAL'
  if (track.source === 'QQ音乐') return 'QQ'
  if (track.source === '酷狗') return 'KG'
  return (track.source || 'LIVE').toUpperCase()
}

/** 取曲目封面展示地址（代理/直链适配），无封面返回空串 */
export function coverOf(track: PulseTrack | null | undefined) {
  return toCoverDisplayUrl(track?.coverUrl) || ''
}

/** 是否为本地导入的曲目（本地来源 / 持有 File / Tauri 路径 / 有持久化通道） */
export function isLocalTrack(track: PulseTrack) {
  return track.source === '本地' || !!track.file || !!track.localPath || !!track.persistKind
}

/** 生成本地曲目唯一 id（时间戳 + 随机串） */
export function newLocalTrackId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
