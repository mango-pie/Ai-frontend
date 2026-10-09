<script setup lang="ts">
/**
 * 音乐房间主容器（Pulse 播放器）：左侧导航栏 + 各功能视图 + 底部播放控制条，
 * 外加全局抽屉（队列/歌词）、迷你播放器、MV 画中画层、全屏歌词剧场与下载弹窗。
 * 核心职责：
 *  - 组装 usePulsePlayer 等组合式能力并分发给子视图；
 *  - MV 视频与音频主时钟的同步对齐（时长不匹配时变速/循环/硬 seek）；
 *  - 剧场（全屏）模式的控件显隐、快捷键与浏览器全屏；
 *  - MV 画中画拖拽与停靠到舞台封面对应区域。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  AudioLines,
  ChevronLeft,
  Compass,
  Download,
  HardDrive,
  Heart,
  Library,
  ListMusic,
  Maximize2,
  Minimize2,
  Bell,
  MoreHorizontal,
  Pause,
  Pin,
  Play,
  Repeat,
  Repeat1,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next'
import '@/assets/styles/music-pulse-v1.css'
import { usePulsePlayer, type PulseView } from '@/composables/usePulsePlayer'
import { usePulseDiscover } from '@/composables/usePulseDiscover'
import { usePulseLyricUi } from '@/composables/pulse/usePulseLyricUi'
import { useNeteaseLogin } from '@/design/useNeteaseLogin'
import { applyCoverFallback } from '@/utils/musicCover'
import { roomCssVars } from '@/composables/pulse/pulseRoomLook'
import { useBackgroundSlideshow } from '@/composables/useBackgroundSlideshow'
import PulseStageView from './views/PulseStageView.vue'
import PulseDiscoverView from './views/PulseDiscoverView.vue'
import PulseSearchView from './views/PulseSearchView.vue'
import PulseLibraryView from './views/PulseLibraryView.vue'
import PulseFilesView from './views/PulseFilesView.vue'
import PulsePlaylistsView from './views/PulsePlaylistsView.vue'
import PulseSettingsView from './views/PulseSettingsView.vue'
import PulseSongDetailDrawer from './views/PulseSongDetailDrawer.vue'

const router = useRouter()
// 独立窗口模式（music-standalone）下隐藏「返回」按钮
const standaloneMode = import.meta.env.MODE === 'music-standalone'
const rootRef = ref<HTMLElement | null>(null)
// 播放器核心 API（状态 + 操作），几乎所有子视图都接收这个 p
const p = usePulsePlayer(rootRef)
// 发现页能力：打开歌单/专辑/歌手详情并联动播放器
const discover = usePulseDiscover({
  upsertNeteaseTracks: p.upsertNeteaseTracks,
  playTrack: p.playTrack,
  switchView: p.switchView,
  openPlaylist: p.openPlaylist,
  ingestTrack: p.ingestTrack,
  currentId: p.currentId,
  view: p.view,
})
const netease = useNeteaseLogin()
// 歌词 UI 行为（舞台/抽屉/剧场三处歌词的滚动同步、行点击跳转）
const {
  theaterFlowRef,
  drawerLyricRef,
  lyricToneClass,
  onLyricLineClick,
  markLyricUserScroll,
  syncLyricScroll,
} = usePulseLyricUi(p)

// 房间观感（日夜/强调色/模糊/幕布）转成 CSS 变量挂到根节点
const roomStyle = computed(() =>
  roomCssVars({
    mode: p.roomMode.value,
    preset: p.accentPreset.value,
    hex: p.accentHex.value,
    blur: p.roomBlur.value,
    veil: p.roomVeil.value,
  }),
)
// 双层交叉淡入的背景轮播；autoRun:false 由下面的 watch 按设置开关
const { layerA, layerB, activeLayer, hasImages, start, stop } = useBackgroundSlideshow({ autoRun: false })

// 开启动漫背景 + 允许动效 + 系统未开启「减少动态」时才轮播，否则停掉
watch(
  () => [p.roomBg.value, p.motionOn.value] as const,
  ([bg, motion]) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (bg === 'anime' && hasImages && motion && !reduce) start()
    else stop()
  },
  { immediate: true },
)

// MV 视频 ref 与画中画图层 ref（画中画层同时承载 stage/theater 形态）
const mvVideoRef = ref<HTMLVideoElement | null>(null)
const mvPipLayerRef = ref<HTMLElement | null>(null)

// 左侧导航（桌面 rail）：key 为数字快捷键编号
const navItems: Array<{ view: PulseView; num: string; label: string; key: string; icon: Component }> = [
  { view: 'stage', num: '01', label: '正在播放', key: '1', icon: AudioLines },
  { view: 'discover', num: '02', label: '发现', key: '2', icon: Compass },
  { view: 'library', num: '03', label: '曲库', key: '3', icon: Library },
  { view: 'files', num: '04', label: '本地', key: '4', icon: HardDrive },
  { view: 'settings', num: '05', label: '设置', key: '5', icon: Settings },
]

// 移动端底部 tab 栏
const tabItems: Array<{ view: PulseView; label: string; icon: Component }> = [
  { view: 'stage', label: '播放', icon: AudioLines },
  { view: 'discover', label: '发现', icon: Compass },
  { view: 'search', label: '搜索', icon: Search },
  { view: 'library', label: '曲库', icon: Library },
]

// 导航高亮：发现页下辖歌单页，设置页下辖均衡器页
function navActive(view: PulseView) {
  const current = p.view.value
  if (view === 'discover') return current === 'discover' || current === 'playlists'
  if (view === 'settings') return current === 'settings' || current === 'audio'
  return current === view
}

// 搜索快捷键提示按平台区分（Mac 用 ⌘K）
const isMac = /mac/i.test(
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    '',
)
const searchShortcut = isMac ? '⌘K' : 'Ctrl+K'
// 播放队列拖拽排序：正在拖拽的行下标
const queueDragFrom = ref<number | null>(null)
// 下载总进度百分比（未知大小时为 0，模板里用 18% 假进度条示意）
const downloadPercent = computed(() => {
  const progress = p.downloadProgress.value
  if (!progress?.total) return 0
  return Math.min(100, Math.round(((progress.loaded || 0) / progress.total) * 100))
})

// 下载阶段文案：音频 -> 标签 -> 封面 -> 歌词 -> MV
function downloadStageLabel(stage?: string) {
  if (stage === 'audio') return '音频'
  if (stage === 'tag') return '写入标签'
  if (stage === 'cover') return '封面'
  if (stage === 'lyrics') return '歌词'
  if (stage === 'mv') return 'MV'
  return '准备中'
}

// ---- 播放队列拖拽排序（HTML5 drag & drop）----
// 行内按钮（下载/移除）不触发拖拽，避免误排序
function onQueueDragStart(index: number, event: DragEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.text-button')) {
    event.preventDefault()
    return
  }
  queueDragFrom.value = index
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onQueueDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onQueueDrop(index: number) {
  if (queueDragFrom.value == null) return
  p.reorderQueue(queueDragFrom.value, index)
  queueDragFrom.value = null
}

// ---- 悬停展开的浮层状态（更多控制菜单 / 剧场溢出菜单 / 收藏心跳 / 侧栏展开）----
// fineHover = 精确指针设备（鼠标）才启用悬停展开；触屏只能点击
const toolsOpen = ref(false)
const toolsPinned = ref(false)
const theaterOverflowOpen = ref(false)
const theaterOverflowPinned = ref(false)
const heartPop = ref(false)
const fineHover = ref(false)
const railExpanded = ref(false)

// 悬停进入/离开的防抖定时器句柄
let toolsInTimer = 0
let toolsOutTimer = 0
let drawerInTimer = 0
let drawerOutTimer = 0
let heartPopTimer = 0
let fineHoverMq: MediaQueryList | null = null

// 跟随媒体查询同步「是否精确指针」
function syncFineHover() {
  fineHover.value = !!fineHoverMq?.matches
}

function closeTools() {
  toolsOpen.value = false
  toolsPinned.value = false
}

function onTool(action: () => void) {
  action()
  closeTools()
}

function clearHoverTimers() {
  window.clearTimeout(toolsInTimer)
  window.clearTimeout(toolsOutTimer)
  window.clearTimeout(drawerInTimer)
  window.clearTimeout(drawerOutTimer)
}

// 「更多控制」浮层：悬停延迟展开 / 离开延迟收起；图钉态（toolsPinned）保持常开
function onToolsEnter() {
  if (!fineHover.value) return
  window.clearTimeout(toolsOutTimer)
  toolsInTimer = window.setTimeout(() => {
    toolsOpen.value = true
  }, 120)
}

function onToolsLeave() {
  window.clearTimeout(toolsInTimer)
  if (toolsPinned.value) return
  toolsOutTimer = window.setTimeout(() => {
    toolsOpen.value = false
  }, 220)
}

function toggleTools() {
  toolsPinned.value = !toolsPinned.value
  toolsOpen.value = toolsPinned.value
}

function closeTheaterOverflow() {
  theaterOverflowOpen.value = false
  theaterOverflowPinned.value = false
}

function toggleTheaterOverflow() {
  theaterOverflowPinned.value = !theaterOverflowPinned.value
  theaterOverflowOpen.value = theaterOverflowPinned.value
  if (theaterOverflowOpen.value) bumpTheaterChrome()
}

// 队列抽屉：悬停快捷窥视（peek），已钉住则不自动收起
function onDrawerEnter() {
  if (!fineHover.value) return
  window.clearTimeout(drawerOutTimer)
  drawerInTimer = window.setTimeout(() => {
    p.peekDrawer('queue')
  }, 140)
}

function onDrawerLeave() {
  window.clearTimeout(drawerInTimer)
  if (p.drawerPinned.value) return
  drawerOutTimer = window.setTimeout(() => {
    p.closeDrawer()
  }, 400)
}

// 点击导航：切换视图；自动收起模式下（触屏）顺手收起侧栏
function onNavClick(view: PulseView) {
  p.switchView(view)
  if (p.railAutoCollapse.value && !fineHover.value) railExpanded.value = false
}

// 侧栏手风琴开关：仅自动收起模式且非精确指针时可用
function toggleRailExpanded() {
  if (!p.railAutoCollapse.value || fineHover.value) return
  railExpanded.value = !railExpanded.value
}

// 收藏按钮：切换收藏态并播放一次心跳动画（重挂 class 触发）
function onFavoriteClick() {
  p.toggleFavorite()
  heartPop.value = false
  requestAnimationFrame(() => {
    heartPop.value = true
  })
  window.clearTimeout(heartPopTimer)
  heartPopTimer = window.setTimeout(() => {
    heartPop.value = false
  }, 420)
}

// 视图切换：收起浮层；进搜索页时预拉热搜并聚焦搜索框
watch(
  () => p.view.value,
  async (view) => {
    closeTools()
    if (view === 'search') {
      void p.loadHotSearches()
      await nextTick()
      const input = rootRef.value?.querySelector<HTMLInputElement>('#pulse-search-input')
      input?.focus()
    }
  },
)

// 进度/音量滑条的双向绑定：显示取整百分比，写回时换算成 0~1
const seekValue = computed({
  get: () => Math.round(p.progressPct.value),
  set: (v: number) => p.seekTo(v / 100),
})

const volumeValue = computed({
  get: () => Math.round(p.volume.value * 100),
  set: (v: number) => p.setVolume(v / 100),
})

// 云端歌单联动：登录后拉取账号歌单，退出后清空
watch(
  () => [netease.isLoggedIn.value, netease.loginInfo.value.userId] as const,
  ([loggedIn, uid]) => {
    if (loggedIn && uid) void p.loadAccountPlaylists(uid)
    else p.clearAccountPlaylists()
  },
)

// ==================== MV 与音频主时钟的同步 ====================
// 原则：音频是唯一主时钟，MV 视频永远跟随音频（对齐/变速/循环），保证歌词、进度、声音一致。

// 判断 <video> 当前源是否已经是目标 URL（含相对地址按 baseURI 归一化）
function mediaUrlEquals(el: HTMLMediaElement, url: string) {
  if (!url) return !el.getAttribute('src') && !el.currentSrc
  let abs = url
  try {
    abs = new URL(url, document.baseURI).href
  } catch {
    /* keep raw */
  }
  return el.src === abs || el.currentSrc === abs || el.getAttribute('src') === url
}

let mvSyncRaf = 0
// 上次硬 seek 时间戳：硬 seek 限频（900ms），避免反复 seek 卡顿
let mvHardSeekAt = 0

function stopMvSyncLoop() {
  if (mvSyncRaf) cancelAnimationFrame(mvSyncRaf)
  mvSyncRaf = 0
}

// 音频总时长（元数据缺失时回退到曲目自带的 duration）
function audioDurationSec() {
  const d = p.duration.value || p.currentTrack.value?.duration || 0
  return d > 0.5 ? d : NaN
}

// MV 明显短于音频（<62%）时视为循环素材（官方 MV 常见剪辑版）
function shouldLoopMv(videoDur: number) {
  const audioDur = audioDurationSec()
  return Number.isFinite(audioDur) && videoDur > 0.5 && videoDur < audioDur * 0.62
}

// 视频相对音频的基准播放倍率：时长几乎一致或循环素材时按 1x 播，
// 否则线性拉伸（限制在 0.55x~1.7x，避免变速过度失真）
function mvSpanRate(videoDur: number) {
  const audioDur = audioDurationSec()
  if (!Number.isFinite(audioDur) || !Number.isFinite(videoDur) || videoDur < 0.5) return 1
  const absDiff = Math.abs(videoDur - audioDur)
  const rel = absDiff / audioDur
  if (absDiff < 2.2 && rel < 0.045) return 1
  if (shouldLoopMv(videoDur)) return 1
  return Math.max(0.55, Math.min(1.7, videoDur / audioDur))
}

// 音频时间 -> 视频时间的映射：
//  - 循环素材：对视频时长取模
//  - 时长接近：直接钳制到 [0, end]
//  - 其它：按比例缩放（配合 mvSpanRate 变速后残余漂移很小）
function mapAudioTimeToVideo(audioT: number, videoDur: number) {
  const audioDur = audioDurationSec()
  if (!Number.isFinite(videoDur) || videoDur < 0.5) return audioT
  const end = Math.max(0, videoDur - 0.05)
  if (!Number.isFinite(audioDur)) return Math.min(Math.max(0, audioT), end)
  if (shouldLoopMv(videoDur)) {
    const looped = audioT % videoDur
    return Math.min(Math.max(0, looped), end)
  }
  const absDiff = Math.abs(videoDur - audioDur)
  const rel = absDiff / audioDur
  if (absDiff < 2.2 && rel < 0.045) return Math.min(Math.max(0, audioT), end)
  return Math.min(Math.max(0, audioT * (videoDur / audioDur)), end)
}

// 每帧对齐：暂停态直接对齐位置；播放态按漂移量分级处理——
// 小漂移微调 playbackRate、中漂移强纠偏、大漂移硬 seek（限频）
function alignMvToAudio() {
  const video = mvVideoRef.value
  if (!video || !p.mvActive.value || !p.mvReady.value || p.mvOriginalAudio.value) return
  if (video.seeking || video.readyState < 2) return
  const targetRaw = p.getAudioClock()
  if (!Number.isFinite(targetRaw)) return
  const dur = video.duration
  const target = mapAudioTimeToVideo(targetRaw, Number.isFinite(dur) ? dur : NaN)
  const drift = video.currentTime - target
  const abs = Math.abs(drift)
  const baseRate = Number.isFinite(dur) ? mvSpanRate(dur) : 1
  if (!p.isPlaying.value) {
    if (video.playbackRate !== 1) video.playbackRate = 1
    if (abs > 0.12) {
      try {
        video.currentTime = target
      } catch {
        /* ignore */
      }
    }
    return
  }
  if (abs < 0.05) {
    if (Math.abs(video.playbackRate - baseRate) > 0.01) video.playbackRate = baseRate
    return
  }
  if (abs < 0.55) {
    video.playbackRate = baseRate + Math.max(-0.08, Math.min(0.08, -drift * 0.22))
    return
  }
  const now = performance.now()
  if (now - mvHardSeekAt < 900) return
  mvHardSeekAt = now
  video.playbackRate = baseRate
  try {
    video.currentTime = target
  } catch {
    /* ignore seek errors while loading */
  }
}

// 启动 rAF 对齐循环（仅静音跟音频模式需要；原声模式视频自己就是主时钟）
function startMvSyncLoop() {
  stopMvSyncLoop()
  const tick = () => {
    mvSyncRaf = requestAnimationFrame(tick)
    alignMvToAudio()
  }
  mvSyncRaf = requestAnimationFrame(tick)
}

// 一次性校时：漂移超过 120ms（或 force）时直接 seek 到目标位置并恢复基准倍率
function syncMvClock(force = false) {
  const video = mvVideoRef.value
  if (!video || !p.mvActive.value || !p.mvReady.value || p.mvOriginalAudio.value) return
  const audioT = p.getAudioClock()
  if (!Number.isFinite(audioT)) return
  const target = mapAudioTimeToVideo(audioT, Number.isFinite(video.duration) ? video.duration : NaN)
  if (force || Math.abs(video.currentTime - target) > 0.12) {
    video.playbackRate = Number.isFinite(video.duration) ? mvSpanRate(video.duration) : 1
    try {
      video.currentTime = target
    } catch {
      /* ignore seek errors while loading */
    }
  }
}

// 播放/暂停联动：静音模式下视频跟随音频播放状态；原声模式下不静音
async function syncMvPlayback() {
  const video = mvVideoRef.value
  if (!video || !p.mvActive.value) return
  video.muted = !p.mvOriginalAudio.value
  if (!p.isPlaying.value) {
    video.pause()
    return
  }
  try {
    await video.play()
  } catch {
    /* 放大 / 切原声后浏览器可能还没准备好，loadeddata 会再试一次 */
  }
}

// 切换 MV 原声：切到原声时视频不静音立即播放；切回音频时恢复静音由对齐循环接管
function onToggleMvOriginalAudio() {
  p.toggleMvOriginalAudio()
  const video = mvVideoRef.value
  if (!video || !p.mvActive.value) return
  video.muted = !p.mvOriginalAudio.value
  if (p.mvOriginalAudio.value || p.isPlaying.value) {
    void video.play().catch(() => {})
  }
}

// 放大到剧场：切换形态后按原声开关决定静音，并尽量保持播放
function onExpandMv() {
  p.expandPipToTheater()
  const video = mvVideoRef.value
  if (!video || !p.mvActive.value) return
  video.muted = !p.mvOriginalAudio.value
  if (p.isPlaying.value) void video.play().catch(() => {})
}

// MV 地址/形态变化：换源后强校时，再同步播放状态
watch(
  () => [p.mvUrl.value, p.mvMode.value] as const,
  async ([url, mode]) => {
    await nextTick()
    const video = mvVideoRef.value
    if (!video) return
    if (mode === 'off' || !url) {
      video.pause()
      return
    }
    if (!mediaUrlEquals(video, url)) {
      video.src = url
      video.load()
      if (!p.mvOriginalAudio.value) syncMvClock(true)
    }
    await syncMvPlayback()
  },
)

// 音频播放/暂停时同步视频播放状态
watch(
  () => p.isPlaying.value,
  () => {
    void syncMvPlayback()
  },
)

// 对齐循环的开关：仅「MV 激活 + 就绪 + 静音跟音频」时运行
watch(
  () => [p.mvActive.value, p.mvReady.value, p.mvOriginalAudio.value] as const,
  ([active, ready, original]) => {
    if (active && ready && !original) startMvSyncLoop()
    else stopMvSyncLoop()
  },
  { immediate: true },
)

// 播放器内部发起的 MV seek 请求（如进度条拖动）转发给 video 元素
watch(
  () => p.mvSeekRequest.value,
  (t) => {
    if (t == null) return
    const video = mvVideoRef.value
    const seek = p.consumeMvSeekRequest()
    if (video && seek != null) {
      try {
        video.currentTime = seek
      } catch {
        /* ignore */
      }
    }
  },
)

// 原声开关切换后同步静音与播放
watch(
  () => p.mvOriginalAudio.value,
  () => {
    void syncMvPlayback()
  },
)

// 视频可播：标记就绪并立即强校时一次
function onMvLoaded() {
  p.markMvReady(true)
  syncMvClock(true)
  void syncMvPlayback()
}

// 视频出错：换源/拖拽引发的瞬时错误窗口期内忽略；真正失败则关 MV 并提示
function onMvError() {
  if (performance.now() < ignoreMvErrorUntil) return
  const video = mvVideoRef.value
  if (video && video.readyState >= 2 && video.currentSrc) return
  p.markMvReady(false)
  if (p.mvActive.value) {
    p.closeMv()
    p.showToast('MV 暂不可播')
  }
}

// 原声模式下视频是主时钟：把视频进度回报给播放器（进度条/歌词跟随视频）
function onMvTimeUpdate() {
  const video = mvVideoRef.value
  if (!video || !p.mvOriginalAudio.value) return
  p.reportMvVideoTime(video.currentTime, video.duration || 0)
}

// 视频播完：原声模式直接切下一首；静音模式下循环素材回到开头重播
function onMvEnded() {
  if (p.mvOriginalAudio.value) {
    p.nextTrack()
    return
  }
  const video = mvVideoRef.value
  if (!video || !shouldLoopMv(video.duration)) return
  try {
    video.currentTime = 0
  } catch {
    /* ignore */
  }
  if (p.isPlaying.value) void video.play().catch(() => {})
}

// ==================== MV 画中画拖拽与舞台停靠 ====================
// 拖拽状态：是否拖拽中、是否悬停在舞台封面上方（可停靠提示）、停靠矩形
const pipDragging = ref(false)
const pipOverStage = ref(false)
const stageDockRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)
let pipDragOffsetX = 0
let pipDragOffsetY = 0
let pipDragMoved = false
let stageDockRo: ResizeObserver | null = null
let ignoreMvErrorUntil = 0

// 舞台封面元素（MV 停靠的目标区域）
function getStageArtEl() {
  return rootRef.value?.querySelector('[data-stage-art]') as HTMLElement | null
}

// 判断坐标是否落在舞台封面内（仅舞台视图且非剧场时允许停靠）
function isPointInStageArt(x: number, y: number) {
  if (p.view.value !== 'stage' || p.theaterOpen.value) return false
  const el = getStageArtEl()
  if (!el) return false
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return false
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

// 重新测量停靠区（舞台封面相对根节点的位置尺寸）
function updateStageDockRect() {
  const root = rootRef.value
  const el = getStageArtEl()
  if (!root || !el) return
  const rr = root.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return
  stageDockRect.value = {
    left: r.left - rr.left,
    top: r.top - rr.top,
    width: r.width,
    height: r.height,
  }
}

// 绑定/解绑停靠区尺寸监听：封面或窗口尺寸变化时保持 MV 铺满封面
function bindStageDock() {
  unbindStageDock()
  const el = getStageArtEl()
  const root = rootRef.value
  if (!el || !root) return
  updateStageDockRect()
  stageDockRo = new ResizeObserver(() => updateStageDockRect())
  stageDockRo.observe(el)
  stageDockRo.observe(root)
  const pulseApp = root.querySelector('.pulse-app')
  if (pulseApp) stageDockRo.observe(pulseApp)
  window.addEventListener('resize', updateStageDockRect)
  visualViewport?.addEventListener('resize', updateStageDockRect)
}

function unbindStageDock() {
  stageDockRo?.disconnect()
  stageDockRo = null
  window.removeEventListener('resize', updateStageDockRect)
  visualViewport?.removeEventListener('resize', updateStageDockRect)
}

// 松手落在舞台上：切换到停靠形态；短暂忽略换流引发的 video 错误
async function commitDockToStage() {
  ignoreMvErrorUntil = performance.now() + 2500
  updateStageDockRect()
  p.dockMvToStage()
  await nextTick()
  bindStageDock()
  updateStageDockRect()
  const video = mvVideoRef.value
  if (video) {
    video.muted = !p.mvOriginalAudio.value
    if (p.isPlaying.value || p.mvOriginalAudio.value) {
      void video.play().catch(() => {})
    }
  }
}

function onPipPointerDown(e: PointerEvent) {
  if (p.mvMode.value !== 'pip') return
  const target = e.target as HTMLElement | null
  if (target?.closest('button, a, input, .related-scroller, .related-mv-card')) return
  const el = mvPipLayerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  pipDragOffsetX = e.clientX - rect.left
  pipDragOffsetY = e.clientY - rect.top
  pipDragMoved = false
  pipOverStage.value = false
  pipDragging.value = true
  el.setPointerCapture?.(e.pointerId)
  e.preventDefault()
}

// 指针移动：小窗跟随并限制在视口内，同时检测是否悬到舞台上方（显示停靠提示）
function onPipPointerMove(e: PointerEvent) {
  if (!pipDragging.value) return
  const el = mvPipLayerRef.value
  if (!el) return
  const w = el.offsetWidth
  const h = el.offsetHeight
  const maxL = Math.max(8, window.innerWidth - w - 8)
  const maxT = Math.max(8, window.innerHeight - h - 8)
  const left = Math.min(maxL, Math.max(8, e.clientX - pipDragOffsetX))
  const top = Math.min(maxT, Math.max(8, e.clientY - pipDragOffsetY))
  pipDragMoved = true
  p.setPipPos(left, top)
  pipOverStage.value = isPointInStageArt(e.clientX, e.clientY)
}

function onPipPointerUp(e: PointerEvent) {
  if (!pipDragging.value) return
  pipDragging.value = false
  mvPipLayerRef.value?.releasePointerCapture?.(e.pointerId)
  const dropOnStage = pipDragMoved && pipOverStage.value
  pipOverStage.value = false
  if (dropOnStage) void commitDockToStage()
}

// 进入/离开舞台形态时绑定或解除停靠区监听
watch(
  () => p.mvMode.value,
  async (mode) => {
    if (mode === 'stage') {
      ignoreMvErrorUntil = Math.max(ignoreMvErrorUntil, performance.now() + 1200)
      await nextTick()
      bindStageDock()
      updateStageDockRect()
      await syncMvPlayback()
    } else {
      unbindStageDock()
    }
  },
)

// 双击画中画标题栏：位置复位（拖拽后双击仍可复位）
function onPipChromeDblClick() {
  if (pipDragMoved) return
  p.resetPipPos()
}

// MV 图层定位：stage 形态铺满停靠区，pip 形态用记录的小窗位置
const pipLayerStyle = computed(() => {
  if (p.mvMode.value === 'stage' && stageDockRect.value) {
    return {
      left: `${stageDockRect.value.left}px`,
      top: `${stageDockRect.value.top}px`,
      width: `${stageDockRect.value.width}px`,
      height: `${stageDockRect.value.height}px`,
      right: 'auto',
      bottom: 'auto',
    }
  }
  if (p.mvMode.value !== 'pip' || !p.pipPos.value) return undefined
  return {
    left: `${p.pipPos.value.left}px`,
    top: `${p.pipPos.value.top}px`,
    right: 'auto',
    bottom: 'auto',
  }
})

// ==================== 全屏剧场（歌词/MV theater）====================
// 控件可见态：2.5s 无操作自动隐藏，可被图钉钉住
const theaterChromeVisible = ref(true)
const theaterChromePinned = ref(false)
const browserFullscreen = ref(false)
let theaterIdleTimer: ReturnType<typeof setTimeout> | undefined

// 唤醒控件并重新计时自动隐藏
function bumpTheaterChrome() {
  theaterChromeVisible.value = true
  if (theaterIdleTimer) clearTimeout(theaterIdleTimer)
  if (!p.theaterOpen.value || theaterChromePinned.value || theaterOverflowOpen.value) return
  theaterIdleTimer = setTimeout(() => {
    if (p.theaterOpen.value && !theaterChromePinned.value && !theaterOverflowOpen.value) {
      theaterChromeVisible.value = false
    }
  }, 2500)
}

// 手动切换控件显隐（H 键同款）；隐藏时图钉置反实现「钉住」语义
function toggleTheaterChrome() {
  theaterChromePinned.value = !theaterChromeVisible.value
  theaterChromeVisible.value = !theaterChromeVisible.value
  if (theaterChromeVisible.value) bumpTheaterChrome()
}

// 浏览器（系统）全屏：对根节点 requestFullscreen，失败给出提示
async function toggleBrowserFullscreen() {
  const root = rootRef.value
  if (!root) return
  try {
    if (!document.fullscreenElement) {
      await root.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  } catch {
    p.showToast('浏览器全屏不可用')
  }
}

function onFullscreenChange() {
  browserFullscreen.value = document.fullscreenElement === rootRef.value
}

// 剧场快捷键：H 显隐控件、F 系统全屏（输入框聚焦时不响应）
function onTheaterKeydown(e: KeyboardEvent) {
  if (!p.theaterOpen.value) return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  const key = e.key.toLowerCase()
  if (key === 'h') {
    e.preventDefault()
    toggleTheaterChrome()
  } else if (key === 'f') {
    e.preventDefault()
    void toggleBrowserFullscreen()
  }
}

// 剧场开合：打开时唤醒控件，关闭时收起菜单、退出系统全屏
watch(
  () => p.theaterOpen.value,
  (open) => {
    if (open) {
      theaterChromePinned.value = false
      closeTheaterOverflow()
      bumpTheaterChrome()
    } else {
      theaterChromeVisible.value = true
      closeTheaterOverflow()
      if (theaterIdleTimer) clearTimeout(theaterIdleTimer)
      if (document.fullscreenElement === rootRef.value) {
        void document.exitFullscreen().catch(() => {})
      }
    }
  },
)

// 控件隐藏时联动收起溢出菜单
watch(theaterChromeVisible, (visible) => {
  if (!visible) closeTheaterOverflow()
})

// 自动画中画：舞台播放且设置开启但 MV 未开时尝试自动开启
watch(
  () => [p.isPlaying.value, p.view.value, p.mvEnabled.value, p.currentId.value] as const,
  ([playing, view]) => {
    if (playing && view === 'stage' && p.mvEnabled.value && p.mvMode.value === 'off') {
      void p.maybeAutoPip()
    }
  },
)

// 拖动进度条：seek 后立刻把 MV 也校到新位置；音量滑条直接写回
function onSeekInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  p.seekTo(v / 100)
  nextTick(() => syncMvClock(true))
}

function onVolumeInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  p.setVolume(v / 100)
}

// 返回上一页；无历史（如独立窗口直达）则回首页
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

// 申请桌面通知权限（切歌/下载完成提示用）
function requestNotificationPermission() {
  if (typeof Notification === 'undefined') {
    p.showToast('当前浏览器不支持桌面通知')
    return
  }
  if (Notification.permission === 'granted') {
    p.showToast('桌面通知已开启')
    return
  }
  void Notification.requestPermission().then((perm) => {
    p.showToast(perm === 'granted' ? '桌面通知已开启' : '通知权限被拒绝')
  })
}

onMounted(() => {
  // 锁定页面滚动（音乐房间是全屏应用），并注册全局监听
  document.documentElement.classList.add('music-room-lock')
  document.body.classList.add('music-room-lock')
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('keydown', onTheaterKeydown)
  fineHoverMq = window.matchMedia('(hover: hover) and (pointer: fine)')
  syncFineHover()
  fineHoverMq.addEventListener('change', syncFineHover)
  void nextTick(() => syncLyricScroll(true))
})

onUnmounted(() => {
  // 解锁滚动、移除全部监听并清理定时器/动画帧
  document.documentElement.classList.remove('music-room-lock')
  document.body.classList.remove('music-room-lock')
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('keydown', onTheaterKeydown)
  fineHoverMq?.removeEventListener('change', syncFineHover)
  clearHoverTimers()
  window.clearTimeout(heartPopTimer)
  if (theaterIdleTimer) clearTimeout(theaterIdleTimer)
  stopMvSyncLoop()
  unbindStageDock()
})
</script>

<template>
  <div
    ref="rootRef"
    class="music-room-root"
    :class="{ 'is-pip-over-stage': pipOverStage }"
    :data-stage="p.stageVariant.value"
    :data-font="p.fontPreset.value"
    :data-lyric-size="p.lyricSize.value"
    :data-theater-view="p.theaterView.value"
    :data-mode="p.roomMode.value"
    :data-slide="p.roomBg.value === 'anime' ? 'on' : 'off'"
    :style="roomStyle"
  >
    <!-- 场景背景层：设计天空 + 可选动漫轮播（双层交叉淡入）+ 色调/幕布罩 -->
    <div class="pulse-scene" aria-hidden="true">
      <div class="pulse-sky">
        <div class="pulse-sky-wash" />
        <div class="pulse-sky-moon" />
        <i class="pulse-sky-dot" style="left:18%;top:16%" />
        <i class="pulse-sky-dot" style="left:32%;top:24%" />
        <i class="pulse-sky-dot" style="left:22%;top:38%" />
        <div class="pulse-sky-sash">
          <span /><span /><span />
        </div>
        <div class="pulse-sky-grain" />
      </div>
      <img v-if="hasImages && layerA" class="pulse-slide" :class="{ 'is-on': activeLayer === 'a' }" :src="layerA" alt="" />
      <img v-if="hasImages && layerB" class="pulse-slide" :class="{ 'is-on': activeLayer === 'b' }" :src="layerB" alt="" />
      <div class="pulse-tint" />
      <div class="pulse-veil" />
    </div>
    <!-- 应用主体：左导航 rail + 中部 workspace + 底部播放条 -->
    <div class="pulse-app" :class="{ 'is-playing': p.isPlaying.value }">
      <!-- 左侧导航 rail：自动收起模式下收成图标条，点击 01 展开 -->
      <aside
        class="rail"
        :class="{ 'is-expanded': railExpanded || !p.railAutoCollapse.value }"
        aria-label="播放器主导航"
        :aria-expanded="railExpanded || !p.railAutoCollapse.value"
      >
        <div class="brand">
          <button
            class="brand-index"
            type="button"
            :aria-label="p.railAutoCollapse.value ? '展开导航' : 'listen'"
            :tabindex="p.railAutoCollapse.value ? 0 : -1"
            @click="toggleRailExpanded"
          >01</button>
          <div class="brand-copy">
            <strong>listen</strong>
            <span>NIGHT ROOM</span>
          </div>
        </div>

        <div class="rail-label">NIGHT ROOM</div>
        <nav class="nav">
          <button
            v-for="item in navItems"
            :key="item.view"
            class="nav-button"
            :class="{ 'is-active': navActive(item.view) }"
            type="button"
            @click="onNavClick(item.view)"
          >
            <component :is="item.icon" class="nav-icon" :size="18" :stroke-width="2" aria-hidden="true" />
            <span class="nav-copy">{{ item.label }}</span>
            <span class="nav-key">{{ item.key }}</span>
          </button>
        </nav>

        <div class="rail-bottom">
          <div class="prototype-card">
            <strong>NIGHT ROOM</strong>
            <p>默认是设计天空。设置里可开动漫轮播，并单独调模糊、幕布和强调色。</p>
          </div>
        </div>
      </aside>

      <main class="workspace">
        <!-- 顶栏：当前视图标题 + 日夜切换 + 沉浸/通知/返回 + 搜索入口 -->
        <header class="topbar">
          <div class="route">
            <small>{{ p.viewMeta.value.code }}</small>
            <strong>{{ p.viewMeta.value.title }}</strong>
          </div>
          <div class="top-spacer" />
          <div class="modes" role="group" aria-label="日夜">
            <button type="button" :class="{ 'is-on': p.roomMode.value === 'day' }" @click="p.setRoomMode('day')">日间</button>
            <button type="button" :class="{ 'is-on': p.roomMode.value === 'night' }" @click="p.setRoomMode('night')">夜间</button>
          </div>
          <button
            class="top-action"
            type="button"
            :class="{ 'is-on': p.immersive.value }"
            :aria-label="p.immersive.value ? '退出沉浸模式' : '沉浸模式'"
            :title="p.immersive.value ? '退出沉浸（I）' : '沉浸模式（I）'"
            @click="p.toggleImmersive()"
          >
            <Maximize2 :size="13" :stroke-width="2" aria-hidden="true" />
            沉浸
          </button>
          <button
            class="top-action"
            type="button"
            aria-label="开启桌面通知"
            title="开启切歌/下载完成桌面通知"
            @click="requestNotificationPermission()"
          >
            <Bell :size="13" :stroke-width="2" aria-hidden="true" />
            通知
          </button>
          <button v-if="!standaloneMode" class="pulse-back pulse-back--top" type="button" aria-label="返回" @click="goBack">
            <ChevronLeft :size="16" :stroke-width="2.2" aria-hidden="true" />
            返回
          </button>
          <span class="status-chip"><i aria-hidden="true" />{{ p.isPlaying.value ? 'NOW PLAYING' : 'READY' }} / LIVE</span>
          <button class="top-action" type="button" aria-label="打开搜索" @click="p.switchView('search')">
            <Search :size="14" :stroke-width="2" aria-hidden="true" />
            SEARCH <span aria-hidden="true">{{ searchShortcut }}</span>
          </button>
        </header>

        <!-- 各功能视图（同一时刻只显示一个）+ 歌曲详情抽屉 -->
        <div class="canvas">
          <PulseStageView :p="p" />
          <PulseDiscoverView :p="p" :discover="discover" />
          <PulseSearchView :p="p" :discover="discover" :search-shortcut="searchShortcut" />
          <PulseLibraryView :p="p" />
          <PulseFilesView :p="p" />
          <PulsePlaylistsView :p="p" />
          <PulseSettingsView :p="p" :netease="netease" />
          <PulseSongDetailDrawer :p="p" />
        </div>

        <!-- 未登录提示条：引导去设置页登录网易云 -->
        <button
          v-if="p.view.value === 'discover' && !netease.isLoggedIn.value"
          class="login-banner"
          type="button"
          @click="p.switchView('settings')"
        >
          <span class="login-banner-mark" aria-hidden="true">♪</span>
          <span class="login-banner-copy"
            ><strong>登录网易云</strong><small>解锁每日推荐更准、云端歌单与更高音质</small></span
          >
          <span class="login-banner-cta">去登录 →</span>
        </button>
      </main>

      <!-- 底部播放控制条：当前曲目/收藏 | 走带控制+进度 | 队列/均衡器/MV/下载/迷你/音量 -->
      <footer class="player" aria-label="播放器控制">
        <div class="player-now">
          <button class="now-open" type="button" aria-label="打开全屏歌词" @click="p.openTheater()">
            <span v-if="p.currentCover.value" class="track-cover" aria-hidden="true">
              <img :src="p.currentCover.value" alt="" @error="applyCoverFallback" />
            </span>
            <span v-else class="demo-cover" aria-hidden="true" />
            <div class="now-copy">
              <strong>{{ p.currentTrack.value?.title || '尚未选择曲目' }}</strong>
              <small>{{ p.currentTrack.value?.artist || '搜索或导入后开始播放' }}</small>
            </div>
          </button>
          <button
            class="icon-button"
            :class="{ 'is-active': p.currentTrack.value?.favorite, 'is-pop': heartPop }"
            data-fx="heart"
            type="button"
            :aria-label="p.currentTrack.value?.favorite ? '取消收藏' : '收藏'"
            @click="onFavoriteClick"
          >
            <Heart :size="17" :stroke-width="2" :fill="p.currentTrack.value?.favorite ? 'currentColor' : 'none'" />
          </button>
        </div>

        <div class="player-core">
          <div class="transport">
            <button class="icon-button" :class="{ 'is-active': p.shuffle.value }" data-fx="shuffle" type="button" aria-label="随机播放" @click="p.toggleShuffle()">
              <Shuffle :size="17" :stroke-width="2" />
            </button>
            <button class="icon-button" data-fx="prev" type="button" aria-label="上一首" @click="p.prevTrack()">
              <SkipBack :size="18" :stroke-width="2" />
            </button>
            <button class="icon-button play-button" data-fx="play" :class="{ 'is-playing': p.isPlaying.value }" type="button" :aria-label="p.isPlaying.value ? '暂停' : '播放'" @click="p.togglePlay()">
              <Pause v-if="p.isPlaying.value" :size="20" :stroke-width="2" />
              <Play v-else :size="20" :stroke-width="2" />
            </button>
            <button class="icon-button" data-fx="next" type="button" aria-label="下一首" @click="p.nextTrack()">
              <SkipForward :size="18" :stroke-width="2" />
            </button>
            <button
              class="icon-button"
              data-fx="repeat"
              :class="{ 'is-active': p.repeat.value > 0 }"
              type="button"
              :aria-label="p.repeat.value === 2 ? '单曲循环' : p.repeat.value === 1 ? '列表循环' : '循环关闭'"
              @click="p.cycleRepeat()"
            >
              <Repeat1 v-if="p.repeat.value === 2" :size="17" :stroke-width="2" />
              <Repeat v-else :size="17" :stroke-width="2" />
              <span class="repeat-badge">{{ p.repeat.value === 0 ? '关' : p.repeat.value === 1 ? '列' : '单' }}</span>
            </button>
          </div>

          <div class="progress">
            <span class="timecode">{{ p.formatTime(p.currentTime.value) }}</span>
            <label class="sr-only" for="pulseSeek">播放进度</label>
            <input
              id="pulseSeek"
              class="range"
              type="range"
              min="0"
              max="100"
              :value="seekValue"
              :style="{ '--value': seekValue + '%' }"
              @input="onSeekInput"
            />
            <span class="timecode">{{ p.formatTime(p.duration.value || p.currentTrack.value?.duration || 0) }}</span>
          </div>
        </div>

        <div class="player-tools">
          <div class="player-tools-wide">
            <button
              class="icon-button"
              data-fx="queue"
              type="button"
              aria-label="播放队列"
              @mouseenter="onDrawerEnter"
              @mouseleave="onDrawerLeave"
              @click="p.openDrawer('queue')"
            >
              <ListMusic :size="17" :stroke-width="2" />
            </button>
            <button class="icon-button" data-fx="eq" type="button" aria-label="均衡器" @click="p.switchView('audio')">
              <SlidersHorizontal :size="17" :stroke-width="2" />
            </button>
            <button
              v-if="p.hasMv.value"
              class="icon-button"
              data-fx="mv"
              type="button"
              :aria-label="p.mvMode.value === 'off' ? '播放 MV' : '关闭 MV'"
              :disabled="p.mvLoading.value"
              @click="p.mvMode.value === 'off' ? p.openMvPip() : p.closeMv()"
            >
              <Video :size="17" :stroke-width="2" />
            </button>
            <button
              v-if="p.canDownloadTrack(p.currentTrack.value)"
              class="icon-button"
              data-fx="download"
              type="button"
              aria-label="下载到本地"
              :disabled="p.downloadBusy.value"
              @click="p.openDownloadPrompt(p.currentTrack.value)"
            >
              <Download :size="17" :stroke-width="2" />
            </button>
            <button class="icon-button" data-fx="mini" type="button" aria-label="迷你播放器" @click="p.toggleMini()">
              <Minimize2 :size="17" :stroke-width="2" />
            </button>
            <div class="volume">
              <button class="icon-button" data-fx="volume" type="button" :aria-label="p.muted.value ? '取消静音' : '静音'" @click="p.toggleMute()">
                <VolumeX v-if="p.muted.value" :size="17" :stroke-width="2" />
                <Volume2 v-else :size="17" :stroke-width="2" />
              </button>
              <label class="sr-only" for="pulseVolume">音量</label>
              <input
                id="pulseVolume"
                class="range"
                type="range"
                min="0"
                max="100"
                :value="volumeValue"
                :style="{ '--value': volumeValue + '%' }"
                @input="onVolumeInput"
              />
            </div>
          </div>
          <div
            class="player-overflow-wrap"
            @mouseenter="onToolsEnter"
            @mouseleave="onToolsLeave"
          >
            <button
              class="icon-button player-overflow-trigger"
              data-fx="more"
              type="button"
              aria-label="更多控制"
              :aria-expanded="toolsOpen"
              @click="toggleTools"
            >
              <MoreHorizontal :size="17" :stroke-width="2" />
            </button>
            <button
              v-if="toolsOpen && toolsPinned"
              class="player-overflow-scrim"
              type="button"
              tabindex="-1"
              aria-label="关闭更多控制"
              @click="closeTools"
            />
            <div class="player-overflow" role="menu" :class="{ 'is-open': toolsOpen }">
              <button type="button" role="menuitem" @click="onTool(() => p.openTheater())">
                <Maximize2 :size="16" :stroke-width="2" /> 全屏歌词
              </button>
              <button
                type="button"
                role="menuitem"
                @mouseenter="onDrawerEnter"
                @mouseleave="onDrawerLeave"
                @click="onTool(() => p.openDrawer('queue'))"
              >
                <ListMusic :size="16" :stroke-width="2" /> 播放队列
              </button>
              <button type="button" role="menuitem" @click="onTool(() => p.switchView('audio'))">
                <SlidersHorizontal :size="16" :stroke-width="2" /> 均衡器
              </button>
              <button
                v-if="p.hasMv.value"
                type="button"
                role="menuitem"
                :disabled="p.mvLoading.value"
                @click="onTool(() => (p.mvMode.value === 'off' ? p.openMvPip() : p.closeMv()))"
              >
                <Video :size="16" :stroke-width="2" />
                {{ p.mvMode.value === 'off' ? '播放 MV' : '关闭 MV' }}
              </button>
              <button
                v-if="p.canDownloadTrack(p.currentTrack.value)"
                type="button"
                role="menuitem"
                :disabled="p.downloadBusy.value"
                @click="onTool(() => p.openDownloadPrompt(p.currentTrack.value))"
              >
                <Download :size="16" :stroke-width="2" /> 下载到本地
              </button>
              <button type="button" role="menuitem" @click="onTool(() => p.toggleMini())">
                <Minimize2 :size="16" :stroke-width="2" /> 迷你播放器
              </button>
              <button type="button" role="menuitem" @click="onTool(() => p.switchView('settings'))">
                <Settings :size="16" :stroke-width="2" /> 设置
              </button>
              <div class="volume">
                <button class="icon-button" data-fx="volume" type="button" :aria-label="p.muted.value ? '取消静音' : '静音'" @click="p.toggleMute()">
                  <VolumeX v-if="p.muted.value" :size="17" :stroke-width="2" />
                  <Volume2 v-else :size="17" :stroke-width="2" />
                </button>
                <label class="sr-only" for="pulseVolumeOverflow">音量</label>
                <input
                  id="pulseVolumeOverflow"
                  class="range"
                  type="range"
                  min="0"
                  max="100"
                  :value="volumeValue"
                  :style="{ '--value': volumeValue + '%' }"
                  @input="onVolumeInput"
                />
              </div>
            </div>
          </div>
        </div>
      </footer>

      <!-- 移动端底部 tab 导航（替代侧栏） -->
      <nav class="pulse-tabs" aria-label="移动导航">
        <button
          v-for="tab in tabItems"
          :key="tab.view"
          class="pulse-tab"
          :class="{ 'is-active': navActive(tab.view) || (tab.view === 'search' && p.view.value === 'search') }"
          type="button"
          @click="p.switchView(tab.view)"
        >
          <component :is="tab.icon" :size="18" :stroke-width="2" aria-hidden="true" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </div>

      <!-- 队列抽屉：边缘窥视按钮 + 遮罩；抽屉内含队列（可拖拽排序）与同步歌词两个页签 -->
      <button
        class="drawer-peek"
        type="button"
        aria-label="打开播放队列"
        @mouseenter="onDrawerEnter"
        @mouseleave="onDrawerLeave"
        @click="p.openDrawer('queue')"
      >
        <ListMusic :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button class="drawer-scrim" type="button" tabindex="-1" aria-label="关闭侧边抽屉" @click="p.closeDrawer()" />
      <aside
        class="global-drawer"
        role="dialog"
        :aria-modal="p.drawerPinned.value"
        :aria-hidden="!p.drawerOpen.value"
        @mouseenter="onDrawerEnter"
        @mouseleave="onDrawerLeave"
      >
        <header class="drawer-heading">
          <strong>{{ p.drawerTab.value === 'queue' ? 'QUEUE / CONTEXT' : 'LYRICS / 辅助' }}</strong>
          <div class="drawer-heading-actions">
            <button
              class="icon-button"
              data-fx="pin"
              type="button"
              :class="{ 'is-active': p.drawerPinned.value }"
              :aria-label="p.drawerPinned.value ? '取消钉住' : '钉住抽屉'"
              :aria-pressed="p.drawerPinned.value"
              @click="p.toggleDrawerPin()"
            >
              <Pin :size="17" :stroke-width="2" />
            </button>
            <button class="icon-button" type="button" aria-label="关闭抽屉" @click="p.closeDrawer()">
              <X :size="17" :stroke-width="2" />
            </button>
          </div>
        </header>
        <div class="drawer-tabs" role="tablist">
          <button class="drawer-tab" :class="{ 'is-active': p.drawerTab.value === 'queue' }" type="button" @click="p.drawerTab.value = 'queue'">播放队列</button>
          <button class="drawer-tab" :class="{ 'is-active': p.drawerTab.value === 'lyrics' }" type="button" @click="p.drawerTab.value = 'lyrics'">同步歌词</button>
        </div>
        <div class="drawer-content">
          <div v-show="p.drawerTab.value === 'queue'" class="drawer-pane is-active">
            <div class="queue-list">
              <div
                v-for="(track, i) in p.queueTracks.value"
                :key="track.id"
                class="queue-item"
                :class="{ 'is-current': track.id === p.currentId.value, 'is-dragging': queueDragFrom === i }"
                draggable="true"
                @dragstart="onQueueDragStart(i, $event)"
                @dragover="onQueueDragOver"
                @drop.prevent="onQueueDrop(i)"
                @dragend="queueDragFrom = null"
              >
                <button type="button" class="result-main" @click="p.playTrack(track.id)">
                  <span>{{ String(i + 1).padStart(2, '0') }}</span>
                  <span class="queue-copy"><strong>{{ track.shortTitle }}</strong><small>{{ track.artist }}</small></span>
                  <span class="duration">{{ p.formatTime(track.duration) }}</span>
                </button>
                <span class="result-actions">
                  <button
                    v-if="p.canDownloadTrack(track)"
                    class="icon-button"
                    data-fx="download"
                    type="button"
                    aria-label="下载到本地"
                    :disabled="p.downloadBusy.value"
                    @click="p.openDownloadPrompt(track)"
                  >
                    <Download :size="16" :stroke-width="2" />
                  </button>
                  <button class="icon-button" data-fx="remove" type="button" aria-label="移出队列" @click="p.removeFromQueue(track.id)">
                    <X :size="16" :stroke-width="2" />
                  </button>
                </span>
              </div>
            </div>
          </div>
          <div v-show="p.drawerTab.value === 'lyrics'" class="drawer-pane is-active">
            <p class="drawer-lyric-hint">日常歌词在舞台右栏；沉浸请用全屏。点行仍可跳转。</p>
            <div
              ref="drawerLyricRef"
              class="drawer-lyric"
              @wheel="markLyricUserScroll"
              @touchstart.passive="markLyricUserScroll"
            >
              <p
                v-for="(line, i) in p.lyricDisplayLines.value"
                :key="`${line.time}-${i}`"
                class="drawer-lyric-line"
                :class="lyricToneClass(i)"
                @click="onLyricLineClick(i)"
              >
                <span class="lyric-line-text">{{ line.text }}</span>
                <small v-if="line.translation" class="lyric-sub">{{ line.translation }}</small>
              </p>
            </div>
          </div>
        </div>
        <footer class="drawer-foot">
          <button class="action-button" type="button" @click="p.clearQueue()">清空队列</button>
          <button class="action-button primary" type="button" @click="p.openTheater()">全屏歌词</button>
        </footer>
      </aside>

      <!-- 迷你播放器（迷你模式下的常驻小条） -->
      <aside class="mini-player" aria-label="迷你播放器">
        <span v-if="p.currentCover.value" class="track-cover" aria-hidden="true">
          <img :src="p.currentCover.value" alt="" @error="applyCoverFallback" />
        </span>
        <span v-else class="demo-cover" aria-hidden="true" />
        <div class="now-copy">
          <strong>{{ p.currentTrack.value?.shortTitle || '—' }}</strong>
          <small>{{ p.currentTrack.value?.artist || '—' }}</small>
        </div>
        <div class="mini-controls">
          <button class="icon-button" data-fx="prev" type="button" aria-label="上一首" @click="p.prevTrack()">
            <SkipBack :size="17" :stroke-width="2" />
          </button>
          <button class="icon-button play-button" data-fx="play" :class="{ 'is-playing': p.isPlaying.value }" type="button" @click="p.togglePlay()">
            <Pause v-if="p.isPlaying.value" :size="18" :stroke-width="2" />
            <Play v-else :size="18" :stroke-width="2" />
          </button>
          <button class="icon-button" data-fx="next" type="button" aria-label="下一首" @click="p.nextTrack()">
            <SkipForward :size="17" :stroke-width="2" />
          </button>
          <button class="icon-button" data-fx="close" type="button" aria-label="退出迷你模式" @click="p.toggleMini()">
            <X :size="16" :stroke-width="2" />
          </button>
        </div>
      </aside>

      <!-- MV 图层：pip 小窗（可拖拽/双击复位） / stage 停靠舞台 / theater 全屏铺底；下方附相关 MV 横滑列表 -->
      <div
        ref="mvPipLayerRef"
        class="pulse-mv-layer"
        :class="{
          'is-pip': p.mvMode.value === 'pip',
          'is-stage': p.mvMode.value === 'stage',
          'is-theater': p.mvMode.value === 'theater',
          'is-ready': p.mvReady.value,
          'is-loading': p.mvLoading.value,
          'is-dragging': pipDragging,
        }"
        :style="pipLayerStyle"
        v-show="p.mvActive.value && (p.mvMode.value !== 'stage' || !!stageDockRect)"
        aria-hidden="true"
        @click.stop
        @pointerdown="onPipPointerDown"
        @pointermove="onPipPointerMove"
        @pointerup="onPipPointerUp"
        @pointercancel="onPipPointerUp"
      >
        <video
          ref="mvVideoRef"
          class="pulse-mv-video"
          playsinline
          preload="auto"
          referrerpolicy="no-referrer"
          @loadeddata="onMvLoaded"
          @error="onMvError"
          @timeupdate="onMvTimeUpdate"
          @ended="onMvEnded"
        />
        <div
          v-if="p.mvMode.value === 'pip'"
          class="pulse-mv-pip-chrome"
          @dblclick="onPipChromeDblClick"
        >
          <span class="pip-label">{{ p.mvLoading.value ? 'MV…' : p.mvOriginalAudio.value ? 'MV 原声' : 'MV PIP · 拖到舞台' }}</span>
          <div class="pip-actions">
            <button class="theater-chip" type="button" @click="onToggleMvOriginalAudio">
              {{ p.mvOriginalAudio.value ? '回音频' : '原声' }}
            </button>
            <button class="theater-chip" type="button" @click="onExpandMv">放大</button>
            <button class="icon-button" type="button" aria-label="关闭画中画" @click="p.closeMv()">
              <X :size="16" :stroke-width="2" />
            </button>
          </div>
        </div>
        <div
          v-if="p.mvMode.value === 'stage'"
          class="pulse-mv-pip-chrome pulse-mv-pip-chrome--stage"
        >
          <span class="pip-label">{{ p.mvLoading.value ? 'MV…' : '舞台 MV' }}</span>
          <div class="pip-actions">
            <button class="theater-chip" type="button" @click="onToggleMvOriginalAudio">
              {{ p.mvOriginalAudio.value ? '回音频' : '原声' }}
            </button>
            <button class="theater-chip" type="button" @click="p.undockMvToPip()">小窗</button>
            <button class="theater-chip" type="button" @click="onExpandMv">放大</button>
            <button class="icon-button" type="button" aria-label="关闭 MV" @click="p.closeMv()">
              <X :size="16" :stroke-width="2" />
            </button>
          </div>
        </div>
        <div
          v-if="p.mvMode.value === 'pip' && p.showRelatedMvs.value && (p.relatedMvs.value.length || p.relatedMvLoading.value)"
          class="pulse-mv-related pulse-mv-related--pip"
        >
          <span class="related-kicker">{{ p.relatedMvLoading.value ? '相关…' : '相关 MV' }}</span>
          <div class="related-scroller">
            <button
              v-for="item in p.relatedMvs.value"
              :key="item.id"
              class="related-mv-card"
              type="button"
              :class="{ 'is-active': item.id === (p.mvOverrideId.value || p.currentTrack.value?.mvId) }"
              @click="p.selectRelatedMv(item)"
            >
              <img v-if="item.coverUrl" :src="item.coverUrl" alt="" referrerpolicy="no-referrer" @error="applyCoverFallback" />
              <span>{{ item.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 全屏剧场：封面氛围背景 + 顶部元信息/操作 + 同步歌词流 + 底部进度与走带 -->
      <div
        class="lyrics-theater"
        :class="{
          'is-open': p.theaterOpen.value,
          'mv-on': p.mvMode.value === 'theater' && !!p.mvUrl.value,
          'mv-ready': p.mvMode.value === 'theater' && p.mvReady.value,
          'chrome-hidden': p.theaterOpen.value && !theaterChromeVisible,
        }"
        role="dialog"
        aria-modal="true"
        :aria-hidden="!p.theaterOpen.value"
        @mousemove="bumpTheaterChrome"
        @pointerdown="bumpTheaterChrome"
      >
        <div class="theater-bg" aria-hidden="true">
          <div
            class="theater-fallback"
            :style="p.currentCover.value ? { '--theater-cover': `url(${p.currentCover.value})` } : undefined"
          />
          <div class="theater-veil" />
          <div class="theater-grain" />
        </div>
        <header class="theater-top theater-chrome">
          <div class="theater-meta">
            <small>{{ p.mvMode.value === 'theater' ? 'MV THEATER' : 'LYRICS THEATER' }}</small>
            <strong>{{ p.currentTrack.value?.title || '—' }}</strong>
            <span>{{ p.currentTrack.value?.artist || '—' }}</span>
          </div>
          <div class="theater-actions">
            <button
              v-if="p.canShowLyricTranslation.value"
              class="theater-chip"
              type="button"
              :class="{ 'is-active': p.showLyricTranslation.value }"
              @click="p.toggleLyricTranslation()"
            >
              {{ p.showLyricTranslation.value ? '翻译开' : '翻译关' }}
            </button>
            <div class="theater-overflow-wrap">
              <button
                class="icon-button theater-overflow-trigger"
                type="button"
                aria-label="更多剧场选项"
                :aria-expanded="theaterOverflowOpen"
                @click.stop="toggleTheaterOverflow()"
              >
                <MoreHorizontal :size="18" :stroke-width="2" />
              </button>
              <button
                v-if="theaterOverflowOpen"
                class="theater-overflow-scrim"
                type="button"
                tabindex="-1"
                aria-label="关闭更多选项"
                @click="closeTheaterOverflow()"
              />
              <div class="theater-overflow" role="menu" :class="{ 'is-open': theaterOverflowOpen }" @click.stop>
                <button
                  type="button"
                  role="menuitem"
                  :disabled="p.mvLoading.value"
                  @click="p.toggleTheaterMv()"
                >
                  {{ p.mvLoading.value ? 'MV 加载中' : p.mvMode.value === 'theater' ? '关闭 MV' : '开启 MV' }}
                </button>
                <button
                  v-if="p.mvMode.value === 'theater'"
                  type="button"
                  role="menuitem"
                  @click="onToggleMvOriginalAudio"
                >
                  {{ p.mvOriginalAudio.value ? '回音频主控' : 'MV 原声' }}
                </button>
                <span class="theater-overflow-label">字号</span>
                <div class="theater-overflow-group" role="group" aria-label="歌词字号">
                  <button
                    v-for="size in (['md', 'large', 'xlarge'] as const)"
                    :key="size"
                    class="theater-chip"
                    type="button"
                    :class="{ 'is-active': p.lyricSize.value === size }"
                    @click="p.setLyricSize(size)"
                  >
                    {{ size === 'md' ? '字' : size === 'large' ? '大' : '特' }}
                  </button>
                </div>
                <span class="theater-overflow-label">观感</span>
                <div class="theater-overflow-group" role="group" aria-label="观感">
                  <button
                    v-for="view in (['mv', 'balanced', 'lyrics'] as const)"
                    :key="view"
                    class="theater-chip"
                    type="button"
                    :class="{ 'is-active': p.theaterView.value === view }"
                    @click="p.setTheaterView(view)"
                  >
                    {{ view === 'mv' ? 'MV' : view === 'balanced' ? '均衡' : '歌词' }}
                  </button>
                </div>
                <template v-if="p.mvMode.value === 'theater'">
                  <span class="theater-overflow-label">清晰度</span>
                  <div class="theater-overflow-group" role="group" aria-label="清晰度">
                    <button
                      v-for="q in [1080, 720, 480] as const"
                      :key="q"
                      class="theater-chip"
                      type="button"
                      :class="{ 'is-active': p.mvQuality.value === q }"
                      @click="p.setMvQuality(q)"
                    >
                      {{ q }}p
                    </button>
                  </div>
                </template>
              </div>
            </div>
            <button class="theater-chip" type="button" @click="p.collapseTheater()">收起</button>
            <button class="theater-chip" type="button" :class="{ 'is-active': browserFullscreen }" @click="toggleBrowserFullscreen">
              {{ browserFullscreen ? '退出全屏' : '系统全屏' }}
            </button>
            <button class="icon-button" type="button" aria-label="关闭全屏" @click="p.dismissTheater()">
              <X :size="18" :stroke-width="2" />
            </button>
          </div>
        </header>
        <div
          v-if="p.mvMode.value === 'theater' && p.showRelatedMvs.value && (p.relatedMvs.value.length || p.relatedMvLoading.value)"
          class="pulse-mv-related pulse-mv-related--theater theater-chrome"
        >
          <span class="related-kicker">{{ p.relatedMvLoading.value ? '相关…' : '相关 MV' }}</span>
          <div class="related-scroller">
            <button
              v-for="item in p.relatedMvs.value"
              :key="item.id"
              class="related-mv-card"
              type="button"
              :class="{ 'is-active': item.id === (p.mvOverrideId.value || p.currentTrack.value?.mvId) }"
              @click="p.selectRelatedMv(item)"
            >
              <img v-if="item.coverUrl" :src="item.coverUrl" alt="" referrerpolicy="no-referrer" @error="applyCoverFallback" />
              <span>{{ item.name }}</span>
            </button>
          </div>
        </div>
        <div class="theater-lyrics">
          <div
            ref="theaterFlowRef"
            class="theater-flow"
            aria-label="全屏同步歌词"
            @wheel="markLyricUserScroll"
            @touchstart.passive="markLyricUserScroll"
          >
            <button
              v-for="(line, i) in p.lyricDisplayLines.value"
              :key="`${line.time}-${i}`"
              class="theater-lyric"
              :class="lyricToneClass(i)"
              type="button"
              @click="onLyricLineClick(i)"
            >
              <span class="lyric-line-text">{{ line.text }}</span>
              <small v-if="line.translation" class="lyric-sub">{{ line.translation }}</small>
            </button>
            <p v-if="!p.lyricDisplayLines.value.length" class="theater-empty">暂无歌词</p>
          </div>
        </div>
        <footer class="theater-dock">
          <div class="theater-progress">
            <span class="timecode">{{ p.formatTime(p.currentTime.value) }}</span>
            <input
              class="range"
              type="range"
              min="0"
              max="100"
              :value="seekValue"
              :style="{ '--value': seekValue + '%' }"
              @input="onSeekInput"
              @pointerdown="bumpTheaterChrome"
            />
            <span class="timecode">{{ p.formatTime(p.duration.value || p.currentTrack.value?.duration || 0) }}</span>
          </div>
          <div class="theater-dock-extra theater-chrome">
            <div class="theater-transport">
              <button class="icon-button" data-fx="prev" type="button" aria-label="上一首" @click="p.prevTrack()">
                <SkipBack :size="18" :stroke-width="2" />
              </button>
              <button class="icon-button play-button" data-fx="play" :class="{ 'is-playing': p.isPlaying.value }" type="button" aria-label="播放暂停" @click="p.togglePlay()">
                <Pause v-if="p.isPlaying.value" :size="20" :stroke-width="2" />
                <Play v-else :size="20" :stroke-width="2" />
              </button>
              <button class="icon-button" data-fx="next" type="button" aria-label="下一首" @click="p.nextTrack()">
                <SkipForward :size="18" :stroke-width="2" />
              </button>
              <button
                class="icon-button"
                data-fx="shuffle"
                type="button"
                :class="{ 'is-active': p.shuffle.value }"
                aria-label="随机"
                @click="p.toggleShuffle()"
              >
                <Shuffle :size="16" :stroke-width="2" />
              </button>
              <button
                class="icon-button"
                data-fx="repeat"
                type="button"
                :class="{ 'is-active': p.repeat.value > 0 }"
                :aria-label="p.repeat.value === 2 ? '单曲循环' : p.repeat.value === 1 ? '列表循环' : '循环关闭'"
                @click="p.cycleRepeat()"
              >
                <Repeat1 v-if="p.repeat.value === 2" :size="16" :stroke-width="2" />
                <Repeat v-else :size="16" :stroke-width="2" />
                <span class="repeat-badge">{{ p.repeat.value === 0 ? '关' : p.repeat.value === 1 ? '列' : '单' }}</span>
              </button>
              <button
                class="icon-button"
                data-fx="heart"
                type="button"
                :class="{ 'is-active': p.currentTrack.value?.favorite, 'is-pop': heartPop }"
                aria-label="收藏"
                @click="onFavoriteClick"
              >
                <Heart :size="16" :stroke-width="2" :fill="p.currentTrack.value?.favorite ? 'currentColor' : 'none'" />
              </button>
              <button class="icon-button" data-fx="volume" type="button" aria-label="静音" @click="p.toggleMute()">
                <VolumeX v-if="p.muted.value" :size="16" :stroke-width="2" />
                <Volume2 v-else :size="16" :stroke-width="2" />
              </button>
              <input
                class="theater-volume range"
                type="range"
                min="0"
                max="100"
                :value="Math.round(p.volume.value * 100)"
                :style="{ '--value': Math.round(p.volume.value * 100) + '%' }"
                aria-label="音量"
                @input="p.setVolume(Number(($event.target as HTMLInputElement).value) / 100)"
              />
            </div>
            <button
              v-if="p.upNextTrack.value"
              class="theater-upnext"
              type="button"
              @click="p.playTrack(p.upNextTrack.value.id)"
            >
              <span>下一首</span>
              <strong>{{ p.upNextTrack.value.shortTitle }}</strong>
              <small>{{ p.upNextTrack.value.artist }}</small>
            </button>
            <p class="theater-credit">
              {{
                p.mvMode.value === 'theater'
                  ? (p.mvOriginalAudio.value ? 'MV 原声；' : 'MV 静音跟音频；')
                  : '封面氛围；'
              }}
              H 显隐控件 · F 系统全屏 · ←→ 快进退
            </p>
          </div>
        </footer>
      </div>

      <!-- 下载弹窗：可选歌词/MV 的保存开关、分阶段进度与失败汇总 -->
      <div
        v-if="p.downloadPromptTracks.value.length"
        class="download-scrim"
        role="presentation"
        @click="p.downloadBusy.value ? undefined : p.closeDownloadPrompt()"
      />
      <div
        v-if="p.downloadPromptTracks.value.length"
        class="download-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="downloadSheetTitle"
        @click.stop
      >
        <header class="download-sheet-head">
          <span class="page-eyebrow">SAVE LOCAL</span>
          <h2 id="downloadSheetTitle">{{ p.downloadPromptTracks.value.length > 1 ? `下载 ${p.downloadPromptTracks.value.length} 首` : '下载到本地' }}</h2>
          <p>
            <template v-if="p.downloadPromptTracks.value.length === 1">
              {{ p.downloadPromptTrack.value?.artist }} · {{ p.downloadPromptTrack.value?.title }}
            </template>
            <template v-else>将串行保存到曲库目录，每首歌一个文件夹。</template>
          </p>
        </header>
        <div v-if="!p.downloadBusy.value" class="settings-stack">
          <div class="setting-line">
            <div>
              <strong>保存歌词</strong>
              <small>原文 lyrics.lrc，有译文再写 lyrics.trans.lrc</small>
            </div>
            <label class="switch">
              <input v-model="p.downloadIncludeLyrics.value" type="checkbox" />
              <span class="switch-ui" />
            </label>
          </div>
          <div class="setting-line">
            <div>
              <strong>同时下载 MV</strong>
              <small>
                {{
                  p.downloadPromptTracks.value.length > 1
                    ? '批量默认关闭；体积很大，仅对有官方 MV 的曲生效'
                    : p.downloadHasMv.value
                      ? '保存为同文件夹内的 video 文件'
                      : '当前曲目没有官方 MV'
                }}
              </small>
            </div>
            <label class="switch">
              <input
                v-model="p.downloadIncludeMv.value"
                type="checkbox"
                :disabled="p.downloadPromptTracks.value.length === 1 && !p.downloadHasMv.value"
              />
              <span class="switch-ui" />
            </label>
          </div>
        </div>
        <div v-else class="download-progress">
          <p>
            {{ downloadStageLabel(p.downloadProgress.value?.stage) }}
            · {{ p.downloadProgress.value?.title || '准备中' }}
          </p>
          <p class="download-progress-meta">
            {{ p.downloadProgress.value?.index || 1 }} / {{ p.downloadProgress.value?.count || p.downloadPromptTracks.value.length }}
            <template v-if="p.downloadProgress.value?.total"> · {{ downloadPercent }}%</template>
          </p>
          <div class="download-progress-track" aria-hidden="true">
            <span class="download-progress-bar" :style="{ width: (p.downloadProgress.value?.total ? downloadPercent : 18) + '%' }" />
          </div>
        </div>
        <p v-if="p.downloadFailedTitles.value.length && !p.downloadBusy.value" class="download-sheet-hint">
          失败 {{ p.downloadFailedTitles.value.length }} 首：{{ p.downloadFailedTitles.value.slice(0, 4).join('、') }}{{ p.downloadFailedTitles.value.length > 4 ? '…' : '' }}
        </p>
        <p class="download-sheet-hint">
          {{ p.downloadSinkLabel.value ? `曲库目录：${p.downloadSinkLabel.value}` : '请先在设置中选择固定曲库目录；未设置时会弹出选择。每首歌一个文件夹，含音频、封面、歌词。' }}
        </p>
        <div class="button-row">
          <button
            v-if="p.downloadBusy.value"
            class="action-button"
            type="button"
            @click="p.cancelDownload()"
          >
            取消下载
          </button>
          <button
            v-else
            class="action-button"
            type="button"
            @click="p.closeDownloadPrompt()"
          >
            关闭
          </button>
          <button
            v-if="!p.downloadBusy.value && p.downloadSinkLabel.value"
            class="action-button"
            type="button"
            @click="p.confirmDownload({ changeFolder: true })"
          >
            更换目录
          </button>
          <button
            v-if="!p.downloadBusy.value"
            class="action-button primary"
            type="button"
            @click="p.confirmDownload()"
          >
            <Download :size="14" :stroke-width="2" aria-hidden="true" />
            {{ p.downloadSinkLabel.value ? '保存到曲库目录' : '选择曲库目录并保存' }}
          </button>
        </div>
      </div>

      <!-- 全局轻提示（toast） -->
      <div class="toast" :class="{ 'is-visible': p.toastVisible.value }" role="status" aria-live="polite">
        {{ p.toastText.value }}
      </div>

      <!-- 隐藏文件选择器：本地音频文件 / 整个文件夹 / lrc 歌词，由播放器逻辑触发 -->
      <input
        class="sr-only"
        type="file"
        accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac"
        multiple
        :ref="(el) => { p.fileInputRef.value = el as HTMLInputElement | null }"
        @change="p.onFileChange"
      />
      <input
        class="sr-only"
        type="file"
        accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac"
        multiple
        webkitdirectory
        :ref="(el) => { p.folderInputRef.value = el as HTMLInputElement | null }"
        @change="p.onFileChange"
      />
      <input
        class="sr-only"
        type="file"
        accept=".lrc,text/plain"
        :ref="(el) => { p.lrcInputRef.value = el as HTMLInputElement | null }"
        @change="p.onLrcChange"
      />
  </div>
</template>
