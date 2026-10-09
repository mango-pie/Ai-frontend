/**
 * Pulse 音乐房的播放引擎（全站唯一的全局单例）。
 * 管理曲库/队列/播放控制、多源搜索（网易云 + QQ/酷狗 Meting）、歌词与翻译、
 * MV（画中画/舞台/全屏）、本地文件导入、下载落盘、十段 EQ 与频谱、听歌统计、
 * 以及外观偏好（房间模式/字体/舞台样式等）的全部状态与动作。
 * 状态与副作用集中在 createPulseEngine 内，通过 effectScope 单例化供多个组件共享。
 */
import { computed, effectScope, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import {
  searchMusic,
  searchAlbums,
  searchPlaylists,
  searchArtists,
  getSongUrl,
  getLyricBundle,
  lookupOnlineLyrics,
  parseLrcOrPlain,
  getSongDetails,
  getMvUrl,
  getMvDetail,
  fetchSimilarMvs,
  fetchArtistMvs,
  fetchHotSearches,
  getSimiSongs,
  getUserPlaylists,
  getPlaylistDetail,
  getLikedSongs,
  type AudioQuality,
  type HotSearchItem,
  type LyricLine,
  type Song,
  type MvSummary,
  type MvQuality,
  type NeteaseAlbumSummary,
  type NeteaseArtistSummary,
  type NeteasePlaylistSummary,
} from '@/integrations/neteaseMusic'
import {
  searchMeting,
  getMetingUrl,
  getMetingToplist,
  getMetingLyric,
  METING_SERVER_LABEL,
  type MetingServer,
} from '@/integrations/metingMusic'
import {
  applyEqGains,
  clampEqGain,
  connectEqGraph,
  createEqFilters,
  decaySpectrumLevels,
  DEFAULT_EQ_GAINS,
  EQ_BAND_LABELS,
  EQ_PRESETS,
  sampleSpectrumLevels,
  SPECTRUM_BAR_COUNT,
  type SpectrumSampleState,
} from '@/composables/pulse/pulseEqGraph'
import {
  alignLyricTranslation,
  coverOf,
  FAV_KEY,
  formatTime,
  HIST_KEY,
  isForeignPrimaryLyrics,
  isLocalTrack,
  PREFS_KEY,
  qualityLabel,
  QUEUE_KEY,
  SEARCH_HIST_KEY,
  SEARCH_PAGE_SIZE,
  shortOf,
  songToPulseTrack,
  STATS_KEY,
  STORAGE_KEY,
  USER_PL_KEY,
  VIEW_META,
  type LibraryFocus,
  type LibraryTab,
  type LocalPersistKind,
  type LyricDisplayLine,
  type LyricSize,
  type MvMode,
  type PlaylistDef,
  type PlayModeLabel,
  type PulseFontPreset,
  type PulseRoomBg,
  type PulseRoomMode,
  type PulseAccentPreset,
  type PulseTrack,
  type PulseView,
  type SearchKind,
  type SearchState,
  type TheaterView,
  type UserPlaylist,
} from '@/composables/pulse/pulseTypes'
import {
  deleteLocalRecord,
  hydrateLocalTracks,
  importBrowserFileList,
  localLibraryHint,
  persistImportedLocal,
  persistLocalTrackMeta,
  pickLocalMedia,
  requestHandlePermission,
  restoreLocalPlayback,
  revokeTrackUrls,
  type LocalImportResult,
  type LocalPersistOutcome,
} from '@/integrations/pulseLocalLibrary'
import {
  canDownloadTrack,
  downloadSinkLabel as formatDownloadSinkLabel,
  downloadTrackToDisk,
  isDownloadAbortError,
  persistDownloadSink,
  rememberedSinkHint,
  rememberedFsaDir,
  resolveDownloadSink,
  pickDownloadSink,
  importFromDownloadSink,
  resolveTrackMvId,
  type DownloadProgress,
} from '@/integrations/pulseDownload'
import { isTauriRuntime } from '@/integrations/musicRuntime'
import { hasBackgroundImages } from '@/composables/useBackgroundSlideshow'
import {
  ACCENT_PRESETS,
  clampRoomBlur,
  clampRoomVeil,
  normalizeHex,
} from '@/composables/pulse/pulseRoomLook'

export {
  alignLyricTranslation,
  coverOf,
  formatTime,
  isForeignPrimaryLyrics,
  qualityLabel,
  songToPulseTrack,
  VIEW_META,
}
export type {
  LibraryFocus,
  LibraryTab,
  LyricDisplayLine,
  LyricSize,
  MvMode,
  PlaylistDef,
  PlayModeLabel,
  PulseFontPreset,
  PulseRoomBg,
  PulseRoomMode,
  PulseAccentPreset,
  PulseTrack,
  PulseView,
  SearchKind,
  SearchState,
  TheaterView,
  UserPlaylist,
} from '@/composables/pulse/pulseTypes'

/**
 * 创建播放引擎实例。仅在 effectScope 中执行一次（见底部 usePulsePlayer），
 * 返回的巨对象同时充当状态容器与 API，供音乐房各视图组件直接消费。
 */
function createPulseEngine() {
  let rootClassTarget: Ref<HTMLElement | null> | undefined
  let audioBound = false
  let bootstrapped = false
  let recoveringUrl = false
  // 单例 <audio>：crossOrigin 以便接入 Web Audio 分析频谱
  const audio = new Audio()
  audio.preload = 'metadata'
  audio.crossOrigin = 'anonymous'

  // Web Audio 图：媒体源 → EQ 滤波器链 → 分析器 → 输出（首次播放时惰性搭建）
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let mediaSource: MediaElementAudioSourceNode | null = null
  let eqFilters: BiquadFilterNode[] = []
  let freqData: Uint8Array<ArrayBuffer> | null = null
  let spectrumRaf = 0
  const spectrumState: SpectrumSampleState = { silentFrames: 0, fallbackSeed: 0 }
  let pendingLrcTrackId = ''

  const spectrumLevels = ref<number[]>(Array.from({ length: SPECTRUM_BAR_COUNT }, () => 0.08))
  const spectrumBarCount = SPECTRUM_BAR_COUNT

  const tracks = ref<PulseTrack[]>([])
  const queueIds = ref<string[]>([])
  const currentId = ref('')
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(0.72)
  const muted = ref(false)
  const shuffle = ref(false)
  const repeat = ref(0)
  const view = ref<PulseView>('stage')
  const libraryTab = ref<LibraryTab>('tracks')
  const drawerOpen = ref(false)
  const drawerPinned = ref(false)
  const drawerTab = ref<'queue' | 'lyrics'>('queue')
  /** 歌曲详情抽屉 */
  const songDetail = ref<PulseTrack | null>(null)
  const simiSongs = ref<Song[]>([])
  const simiLoading = ref(false)

  /** 听歌统计：trackId → { plays, seconds, lastPlay } */
  const playStats = ref<Record<string, { plays: number; seconds: number; lastPlay: number }>>(
    loadPlayStats(),
  )
  const theaterOpen = ref(false)
  const miniMode = ref(false)
  /** 沉浸模式：隐藏侧栏/顶栏/工具条，只留舞台与播放控制 */
  const immersive = ref(false)
  const mvEnabled = ref(true)
  const mvMode = ref<MvMode>('off')
  const mvActive = computed(() => mvMode.value !== 'off')
  const mvQuality = ref<MvQuality>(720)
  /** 是否展示相关 / 歌手 MV 列表 */
  const showRelatedMvs = ref(true)
  const mvUrl = ref('')
  const mvReady = ref(false)
  const mvLoading = ref(false)
  /** 相关列表换片时覆盖当前曲 mvid（不换歌） */
  const mvOverrideId = ref('')
  const relatedMvs = ref<MvSummary[]>([])
  const relatedMvLoading = ref(false)
  const mvOriginalAudio = ref(false)
  const mvSeekRequest = ref<number | null>(null)
  /** PIP 拖动位置（null = 用默认右下角） */
  const pipPos = ref<{ left: number; top: number } | null>(null)
  let mvLoadToken = 0
  let mvLoadedKey = ''
  let relatedLoadToken = 0
  const motionOn = ref(true)
  const compactMode = ref(false)
  const railAutoCollapse = ref(true)
  const stageVariant = ref<'arena' | 'star-river' | 'focus'>('star-river')
  const fontPreset = ref<PulseFontPreset>('pulse')
  /** 舞台悬停才移入封面/快捷入口/下一首 */
  const stageRevealOnHover = ref(false)
  /** 移出舞台时：大屏歌词 + 节拍灯光 */
  const stageConcertFx = ref(true)
  const roomMode = ref<PulseRoomMode>('night')
  const roomBg = ref<PulseRoomBg>('design')
  const roomBlur = ref(8)
  const roomVeil = ref(0.22)
  const accentPreset = ref<PulseAccentPreset>('iris')
  const accentHex = ref(ACCENT_PRESETS.iris.night)
  const toastText = ref('')
  const toastVisible = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  const downloadPromptTracks = ref<PulseTrack[]>([])
  const downloadPromptTrack = computed(() => downloadPromptTracks.value[0] || null)
  const downloadIncludeLyrics = ref(true)
  const downloadIncludeMv = ref(false)
  const downloadHasMv = ref(false)
  const downloadBusy = ref(false)
  const downloadProgress = ref<DownloadProgress | null>(null)
  const downloadDir = ref('')
  const downloadSinkLabel = ref('')
  const downloadFailedTitles = ref<string[]>([])
  let downloadAbort: AbortController | null = null

  const searchQuery = ref('')
  const searchState = ref<SearchState>('idle')
  const searchKind = ref<SearchKind>('song')
  const searchResults = ref<PulseTrack[]>([])
  const searchAlbumResults = ref<NeteaseAlbumSummary[]>([])
  const searchPlaylistResults = ref<NeteasePlaylistSummary[]>([])
  const searchArtistResults = ref<NeteaseArtistSummary[]>([])
  const searchHasMore = ref(false)
  const searchHistory = ref<string[]>([])
  const hotSearches = ref<HotSearchItem[]>([])
  const hotSearchLoading = ref(false)
  const hotSearchLoaded = ref(false)
  const neteaseLoading = ref(false)
  const lyricLoading = ref(false)
  const provider = ref('全部')
  const libraryFilter = ref('')
  const libraryFocus = ref<LibraryFocus | null>(null)
  const playlistKey = ref('queue')
  const showLyricTranslation = ref(true)
  const lyricSize = ref<LyricSize>('md')
  const theaterView = ref<TheaterView>('balanced')
  const eqEnabled = ref(true)
  const eqGains = ref([...DEFAULT_EQ_GAINS])
  /** 当前 EQ 预设 id；'' 表示手动调过档位 */
  const eqPresetId = ref('flat')
  const eqBands = EQ_BAND_LABELS
  const localHint = localLibraryHint()
  /** 本地导入「仅存元数据」开关：只把记录（标题/歌词/封面）写进 IndexedDB，不存音频 Blob，避免大文件占满配额 */
  const localMetadataOnly = ref(false)
  const lrcInputRef = ref<HTMLInputElement | null>(null)
  const historyIds = ref<string[]>([])
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const folderInputRef = ref<HTMLInputElement | null>(null)
  const lyricLookupIds = new Set<string>()
  const audioQuality = ref<AudioQuality>('standard')
  const userPlaylists = ref<UserPlaylist[]>([])
  const neteaseAccountPlaylists = ref<NeteasePlaylistSummary[]>([])
  const neteasePlaylistSongs = ref<PulseTrack[]>([])
  const neteasePlaylistLoading = ref(false)
  const likedTrackIds = ref<string[]>([])

  const playlists: PlaylistDef[] = [
    {
      key: 'queue',
      name: '当前播放队列',
      description: '正在播放与即将播放的曲目。',
      meta: 'LIVE QUEUE',
      label: 'PLAYLIST / 01',
    },
    {
      key: 'favorites',
      name: '我的收藏',
      description: '标记为收藏的曲目。',
      meta: 'FAVORITES',
      label: 'PLAYLIST / 02',
      tone: 'magenta',
    },
    {
      key: 'history',
      name: '最近播放',
      description: '按收听顺序排列的历史记录。',
      meta: 'RECENT',
      label: 'PLAYLIST / 03',
      tone: 'ice',
    },
    {
      key: 'local',
      name: '本地曲库',
      description: '从本机导入的音频文件。',
      meta: 'LOCAL FILES',
      label: 'PLAYLIST / 04',
      tone: 'yellow',
    },
  ]

  const currentTrack = computed(() => tracks.value.find((t) => t.id === currentId.value) ?? null)
  const currentIndex = computed(() => tracks.value.findIndex((t) => t.id === currentId.value))
  const viewMeta = computed(() => VIEW_META[view.value])
  const progressPct = computed(() => {
    const d = duration.value || currentTrack.value?.duration || 0
    if (!d) return 0
    return Math.min(100, (currentTime.value / d) * 100)
  })

  const queueTracks = computed(() => {
    const mapped = queueIds.value
      .map((id) => tracks.value.find((t) => t.id === id))
      .filter(Boolean) as PulseTrack[]
    if (mapped.length) return mapped
    return tracks.value.filter((t) => t.url || t.neteaseId)
  })

  const lyricLines = computed(() => {
    const track = currentTrack.value
    if (!track?.lyrics?.length) return [] as LyricLine[]
    return track.lyrics
  })

  const hasTranslation = computed(() => (currentTrack.value?.lyricsTranslated?.length ?? 0) > 0)

  const isForeignLyrics = computed(() => isForeignPrimaryLyrics(lyricLines.value))

  /** 有译文时露出「显示翻译」 */
  const canShowLyricTranslation = computed(() => hasTranslation.value)

  const lyricDisplayLines = computed((): LyricDisplayLine[] => {
    const primary = lyricLines.value
    if (!primary.length) return []
    if (!canShowLyricTranslation.value || !showLyricTranslation.value) {
      return primary.map((line) => ({ time: line.time, text: line.text }))
    }
    return alignLyricTranslation(primary, currentTrack.value?.lyricsTranslated ?? [])
  })

  const lyricIndex = computed(() => {
    const lines = lyricLines.value
    if (!lines.length) return -1
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.time <= currentTime.value) idx = i
      else break
    }
    return idx
  })

  const lyricProgressWithin = computed(() => {
    const lines = lyricLines.value
    const idx = lyricIndex.value
    if (idx < 0) return 0
    const cur = lines[idx]
    const next = lines[idx + 1]
    if (!cur) return 0
    const start = cur.time
    const end = next?.time ?? (duration.value || currentTrack.value?.duration || start + 8)
    if (end <= start) return 100
    return Math.min(100, Math.max(0, ((currentTime.value - start) / (end - start)) * 100))
  })

  const hasRealLyrics = computed(() => (currentTrack.value?.lyrics?.length ?? 0) > 0)
  const stageQueue = computed(() => queueTracks.value.slice(0, 5))
  const upNextTracks = computed(() => {
    const list = queueTracks.value
    if (!list.length) return [] as PulseTrack[]
    const idx = list.findIndex((t) => t.id === currentId.value)
    if (idx < 0) return list.filter((t) => t.id !== currentId.value).slice(0, 1)
    const after = list.slice(idx + 1)
    const wrap = list.slice(0, idx)
    return [...after, ...wrap].slice(0, 1)
  })
  const upNextTrack = computed(() => upNextTracks.value[0] ?? null)
  const localTracks = computed(() => tracks.value.filter((t) => t.source === '本地' || !!t.file))
  const favoriteTracks = computed(() => tracks.value.filter((t) => t.favorite))
  const historyTracks = computed(
    () => historyIds.value.map((id) => tracks.value.find((t) => t.id === id)).filter(Boolean) as PulseTrack[],
  )
  const discoverTracks = computed(() => tracks.value.filter((t) => t.url || t.neteaseId).slice(0, 8))
  const filteredLibrary = computed(() => {
    const q = libraryFilter.value.trim().toLowerCase()
    const list = tracks.value
    if (!q) return list
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    )
  })
  const activePlaylist = computed(() => {
    if (playlistKey.value === 'liked') {
      return {
        key: 'liked',
        name: '我喜欢的音乐',
        description: '网易云红心歌曲',
        meta: 'LIKED',
        label: '♥',
        tone: 'magenta',
      } satisfies PlaylistDef
    }
    if (playlistKey.value.startsWith('user:')) {
      const pl = userPlaylists.value.find((p) => `user:${p.id}` === playlistKey.value)
      if (pl) {
        return {
          key: playlistKey.value,
          name: pl.name,
          description: '本地自建歌单',
          meta: 'LOCAL LIST',
          label: 'MINE',
          tone: 'yellow',
        } satisfies PlaylistDef
      }
    }
    if (playlistKey.value.startsWith('net:')) {
      const pl = neteaseAccountPlaylists.value.find((p) => `net:${p.id}` === playlistKey.value)
      if (pl) {
        return {
          key: playlistKey.value,
          name: pl.name,
          description: '来自网易云账号',
          meta: 'NETEASE',
          label: 'CLOUD',
          tone: 'magenta',
        } satisfies PlaylistDef
      }
    }
    return playlists.find((p) => p.key === playlistKey.value) ?? playlists[0]!
  })
  const playlistTracks = computed(() => {
    if (playlistKey.value.startsWith('user:')) {
      const pl = userPlaylists.value.find((p) => `user:${p.id}` === playlistKey.value)
      if (!pl) return [] as PulseTrack[]
      return pl.trackIds
        .map((id) => tracks.value.find((t) => t.id === id))
        .filter(Boolean) as PulseTrack[]
    }
    if (playlistKey.value.startsWith('net:')) {
      return neteasePlaylistSongs.value
    }
    switch (playlistKey.value) {
      case 'favorites':
        return favoriteTracks.value
      case 'history':
        return historyTracks.value
      case 'local':
        return localTracks.value
      case 'liked':
        return tracks.value.filter((t) => t.neteaseId && likedTrackIds.value.includes(t.neteaseId))
      default:
        return queueTracks.value
    }
  })
  const albumGroups = computed(() => {
    const map = new Map<string, PulseTrack[]>()
    for (const t of filteredLibrary.value) {
      const key = t.album || '未知专辑'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      items,
      count: items.length,
      coverUrl: items.find((t) => t.coverUrl)?.coverUrl || '',
    }))
  })
  const artistGroups = computed(() => {
    const map = new Map<string, PulseTrack[]>()
    for (const t of filteredLibrary.value) {
      const key = t.artist || '未知歌手'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      items,
      count: items.length,
      coverUrl: items.find((t) => t.coverUrl)?.coverUrl || '',
    }))
  })
  const libraryFocusTracks = computed(() => {
    if (!libraryFocus.value) return [] as PulseTrack[]
    if (libraryFocus.value.kind === 'album') {
      return albumGroups.value.find((g) => g.name === libraryFocus.value?.name)?.items ?? []
    }
    return artistGroups.value.find((g) => g.name === libraryFocus.value?.name)?.items ?? []
  })
  const libraryStats = computed(() => ({
    tracks: tracks.value.length,
    albums: albumGroups.value.length,
    artists: artistGroups.value.length,
    favorites: favoriteTracks.value.length,
    local: localTracks.value.length,
  }))
  const playMode = computed<PlayModeLabel>(() => {
    if (shuffle.value) return 'shuffle'
    if (repeat.value === 2) return 'single-loop'
    if (repeat.value === 1) return 'list-loop'
    return 'order'
  })
  const currentCover = computed(() => coverOf(currentTrack.value))
  const hasMv = computed(
    () => !!(currentTrack.value?.mvId || currentTrack.value?.localMvPath || currentTrack.value?.localMvUrl),
  )
  const isEmptyLibrary = computed(() => tracks.value.length === 0)

  /** 统一弹 toast（2.4s 自动消失，重置前先清旧定时器） */
  function showToast(message: string) {
    toastText.value = message
    toastVisible.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastVisible.value = false
    }, 2400)
  }

  /** 把播放/抽屉/迷你/沉浸/MV 模式等状态同步为音乐房根节点的 class 与 data-*，供 CSS 分支 */
  function syncRootClasses() {
    const root = rootClassTarget?.value ?? document.querySelector('.music-room-root')
    if (!root) return
    root.classList.toggle('is-playing', isPlaying.value)
    root.classList.toggle('drawer-open', drawerOpen.value)
    root.classList.toggle('drawer-pinned', drawerOpen.value && drawerPinned.value)
    root.classList.toggle('lyrics-theater-open', theaterOpen.value)
    root.classList.toggle('mini-mode', miniMode.value)
    root.classList.toggle('is-immersive', immersive.value)
    root.classList.toggle('motion-off', !motionOn.value)
    root.classList.toggle('compact-mode', compactMode.value)
    root.classList.toggle('rail-auto-collapse', railAutoCollapse.value)
    root.classList.toggle('stage-reveal-on', stageRevealOnHover.value)
    root.classList.toggle('stage-concert-on', stageConcertFx.value)
    root.classList.toggle('mv-pip-on', mvMode.value === 'pip')
    root.classList.toggle('mv-stage-on', mvMode.value === 'stage')
    root.classList.toggle('mv-theater-on', mvMode.value === 'theater')
    root.setAttribute('data-stage', stageVariant.value)
    root.setAttribute('data-font', fontPreset.value)
    root.setAttribute('data-lyric-size', lyricSize.value)
    root.setAttribute('data-theater-view', theaterView.value)
    root.setAttribute('data-mode', roomMode.value)
    root.setAttribute('data-slide', roomBg.value === 'anime' ? 'on' : 'off')
  }

  /** 外观/播放偏好整体写入 localStorage（PREFS_KEY），失败静默 */
  function persistPrefs() {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          motionOn: motionOn.value,
          compactMode: compactMode.value,
          railAutoCollapse: railAutoCollapse.value,
          stageVariant: stageVariant.value,
          fontPreset: fontPreset.value,
          stageRevealOnHover: stageRevealOnHover.value,
          stageConcertFx: stageConcertFx.value,
          roomMode: roomMode.value,
          roomBg: roomBg.value,
          roomBlur: roomBlur.value,
          roomVeil: roomVeil.value,
          accentPreset: accentPreset.value,
          accentHex: accentHex.value,
          mvEnabled: mvEnabled.value,
          mvQuality: mvQuality.value,
          showRelatedMvs: showRelatedMvs.value,
          showLyricTranslation: showLyricTranslation.value,
          lyricSize: lyricSize.value,
          theaterView: theaterView.value,
          volume: volume.value,
          muted: muted.value,
          shuffle: shuffle.value,
          repeat: repeat.value,
          audioQuality: audioQuality.value,
          eqEnabled: eqEnabled.value,
          eqGains: eqGains.value,
          eqPresetId: eqPresetId.value,
          downloadDir: downloadDir.value,
        }),
      )
    } catch {
      /* ignore */
    }
  }

  /** 从 localStorage 恢复偏好；逐字段做类型/枚举校验，脏数据直接忽略 */
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (!raw) return
      const prefs = JSON.parse(raw) as {
        motionOn?: boolean
        compactMode?: boolean
        railAutoCollapse?: boolean
        stageVariant?: 'arena' | 'star-river' | 'focus'
        fontPreset?: PulseFontPreset
        stageRevealOnHover?: boolean
        stageConcertFx?: boolean
        roomMode?: PulseRoomMode
        roomBg?: PulseRoomBg
        roomBlur?: number
        roomVeil?: number
        accentPreset?: PulseAccentPreset
        accentHex?: string
        mvEnabled?: boolean
        mvQuality?: MvQuality
        showRelatedMvs?: boolean
        showLyricTranslation?: boolean
        lyricSize?: LyricSize
        theaterView?: TheaterView
        volume?: number
        muted?: boolean
        shuffle?: boolean
        repeat?: number
        audioQuality?: AudioQuality
        eqEnabled?: boolean
        eqGains?: number[]
        eqPresetId?: string
        downloadDir?: string
      }
      if (typeof prefs.motionOn === 'boolean') motionOn.value = prefs.motionOn
      if (typeof prefs.compactMode === 'boolean') compactMode.value = prefs.compactMode
      if (typeof prefs.railAutoCollapse === 'boolean') railAutoCollapse.value = prefs.railAutoCollapse
      if (prefs.stageVariant === 'arena' || prefs.stageVariant === 'star-river' || prefs.stageVariant === 'focus') {
        stageVariant.value = prefs.stageVariant
      }
      if (prefs.fontPreset === 'pulse' || prefs.fontPreset === 'zcool') {
        fontPreset.value = prefs.fontPreset
      }
      if (typeof prefs.stageRevealOnHover === 'boolean') {
        stageRevealOnHover.value = prefs.stageRevealOnHover
      }
      if (typeof prefs.stageConcertFx === 'boolean') {
        stageConcertFx.value = prefs.stageConcertFx
      }
      if (prefs.roomMode === 'night' || prefs.roomMode === 'day') {
        roomMode.value = prefs.roomMode
      }
      if (prefs.roomBg === 'design' || prefs.roomBg === 'anime') {
        roomBg.value = hasBackgroundImages ? prefs.roomBg : 'design'
      }
      if (typeof prefs.roomBlur === 'number') roomBlur.value = clampRoomBlur(prefs.roomBlur)
      if (typeof prefs.roomVeil === 'number') roomVeil.value = clampRoomVeil(prefs.roomVeil)
      if (
        prefs.accentPreset === 'iris' ||
        prefs.accentPreset === 'amber' ||
        prefs.accentPreset === 'rose' ||
        prefs.accentPreset === 'mint' ||
        prefs.accentPreset === 'custom'
      ) {
        accentPreset.value = prefs.accentPreset
      }
      if (typeof prefs.accentHex === 'string' && prefs.accentHex) {
        accentHex.value = prefs.accentHex
      }
      if (typeof prefs.mvEnabled === 'boolean') {
        mvEnabled.value = prefs.mvEnabled
      }
      if (prefs.mvQuality === 480 || prefs.mvQuality === 720 || prefs.mvQuality === 1080) {
        mvQuality.value = prefs.mvQuality
      }
      if (typeof prefs.showRelatedMvs === 'boolean') {
        showRelatedMvs.value = prefs.showRelatedMvs
      }
      if (typeof prefs.showLyricTranslation === 'boolean') {
        showLyricTranslation.value = prefs.showLyricTranslation
      }
      if (prefs.lyricSize === 'md' || prefs.lyricSize === 'large' || prefs.lyricSize === 'xlarge') {
        lyricSize.value = prefs.lyricSize
      }
      if (prefs.theaterView === 'mv' || prefs.theaterView === 'balanced' || prefs.theaterView === 'lyrics') {
        theaterView.value = prefs.theaterView
      }
      if (typeof prefs.volume === 'number') volume.value = Math.max(0, Math.min(1, prefs.volume))
      if (typeof prefs.muted === 'boolean') muted.value = prefs.muted
      if (typeof prefs.shuffle === 'boolean') shuffle.value = prefs.shuffle
      if (prefs.repeat === 0 || prefs.repeat === 1 || prefs.repeat === 2) repeat.value = prefs.repeat
      if (prefs.audioQuality === 'standard' || prefs.audioQuality === 'exhigh' || prefs.audioQuality === 'lossless') {
        audioQuality.value = prefs.audioQuality
      }
      if (typeof prefs.eqEnabled === 'boolean') eqEnabled.value = prefs.eqEnabled
      if (Array.isArray(prefs.eqGains) && prefs.eqGains.length === DEFAULT_EQ_GAINS.length) {
        eqGains.value = prefs.eqGains.map((g) => clampEqGain(g))
      }
      if (typeof prefs.eqPresetId === 'string' && EQ_PRESETS.some((p) => p.id === prefs.eqPresetId)) {
        eqPresetId.value = prefs.eqPresetId
      }
      if (typeof prefs.downloadDir === 'string') downloadDir.value = prefs.downloadDir
    } catch {
      /* ignore */
    }
  }

  function setFontPreset(next: PulseFontPreset) {
    fontPreset.value = next
    persistPrefs()
    syncRootClasses()
    showToast(next === 'zcool' ? '已切换为站酷快乐体' : '已恢复舞台默认字体')
  }

  function loadPlayStats(): Record<string, { plays: number; seconds: number; lastPlay: number }> {
    try {
      const raw = localStorage.getItem(STATS_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, { plays?: number; seconds?: number; lastPlay?: number }>
      const out: Record<string, { plays: number; seconds: number; lastPlay: number }> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (!v || typeof v !== 'object') continue
        out[k] = {
          plays: Math.max(0, Math.floor(Number(v.plays) || 0)),
          seconds: Math.max(0, Math.floor(Number(v.seconds) || 0)),
          lastPlay: Number(v.lastPlay) || 0,
        }
      }
      return out
    } catch {
      return {}
    }
  }

  function persistPlayStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(playStats.value))
    } catch {
      /* ignore */
    }
  }

  /** 记录一次播放（次数 +1、累计时长 += 已听秒数） */
  function recordPlay(track: PulseTrack, listenedSeconds = 0) {
    const prev = playStats.value[track.id] ?? { plays: 0, seconds: 0, lastPlay: 0 }
    playStats.value = {
      ...playStats.value,
      [track.id]: {
        plays: prev.plays + 1,
        seconds: prev.seconds + Math.max(0, Math.round(listenedSeconds || track.duration || prev.seconds)),
        lastPlay: Date.now(),
      },
    }
    persistPlayStats()
  }

  /** 统计汇总：总播放/总时长/热门歌曲/热门歌手 */
  const listenStats = computed(() => {
    const entries = Object.entries(playStats.value)
      .map(([id, s]) => ({ track: tracks.value.find((t) => t.id === id), ...s }))
      .filter((x) => x.track)
    const topSongs = [...entries].sort((a, b) => b.plays - a.plays).slice(0, 10).map((x) => x.track!)
    const artistAgg = new Map<string, { plays: number; seconds: number }>()
    for (const x of entries) {
      const name = x.track!.artist || '未知歌手'
      const cur = artistAgg.get(name) ?? { plays: 0, seconds: 0 }
      artistAgg.set(name, { plays: cur.plays + x.plays, seconds: cur.seconds + x.seconds })
    }
    const topArtists = [...artistAgg.entries()]
      .sort((a, b) => b[1].plays - a[1].plays)
      .slice(0, 10)
      .map(([name, v]) => ({ name, plays: v.plays, seconds: v.seconds }))
    return {
      totalPlays: entries.reduce((acc, x) => acc + x.plays, 0),
      totalSeconds: entries.reduce((acc, x) => acc + x.seconds, 0),
      songCount: entries.length,
      topSongs,
      topArtists,
    }
  })

  /** 会话级地址（blob:）不能写入持久化：剥掉留空，刷新后由 ensureTrackMeta / backfillMissingCovers 重取在线封面 */
  function persistableCover(coverUrl?: string) {
    return coverUrl?.startsWith('blob:') ? '' : coverUrl
  }

  /** 曲库元数据持久化：只落可离线恢复的在线曲目（本地 blob URL 无法持久），连带收藏/历史/队列/自建歌单 */
  function persistMeta() {
    try {
      const meta = tracks.value
        .filter((t) => t.neteaseId || t.remoteId || (t.source === '本地' && !t.file))
        .map((t) => ({
          id: t.id,
          title: t.title,
          shortTitle: t.shortTitle,
          artist: t.artist,
          album: t.album,
          source: t.source,
          duration: t.duration,
          url: t.neteaseId ? '' : '',
          coverUrl: persistableCover(t.coverUrl),
          tone: t.tone,
          favorite: t.favorite,
          neteaseId: t.neteaseId,
          mvId: t.mvId,
          artistId: t.artistId,
          remoteServer: t.remoteServer,
          remoteId: t.remoteId,
        }))
      // Prefer persisting NetEase tracks (URLs expire); local blob URLs can't persist
      const neteaseOnly = tracks.value
        .filter((t) => t.neteaseId || t.remoteId)
        .map((t) => ({
          id: t.id,
          title: t.title,
          shortTitle: t.shortTitle,
          artist: t.artist,
          album: t.album,
          source: t.source,
          duration: t.duration,
          url: '',
          coverUrl: persistableCover(t.coverUrl),
          tone: t.tone,
          favorite: t.favorite,
          neteaseId: t.neteaseId,
          mvId: t.mvId,
          artistId: t.artistId,
          remoteServer: t.remoteServer,
          remoteId: t.remoteId,
        }))
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(neteaseOnly.length ? neteaseOnly : meta.filter((t) => t.neteaseId || t.remoteId)),
      )
      localStorage.setItem(FAV_KEY, JSON.stringify(tracks.value.filter((t) => t.favorite).map((t) => t.id)))
      localStorage.setItem(HIST_KEY, JSON.stringify(historyIds.value.slice(0, 60)))
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queueIds.value.slice(0, 100)))
      localStorage.setItem(USER_PL_KEY, JSON.stringify(userPlaylists.value.slice(0, 40)))
    } catch {
      /* ignore */
    }
  }

  function persistSearchHistory() {
    try {
      localStorage.setItem(SEARCH_HIST_KEY, JSON.stringify(searchHistory.value.slice(0, 20)))
    } catch {
      /* ignore */
    }
  }

  function pushSearchHistory(keyword: string) {
    const q = keyword.trim()
    if (!q) return
    searchHistory.value = [q, ...searchHistory.value.filter((x) => x !== q)].slice(0, 20)
    persistSearchHistory()
  }

  function removeSearchHistory(keyword: string) {
    searchHistory.value = searchHistory.value.filter((x) => x !== keyword)
    persistSearchHistory()
  }

  function clearSearchHistory() {
    searchHistory.value = []
    persistSearchHistory()
  }

  async function loadHotSearches(force = false) {
    if (hotSearchLoading.value) return
    if (hotSearchLoaded.value && !force) return
    hotSearchLoading.value = true
    try {
      hotSearches.value = await fetchHotSearches()
      hotSearchLoaded.value = true
    } catch {
      // 网易云热搜不可用时多源降级：改用 meting QQ 热歌榜歌名作为热搜词（content 标注来源）
      try {
        const songs = await getMetingToplist('qq', '26')
        hotSearches.value = songs
          .filter((s) => s.name)
          .slice(0, 16)
          .map((s) => ({ searchWord: s.name, content: `QQ音乐热歌榜 · ${s.artist}` }))
        hotSearchLoaded.value = !!hotSearches.value.length
      } catch {
        /* 两个来源都不可用，保持空列表（UI 有空态文案） */
      }
    } finally {
      hotSearchLoading.value = false
    }
  }

  /** 恢复 localStorage 中的曲库/历史/队列/自建歌单；在线曲目 URL 一律清空待播放时重取 */
  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const favs = new Set<string>(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'))
      const hist = JSON.parse(localStorage.getItem(HIST_KEY) || '[]') as string[]
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as string[]
      const searchHist = JSON.parse(localStorage.getItem(SEARCH_HIST_KEY) || '[]') as string[]
      historyIds.value = Array.isArray(hist) ? hist : []
      searchHistory.value = Array.isArray(searchHist)
        ? searchHist.filter((x) => typeof x === 'string' && x.trim()).slice(0, 20)
        : []
      if (raw) {
        const saved = JSON.parse(raw) as PulseTrack[]
        tracks.value = (Array.isArray(saved) ? saved : [])
          .filter((t) => t.neteaseId || t.remoteId)
          .map((t) => ({
            ...t,
            shortTitle: t.shortTitle || shortOf(t.title),
            favorite: favs.has(t.id) || t.favorite,
            url: '',
            // 历史版本可能存入了 blob: 封面（刷新即死链）：恢复时统一剥掉，交由封面补齐逻辑重取
            coverUrl: t.coverUrl?.startsWith('blob:') ? '' : t.coverUrl,
            source: t.source || '网易云',
          }))
      } else {
        tracks.value = []
      }
      queueIds.value = Array.isArray(queue) ? queue.filter((id) => tracks.value.some((t) => t.id === id)) : []
      if (!queueIds.value.length) queueIds.value = tracks.value.map((t) => t.id)
      if (tracks.value[0]) currentId.value = tracks.value[0].id
      const savedPl = JSON.parse(localStorage.getItem(USER_PL_KEY) || '[]') as UserPlaylist[]
      userPlaylists.value = Array.isArray(savedPl)
        ? savedPl.filter((p) => p?.id && p?.name && Array.isArray(p.trackIds)).slice(0, 40)
        : []
    } catch {
      tracks.value = []
      queueIds.value = []
    }
  }

  function ensureInQueue(id: string) {
    if (!queueIds.value.includes(id)) queueIds.value = [...queueIds.value, id]
  }

  function switchView(next: PulseView) {
    if (next === 'audio') {
      view.value = 'settings'
      undockStageMvIfNeeded()
      void nextTick(() => {
        const host = rootClassTarget?.value ?? document.querySelector('.music-room-root')
        const canvas = host?.querySelector('.canvas') as HTMLElement | null
        const eq = document.getElementById('pulse-eq')
        if (canvas && eq) {
          canvas.scrollTop = Math.max(0, eq.offsetTop - 12)
        }
      })
      return
    }
    const prev = view.value
    view.value = next
    if (prev === 'stage' && next !== 'stage') undockStageMvIfNeeded()
    if (next === 'search') void loadHotSearches()
  }

  function mapSongResult(s: Song): PulseTrack {
    return {
      id: `net-${s.id}`,
      title: s.title,
      shortTitle: shortOf(s.title),
      artist: s.artist,
      album: s.album,
      source: '网易云',
      duration: s.duration,
      url: '',
      coverUrl: s.coverUrl,
      favorite: false,
      neteaseId: s.id,
      mvId: s.mvId,
      artistId: s.artistId,
    }
  }

  /** 统一搜索入口：单曲搜索合并本地命中 + 网易云分页 + QQ/酷狗首屏；append=true 追加下一页 */
  async function runSearch(query = searchQuery.value, append = false) {
    const q = query.trim()
    searchQuery.value = q
    if (!q) {
      searchResults.value = []
      searchAlbumResults.value = []
      searchPlaylistResults.value = []
      searchArtistResults.value = []
      searchHasMore.value = false
      searchState.value = 'idle'
      return
    }
    if (append && (neteaseLoading.value || !searchHasMore.value)) return
    if (!append) {
      searchState.value = 'loading'
      searchHasMore.value = false
      if (searchKind.value === 'song') searchResults.value = []
      if (searchKind.value === 'album') searchAlbumResults.value = []
      if (searchKind.value === 'playlist') searchPlaylistResults.value = []
      if (searchKind.value === 'artist') searchArtistResults.value = []
    }
    neteaseLoading.value = true
    if (!append) pushSearchHistory(q)
    try {
      if (searchKind.value === 'album') {
        const offset = append ? searchAlbumResults.value.length : 0
        const page = await searchAlbums(q, 20, offset)
        searchAlbumResults.value = append ? [...searchAlbumResults.value, ...page.albums] : page.albums
        searchHasMore.value = page.hasMore
        searchState.value = searchAlbumResults.value.length ? 'results' : 'empty'
        return
      }
      if (searchKind.value === 'playlist') {
        const offset = append ? searchPlaylistResults.value.length : 0
        const page = await searchPlaylists(q, 20, offset)
        searchPlaylistResults.value = append
          ? [...searchPlaylistResults.value, ...page.playlists]
          : page.playlists
        searchHasMore.value = page.hasMore
        searchState.value = searchPlaylistResults.value.length ? 'results' : 'empty'
        return
      }
      if (searchKind.value === 'artist') {
        const offset = append ? searchArtistResults.value.length : 0
        const page = await searchArtists(q, 20, offset)
        searchArtistResults.value = append ? [...searchArtistResults.value, ...page.artists] : page.artists
        searchHasMore.value = page.hasMore
        searchState.value = searchArtistResults.value.length ? 'results' : 'empty'
        return
      }

      const localHits = append
        ? []
        : tracks.value.filter(
            (t) =>
              t.title.toLowerCase().includes(q.toLowerCase()) ||
              t.artist.toLowerCase().includes(q.toLowerCase()) ||
              t.album.toLowerCase().includes(q.toLowerCase()),
          )
      let remote: PulseTrack[] = []
      const neteaseOffset = append ? searchResults.value.filter((t) => t.neteaseId).length : 0
      try {
        const page = await searchMusic(q, SEARCH_PAGE_SIZE, neteaseOffset)
        remote = page.songs.map(mapSongResult)
        searchHasMore.value = page.hasMore
      } catch {
        if (!append) showToast('网易云搜索失败，仅显示本地结果')
        searchHasMore.value = false
      }
      if (!append) {
        const multiServers: MetingServer[] = ['qq', 'kugou']
        await Promise.all(
          multiServers.map(async (server) => {
            try {
              const songs = await searchMeting(server, q)
              remote = [
                ...remote,
                ...songs.map((s) => ({
                  id: `${server}-${s.id}`,
                  title: s.name,
                  shortTitle: shortOf(s.name),
                  artist: s.artist,
                  album: s.album,
                  source: METING_SERVER_LABEL[server],
                  duration: s.duration > 10_000 ? Math.round(s.duration / 1000) : s.duration,
                  url: '',
                  coverUrl: s.pic || '',
                  favorite: false,
                  remoteServer: server,
                  remoteId: s.id,
                })),
              ]
            } catch {
              /* 单个平台失败忽略 */
            }
          }),
        )
        const merged = [
          ...localHits,
          ...remote.filter((r) => !localHits.some((l) => l.neteaseId && l.neteaseId === r.neteaseId)),
        ]
        searchResults.value = merged
      } else {
        const existing = new Set(searchResults.value.map((t) => t.id))
        searchResults.value = [...searchResults.value, ...remote.filter((t) => !existing.has(t.id))]
      }
      searchState.value = searchResults.value.length ? 'results' : 'empty'
    } catch {
      if (!append) searchState.value = 'error'
    } finally {
      neteaseLoading.value = false
    }
  }

  function loadMoreSearch() {
    void runSearch(searchQuery.value, true)
  }

  function setSearchKind(kind: SearchKind) {
    if (searchKind.value === kind) return
    searchKind.value = kind
    if (searchQuery.value.trim()) void runSearch(searchQuery.value)
  }

  function applySearchKeyword(keyword: string) {
    void runSearch(keyword)
  }

  function trackById(id: string | undefined) {
    if (!id) return undefined
    return tracks.value.find((t) => t.id === id)
  }

  /** 补齐曲目元数据（封面/mvId/artistId）：网易云曲目惰性查详情，其余仅标记无 MV */
  async function ensureTrackMeta(track: PulseTrack) {
    if (!track.neteaseId) {
      if (track.mvId === undefined && !track.localMvPath && !track.localMvUrl) {
        const idx = tracks.value.findIndex((t) => t.id === track.id)
        if (idx >= 0) tracks.value[idx] = { ...tracks.value[idx]!, mvId: '' }
      }
      return
    }
    if (track.coverUrl && track.mvId !== undefined && track.artistId) return
    try {
      const details = await getSongDetails([track.neteaseId])
      const detail = details.get(String(track.neteaseId))
      if (!detail) return
      const patch = {
        coverUrl: track.coverUrl || detail.coverUrl,
        mvId: detail.mvId ?? '',
        artistId: detail.artistId || track.artistId,
      }
      const idx = tracks.value.findIndex((t) => t.id === track.id)
      if (idx >= 0) {
        tracks.value[idx] = { ...tracks.value[idx]!, ...patch }
        persistMeta()
      }
      const sIdx = searchResults.value.findIndex((t) => t.id === track.id)
      if (sIdx >= 0) {
        searchResults.value[sIdx] = { ...searchResults.value[sIdx]!, ...patch }
      }
    } catch {
      /* ignore */
    }
  }

  /** @deprecated use ensureTrackMeta */
  async function ensureCover(track: PulseTrack) {
    await ensureTrackMeta(track)
  }

  /** 为本地已缓存但缺封面的网易云曲目批量补封面 */
  async function backfillMissingCovers() {
    const missing = tracks.value.filter((t) => t.neteaseId && !t.coverUrl)
    if (!missing.length) return
    try {
      const details = await getSongDetails(missing.map((t) => t.neteaseId!))
      let changed = false
      tracks.value = tracks.value.map((t) => {
        if (t.coverUrl || !t.neteaseId) return t
        const cover = details.get(String(t.neteaseId))?.coverUrl
        if (!cover) return t
        changed = true
        return { ...t, coverUrl: cover }
      })
      if (changed) persistMeta()
    } catch {
      /* ignore */
    }
  }

  /**
   * 确保曲目当前可播：本地文件恢复句柄/授权；网易云按音质取 URL；多平台走 Meting 取 URL。
   * 返回 false 时已向用户 toast 失败原因。
   */
  async function ensurePlayable(track: PulseTrack): Promise<boolean> {
    if (isLocalTrack(track) || track.localNeedsPermission) {
      if (track.url && !track.localNeedsPermission) return true
      const restored = await restoreLocalPlayback(track)
      // 回写调用方持有的对象：playTrack / recoverExpiredUrl 捕获的 track 引用必须拿到重建后的 URL，
      // 否则 audio.src 会被赋成空串（切走再切回的本地曲会因此无法再播）
      track.url = restored.url
      track.localNeedsPermission = restored.needsPermission
      if (restored.file) track.file = restored.file
      const idx = tracks.value.findIndex((t) => t.id === track.id)
      if (idx >= 0) {
        tracks.value[idx] = {
          ...tracks.value[idx]!,
          url: restored.url,
          file: restored.file ?? tracks.value[idx]!.file,
          localNeedsPermission: restored.needsPermission,
        }
      }
      if (restored.url) return true
      showToast('本地文件需要重新授权或导入')
      return false
    }
    if (track.url) return true
    if (track.neteaseId) {
      try {
        track.url = await getSongUrl(track.neteaseId, audioQuality.value)
        return !!track.url
      } catch {
        showToast('获取播放链接失败，请确认网易云服务可用')
        return false
      }
    }
    if (track.remoteServer && track.remoteId) {
      try {
        track.url = await getMetingUrl(track.remoteServer as MetingServer, track.remoteId)
        if (!track.url) showToast('该平台未返回播放地址，可尝试其他来源')
        return !!track.url
      } catch {
        showToast(`获取播放链接失败（${track.source}）`)
        return false
      }
    }
    showToast('该曲目无法播放，请搜索网易云/QQ音乐/酷狗或导入本地文件')
    return false
  }

  /**
   * 加载歌词（含翻译）：优先本地 LRC 文本，其次按来源请求网易云 / Meting，
   * 本地曲无词时尝试在线匹配。lyricLookupIds 防止同一曲目并发重复查询。
   */
  async function loadLyricsFor(track: PulseTrack) {
    const hasOrig = !!(track.lyrics?.length)
    const hasTrans = !!(track.lyricsTranslated?.length)
    if (hasOrig && hasTrans) return
    if (lyricLookupIds.has(track.id)) return

    const applyParsed = (origText?: string, transText?: string, original?: LyricLine[], translation?: LyricLine[]) => {
      const idx = tracks.value.findIndex((t) => t.id === track.id)
      if (idx < 0) return
      const next = { ...tracks.value[idx]! }
      if (origText) next.lrcText = origText
      if (transText) next.lrcTransText = transText
      if (original?.length) next.lyrics = original
      else if (origText && !next.lyrics?.length) next.lyrics = parseLrcOrPlain(origText, next.duration)
      if (translation?.length) next.lyricsTranslated = translation
      else if (transText && !next.lyricsTranslated?.length) next.lyricsTranslated = parseLrcOrPlain(transText, next.duration)
      tracks.value[idx] = next
      if (isLocalTrack(next)) void persistLocalTrackMeta(next)
    }

    if (!hasOrig && track.lrcText) {
      const parsed = parseLrcOrPlain(track.lrcText, track.duration)
      const trans = track.lrcTransText ? parseLrcOrPlain(track.lrcTransText, track.duration) : track.lyricsTranslated
      applyParsed(track.lrcText, track.lrcTransText, parsed, trans)
      if (!parsed.length) showToast('歌词文件没有可识别的时间轴')
      if (parsed.length && (trans?.length || !track.neteaseId)) return
    } else if (hasOrig && !hasTrans && track.lrcTransText) {
      applyParsed(track.lrcText, track.lrcTransText, track.lyrics, parseLrcOrPlain(track.lrcTransText, track.duration))
      return
    }

    if (hasOrig && hasTrans) return

    lyricLookupIds.add(track.id)
    lyricLoading.value = true
    try {
      let original: LyricLine[] = track.lyrics || []
      if (track.neteaseId) {
        const bundle = await getLyricBundle(track.neteaseId)
        original = bundle.original.length ? bundle.original : original
        if (currentId.value !== track.id) return
        applyParsed(
          bundle.lrcText || track.lrcText,
          bundle.transLrcText || track.lrcTransText,
          original,
          bundle.translation,
        )
      } else if (track.remoteServer && track.remoteId) {
        original = await getMetingLyric(track.remoteServer as MetingServer, track.remoteId)
        if (currentId.value !== track.id) return
        applyParsed(undefined, undefined, original, [])
      } else if (isLocalTrack(track) && !original.length) {
        const found = await lookupOnlineLyrics(track.title, track.artist, track.duration)
        if (currentId.value !== track.id) return
        if (!found) return
        original = found.original
        applyParsed(found.lrcText, found.transLrcText, found.original, found.translation)
      } else {
        return
      }
      if (!original.length && (track.neteaseId || (track.remoteServer && track.remoteId))) {
        showToast('暂无歌词')
      }
    } catch {
      /* keep empty */
    } finally {
      lyricLookupIds.delete(track.id)
      lyricLoading.value = false
    }
  }

  /**
   * 切歌后释放上一首本地曲目的 blob: 音频 URL（防内存泄漏）。
   * 只清音频播放地址并置空字段，下次播放由 restoreLocalPlayback 重建（句柄/File/IDB Blob 均可再生）；
   * 封面与本地 MV 的 blob URL 不动（展示/无重建途径），删除曲目时才由 revokeTrackUrls 全量回收。
   */
  function releaseLocalAudioUrl(prevId: string, nextId: string) {
    if (!prevId || prevId === nextId) return
    const idx = tracks.value.findIndex((t) => t.id === prevId)
    if (idx < 0) return
    const prev = tracks.value[idx]!
    if (!prev.url?.startsWith('blob:')) return
    try {
      URL.revokeObjectURL(prev.url)
    } catch {
      /* ignore */
    }
    tracks.value[idx] = { ...prev, url: '' }
  }

  /** 核心播放：确保可播 → 换 audio.src → 记历史/拉歌词与元数据/MV → 媒体会话与通知 → 起播 */
  async function playTrack(id: string, autoplay = true) {
    const track = tracks.value.find((t) => t.id === id)
    if (!track) return
    const prevId = currentId.value
    currentId.value = id
    ensureInQueue(id)
    const ok = await ensurePlayable(track)
    if (!ok) {
      isPlaying.value = false
      syncRootClasses()
      return
    }
    audio.src = track.url
    audio.load()
    releaseLocalAudioUrl(prevId, id)
    historyIds.value = [id, ...historyIds.value.filter((x) => x !== id)].slice(0, 60)
    void loadLyricsFor(track)
    void ensureTrackMeta(track).then(() => {
      exitMvOriginalAudio()
      mvOverrideId.value = ''
      if (mvMode.value !== 'off') {
        void loadMvForCurrent(true)
        void loadRelatedMvs()
      } else if (mvEnabled.value && view.value === 'stage') {
        void maybeAutoPip()
      }
    })
    persistMeta()
    updateMediaSession()
    // 听歌统计：选择即记一次（时长在 ended/timeupdate 汇总）
    recordPlay(track)
    // 页面后台化时通知切歌
    notify(
      track.title || '正在播放',
      `${track.artist || '未知歌手'} · ${viewMeta.value.title}`,
    )
    if (autoplay) {
      try {
        await resumeAudioContext()
        await audio.play()
      } catch {
        showToast('播放被浏览器拦截，请再点一次播放')
      }
    }
  }

  async function togglePlay() {
    const track = currentTrack.value
    if (!track) {
      showToast('曲库为空，请先搜索或导入')
      switchView('search')
      return
    }
    if (mvOriginalAudio.value) {
      isPlaying.value = !isPlaying.value
      syncRootClasses()
      return
    }
    if (!audio.src || currentId.value !== track.id || !track.url) {
      await playTrack(track.id, true)
      return
    }
    if (audio.paused) {
      try {
        await resumeAudioContext()
        await audio.play()
      } catch {
        showToast('播放失败')
      }
    } else {
      audio.pause()
    }
  }

  function nextTrack() {
    const list = queueTracks.value.length ? queueTracks.value : tracks.value
    if (!list.length) return
    const idx = list.findIndex((t) => t.id === currentId.value)
    if (shuffle.value) {
      let next = idx
      while (next === idx && list.length > 1) next = Math.floor(Math.random() * list.length)
      void playTrack(list[next]!.id)
      return
    }
    const next = (Math.max(0, idx) + 1) % list.length
    void playTrack(list[next]!.id)
  }

  function prevTrack() {
    const list = queueTracks.value.length ? queueTracks.value : tracks.value
    if (!list.length) return
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      currentTime.value = 0
      return
    }
    const idx = list.findIndex((t) => t.id === currentId.value)
    let prev = idx - 1
    if (prev < 0) prev = list.length - 1
    void playTrack(list[prev]!.id)
  }

  function seekTo(pct: number) {
    const d = duration.value || currentTrack.value?.duration || 0
    if (!d) return
    const t = Math.max(0, Math.min(1, pct)) * d
    currentTime.value = t
    if (mvOriginalAudio.value) {
      mvSeekRequest.value = t
      return
    }
    if (!audio.src) return
    audio.currentTime = t
  }

  function seekLyric(index: number) {
    const line = lyricLines.value[index]
    if (!line) return
    currentTime.value = line.time
    if (mvOriginalAudio.value) {
      mvSeekRequest.value = line.time
      return
    }
    if (!audio.src) return
    audio.currentTime = line.time
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v))
    audio.volume = muted.value ? 0 : volume.value
    persistPrefs()
  }

  function toggleMute() {
    muted.value = !muted.value
    audio.volume = muted.value ? 0 : volume.value
    persistPrefs()
  }

  function toggleShuffle() {
    shuffle.value = !shuffle.value
    persistPrefs()
    showToast(shuffle.value ? '随机播放已开' : '随机播放已关')
  }

  function cycleRepeat() {
    repeat.value = (repeat.value + 1) % 3
    persistPrefs()
    showToast(['循环关闭', '列表循环', '单曲循环'][repeat.value]!)
  }

  function cyclePlayMode() {
    const mode = playMode.value
    if (mode === 'order') {
      shuffle.value = false
      repeat.value = 1
    } else if (mode === 'list-loop') {
      shuffle.value = false
      repeat.value = 2
    } else if (mode === 'single-loop') {
      shuffle.value = true
      repeat.value = 0
    } else {
      shuffle.value = false
      repeat.value = 0
    }
    persistPrefs()
    showToast(
      playMode.value === 'shuffle'
        ? '随机播放'
        : playMode.value === 'single-loop'
          ? '单曲循环'
          : playMode.value === 'list-loop'
            ? '列表循环'
            : '顺序播放',
    )
  }

  function setAudioQuality(level: AudioQuality) {
    audioQuality.value = level
    persistPrefs()
    const track = currentTrack.value
    if (track?.neteaseId) {
      track.url = ''
      void playTrack(track.id, isPlaying.value)
    }
    showToast(`音质：${level === 'lossless' ? '无损' : level === 'exhigh' ? '极高' : '标准'}`)
  }

  function toggleFavorite(id?: string) {    const track = tracks.value.find((t) => t.id === (id || currentId.value))
    if (!track) return
    track.favorite = !track.favorite
    persistMeta()
    if (isLocalTrack(track)) void persistLocalTrackMeta(track)
    showToast(track.favorite ? `已收藏：${track.shortTitle}` : `已取消收藏：${track.shortTitle}`)
  }

  function openDrawer(tab: 'queue' | 'lyrics' = 'queue', pin = false) {
    drawerTab.value = tab
    drawerOpen.value = true
    drawerPinned.value = pin
    syncRootClasses()
  }

  /** 打开歌曲详情抽屉；网易云曲目会顺带加载相似歌曲 */
  async function openSongDetail(track: PulseTrack) {
    songDetail.value = track
    simiSongs.value = []
    if (!track.neteaseId) return
    simiLoading.value = true
    try {
      simiSongs.value = await getSimiSongs(track.neteaseId, 12)
    } catch {
      simiSongs.value = []
    } finally {
      simiLoading.value = false
    }
  }

  function closeSongDetail() {
    songDetail.value = null
    simiSongs.value = []
  }

  async function playSimiSong(song: Song) {
    const track = songToPulseTrack(song)
    const stored = ingestTrack(track)
    queueIds.value = [...queueIds.value.filter((x) => x !== stored.id), stored.id]
    await playTrack(stored.id)
  }

  function toggleDrawerPin() {
    if (!drawerOpen.value) {
      openDrawer(drawerTab.value, true)
      return
    }
    drawerPinned.value = !drawerPinned.value
    syncRootClasses()
  }

  function peekDrawer(tab: 'queue' | 'lyrics' = 'queue') {
    if (drawerOpen.value && drawerPinned.value) {
      drawerTab.value = tab
      return
    }
    openDrawer(tab, false)
  }

  function closeDrawer() {
    drawerOpen.value = false
    drawerPinned.value = false
    syncRootClasses()
  }

  function clearMvPlayback() {
    mvLoadToken += 1
    mvLoadedKey = ''
    mvUrl.value = ''
    mvReady.value = false
    mvLoading.value = false
  }

  function effectiveMvId() {
    return mvOverrideId.value || currentTrack.value?.mvId || ''
  }

  function currentMvKey() {
    const track = currentTrack.value
    if (!track) return ''
    if (mvOverrideId.value) return `override:${mvOverrideId.value}`
    if (track.localMvUrl) return `local-url:${track.id}:${track.localMvUrl}`
    if (track.localMvPath) return `local-path:${track.id}:${track.localMvPath}`
    if (track.mvId) return `id:${track.mvId}`
    return ''
  }

  async function loadMvForCurrent(force = false) {
    const track = currentTrack.value
    const key = currentMvKey()
    const localUrl = !mvOverrideId.value
      ? track?.localMvUrl || ''
      : ''
    let localPathUrl = ''
    if (!mvOverrideId.value && track?.localMvPath && isTauriRuntime()) {
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/core')
        localPathUrl = convertFileSrc(track.localMvPath)
      } catch {
        localPathUrl = ''
      }
    }
    const localMv = localUrl || localPathUrl
    if (localMv) {
      if (!force && key && key === mvLoadedKey && mvUrl.value === localMv && mvReady.value && mvActive.value) return
      const token = ++mvLoadToken
      mvLoading.value = true
      mvReady.value = false
      mvUrl.value = localMv
      mvLoadedKey = key
      if (token === mvLoadToken) mvLoading.value = false
      return
    }

    const mvId = effectiveMvId()
    if (!mvId) {
      if (mvMode.value !== 'off') closeMv()
      else clearMvPlayback()
      return
    }
    if (!force && key && key === mvLoadedKey && mvUrl.value && mvReady.value && mvActive.value) {
      return
    }
    const token = ++mvLoadToken
    mvLoading.value = true
    try {
      let url = ''
      let quality = mvQuality.value
      const ladder: MvQuality[] =
        quality === 1080 ? [1080, 720, 480] : quality === 720 ? [720, 480] : [480]
      let lastErr: unknown
      for (const q of ladder) {
        try {
          url = await getMvUrl(mvId, q)
          quality = q
          break
        } catch (err) {
          lastErr = err
        }
      }
      if (!url) throw lastErr || new Error('无法获取 MV 播放地址')
      if (token !== mvLoadToken) return
      mvReady.value = false
      mvLoadedKey = key
      if (mvUrl.value !== url) mvUrl.value = url
      else {
        mvUrl.value = ''
        await Promise.resolve()
        if (token !== mvLoadToken) return
        mvUrl.value = url
      }
      if (quality !== mvQuality.value) {
        showToast(`已降到 ${quality}p`)
      }
    } catch {
      if (token !== mvLoadToken) return
      clearMvPlayback()
      showToast('MV 暂不可播')
      mvMode.value = 'off'
      exitMvOriginalAudio()
    } finally {
      if (token === mvLoadToken) mvLoading.value = false
    }
  }

  function markMvReady(ready = true) {
    mvReady.value = ready
  }

  async function loadRelatedMvs() {
    const track = currentTrack.value
    const mvId = effectiveMvId() || track?.mvId
    const token = ++relatedLoadToken
    relatedMvs.value = []
    if (!showRelatedMvs.value) {
      relatedMvLoading.value = false
      return
    }
    relatedMvLoading.value = true
    try {
      let list: MvSummary[] = []
      if (mvId) {
        list = await fetchSimilarMvs(mvId)
      }
      if (!list.length && track?.artistId) {
        list = await fetchArtistMvs(track.artistId)
      }
      if (token !== relatedLoadToken) return
      relatedMvs.value = list.filter((m) => m.id !== mvId).slice(0, 12)
    } catch {
      if (token === relatedLoadToken) relatedMvs.value = []
    } finally {
      if (token === relatedLoadToken) relatedMvLoading.value = false
    }
  }

  function setShowRelatedMvs(on: boolean) {
    showRelatedMvs.value = on
    persistPrefs()
    if (on && mvMode.value !== 'off') void loadRelatedMvs()
    else relatedMvs.value = []
  }

  async function selectRelatedMv(item: MvSummary) {
    if (!item?.id) return
    mvOverrideId.value = item.id
    mvReady.value = false
    await loadMvForCurrent(true)
    void loadRelatedMvs()
    try {
      const detail = await getMvDetail(item.id)
      const songDur = currentTrack.value?.duration || 0
      if (songDur > 0 && detail.duration > 0 && Math.abs(detail.duration - songDur) > 45) {
        showToast('相关 MV 时长与歌曲差异较大，画面将尽量跟音频进度')
      }
    } catch {
      /* ignore */
    }
  }

  function exitMvOriginalAudio() {
    if (!mvOriginalAudio.value) return
    mvOriginalAudio.value = false
    mvSeekRequest.value = null
  }

  async function setMvOriginalAudio(on: boolean) {
    if (on) {
      if (mvMode.value === 'off' || !mvUrl.value) {
        showToast('请先开启 MV')
        return
      }
      mvOriginalAudio.value = true
      audio.pause()
      isPlaying.value = true
      syncRootClasses()
      showToast('已切到 MV 原声（频谱暂停）')
      return
    }
    exitMvOriginalAudio()
    const track = currentTrack.value
    if (track?.url && audio.src) {
      try {
        audio.currentTime = currentTime.value
        await resumeAudioContext()
        await audio.play()
      } catch {
        isPlaying.value = false
      }
    }
    showToast('已回到音频主控')
  }

  function toggleMvOriginalAudio() {
    void setMvOriginalAudio(!mvOriginalAudio.value)
  }

  function reportMvVideoTime(t: number, d: number) {
    if (!mvOriginalAudio.value) return
    currentTime.value = t
    if (d > 0) duration.value = d
  }

  function consumeMvSeekRequest() {
    const t = mvSeekRequest.value
    mvSeekRequest.value = null
    return t
  }

  function getAudioClock() {
    if (mvOriginalAudio.value) return currentTime.value
    const t = audio.currentTime
    return Number.isFinite(t) ? t : currentTime.value
  }

  async function maybeAutoPip() {
    if (!mvEnabled.value || view.value !== 'stage' || theaterOpen.value) return
    const track = currentTrack.value
    if (!track) return
    await ensureTrackMeta(track)
    const latest = tracks.value.find((t) => t.id === track.id) || track
    if (!latest.mvId && !latest.localMvPath && !latest.localMvUrl) return
    if (mvMode.value === 'off') {
      mvMode.value = 'pip'
      void loadMvForCurrent()
      void loadRelatedMvs()
    }
  }

  function setMvMode(mode: MvMode) {
    if (mode === 'off') {
      mvMode.value = 'off'
      clearMvPlayback()
      exitMvOriginalAudio()
      relatedMvs.value = []
      return
    }
    mvMode.value = mode
    if (mode === 'theater') theaterOpen.value = true
    void loadMvForCurrent()
    void loadRelatedMvs()
  }

  function setMvQuality(q: MvQuality) {
    mvQuality.value = q
    persistPrefs()
    if (mvMode.value !== 'off') void loadMvForCurrent(true)
  }

  function openTheater(opts?: { withMv?: boolean }) {
    theaterOpen.value = true
    const hasId = !!(effectiveMvId() || currentTrack.value?.mvId || currentTrack.value?.localMvPath || currentTrack.value?.localMvUrl)
    if ((opts?.withMv || mvMode.value === 'pip' || mvMode.value === 'stage') && hasId) {
      mvMode.value = 'theater'
      void loadMvForCurrent()
      void loadRelatedMvs()
    } else if (mvMode.value === 'theater' && !opts?.withMv) {
      closeMv()
    }
    syncRootClasses()
  }

  async function openMvPip() {
    const track = currentTrack.value
    if (!track) {
      showToast('请先播放曲目')
      return
    }
    await ensureTrackMeta(track)
    const latest = tracks.value.find((t) => t.id === track.id) || track
    if (!latest.mvId && !latest.localMvPath && !latest.localMvUrl) {
      showToast('当前曲目暂无官方 MV')
      return
    }
    mvEnabled.value = true
    persistPrefs()
    mvOverrideId.value = ''
    mvMode.value = 'pip'
    void loadMvForCurrent()
    void loadRelatedMvs()
  }

  async function openMvTheater() {
    const track = currentTrack.value
    if (!track) {
      showToast('请先播放曲目')
      return
    }
    await ensureTrackMeta(track)
    const latest = tracks.value.find((t) => t.id === track.id) || track
    if (!latest.mvId && !mvOverrideId.value && !latest.localMvPath && !latest.localMvUrl) {
      showToast('当前曲目暂无官方 MV')
      return
    }
    mvEnabled.value = true
    persistPrefs()
    openTheater({ withMv: true })
  }

  function dockMvToStage() {
    if (mvMode.value === 'off') return
    theaterOpen.value = false
    mvMode.value = 'stage'
    pipPos.value = null
    syncRootClasses()
  }

  function undockMvToPip() {
    if (mvMode.value !== 'stage') return
    mvMode.value = 'pip'
    syncRootClasses()
  }

  function undockStageMvIfNeeded() {
    if (mvMode.value === 'stage') undockMvToPip()
  }

  function expandPipToTheater() {
    if (mvMode.value === 'pip' || mvMode.value === 'stage') {
      theaterOpen.value = true
      mvMode.value = 'theater'
      syncRootClasses()
      return
    }
    void openMvTheater()
  }

  function toggleTheaterMv() {
    if (!theaterOpen.value) {
      void openMvTheater()
      return
    }
    if (mvMode.value === 'theater') {
      mvMode.value = 'off'
      clearMvPlayback()
      exitMvOriginalAudio()
      return
    }
    void openMvTheater()
  }

  function closeMv() {
    mvMode.value = 'off'
    clearMvPlayback()
    exitMvOriginalAudio()
    relatedMvs.value = []
    pipPos.value = null
  }

  /** 全屏收起为舞台画中画（保留 MV） */
  function collapseTheater() {
    theaterOpen.value = false
    if (mvMode.value === 'theater') {
      const hasId = !!(effectiveMvId() || currentTrack.value?.mvId || currentTrack.value?.localMvPath || currentTrack.value?.localMvUrl)
      if (hasId) {
        mvMode.value = 'pip'
      } else {
        closeMv()
      }
    }
    syncRootClasses()
  }

  /** 关闭全屏并退出 MV */
  function dismissTheater() {
    theaterOpen.value = false
    if (mvMode.value === 'theater' || mvMode.value === 'pip' || mvMode.value === 'stage') {
      closeMv()
    }
    syncRootClasses()
  }

  function closeTheater() {
    collapseTheater()
  }

  function setPipPos(left: number, top: number) {
    pipPos.value = { left, top }
  }

  function resetPipPos() {
    pipPos.value = null
  }

  function toggleMini() {
    miniMode.value = !miniMode.value
    syncRootClasses()
  }

  function toggleImmersive() {
    immersive.value = !immersive.value
    syncRootClasses()
  }

  /** 页面后台化时给出系统通知（需用户授权过） */
  function notify(title: string, body?: string) {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      if (!document.hidden) return
      new Notification(title, { body, silent: true })
    } catch {
      /* ignore */
    }
  }

  function setStageVariant(v: 'arena' | 'star-river' | 'focus') {
    stageVariant.value = v
    persistPrefs()
    syncRootClasses()
  }

  function setRoomMode(mode: PulseRoomMode) {
    roomMode.value = mode
    persistPrefs()
    syncRootClasses()
  }

  function setRoomBg(next: PulseRoomBg) {
    if (next === 'anime' && !hasBackgroundImages) {
      showToast('还没有可轮播的背景图')
      return
    }
    roomBg.value = next
    persistPrefs()
    syncRootClasses()
  }

  function setRoomBlur(next: number) {
    roomBlur.value = clampRoomBlur(next)
    persistPrefs()
  }

  function setRoomVeil(next: number) {
    roomVeil.value = clampRoomVeil(next)
    persistPrefs()
  }

  function setAccentPreset(next: PulseAccentPreset) {
    accentPreset.value = next
    if (next !== 'custom') {
      accentHex.value = ACCENT_PRESETS[next][roomMode.value]
    }
    persistPrefs()
  }

  function setAccentHex(next: string) {
    accentHex.value = normalizeHex(next) || ACCENT_PRESETS.iris.night
    accentPreset.value = 'custom'
    persistPrefs()
  }

  function setLyricsTranslation(on: boolean) {
    showLyricTranslation.value = on
    persistPrefs()
  }

  function toggleLyricTranslation() {
    if (!canShowLyricTranslation.value) {
      showToast('当前曲目无需翻译')
      return
    }
    setLyricsTranslation(!showLyricTranslation.value)
  }

  function setLyricSize(size: LyricSize) {
    lyricSize.value = size
    persistPrefs()
    syncRootClasses()
  }

  function setTheaterView(v: TheaterView) {
    theaterView.value = v
    persistPrefs()
    syncRootClasses()
  }

  function saveQueueToast() {
    persistMeta()
    showToast(`已保存队列（${queueTracks.value.length} 首）`)
  }

  function clearQueue() {
    if (currentId.value) queueIds.value = [currentId.value]
    else queueIds.value = []
    persistMeta()
    showToast('已清空队列（保留当前曲）')
  }

  async function playSearchResult(track: PulseTrack) {
    const existing = tracks.value.find(
      (t) => t.id === track.id || (track.neteaseId && t.neteaseId === track.neteaseId),
    )
    if (existing) {
      await playTrack(existing.id)
      switchView('stage')
      return
    }
    tracks.value.push(track)
    ensureInQueue(track.id)
    persistMeta()
    await playTrack(track.id)
    switchView('stage')
  }

  function ingestTrack(track: PulseTrack): PulseTrack {
    const existing = tracks.value.find(
      (t) => t.id === track.id || (track.neteaseId && t.neteaseId === track.neteaseId),
    )
    if (existing) return existing
    tracks.value.push(track)
    persistMeta()
    return track
  }

  function addToQueue(track: PulseTrack, opts?: { next?: boolean }) {
    const stored = ingestTrack(track)
    const id = stored.id
    queueIds.value = queueIds.value.filter((x) => x !== id)
    if (opts?.next) {
      const idx = queueIds.value.indexOf(currentId.value)
      if (idx >= 0) {
        queueIds.value.splice(idx + 1, 0, id)
      } else {
        queueIds.value = [id, ...queueIds.value]
      }
    } else {
      queueIds.value = [...queueIds.value, id]
    }
    persistMeta()
    showToast(opts?.next ? `下一首播放：${stored.shortTitle}` : `已加入队列：${stored.shortTitle}`)
    return stored
  }

  function removeFromQueue(id: string) {
    const wasCurrent = id === currentId.value
    queueIds.value = queueIds.value.filter((x) => x !== id)
    persistMeta()
    if (wasCurrent) {
      const next = queueIds.value[0]
      if (next) void playTrack(next, isPlaying.value)
      else {
        isPlaying.value = false
        audio.pause()
        currentId.value = ''
        syncRootClasses()
      }
    }
    showToast('已移出队列')
  }

  function playAtQueueIndex(index: number) {
    const track = queueTracks.value[index]
    if (track) void playTrack(track.id)
  }

  function reorderQueue(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const next = [...queueIds.value]
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length) return
    const [item] = next.splice(fromIndex, 1)
    if (!item) return
    next.splice(toIndex, 0, item)
    queueIds.value = next
    persistMeta()
  }

  function openLibraryGroup(kind: 'album' | 'artist', name: string) {
    libraryFocus.value = { kind, name }
    libraryTab.value = kind === 'album' ? 'albums' : 'artists'
    switchView('library')
  }

  function closeLibraryGroup() {
    libraryFocus.value = null
  }

  function createUserPlaylist(name: string) {
    const trimmed = name.trim() || `歌单 ${userPlaylists.value.length + 1}`
    const pl: UserPlaylist = {
      id: `pl-${Date.now().toString(36)}`,
      name: trimmed,
      trackIds: [],
    }
    userPlaylists.value = [...userPlaylists.value, pl]
    persistMeta()
    playlistKey.value = `user:${pl.id}`
    showToast(`已创建「${trimmed}」`)
    return pl
  }

  function renameUserPlaylist(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    userPlaylists.value = userPlaylists.value.map((p) => (p.id === id ? { ...p, name: trimmed } : p))
    persistMeta()
  }

  function deleteUserPlaylist(id: string) {
    userPlaylists.value = userPlaylists.value.filter((p) => p.id !== id)
    if (playlistKey.value === `user:${id}`) playlistKey.value = 'queue'
    persistMeta()
    showToast('已删除歌单')
  }

  function addTrackToUserPlaylist(playlistId: string, track: PulseTrack) {
    const stored = ingestTrack(track)
    userPlaylists.value = userPlaylists.value.map((p) => {
      if (p.id !== playlistId) return p
      if (p.trackIds.includes(stored.id)) return p
      return { ...p, trackIds: [...p.trackIds, stored.id] }
    })
    persistMeta()
    showToast('已加入歌单')
  }

  function removeTrackFromUserPlaylist(playlistId: string, trackId: string) {
    userPlaylists.value = userPlaylists.value.map((p) =>
      p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) } : p,
    )
    persistMeta()
  }

  /** 歌单内曲目拖拽排序 */
  function reorderUserPlaylist(id: string, fromIndex: number, toIndex: number) {
    const pl = userPlaylists.value.find((p) => p.id === id)
    if (!pl || !pl.trackIds.length) return
    const len = pl.trackIds.length
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= len || toIndex >= len) return
    const next = [...pl.trackIds]
    const [moved] = next.splice(fromIndex, 1)
    if (moved === undefined) return
    next.splice(toIndex, 0, moved)
    userPlaylists.value = userPlaylists.value.map((p) => (p.id === id ? { ...p, trackIds: next } : p))
    persistMeta()
  }

  /** 歌单批量移出曲目 */
  function batchRemoveFromUserPlaylist(playlistId: string, trackIds: string[]) {
    if (!trackIds.length) return
    const set = new Set(trackIds)
    userPlaylists.value = userPlaylists.value.map((p) =>
      p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((tid) => !set.has(tid)) } : p,
    )
    persistMeta()
    showToast(`已从歌单移除 ${trackIds.length} 首`)
  }

  async function loadAccountPlaylists(uid: string) {
    if (!uid) return
    try {
      const [lists, liked] = await Promise.all([
        getUserPlaylists(uid),
        getLikedSongs(uid).catch(() => [] as Song[]),
      ])
      neteaseAccountPlaylists.value = lists
      likedTrackIds.value = liked.map((s) => s.id)
      if (liked.length) upsertNeteaseTracks(liked)
    } catch {
      showToast('账号歌单加载失败')
    }
  }

  function clearAccountPlaylists() {
    neteaseAccountPlaylists.value = []
    neteasePlaylistSongs.value = []
    likedTrackIds.value = []
    if (playlistKey.value.startsWith('net:')) playlistKey.value = 'queue'
  }

  async function openNeteaseAccountPlaylist(id: string) {
    playlistKey.value = `net:${id}`
    switchView('playlists')
    neteasePlaylistLoading.value = true
    neteasePlaylistSongs.value = []
    try {
      const detail = await getPlaylistDetail(id)
      neteasePlaylistSongs.value = upsertNeteaseTracks(detail.songs)
    } catch {
      showToast('歌单详情加载失败')
    } finally {
      neteasePlaylistLoading.value = false
    }
  }

  async function playLikedSongs() {
    if (!likedTrackIds.value.length) {
      showToast('还没有红心歌曲')
      return
    }
    const liked = tracks.value.filter((t) => t.neteaseId && likedTrackIds.value.includes(t.neteaseId))
    if (!liked.length) {
      showToast('红心曲目尚未同步')
      return
    }
    queueIds.value = liked.map((t) => t.id)
    await playTrack(liked[0]!.id)
    switchView('stage')
  }

  /**
   * 将网易云歌曲合并进曲库；可选替换队列（专辑「播放全部」）
   */
  function upsertNeteaseTracks(
    songs: Song[],
    opts?: { replaceQueue?: boolean; enqueue?: boolean },
  ): PulseTrack[] {
    const mapped = songs.map((s) => songToPulseTrack(s))
    const resolved: PulseTrack[] = []

    for (const incoming of mapped) {
      const idx = tracks.value.findIndex(
        (t) => t.id === incoming.id || (incoming.neteaseId && t.neteaseId === incoming.neteaseId),
      )
      if (idx >= 0) {
        const prev = tracks.value[idx]!
        tracks.value[idx] = {
          ...prev,
          title: incoming.title,
          shortTitle: incoming.shortTitle,
          artist: incoming.artist,
          album: incoming.album,
          duration: incoming.duration || prev.duration,
          coverUrl: incoming.coverUrl || prev.coverUrl,
          neteaseId: incoming.neteaseId || prev.neteaseId,
          source: prev.source || '网易云',
        }
        resolved.push(tracks.value[idx]!)
      } else {
        tracks.value.push(incoming)
        resolved.push(incoming)
      }
    }

    if (opts?.replaceQueue) {
      queueIds.value = resolved.map((t) => t.id)
    } else if (opts?.enqueue !== false) {
      for (const t of resolved) ensureInQueue(t.id)
    }
    persistMeta()
    return resolved
  }

  async function ingestLocalImports(
    imported: LocalImportResult[],
    opts?: { toast?: string; openLibrary?: boolean; metadataOnly?: boolean },
  ) {
    if (!imported.length) {
      showToast('未识别到音频文件')
      return
    }
    const persistJobs: Array<{ id: string; wanted: LocalPersistKind; job: Promise<LocalPersistOutcome> }> = []
    for (const item of imported) {
      const track: PulseTrack = {
        id: item.id,
        title: item.title,
        shortTitle: item.shortTitle,
        artist: item.artist,
        album: item.album,
        source: '本地',
        duration: item.duration,
        url: item.url,
        coverUrl: item.coverUrl,
        file: item.file,
        localPath: item.localPath,
        lrcText: item.lrcText,
        lrcTransText: item.lrcTransText,
        persistKind: item.persistKind,
        favorite: false,
        lyrics: item.lrcText ? parseLrcOrPlain(item.lrcText, item.duration) : undefined,
        lyricsTranslated: item.lrcTransText ? parseLrcOrPlain(item.lrcTransText, item.duration) : undefined,
        neteaseId: item.neteaseId,
        mvId: item.mvId,
        artistId: item.artistId,
        remoteServer: item.remoteServer,
        remoteId: item.remoteId,
        localMvPath: item.localMvPath,
        localMvUrl: item.localMvUrl,
      }
      const existingIdx = tracks.value.findIndex(
        (t) =>
          t.id === item.id ||
          (item.localPath && t.localPath === item.localPath) ||
          (item.neteaseId && isLocalTrack(t) && t.neteaseId === item.neteaseId),
      )
      if (existingIdx >= 0) {
        const prev = tracks.value[existingIdx]!
        tracks.value[existingIdx] = {
          ...prev,
          ...track,
          id: prev.id,
          favorite: prev.favorite,
        }
        ensureInQueue(prev.id)
        const id = prev.id
        persistJobs.push({
          id,
          wanted: item.persistKind,
          job: persistImportedLocal({ ...item, id }, prev.favorite, { metadataOnly: opts?.metadataOnly }),
        })
      } else {
        tracks.value.push(track)
        ensureInQueue(track.id)
        persistJobs.push({
          id: track.id,
          wanted: item.persistKind,
          job: persistImportedLocal(item, false, { metadataOnly: opts?.metadataOnly }),
        })
      }
    }
    // 入库为异步：完成后按实际持久化通道校正徽标；按降级原因区分提示（IndexedDB 不可用 ≠ 文件超限）
    void Promise.all(persistJobs.map(({ id, wanted, job }) => job.then((out) => ({ id, wanted, ...out }))))
      .then((results) => {
        let unavailable = 0
        let oversized = 0
        for (const { id, wanted, kind, reason } of results) {
          const idx = tracks.value.findIndex((t) => t.id === id)
          if (idx >= 0 && tracks.value[idx]!.persistKind !== kind) {
            tracks.value[idx] = { ...tracks.value[idx]!, persistKind: kind }
          }
          if (kind === 'session' && wanted !== 'session') {
            if (reason === 'oversized') oversized++
            else unavailable++
          }
        }
        if (unavailable) showToast(`本地库暂不可用（隐私模式或空间不足），${unavailable} 首仅本次会话有效`)
        if (oversized) showToast(`${oversized} 首文件超过 200MB，仅本次会话有效（未写入本地库）`)
      })
      .catch(() => {
        /* 持久化失败已在 persistImportedLocal 内降级 */
      })
    if (!currentId.value) currentId.value = imported[0]!.id
    persistMeta()
    showToast(opts?.toast ?? `已添加 ${imported.length} 首本地曲目`)
    if (opts?.openLibrary !== false) {
      switchView('files')
    }
  }

  async function openDownloadPrompt(input: PulseTrack | PulseTrack[] | null | undefined) {
    const raw = !input ? [] : Array.isArray(input) ? input : [input]
    const list = raw.filter((track) => canDownloadTrack(track))
    if (!list.length) {
      showToast(raw.length ? '没有可下载的在线曲' : '请先选择曲目')
      return
    }
    downloadPromptTracks.value = list
    downloadIncludeLyrics.value = true
    downloadIncludeMv.value = false
    downloadFailedTitles.value = []
    downloadProgress.value = null
    downloadHasMv.value = list.length === 1 ? !!list[0]!.mvId : list.some((t) => !!t.mvId)
    const hint = await rememberedSinkHint(downloadDir.value)
    if (hint) downloadSinkLabel.value = hint
    if (list.length === 1 && list[0]!.neteaseId && !list[0]!.mvId) {
      try {
        const mvId = await resolveTrackMvId(list[0]!)
        if (downloadPromptTracks.value[0]?.id !== list[0]!.id) return
        downloadHasMv.value = !!mvId
        const idx = tracks.value.findIndex((t) => t.id === list[0]!.id)
        if (idx >= 0) tracks.value[idx] = { ...tracks.value[idx]!, mvId: mvId || '' }
        const sIdx = searchResults.value.findIndex((t) => t.id === list[0]!.id)
        if (sIdx >= 0) searchResults.value[sIdx] = { ...searchResults.value[sIdx]!, mvId: mvId || '' }
        downloadPromptTracks.value = [{ ...downloadPromptTracks.value[0]!, mvId: mvId || '' }]
      } catch {
        downloadHasMv.value = false
      }
    }
  }

  function closeDownloadPrompt() {
    if (downloadBusy.value) return
    downloadPromptTracks.value = []
    downloadIncludeMv.value = false
    downloadProgress.value = null
    downloadFailedTitles.value = []
  }

  function cancelDownload() {
    downloadAbort?.abort()
  }

  async function confirmDownload(opts?: { changeFolder?: boolean }) {
    const list = downloadPromptTracks.value
    if (!list.length || downloadBusy.value) return
    downloadBusy.value = true
    downloadFailedTitles.value = []
    downloadProgress.value = null
    const ac = new AbortController()
    downloadAbort = ac
    try {
      const sink = await resolveDownloadSink({
        reuse: !opts?.changeFolder,
        rememberedTauriDir: downloadDir.value,
      })
      if (!sink) {
        showToast('已取消保存')
        return
      }
      const savedDir = await persistDownloadSink(sink)
      if (savedDir) {
        downloadDir.value = savedDir
        persistPrefs()
      }
      downloadSinkLabel.value = formatDownloadSinkLabel(sink)

      const imported: LocalImportResult[] = []
      const failed: string[] = []
      let cancelled = false
      for (let i = 0; i < list.length; i++) {
        const track = list[i]!
        try {
          const result = await downloadTrackToDisk(track, {
            sink,
            includeLyrics: downloadIncludeLyrics.value,
            includeMv: downloadIncludeMv.value && (list.length === 1 ? downloadHasMv.value : true),
            audioQuality: audioQuality.value,
            mvQuality: mvQuality.value,
            signal: ac.signal,
            index: i + 1,
            count: list.length,
            onProgress: (progress) => {
              downloadProgress.value = progress
            },
          })
          imported.push(result.imported)
        } catch (err) {
          if (isDownloadAbortError(err) || ac.signal.aborted) {
            cancelled = true
            break
          }
          failed.push(track.shortTitle || track.title)
        }
      }
      downloadFailedTitles.value = failed
      if (imported.length) {
        const extra = failed.length ? `，失败 ${failed.length}` : ''
        const prefix = cancelled ? '已取消，' : ''
        await ingestLocalImports(imported, {
          toast: `${prefix}已保存 ${imported.length} 首到本地曲库${extra}`,
          openLibrary: false,
        })
        notify('下载完成', `已保存 ${imported.length} 首到本地曲库${extra}`)
      } else if (cancelled) {
        showToast('已取消下载')
      } else if (failed.length) {
        showToast(`下载失败：${failed.slice(0, 3).join('、')}${failed.length > 3 ? '…' : ''}`)
      }
      if (!cancelled && !failed.length) {
        downloadPromptTracks.value = []
        downloadProgress.value = null
      } else if (cancelled && imported.length) {
        downloadPromptTracks.value = []
        downloadProgress.value = null
      }
    } catch (err) {
      if (isDownloadAbortError(err)) showToast('已取消下载')
      else {
        const message = err instanceof Error && err.message ? err.message : '下载失败'
        showToast(message)
      }
    } finally {
      downloadBusy.value = false
      downloadAbort = null
    }
  }

  async function addFiles(fileList: FileList | File[]) {
    const imported = await importBrowserFileList(fileList)
    await ingestLocalImports(imported, { metadataOnly: localMetadataOnly.value })
  }

  async function pickFiles() {
    const result = await pickLocalMedia(false)
    if (result === 'fallback-input') {
      fileInputRef.value?.click()
      return
    }
    if (!result.length) return
    await ingestLocalImports(result, { metadataOnly: localMetadataOnly.value })
  }

  async function pickFolder() {
    const result = await pickLocalMedia(true)
    if (result === 'fallback-input') {
      folderInputRef.value?.click()
      return
    }
    if (!result.length) return
    await ingestLocalImports(result, { metadataOnly: localMetadataOnly.value })
  }

  async function pickDownloadLibraryDir() {
    const sink = await pickDownloadSink({ defaultTauriPath: downloadDir.value })
    if (!sink) return
    const savedDir = await persistDownloadSink(sink)
    if (savedDir) downloadDir.value = savedDir
    downloadSinkLabel.value = formatDownloadSinkLabel(sink)
    persistPrefs()
    showToast(`曲库目录：${downloadSinkLabel.value}`)
  }

  async function scanDownloadLibrary() {
    let sink: { kind: 'tauri'; dir: string } | { kind: 'fsa'; dir: FileSystemDirectoryHandle } | null = null
    if (isTauriRuntime() && downloadDir.value) {
      sink = { kind: 'tauri', dir: downloadDir.value }
    } else {
      const fsa = await rememberedFsaDir()
      if (fsa) sink = { kind: 'fsa', dir: fsa }
    }
    if (!sink) {
      showToast('请先在设置中选择曲库目录')
      return
    }
    const imported = await importFromDownloadSink(sink)
    if (!imported.length) {
      showToast('曲库目录里没有可导入的歌曲文件夹')
      return
    }
    await ingestLocalImports(imported, { toast: `已从曲库导入 ${imported.length} 首`, openLibrary: true })
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files) void addFiles(input.files)
    input.value = ''
  }

  function pickLrcForTrack(id: string) {
    pendingLrcTrackId = id
    lrcInputRef.value?.click()
  }

  async function attachLrcText(id: string, text: string) {
    const parsed = parseLrcOrPlain(text)
    const idx = tracks.value.findIndex((t) => t.id === id)
    if (idx < 0) return
    tracks.value[idx] = {
      ...tracks.value[idx]!,
      lrcText: text,
      lyrics: parsed,
      lyricsTranslated: [],
    }
    void persistLocalTrackMeta(tracks.value[idx]!)
    showToast(parsed.length ? '已导入歌词' : '歌词文件没有可识别的时间轴')
  }

  function onLrcChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    const id = pendingLrcTrackId
    pendingLrcTrackId = ''
    input.value = ''
    if (file && id) void file.text().then((text) => attachLrcText(id, text))
  }

  function removeLocalTrack(id: string) {
    const track = tracks.value.find((t) => t.id === id)
    if (!track || !isLocalTrack(track)) return
    revokeTrackUrls(track)
    void deleteLocalRecord(id)
    tracks.value = tracks.value.filter((t) => t.id !== id)
    userPlaylists.value = userPlaylists.value.map((pl) => ({
      ...pl,
      trackIds: pl.trackIds.filter((x) => x !== id),
    }))
    removeFromQueue(id)
    persistMeta()
    showToast('已从曲库移除本地曲目')
  }

  /** 清空本地曲库：回收全部本地曲目 URL、删除 IndexedDB 记录与音频数据，并同步清理队列/自建歌单引用（在线曲目不受影响） */
  async function clearLocalLibrary() {
    const locals = tracks.value.filter((t) => isLocalTrack(t))
    if (!locals.length) {
      showToast('本地曲库已为空')
      return
    }
    const ok = window.confirm(
      `清空本地曲库？将删除 ${locals.length} 首本地曲目及已入库的音频数据（在线曲目不受影响）。`,
    )
    if (!ok) return
    const localIds = new Set(locals.map((t) => t.id))
    const wasCurrent = !!currentId.value && localIds.has(currentId.value)
    for (const t of locals) {
      revokeTrackUrls(t)
      void deleteLocalRecord(t.id)
    }
    tracks.value = tracks.value.filter((t) => !localIds.has(t.id))
    queueIds.value = queueIds.value.filter((id) => !localIds.has(id))
    userPlaylists.value = userPlaylists.value.map((pl) => ({
      ...pl,
      trackIds: pl.trackIds.filter((x) => !localIds.has(x)),
    }))
    if (wasCurrent) {
      isPlaying.value = false
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      currentId.value = ''
      stopSpectrumLoop()
    }
    persistMeta()
    syncRootClasses()
    showToast(`已清空本地曲库（${locals.length} 首）`)
  }

  async function restoreLocalLibraryAccess() {
    const blocked = tracks.value.filter((t) => t.localNeedsPermission)
    if (!blocked.length) {
      showToast('没有需要授权的本地曲目')
      return
    }
    let ok = 0
    for (const track of blocked) {
      const granted = await requestHandlePermission(track.id)
      if (!granted) continue
      const restored = await restoreLocalPlayback(track)
      if (!restored.url) continue
      const idx = tracks.value.findIndex((t) => t.id === track.id)
      if (idx < 0) continue
      tracks.value[idx] = {
        ...tracks.value[idx]!,
        url: restored.url,
        file: restored.file ?? tracks.value[idx]!.file,
        localNeedsPermission: false,
      }
      ok++
    }
    showToast(ok ? `已恢复 ${ok} 首本地曲目` : '浏览器未授予文件夹权限')
  }

  function openPlaylist(key: string) {
    playlistKey.value = key
    switchView('playlists')
  }

  function playPlaylist(key?: string) {
    if (key) playlistKey.value = key
    const list = playlistTracks.value
    if (!list.length) {
      showToast('歌单为空')
      return
    }
    queueIds.value = list.map((t) => t.id)
    void playTrack(list[0]!.id)
    switchView('stage')
  }

  /** 用给定列表替换队列并从指定曲目（默认第一首）开始播，不跳视图 */
  function playTrackList(list: PulseTrack[], startId?: string, emptyToast = '没有可播放的曲目') {
    if (!list.length) {
      showToast(emptyToast)
      return
    }
    queueIds.value = list.map((t) => t.id)
    void playTrack(startId ?? list[0]!.id)
  }

  /** 惰性搭建 Web Audio 链路（audio → EQ 链 → analyser → destination）；已搭好或环境不支持则跳过 */
  function ensureAudioGraph() {
    if (mediaSource && analyser && audioCtx) return
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    try {
      audioCtx = audioCtx ?? new AC()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.62
      analyser.minDecibels = -85
      analyser.maxDecibels = -25
      mediaSource = audioCtx.createMediaElementSource(audio)
      eqFilters = createEqFilters(audioCtx)
      applyEqGains(eqFilters, eqGains.value, eqEnabled.value)
      connectEqGraph(mediaSource, eqFilters, analyser, audioCtx.destination)
      freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    } catch {
      /* MediaElementSource may already exist or AudioContext blocked */
    }
  }

  function setEqGain(index: number, db: number) {
    const next = [...eqGains.value]
    next[index] = clampEqGain(db)
    eqGains.value = next
    eqPresetId.value = ''
    applyEqGains(eqFilters, next, eqEnabled.value)
    persistPrefs()
  }

  function setEqPreset(id: string) {
    const preset = EQ_PRESETS.find((p) => p.id === id)
    if (!preset) return
    eqPresetId.value = id
    eqGains.value = [...preset.gains]
    applyEqGains(eqFilters, eqGains.value, eqEnabled.value)
    persistPrefs()
  }

  function resetEq() {
    eqGains.value = EQ_BAND_LABELS.map(() => 0)
    eqPresetId.value = ''
    applyEqGains(eqFilters, eqGains.value, eqEnabled.value)
    persistPrefs()
  }

  function setEqEnabled(on: boolean) {
    eqEnabled.value = on
    applyEqGains(eqFilters, eqGains.value, on)
    persistPrefs()
  }

  /** 播放前唤醒被浏览器自动暂停策略挂起的 AudioContext */
  async function resumeAudioContext() {
    ensureAudioGraph()
    if (audioCtx?.state === 'suspended') {
      try {
        await audioCtx.resume()
      } catch {
        /* ignore */
      }
    }
  }

  /** 停止频谱 rAF 循环（暂停/关闭动效/卸载时调用） */
  function stopSpectrumLoop() {
    if (spectrumRaf) {
      cancelAnimationFrame(spectrumRaf)
      spectrumRaf = 0
    }
  }

  function decaySpectrum() {
    spectrumLevels.value = decaySpectrumLevels(spectrumLevels.value)
  }

  function sampleSpectrumFrame() {
    if (!motionOn.value || !isPlaying.value) {
      decaySpectrum()
      return
    }
    const sampled = sampleSpectrumLevels(analyser, freqData, spectrumState, {
      motionOn: true,
      isPlaying: true,
    })
    spectrumState.silentFrames = sampled.state.silentFrames
    spectrumState.fallbackSeed = sampled.state.fallbackSeed
    spectrumLevels.value = sampled.levels
  }

  /** rAF 频谱循环：每帧采样 analyser 更新柱状高度；停止播放/关动效时改为逐帧衰减 */
  function spectrumTick() {
    sampleSpectrumFrame()
    if (isPlaying.value && motionOn.value) {
      spectrumRaf = requestAnimationFrame(spectrumTick)
    } else {
      spectrumRaf = 0
      decaySpectrum()
    }
  }

  function startSpectrumLoop() {
    if (!motionOn.value) {
      stopSpectrumLoop()
      spectrumLevels.value = spectrumLevels.value.map(() => 0.04)
      return
    }
    if (spectrumRaf) return
    spectrumRaf = requestAnimationFrame(spectrumTick)
  }

  /** 把当前曲目同步到系统媒体会话（锁屏/耳机控制展示的元数据与播放态） */
  function updateMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const track = currentTrack.value
    const artwork = track ? coverOf(track) : ''
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: artwork ? [{ src: artwork, sizes: '300x300', type: 'image/jpeg' }] : [],
        })
      : null
    navigator.mediaSession.playbackState = isPlaying.value ? 'playing' : 'paused'
  }

  /** 注册系统媒体键（播放/暂停/上下曲/进度条）回调 */
  function bindMediaSessionHandlers() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        void togglePlay()
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        void togglePlay()
      })
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack())
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number' && duration.value > 0) {
          seekTo(details.seekTime / duration.value)
        }
      })
    } catch {
      /* some browsers reject handlers */
    }
  }

  /** 绑定 audio 元素的事件（只绑一次）：时长/进度/播放态/结束自动切歌/出错恢复 */
  function bindAudio() {
    if (audioBound) return
    audioBound = true
    audio.volume = muted.value ? 0 : volume.value
    // 元数据就绪：校正时长并回写本地曲的持久化元数据
    audio.addEventListener('loadedmetadata', () => {
      duration.value = audio.duration || currentTrack.value?.duration || 0
      if (currentTrack.value && audio.duration) {
        currentTrack.value.duration = audio.duration
        if (isLocalTrack(currentTrack.value)) void persistLocalTrackMeta(currentTrack.value)
      }
    })
    // 播放进度：MV 原声模式下由视频上报，不走这里
    audio.addEventListener('timeupdate', () => {
      if (!audio.src || mvOriginalAudio.value) return
      currentTime.value = audio.currentTime
      duration.value = audio.duration || duration.value
    })
    audio.addEventListener('play', () => {
      if (mvOriginalAudio.value) return
      isPlaying.value = true
      syncRootClasses()
      updateMediaSession()
      void resumeAudioContext()
      startSpectrumLoop()
    })
    audio.addEventListener('pause', () => {
      if (mvOriginalAudio.value) return
      isPlaying.value = false
      syncRootClasses()
      updateMediaSession()
      stopSpectrumLoop()
      decaySpectrum()
    })
    // 自然播完：单曲循环立即重播；顺序模式播到队尾则停下，否则自动下一首
    audio.addEventListener('ended', () => {
      if (repeat.value === 2) {
        audio.currentTime = 0
        void audio.play()
        return
      }
      const list = queueTracks.value.length ? queueTracks.value : tracks.value
      const idx = list.findIndex((t) => t.id === currentId.value)
      if (repeat.value === 0 && idx >= list.length - 1 && !shuffle.value) {
        isPlaying.value = false
        syncRootClasses()
        updateMediaSession()
        stopSpectrumLoop()
        return
      }
      nextTrack()
    })
    // 加载失败多半是播放 URL 过期：清空重取并从原进度续播
    audio.addEventListener('error', () => {
      void recoverExpiredUrl()
    })
  }

  /** 播放 URL 过期/失效后的恢复：重新取链接、回到中断位置继续播放（防重入） */
  async function recoverExpiredUrl() {
    const track = currentTrack.value
    if (!track || recoveringUrl) {
      showToast('音频加载失败')
      return
    }
    if (!track.neteaseId && !(track.remoteServer && track.remoteId) && !isLocalTrack(track)) {
      showToast('音频加载失败')
      return
    }
    recoveringUrl = true
    const pos = currentTime.value
    track.url = ''
    const ok = await ensurePlayable(track)
    if (ok && track.url) {
      audio.src = track.url
      audio.load()
      try {
        if (pos > 0) audio.currentTime = pos
        await audio.play()
        showToast('已重新获取播放链接')
      } catch {
        showToast('音频加载失败')
      }
    } else {
      showToast('音频加载失败')
    }
    recoveringUrl = false
  }

  /** 全局快捷键：空格播放/暂停、Ctrl+K 搜索、L 全屏歌词、Q 队列抽屉、方向键音量/进度、1-5 切视图 */
  function onKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.code === 'Space') {
      e.preventDefault()
      void togglePlay()
    } else if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      switchView('search')
    } else if (e.key.toLowerCase() === 'l') {
      openTheater()
    } else if (e.key.toLowerCase() === 'q') {
      if (drawerOpen.value) closeDrawer()
      else openDrawer('queue')
    } else if (e.key === 'Escape') {
      if (theaterOpen.value) closeTheater()
      else if (drawerOpen.value) closeDrawer()
      else if (miniMode.value) toggleMini()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setVolume(volume.value + 0.05)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setVolume(volume.value - 0.05)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = Math.max(1, duration.value || currentTrack.value?.duration || 1)
      seekTo((currentTime.value - 5) / d)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const d = Math.max(1, duration.value || currentTrack.value?.duration || 1)
      seekTo((currentTime.value + 5) / d)
    } else if (theaterOpen.value) {
      const key = e.key.toLowerCase()
      if (key === 'm') {
        e.preventDefault()
        toggleMute()
      } else if (key === 't') {
        e.preventDefault()
        toggleLyricTranslation()
      }
      // F / H handled in MusicPage (DOM fullscreen + chrome)
    } else if (/^[1-5]$/.test(e.key)) {
      if (!document.querySelector('.music-room-root')) return
      const views: PulseView[] = ['stage', 'discover', 'library', 'files', 'settings']
      switchView(views[Number(e.key) - 1]!)
    }
  }

  /** 引擎首启用时的一次性初始化：偏好、持久化数据、事件绑定、全局键盘监听与本地曲补水 */
  function bootstrap() {
    if (bootstrapped) {
      audio.volume = muted.value ? 0 : volume.value
      syncRootClasses()
      return
    }
    bootstrapped = true
    loadPrefs()
    void rememberedSinkHint(downloadDir.value).then((hint) => {
      if (hint) downloadSinkLabel.value = hint
    })
    loadPersisted()
    bindAudio()
    bindMediaSessionHandlers()
    audio.volume = muted.value ? 0 : volume.value
    syncRootClasses()
    window.addEventListener('keydown', onKeydown)
    void backfillMissingCovers()
    if (currentId.value) {
      const track = tracks.value.find((t) => t.id === currentId.value)
      if (track) {
        void loadLyricsFor(track)
        void ensureTrackMeta(track)
      }
    }
    void hydrateLocals().then(() => {
      const track = tracks.value.find((t) => t.id === currentId.value)
      if (track) void loadLyricsFor(track)
    })
    updateMediaSession()
  }

  /** 恢复上次会话保存的本地曲目（blob/FSA/Tauri 各自的持久化通道），并合并回队列 */
  async function hydrateLocals() {
    const local = await hydrateLocalTracks(new Set(tracks.value.map((t) => t.id)))
    if (!local.length) return
    tracks.value = [...tracks.value, ...local]
    try {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as string[]
      if (Array.isArray(queue) && queue.length) {
        const merged = queue.filter((id) => tracks.value.some((t) => t.id === id))
        if (merged.length) queueIds.value = merged
      }
    } catch {
      /* keep current queue */
    }
    for (const id of local.map((t) => t.id)) ensureInQueue(id)
    persistMeta()
    const blocked = local.filter((t) => t.localNeedsPermission).length
    if (blocked) showToast(`${blocked} 首本地曲目需要重新授权，可在曲库页恢复`)
  }

  function setRoot(target?: Ref<HTMLElement | null>) {
    if (target) rootClassTarget = target
    syncRootClasses()
  }

  function clearRoot(target?: Ref<HTMLElement | null>) {
    if (rootClassTarget === target) rootClassTarget = undefined
  }

  // 换歌时按需补歌词并刷新系统媒体会话
  watch(currentId, (id) => {
    if (!id) return
    const track = tracks.value.find((t) => t.id === id)
    if (track) void loadLyricsFor(track)
    updateMediaSession()
  })

  // 关/开动效时停掉或重启频谱循环
  watch(motionOn, (on) => {
    if (!on) {
      stopSpectrumLoop()
      spectrumLevels.value = spectrumLevels.value.map(() => 0.04)
    } else if (isPlaying.value) {
      startSpectrumLoop()
    }
  })

  return {
    formatTime,
    qualityLabel,
    coverOf,
    trackById,
    VIEW_META,
    tracks,
    currentId,
    currentTrack,
    currentCover,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    view,
    viewMeta,
    libraryTab,
    drawerOpen,
    drawerPinned,
    drawerTab,
    theaterOpen,
    miniMode,
    mvEnabled,
    mvMode,
    mvActive,
    mvQuality,
    showRelatedMvs,
    mvUrl,
    mvReady,
    mvLoading,
    mvOverrideId,
    relatedMvs,
    relatedMvLoading,
    mvOriginalAudio,
    mvSeekRequest,
    pipPos,
    hasMv,
    motionOn,
    compactMode,
    railAutoCollapse,
    stageVariant,
    fontPreset,
    stageRevealOnHover,
    stageConcertFx,
    roomMode,
    roomBg,
    roomBlur,
    roomVeil,
    accentPreset,
    accentHex,
    toastText,
    toastVisible,
    downloadPromptTrack,
    downloadPromptTracks,
    downloadIncludeLyrics,
    downloadIncludeMv,
    downloadHasMv,
    downloadBusy,
    downloadProgress,
    downloadSinkLabel,
    downloadDir,
    downloadFailedTitles,
    searchQuery,
    searchState,
    searchResults,
    searchHistory,
    hotSearches,
    hotSearchLoading,
    neteaseLoading,
    lyricLoading,
    provider,
    libraryFilter,
    playlistKey,
    playStats,
    listenStats,
    immersive,
    toggleImmersive,
    notify,
    playlists,
    activePlaylist,
    playlistTracks,
    eqEnabled,
    eqGains,
    eqBands,
    eqPresetId,
    setEqGain,
    setEqPreset,
    resetEq,
    setEqEnabled,
    eqPresets: EQ_PRESETS,
    localHint,
    localMetadataOnly,
    historyIds,
    fileInputRef,
    folderInputRef,
    lrcInputRef,
    progressPct,
    lyricLines,
    lyricDisplayLines,
    lyricIndex,
    lyricProgressWithin,
    hasRealLyrics,
    hasTranslation,
    isForeignLyrics,
    canShowLyricTranslation,
    showLyricTranslation,
    lyricSize,
    theaterView,
    stageQueue,
    upNextTracks,
    upNextTrack,
    spectrumLevels,
    spectrumBarCount,
    queueTracks,
    localTracks,
    favoriteTracks,
    historyTracks,
    discoverTracks,
    filteredLibrary,
    albumGroups,
    artistGroups,
    libraryStats,
    isEmptyLibrary,
    showToast,
    switchView,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    seekLyric,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleFavorite,
    openDrawer,
    peekDrawer,
    toggleDrawerPin,
    closeDrawer,
    openTheater,
    openMvPip,
    openMvTheater,
    expandPipToTheater,
    dockMvToStage,
    undockMvToPip,
    toggleTheaterMv,
    closeMv,
    markMvReady,
    setMvQuality,
    setMvMode,
    setShowRelatedMvs,
    selectRelatedMv,
    loadRelatedMvs,
    maybeAutoPip,
    setMvOriginalAudio,
    toggleMvOriginalAudio,
    reportMvVideoTime,
    consumeMvSeekRequest,
    getAudioClock,
    collapseTheater,
    dismissTheater,
    closeTheater,
    setPipPos,
    resetPipPos,
    toggleMini,
    setStageVariant,
    setRoomMode,
    setRoomBg,
    setRoomBlur,
    setRoomVeil,
    setAccentPreset,
    setAccentHex,
    setFontPreset,
    runSearch,
    applySearchKeyword,
    clearSearchHistory,
    removeSearchHistory,
    loadHotSearches,
    playSearchResult,
    ingestTrack,
    upsertNeteaseTracks,
    songDetail,
    simiSongs,
    simiLoading,
    openSongDetail,
    closeSongDetail,
    playSimiSong,
    addFiles,
    pickFiles,
    pickFolder,
    pickDownloadLibraryDir,
    scanDownloadLibrary,
    onFileChange,
    pickLrcForTrack,
    onLrcChange,
    canDownloadTrack,
    openDownloadPrompt,
    closeDownloadPrompt,
    confirmDownload,
    cancelDownload,
    removeLocalTrack,
    clearLocalLibrary,
    restoreLocalLibraryAccess,
    openPlaylist,
    playPlaylist,
    playTrackList,
    clearQueue,
    setLyricsTranslation,
    toggleLyricTranslation,
    setLyricSize,
    setTheaterView,
    saveQueueToast,
    syncRootClasses,
    persistMeta,
    persistPrefs,
    searchKind,
    searchAlbumResults,
    searchPlaylistResults,
    searchArtistResults,
    searchHasMore,
    loadMoreSearch,
    setSearchKind,
    libraryFocus,
    libraryFocusTracks,
    openLibraryGroup,
    closeLibraryGroup,
    playMode,
    cyclePlayMode,
    audioQuality,
    setAudioQuality,
    addToQueue,
    removeFromQueue,
    playAtQueueIndex,
    reorderQueue,
    userPlaylists,
    neteaseAccountPlaylists,
    neteasePlaylistSongs,
    neteasePlaylistLoading,
    likedTrackIds,
    createUserPlaylist,
    renameUserPlaylist,
    deleteUserPlaylist,
    addTrackToUserPlaylist,
    removeTrackFromUserPlaylist,
    reorderUserPlaylist,
    batchRemoveFromUserPlaylist,
    loadAccountPlaylists,
    clearAccountPlaylists,
    openNeteaseAccountPlaylist,
    playLikedSongs,
    bootstrap,
    setRoot,
    clearRoot,
  }
}

// 全局唯一的引擎实例：跨路由/组件保留播放状态
let pulseEngine: ReturnType<typeof createPulseEngine> | null = null

/**
 * 获取 Pulse 播放引擎（单例）。
 * 首次调用时在独立 effectScope 中创建，之后所有组件共享同一实例；
 * 各调用方在挂载时注册自己的根节点引用并触发一次性 bootstrap。
 */
export function usePulsePlayer(rootClassTarget?: Ref<HTMLElement | null>) {
  if (!pulseEngine) {
    const scope = effectScope(true)
    pulseEngine = scope.run(() => createPulseEngine())!
  }
  onMounted(() => {
    pulseEngine!.setRoot(rootClassTarget)
    pulseEngine!.bootstrap()
  })
  onUnmounted(() => {
    pulseEngine!.clearRoot(rootClassTarget)
  })
  return pulseEngine
}
