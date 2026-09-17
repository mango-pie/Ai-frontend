<script setup lang="ts">
/**
 * 悬浮音乐播放器：提供底部停靠栏、悬浮迷你条、可拖拽缩放的展开面板三种形态
 * 整合网易云搜索、扫码登录与播放列表抽屉，并通过 openLyric 事件把歌词窗交给父组件
 */
import { ref, onMounted, onUnmounted, computed, defineComponent, h, nextTick, watch } from 'vue';
import { usePulsePlayer } from '@/composables/usePulsePlayer';
import { searchMusic, type Song } from '@/integrations/neteaseMusic';
import { useNeteaseLogin } from './useNeteaseLogin';
import { applyCoverFallback } from '@/utils/musicCover';

// ===== 对外事件 =====
// 打开歌词窗：歌词浮窗由父组件渲染，组件内只负责触发
const emit = defineEmits<{
  (e: 'openLyric'): void;
}>();

// ===== 播放器核心状态与视图聚合 =====
const p = usePulsePlayer();
// 进度条拖动中的预览值（0~1），null 表示当前未在拖动
const seekingProgress = ref<number | null>(null);

// 将播放队列、进度、音量等聚合为模板可直接使用的扁平状态
const state = computed(() => {
  const track = p.currentTrack.value;
  const queue = p.queueTracks.value;
  return {
    currentSong: track
      ? {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          coverUrl: p.coverOf(track),
          audioUrl: track.url,
          duration: track.duration,
        }
      : null,
    playlist: queue.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: p.coverOf(t),
      audioUrl: t.url,
      duration: t.duration,
    })),
    isPlaying: p.isPlaying.value,
    isBuffering: false,
    playError: '',
    currentTime: p.currentTime.value,
    duration: p.duration.value || track?.duration || 0,
    volume: p.volume.value,
    isMuted: p.muted.value,
    isSeeking: seekingProgress.value !== null,
    seekingProgress: seekingProgress.value,
    playMode: p.playMode.value,
    currentIndex: queue.findIndex((t) => t.id === p.currentId.value),
    progress: p.progressPct.value / 100,
  };
});

// ===== 适配层：把 usePulsePlayer 单例的 API 包装成旧模板使用的函数名 =====
const togglePlay = () => void p.togglePlay();
const playNext = () => p.nextTrack();
const playPrev = () => p.prevTrack();
const playAtIndex = (index: number) => p.playAtQueueIndex(index);
const setVolume = (v: number) => p.setVolume(v);
const adjustVolume = (delta: number) => p.setVolume(p.volume.value + delta);
const toggleMute = () => p.toggleMute();
const cyclePlayMode = () => p.cyclePlayMode();
const removeFromPlaylist = (index: number) => {
  const track = p.queueTracks.value[index];
  if (track) p.removeFromQueue(track.id);
};

// ===== 进度拖动预览：拖动中只更新预览值，松手才真正跳转播放进度 =====
function setSeekingProgress(percent: number) {
  seekingProgress.value = Math.max(0, Math.min(1, percent));
}
function commitSeekingProgress(percent?: number) {
  const pct = percent ?? seekingProgress.value;
  seekingProgress.value = null;
  if (typeof pct === 'number') p.seekTo(pct);
}
function cancelSeekingProgress() {
  seekingProgress.value = null;
}

// ===== 网易云扫码登录 =====
const { isLoggedIn, loginStatus, loginError, loginStatusText, qrCodeUrl, handleLogin, handleLogout } = useNeteaseLogin();

// ===== 悬浮位置 / 显示模式 / 停靠长按交互状态 =====
const position = ref({ x: 20, y: 100 });
const displayMode = ref<'float' | 'dock'>('dock');
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const isExpanded = ref(false);
const playerRef = ref<HTMLElement | null>(null);
const progressBarRef = ref<HTMLElement | null>(null);
const dockProgressBarRef = ref<HTMLElement | null>(null);
const isDockDragging = ref(false);
const isLongPressing = ref(false);
const isDockDragReady = ref(false);
const isDockPressing = ref(false);
const dockPressStart = ref({ x: 0, y: 0 });
const dockLongPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const dockProgressTimer = ref<ReturnType<typeof setInterval> | null>(null);
const dockPressProgress = ref(0);
const dockPressPoint = ref({ x: 0, y: 0 });
// 停靠栏交互常量：栏高、吸附/脱离阈值、长按时长与进度环几何参数
const dockHeight = 76;
const dockSnapThreshold = 24;
const dockUndockDragThreshold = 10;
const dockLongPressDuration = 500;
const dockProgressRadius = 18;
const dockProgressCircumference = 2 * Math.PI * dockProgressRadius;
const dockProgressRingSize = 48;

// ===== 内联 SVG 图标集与 UiIcon 渲染组件（免引入图标库） =====
type IconName =
  | 'music'
  | 'previous'
  | 'next'
  | 'play'
  | 'pause'
  | 'expand'
  | 'collapse'
  | 'close'
  | 'search'
  | 'playlist'
  | 'playlistClose'
  | 'lyric'
  | 'remove'
  | 'volumeMuted'
  | 'volumeLow'
  | 'volumeHigh'
  | 'modeOrder'
  | 'modeLoop'
  | 'modeSingle'
  | 'modeShuffle';

const iconPaths: Record<IconName, string[]> = {
  music: ['M14 5a3 3 0 0 0-2-2.82V16.5a2.5 2.5 0 1 1-1-2V6.2l10-2v9.3a2.5 2.5 0 1 1-1-2V2.7L14 4v1z'],
  previous: ['M18 6v12', 'M16 7 8 12l8 5V7z'],
  next: ['M6 6v12', 'M8 7l8 5-8 5V7z'],
  play: ['M8 6l10 6-10 6V6z'],
  pause: ['M9 6v12', 'M15 6v12'],
  expand: ['M8 10l4-4 4 4', 'M8 14l4 4 4-4'],
  collapse: ['M8 8l4 4 4-4', 'M8 16l4-4 4 4'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  search: ['m11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z', 'm16 16 4 4'],
  playlist: ['M4 6h14', 'M4 11h14', 'M4 16h9', 'M17 14v6', 'M14 17h6'],
  playlistClose: ['M4 6h14', 'M4 11h14', 'M4 16h9', 'm18 14-3 3 3 3'],
  lyric: ['M5 6h14', 'M5 10h14', 'M5 14h9', 'M5 18h7'],
  remove: ['M7 7l10 10', 'M17 7 7 17'],
  volumeMuted: ['M5 10h3l4-3v10l-4-3H5z', 'M16 9l4 6', 'M20 9l-4 6'],
  volumeLow: ['M5 10h3l4-3v10l-4-3H5z', 'M17 10.5a2.5 2.5 0 0 1 0 3'],
  volumeHigh: ['M5 10h3l4-3v10l-4-3H5z', 'M16 9a5 5 0 0 1 0 6', 'M18 7a8 8 0 0 1 0 10'],
  modeOrder: ['M7 6h10', 'M7 12h8', 'M7 18h6', 'M17 14v6', 'm14 17 3 3 3-3'],
  modeLoop: ['M19 7h-8a3 3 0 0 0-3 3v1', 'm8 7 3 3-3 3', 'M5 17h8a3 3 0 0 0 3-3v-1', 'm16 17-3-3 3-3'],
  modeSingle: ['M19 7h-8a3 3 0 0 0-3 3v1', 'm8 7 3 3-3 3', 'M5 17h8a3 3 0 0 0 3-3v-1', 'm16 17-3-3 3-3', 'M12 9v6'],
  modeShuffle: ['M6 7h4l8 10h4', 'm18 17 2 2 2-2', 'M6 17h4l2.5-3.2', 'M14 10.2 16 7h6', 'm18 7 2-2 2 2'],
};

const UiIcon = defineComponent({
  name: 'UiIcon',
  props: {
    name: {
      type: String as () => IconName,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          class: 'ui-icon',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.8,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        (iconPaths[props.name] || iconPaths.music).map((d) => h('path', { d })),
      );
  },
});

// 尺寸调整相关
const size = ref({ width: 320, height: 480 });
const isResizing = ref(false);
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 });
const baseMinSize = { width: 260, height: 320 };
const baseMaxSize = { width: 600, height: 800 };
const viewportPadding = 10;

// 依据视口计算面板宽高上下限（小屏时上限收敛，且下限不超过上限）
const getSizeBounds = () => {
  const viewportMaxWidth = Math.max(280, window.innerWidth - viewportPadding * 2);
  const viewportMaxHeight = Math.max(360, window.innerHeight - viewportPadding * 2);

  const minWidth = Math.min(baseMinSize.width, viewportMaxWidth);
  const minHeight = Math.min(baseMinSize.height, viewportMaxHeight);
  const maxWidth = Math.min(baseMaxSize.width, viewportMaxWidth);
  const maxHeight = Math.min(baseMaxSize.height, viewportMaxHeight);

  return {
    minWidth: Math.min(minWidth, maxWidth),
    minHeight: Math.min(minHeight, maxHeight),
    maxWidth,
    maxHeight,
  };
};

const clampPanelSize = (nextSize: { width: number; height: number }) => {
  const bounds = getSizeBounds();
  return {
    width: Math.round(Math.max(bounds.minWidth, Math.min(nextSize.width, bounds.maxWidth))),
    height: Math.round(Math.max(bounds.minHeight, Math.min(nextSize.height, bounds.maxHeight))),
  };
};

// 位置越界修正：拖拽、缩放或窗口变化后把面板拉回视口内
const clampPosition = (nextPosition: { x: number; y: number }) => {
  const panelWidth = isExpanded.value ? size.value.width : (playerRef.value?.offsetWidth || 300);
  const panelHeight = isExpanded.value ? size.value.height : (playerRef.value?.offsetHeight || 80);

  const maxX = Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding);
  const maxY = Math.max(viewportPadding, window.innerHeight - panelHeight - viewportPadding);

  return {
    x: Math.max(viewportPadding, Math.min(nextPosition.x, maxX)),
    y: Math.max(viewportPadding, Math.min(nextPosition.y, maxY)),
  };
};

const getEventClient = (e: MouseEvent | TouchEvent | PointerEvent) => {
  const touch = 'touches' in e ? e.touches.item(0) : null;
  return {
    clientX: touch ? touch.clientX : ('clientX' in e ? e.clientX : 0),
    clientY: touch ? touch.clientY : ('clientY' in e ? e.clientY : 0),
  };
};

const updateDragPosition = (clientX: number, clientY: number) => {
  const newX = clientX - dragOffset.value.x;
  const newY = clientY - dragOffset.value.y;
  position.value = clampPosition({ x: newX, y: newY });
};

const clearDockLongPressTimer = () => {
  if (dockLongPressTimer.value) {
    clearTimeout(dockLongPressTimer.value);
    dockLongPressTimer.value = null;
  }
};

const clearDockProgressTimer = () => {
  if (dockProgressTimer.value) {
    clearInterval(dockProgressTimer.value);
    dockProgressTimer.value = null;
  }
};

const setDockMode = () => {
  displayMode.value = 'dock';
  isExpanded.value = false;
  isResizing.value = false;
  showSearchPanel.value = false;
  showPlaylistDrawer.value = false;
  showDockSearchDrawer.value = false;
  isDragging.value = false;
};

const normalizePanelInViewport = () => {
  if (isExpanded.value) {
    size.value = clampPanelSize(size.value);
  }
  position.value = clampPosition(position.value);
};

// 依据面板尺寸推导显示密度（常规/紧凑/极简），用于隐藏次要元素
const panelDensity = computed<'regular' | 'compact' | 'ultra'>(() => {
  if (size.value.height < 390 || size.value.width < 320) return 'ultra';
  if (size.value.height < 470 || size.value.width < 360) return 'compact';
  return 'regular';
});

const isCompactMode = computed(() => panelDensity.value !== 'regular');
const playerInlineStyle = computed(() => {
  if (displayMode.value === 'dock') {
    return {};
  }
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  };
});
// 长按进度环的 SVG 弧长偏移：进度 0 -> 完整一圈空缺，进度 1 -> 0 空缺（画满圆环）
const dockProgressOffset = computed(
  () => dockProgressCircumference * (1 - Math.max(0, Math.min(1, dockPressProgress.value))),
);

// ===== 网易云搜索：关键词 / 分页结果 / 各抽屉开关 =====
const SEARCH_PAGE_SIZE = 30;
const searchKey = ref('');
const searchResults = ref<Song[]>([]);
const searchTotal = ref(0);
const searchHasMore = ref(false);
const isSearching = ref(false);
const isLoadingMoreSearch = ref(false);
const showSearchPanel = ref(false);
const showPlaylistDrawer = ref(false);
const showDockSearchDrawer = ref(false);
const isProgressDragging = ref(false);

const togglePlaylistDrawer = () => {
  showPlaylistDrawer.value = !showPlaylistDrawer.value;
  if (showPlaylistDrawer.value && displayMode.value === 'dock') {
    showDockSearchDrawer.value = false;
  }
};

const toggleDockSearchDrawer = () => {
  showDockSearchDrawer.value = !showDockSearchDrawer.value;
  if (showDockSearchDrawer.value) {
    showPlaylistDrawer.value = false;
    void nextTick(() => dockSearchInputRef.value?.focus());
  }
};

const isDockDrawerOpen = computed(
  () => displayMode.value === 'dock' && (showDockSearchDrawer.value || showPlaylistDrawer.value),
);

const dockSearchDrawerRef = ref<HTMLElement | null>(null);
const dockPlaylistDrawerRef = ref<HTMLElement | null>(null);

const closeDockDrawers = () => {
  showDockSearchDrawer.value = false;
  showPlaylistDrawer.value = false;
};

const handleDockDrawerOutsidePointerDown = (e: PointerEvent) => {
  if (!isDockDrawerOpen.value) return;
  const target = e.target;
  if (!(target instanceof Node)) return;
  if (dockSearchDrawerRef.value?.contains(target)) return;
  if (dockPlaylistDrawerRef.value?.contains(target)) return;
  if (playerRef.value?.querySelector('.player-dock')?.contains(target)) return;
  closeDockDrawers();
};

// 抽屉打开时在捕获阶段监听全局 pointerdown，点击抽屉与停靠栏以外的区域即关闭
watch(isDockDrawerOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', handleDockDrawerOutsidePointerDown, true);
  } else {
    document.removeEventListener('pointerdown', handleDockDrawerOutsidePointerDown, true);
  }
});

// ===== 时间格式化与图标映射 =====
const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const currentTimeFormatted = computed(() => formatTime(state.value.currentTime));
const durationFormatted = computed(() => formatTime(state.value.duration));
const displayProgress = computed(() => state.value.seekingProgress ?? state.value.progress);

const playModeIcon = computed<IconName>(() => {
  const icons: Record<string, IconName> = {
    order: 'modeOrder',
    'list-loop': 'modeLoop',
    'single-loop': 'modeSingle',
    shuffle: 'modeShuffle',
  };
  return icons[state.value.playMode] || 'modeLoop';
});

const volumeIconName = computed<IconName>(() => {
  if (state.value.isMuted || state.value.volume === 0) return 'volumeMuted';
  if (state.value.volume < 0.5) return 'volumeLow';
  return 'volumeHigh';
});

// 窗口尺寸变化时校正悬浮面板位置与尺寸，避免停留在视口外
const handleWindowResize = () => {
  if (displayMode.value === 'dock') return;
  normalizePanelInViewport();
};

// ===== 进度条交互：点击直接跳转，按住拖动仅更新预览 =====
const handleProgressClick = (e: MouseEvent) => {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  commitSeekingProgress(percent);
};

const handleProgressStart = (e: MouseEvent | TouchEvent) => {
  isProgressDragging.value = true;
  handleProgressDrag(e);
  e.preventDefault();
};

const handleProgressDrag = (e: MouseEvent | TouchEvent) => {
  if (!isProgressDragging.value || !progressBarRef.value) return;
  const touch = 'touches' in e ? e.touches.item(0) : null;
  const clientX = touch ? touch.clientX : ('clientX' in e ? e.clientX : 0);
  const rect = progressBarRef.value.getBoundingClientRect();
  const percent = (clientX - rect.left) / rect.width;
  setSeekingProgress(percent);
};

const handleProgressEnd = () => {
  if (!isProgressDragging.value) return;
  isProgressDragging.value = false;
  commitSeekingProgress();
};

const dockSearchInputRef = ref<HTMLInputElement | null>(null);
const dockVolumeTrackRef = ref<HTMLElement | null>(null);
const isDockVolumeDragging = ref(false);

// ===== 停靠栏音量：竖向音量条的拖动与滚轮调节 =====
const dockVolumePercent = computed(() => (state.value.isMuted ? 0 : state.value.volume));

const setDockVolumeFromTrackY = (clientY: number) => {
  const track = dockVolumeTrackRef.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const ratio = 1 - (clientY - rect.top) / rect.height;
  setVolume(Math.max(0, Math.min(1, ratio)));
};

const handleDockVolumeTrackDown = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  isDockVolumeDragging.value = true;
  setDockVolumeFromTrackY(e.clientY);
};

const handleDockVolumeDragMove = (e: MouseEvent) => {
  if (!isDockVolumeDragging.value) return;
  setDockVolumeFromTrackY(e.clientY);
};

const handleDockVolumeDragEnd = () => {
  isDockVolumeDragging.value = false;
};

const handleDockVolumeWheel = (e: WheelEvent) => {
  e.preventDefault();
  e.stopPropagation();
  adjustVolume(e.deltaY < 0 ? 0.04 : -0.04);
};

const handleVolumeChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  setVolume(Number.parseFloat(target.value));
};

// ===== 悬浮面板拖拽（兼容鼠标与触摸） =====
const handleDragStart = (e: MouseEvent | TouchEvent) => {
  if (displayMode.value === 'dock') return;
  isDragging.value = true;
  const { clientX, clientY } = getEventClient(e);
  
  if (playerRef.value) {
    const rect = playerRef.value.getBoundingClientRect();
    dragOffset.value = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }
  
  e.preventDefault();
};

const handleDragMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value || displayMode.value === 'dock') return;
  const { clientX, clientY } = getEventClient(e);
  updateDragPosition(clientX, clientY);
};

const handleDragEnd = () => {
  // 拖拽结束时面板贴近视口底部，则自动吸附回停靠栏
  if (isDragging.value && displayMode.value === 'float') {
    const panelHeight = isExpanded.value ? size.value.height : (playerRef.value?.offsetHeight || dockHeight);
    const panelBottom = position.value.y + panelHeight;
    const distanceToViewportBottom = window.innerHeight - panelBottom;
    if (distanceToViewportBottom <= dockSnapThreshold) {
      setDockMode();
    }
  }
  isDragging.value = false;
};

// 尺寸调整开始
const handleResizeStart = (e: MouseEvent | TouchEvent) => {
  if (!isExpanded.value) return;
  
  isResizing.value = true;
  const touch = 'touches' in e ? e.touches.item(0) : null;
  const clientX = touch ? touch.clientX : ('clientX' in e ? e.clientX : 0);
  const clientY = touch ? touch.clientY : ('clientY' in e ? e.clientY : 0);
  
  resizeStart.value = {
    x: clientX,
    y: clientY,
    width: size.value.width,
    height: size.value.height,
  };
  
  e.preventDefault();
};

// 尺寸调整中
const handleResizeMove = (e: MouseEvent | TouchEvent) => {
  if (!isResizing.value) return;
  
  const touch = 'touches' in e ? e.touches.item(0) : null;
  const clientX = touch ? touch.clientX : ('clientX' in e ? e.clientX : 0);
  const clientY = touch ? touch.clientY : ('clientY' in e ? e.clientY : 0);
  
  const deltaX = clientX - resizeStart.value.x;
  const deltaY = clientY - resizeStart.value.y;
  
  size.value = clampPanelSize({
    width: resizeStart.value.width + deltaX,
    height: resizeStart.value.height + deltaY,
  });
  position.value = clampPosition(position.value);
};

// 尺寸调整结束
const handleResizeEnd = () => {
  isResizing.value = false;
  normalizePanelInViewport();
};

// ===== 形态切换：停靠栏 ⇄ 悬浮展开面板 =====
// 脱离停靠并展开悬浮面板，初始位置在停靠栏上方水平居中（可顺带打开搜索）
const exitDockToFloatExpanded = (options?: { openSearch?: boolean }) => {
  if (displayMode.value !== 'dock') return;
  resetDockPressState();
  displayMode.value = 'float';
  isExpanded.value = true;
  showSearchPanel.value = options?.openSearch ?? false;
  showPlaylistDrawer.value = false;
  showDockSearchDrawer.value = false;
  size.value = clampPanelSize(size.value);
  const margin = 16;
  const dockBarHeight =
    dockHeight +
    (typeof window !== 'undefined'
      ? Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--player-dock-safe-bottom'),
        ) || 0
      : 0);
  position.value = clampPosition({
    x: Math.max(margin, (window.innerWidth - size.value.width) / 2),
    y: Math.max(margin, window.innerHeight - size.value.height - dockBarHeight - margin),
  });
  void nextTick(() => normalizePanelInViewport());
};

const toggleExpand = () => {
  if (displayMode.value === 'dock') {
    exitDockToFloatExpanded();
    return;
  }
  isExpanded.value = !isExpanded.value;
  showSearchPanel.value = false;
  if (isExpanded.value) {
    size.value = clampPanelSize(size.value);
  }
  void nextTick(() => normalizePanelInViewport());
};

// ===== 停靠栏长按 / 拖出状态机 =====
// 短按 = 常规点击；长按满 500ms 进入就绪态；就绪后位移超阈值即脱离停靠转为悬浮迷你条
const teardownDockPointerListeners = () => {
  window.removeEventListener('pointermove', handleDockPointerMove);
  window.removeEventListener('pointerup', handleDockPointerUp);
  window.removeEventListener('pointercancel', handleDockPointerUp);
};

const resetDockPressState = () => {
  clearDockLongPressTimer();
  clearDockProgressTimer();
  isLongPressing.value = false;
  isDockDragReady.value = false;
  isDockDragging.value = false;
  isDockPressing.value = false;
  dockPressProgress.value = 0;
  dockPressPoint.value = { x: 0, y: 0 };
};

const handleDockPointerDown = (e: PointerEvent) => {
  if (displayMode.value !== 'dock') return;
  if (e.button !== 0) return;

  resetDockPressState();
  isDockPressing.value = true;
  dockPressStart.value = { x: e.clientX, y: e.clientY };
  dockPressPoint.value = { x: e.clientX, y: e.clientY };
  clearDockLongPressTimer();
  clearDockProgressTimer();
  // 高频刷新长按进度环，满 500ms 后置位长按标志进入可拖动态
  const pressStartAt = Date.now();
  dockPressProgress.value = 0;
  dockProgressTimer.value = setInterval(() => {
    const elapsed = Date.now() - pressStartAt;
    dockPressProgress.value = Math.min(1, elapsed / dockLongPressDuration);
    if (dockPressProgress.value >= 1) {
      clearDockProgressTimer();
    }
  }, 16);
  dockLongPressTimer.value = setTimeout(() => {
    isLongPressing.value = true;
    isDockDragReady.value = true;
    dockPressProgress.value = 1;
    clearDockProgressTimer();
  }, dockLongPressDuration);

  window.addEventListener('pointermove', handleDockPointerMove);
  window.addEventListener('pointerup', handleDockPointerUp);
  window.addEventListener('pointercancel', handleDockPointerUp);
};

function handleDockPointerMove(e: PointerEvent) {
  if (displayMode.value !== 'dock' && !isDockDragging.value) return;

  const deltaX = e.clientX - dockPressStart.value.x;
  const deltaY = e.clientY - dockPressStart.value.y;
  const dragDistance = Math.hypot(deltaX, deltaY);

  // 长按未就绪前的位移一律忽略，避免误触脱离
  if (!isDockDragReady.value) return;

  // 就绪后位移达到阈值才真正脱离停靠：切换为悬浮迷你条并接管拖拽
  if (!isDockDragging.value && dragDistance >= dockUndockDragThreshold) {
    isDockDragging.value = true;
    displayMode.value = 'float';
    isExpanded.value = false;
    showDockSearchDrawer.value = false;

    dragOffset.value = {
      x: Math.max(24, Math.min(180, (playerRef.value?.offsetWidth || 320) * 0.5)),
      y: 36,
    };
    isDragging.value = true;
  }

  if (isDockDragging.value) {
    updateDragPosition(e.clientX, e.clientY);
  }
}

function handleDockPointerUp() {
  teardownDockPointerListeners();
  const wasDockDragging = isDockDragging.value;
  resetDockPressState();

  if (wasDockDragging) {
    handleDragEnd();
  }
}

const handleCoverError = (e: Event) => applyCoverFallback(e);

// 关闭播放器：整体移出视口隐藏（保留组件实例与播放状态）
const closePlayer = () => {
  position.value = { x: -1000, y: -1000 };
};

const resetSearchPagination = () => {
  searchTotal.value = 0;
  searchHasMore.value = false;
};

// ===== 搜索执行与结果播放 =====
/**
 * 执行网易云搜索；append 为 true 时在现有结果后追加下一页（按歌曲 id 去重）
 */
const handleSearch = async (append = false) => {
  const keyword = searchKey.value.trim();
  if (!keyword) return;
  if (append) {
    if (!searchHasMore.value || isLoadingMoreSearch.value || isSearching.value) return;
    isLoadingMoreSearch.value = true;
  } else {
    isSearching.value = true;
    searchResults.value = [];
    resetSearchPagination();
  }

  try {
    const offset = append ? searchResults.value.length : 0;
    const page = await searchMusic(keyword, SEARCH_PAGE_SIZE, offset);
    if (append) {
      const existingIds = new Set(searchResults.value.map((song) => song.id));
      const merged = page.songs.filter((song) => !existingIds.has(song.id));
      searchResults.value = [...searchResults.value, ...merged];
    } else {
      searchResults.value = page.songs;
    }
    searchTotal.value = page.total;
    searchHasMore.value = page.hasMore;
  } catch (error) {
    console.error('搜索失败:', error);
    if (!append) {
      searchResults.value = [];
      resetSearchPagination();
    }
  } finally {
    isSearching.value = false;
    isLoadingMoreSearch.value = false;
  }
};

const loadMoreSearch = () => {
  void handleSearch(true);
};

// 搜索抽屉打开时按回车直接触发搜索
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (showSearchPanel.value || showDockSearchDrawer.value)) {
    e.preventDefault();
    void handleSearch();
  }
};

// 将搜索到的歌曲写入播放队列并立即播放
const playSong = async (song: Song) => {
  const [track] = p.upsertNeteaseTracks([song]);
  if (track) await p.playTrack(track.id);
};

const toggleSearchPanel = () => {
  showSearchPanel.value = !showSearchPanel.value;
};

// ===== 全局事件监听的挂载与清理（拖拽 / 缩放 / 进度 / 音量 / 键盘） =====
onMounted(() => {
  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', handleDragEnd);
  document.addEventListener('touchmove', handleDragMove);
  document.addEventListener('touchend', handleDragEnd);
  document.addEventListener('keydown', handleKeydown);
  
  // 尺寸调整事件
  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
  document.addEventListener('touchmove', handleResizeMove);
  document.addEventListener('touchend', handleResizeEnd);
  document.addEventListener('mousemove', handleProgressDrag);
  document.addEventListener('mouseup', handleProgressEnd);
  document.addEventListener('touchmove', handleProgressDrag);
  document.addEventListener('touchend', handleProgressEnd);
  document.addEventListener('mousemove', handleDockVolumeDragMove);
  document.addEventListener('mouseup', handleDockVolumeDragEnd);
  window.addEventListener('resize', handleWindowResize);
  
  normalizePanelInViewport();
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', handleDragEnd);
  document.removeEventListener('touchmove', handleDragMove);
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('touchend', handleDragEnd);
  
  // 移除尺寸调整事件
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
  document.removeEventListener('touchmove', handleResizeMove);
  document.removeEventListener('touchend', handleResizeEnd);
  document.removeEventListener('mousemove', handleProgressDrag);
  document.removeEventListener('mouseup', handleProgressEnd);
  document.removeEventListener('touchmove', handleProgressDrag);
  document.removeEventListener('touchend', handleProgressEnd);
  document.removeEventListener('mousemove', handleDockVolumeDragMove);
  document.removeEventListener('mouseup', handleDockVolumeDragEnd);
  window.removeEventListener('resize', handleWindowResize);
  teardownDockPointerListeners();
  document.removeEventListener('pointerdown', handleDockDrawerOutsidePointerDown, true);
  clearDockLongPressTimer();
  // 卸载时若仍处于拖动预览态，丢弃未提交的预览值
  if (state.value.isSeeking) {
    cancelSeekingProgress();
  }
});
</script>

<template>
  <div
    ref="playerRef"
    class="floating-player"
    :class="{
      'is-expanded': isExpanded && displayMode === 'float',
      'is-dragging': isDragging,
      'is-docked': displayMode === 'dock',
      'is-long-pressing': isLongPressing,
      [`density-${panelDensity}`]: isExpanded && displayMode === 'float',
    }"
    :style="playerInlineStyle"
  >
    <!-- 区块：停靠模式 —— 底部播放栏（长按可拖出恢复悬浮） -->
    <div
      v-if="displayMode === 'dock'"
      class="player-dock"
      @pointerdown="handleDockPointerDown"
    >
      <div class="player-dock__left">
        <div class="player-dock__cover">
          <img
            v-if="state.currentSong?.coverUrl"
            :src="state.currentSong.coverUrl"
            alt="cover"
            referrerpolicy="no-referrer"
            @error="handleCoverError"
          />
          <div v-else class="cover-placeholder"><UiIcon name="music" /></div>
        </div>
        <div class="player-dock__meta">
          <div class="song-title">{{ state.currentSong?.title || '未播放' }}</div>
          <div class="song-artist">{{ state.currentSong?.artist || '未知艺术家' }}</div>
          <div
            ref="dockProgressBarRef"
            class="player-dock__progress progress-bar"
            @click.stop="handleProgressClick"
            @pointerdown.stop
          >
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${displayProgress * 100}%` }" />
            </div>
          </div>
        </div>
      </div>

      <div class="player-dock__center">
        <button
          class="control-btn"
          type="button"
          @pointerdown.stop
          @click.stop="playPrev"
          title="上一首"
          aria-label="上一首"
        >
          <UiIcon name="previous" />
        </button>
        <button
          class="control-btn play-btn"
          type="button"
          @pointerdown.stop
          @click.stop="togglePlay"
          :title="state.isPlaying ? '暂停' : '播放'"
          :aria-label="state.isPlaying ? '暂停' : '播放'"
        >
          <UiIcon :name="state.isPlaying ? 'pause' : 'play'" />
        </button>
        <button
          class="control-btn"
          type="button"
          @pointerdown.stop
          @click.stop="playNext"
          title="下一首"
          aria-label="下一首"
        >
          <UiIcon name="next" />
        </button>
      </div>

      <div class="player-dock__actions" @pointerdown.stop>
        <button
          class="control-btn dock-action-btn"
          @click.stop="cyclePlayMode"
          :title="state.playMode"
          :aria-label="`播放模式: ${state.playMode}`"
        >
          <UiIcon :name="playModeIcon" />
        </button>
        <div
          class="dock-volume-control"
          @wheel.prevent="handleDockVolumeWheel"
          @pointerdown.stop
        >
          <button
            class="control-btn dock-action-btn"
            @click.stop="toggleMute"
            :title="state.isMuted ? '取消静音' : '音量'"
            :aria-label="state.isMuted ? '取消静音' : '音量'"
          >
            <UiIcon :name="volumeIconName" />
          </button>
          <div class="dock-volume-control__popover" role="group" aria-label="音量调节">
            <div
              ref="dockVolumeTrackRef"
              class="dock-volume-track"
              @mousedown.stop="handleDockVolumeTrackDown"
            >
              <div
                class="dock-volume-track__fill"
                :style="{ height: `${dockVolumePercent * 100}%` }"
              />
              <div
                class="dock-volume-track__thumb"
                :style="{ bottom: `calc(${dockVolumePercent * 100}% - 7px)` }"
              />
            </div>
          </div>
        </div>
        <button
          class="control-btn dock-action-btn"
          @click.stop="emit('openLyric')"
          title="打开歌词窗"
          aria-label="打开歌词窗"
        >
          <UiIcon name="lyric" />
        </button>
        <button
          class="control-btn dock-action-btn"
          @click.stop="toggleDockSearchDrawer"
          :title="showDockSearchDrawer ? '关闭搜索' : '搜索音乐'"
          :aria-label="showDockSearchDrawer ? '关闭搜索' : '搜索音乐'"
        >
          <UiIcon :name="showDockSearchDrawer ? 'playlistClose' : 'search'" />
        </button>
        <button
          class="control-btn dock-action-btn"
          @click.stop="togglePlaylistDrawer"
          :title="`播放列表 (${state.playlist.length})`"
          :aria-label="`播放列表 (${state.playlist.length})`"
        >
          <UiIcon :name="showPlaylistDrawer ? 'playlistClose' : 'playlist'" />
        </button>
        <button
          class="control-btn dock-action-btn"
          @click.stop="exitDockToFloatExpanded()"
          title="展开播放器"
          aria-label="展开播放器"
        >
          <UiIcon name="expand" />
        </button>
      </div>

      <div class="player-dock__hint" aria-hidden="true">长按并拖动可恢复悬浮</div>
    </div>

    <!-- 区块：悬浮迷你条（点击封面/信息区可展开面板） -->
    <div v-else-if="!isExpanded" class="player-mini" @mousedown="handleDragStart" @touchstart="handleDragStart">
      <div class="mini-cover" @click.stop="toggleExpand">
        <img 
          v-if="state.currentSong?.coverUrl" 
          :src="state.currentSong.coverUrl" 
          alt="cover"
          referrerpolicy="no-referrer"
          @error="handleCoverError"
        />
        <div v-else class="cover-placeholder"><UiIcon name="music" /></div>
      </div>
      <div class="mini-info" @click.stop="toggleExpand">
        <div class="song-title">{{ state.currentSong?.title || '未播放' }}</div>
        <div v-show="panelDensity !== 'ultra'" class="song-artist">{{ state.currentSong?.artist || '未知艺术家' }}</div>
      </div>
      <div class="mini-controls" @click.stop>
        <button class="control-btn" @click.stop="playPrev" title="上一首" aria-label="上一首">
          <UiIcon name="previous" />
        </button>
        <button class="control-btn play-btn" @click.stop="togglePlay" :title="state.isPlaying ? '暂停' : '播放'" :aria-label="state.isPlaying ? '暂停' : '播放'">
          <UiIcon :name="state.isPlaying ? 'pause' : 'play'" />
        </button>
        <button class="control-btn" @click.stop="playNext" title="下一首" aria-label="下一首">
          <UiIcon name="next" />
        </button>
      </div>
      <button class="control-btn search-btn" @click.stop="toggleExpand" title="展开播放器" aria-label="展开播放器">
        <UiIcon name="expand" />
      </button>
    </div>

    <!-- 区块：悬浮展开面板（可拖拽移动、右下角可缩放） -->
    <div
      v-else
      class="player-expanded-shell"
      @click.stop
      :style="{ width: `${size.width}px`, height: `${size.height}px` }"
    >
      <div
        class="player-expanded"
        :class="{ 'is-compact': isCompactMode, 'is-ultra': panelDensity === 'ultra' }"
      >
      <div class="player-header" @mousedown="handleDragStart" @touchstart="handleDragStart">
        <span class="header-title">音乐播放器</span>
        <div class="header-actions">
          <button 
            class="action-btn login-btn" 
            @click.stop="isLoggedIn ? handleLogout() : handleLogin()"
            :title="isLoggedIn ? '退出登录' : '登录'"
          >
            {{ isLoggedIn ? '已登录' : '登录' }}
          </button>
          <button class="action-btn icon-action-btn" @click.stop="toggleExpand" title="收起" aria-label="收起">
            <UiIcon name="collapse" />
          </button>
          <button class="action-btn icon-action-btn" @click.stop="closePlayer" title="关闭" aria-label="关闭">
            <UiIcon name="close" />
          </button>
        </div>
      </div>

      <!-- 登录面板 -->
      <div v-if="qrCodeUrl || loginStatus === 'logging'" class="login-panel">
        <div class="login-panel__title">
          {{ loginStatus === 'logging' && !qrCodeUrl ? '准备中...' : '请扫描二维码登录' }}
        </div>
        <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="登录二维码" class="login-panel__qrcode" />
        <div v-if="loginError" class="login-panel__error">{{ loginError }}</div>
        <div class="login-panel__hint">
          <span v-if="loginStatus === 'logging' && qrCodeUrl">请打开网易云音乐APP扫描二维码</span>
          <span v-else>{{ loginStatusText }}</span>
        </div>
      </div>

      <!-- 搜索面板（展开态内嵌，含分页加载） -->
      <div v-else-if="showSearchPanel" class="player-search">
        <div class="search-bar">
          <input
            v-model="searchKey"
            type="text"
            class="search-input"
            placeholder="搜索歌曲..."
            @keydown.enter.prevent="handleSearch()"
            @mousedown.stop
            autofocus
          />
          <button class="search-button" type="button" @click.stop="handleSearch()" :disabled="isSearching">
            <UiIcon name="search" />
            <span>{{ isSearching ? '搜索中...' : '搜索' }}</span>
          </button>
        </div>
        
        <div v-if="searchResults.length" class="search-results">
          <div class="search-results__meta">
            共 {{ searchTotal }} 首，已加载 {{ searchResults.length }} 首
          </div>
          <div
            v-for="song in searchResults"
            :key="song.id"
            class="search-item"
            @click.stop="playSong(song)"
          >
            <img
              :src="song.coverUrl"
              class="search-item-cover"
              referrerpolicy="no-referrer"
              @error="handleCoverError"
            />
            <div class="search-item-info">
              <div class="search-item-title">{{ song.title }}</div>
              <div class="search-item-artist">{{ song.artist }}</div>
            </div>
          </div>
          <button
            v-if="searchHasMore"
            type="button"
            class="search-load-more-btn"
            :disabled="isLoadingMoreSearch"
            @click.stop="loadMoreSearch"
          >
            {{ isLoadingMoreSearch ? '加载中...' : '加载更多' }}
          </button>
        </div>
        <div v-else-if="!isSearching && searchKey" class="search-empty">
          暂无搜索结果
        </div>
      </div>

      <!-- 播放主内容：封面 / 歌曲信息 / 进度条 / 控制按钮 / 音量 -->
      <div v-else class="player-content" :class="{ 'is-compact': isCompactMode, 'is-ultra': panelDensity === 'ultra' }">
        <button class="search-toggle-btn" @click.stop="toggleSearchPanel" title="打开搜索" aria-label="打开搜索">
          <UiIcon name="search" />
          <span>搜索音乐</span>
        </button>

        <div class="player-cover" @click.stop v-show="panelDensity === 'regular'">
          <img
            v-if="state.currentSong?.coverUrl"
            :src="state.currentSong.coverUrl"
            alt="cover"
            referrerpolicy="no-referrer"
            :class="{ 'is-playing': state.isPlaying }"
            @error="handleCoverError"
          />
          <div v-else class="cover-placeholder large"><UiIcon name="music" /></div>
        </div>

        <div class="player-song-info" @click.stop>
          <div class="song-title">{{ state.currentSong?.title || '未播放' }}</div>
          <div v-show="panelDensity !== 'ultra'" class="song-artist">{{ state.currentSong?.artist || '未知艺术家' }}</div>
          <div v-if="state.isBuffering" class="player-status">缓冲中...</div>
          <div v-else-if="state.playError" class="player-status player-status--error">{{ state.playError }}</div>
        </div>

        <div class="player-progress">
          <span class="time-label">{{ currentTimeFormatted }}</span>
          <div
            ref="progressBarRef"
            class="progress-bar"
            @click="handleProgressClick"
            @mousedown.stop="handleProgressStart"
            @touchstart.stop="handleProgressStart"
          >
            <div class="progress-track">
              <div 
                class="progress-fill" 
                :style="{ width: `${displayProgress * 100}%` }"
              />
              <div 
                class="progress-thumb" 
                :style="{ left: `${displayProgress * 100}%` }"
              />
            </div>
          </div>
          <span class="time-label">{{ durationFormatted }}</span>
        </div>

        <div class="player-controls">
          <button class="control-btn" @click.stop="cyclePlayMode" :title="state.playMode" :aria-label="`播放模式: ${state.playMode}`">
            <UiIcon :name="playModeIcon" />
          </button>
          <button class="control-btn" @click.stop="playPrev" title="上一首" aria-label="上一首">
            <UiIcon name="previous" />
          </button>
          <button class="control-btn play-btn" @click.stop="togglePlay" :title="state.isPlaying ? '暂停' : '播放'" :aria-label="state.isPlaying ? '暂停' : '播放'">
            <UiIcon :name="state.isPlaying ? 'pause' : 'play'" />
          </button>
          <button class="control-btn" @click.stop="playNext" title="下一首" aria-label="下一首">
            <UiIcon name="next" />
          </button>
          <button class="control-btn" @click.stop="toggleMute" :title="state.isMuted ? '取消静音' : '静音'" :aria-label="state.isMuted ? '取消静音' : '静音'">
            <UiIcon :name="volumeIconName" />
          </button>
          <button class="control-btn" @click.stop="emit('openLyric')" title="打开歌词窗" aria-label="打开歌词窗" v-show="panelDensity !== 'ultra'">
            <UiIcon name="lyric" />
          </button>
        </div>

        <div class="player-volume" v-show="panelDensity !== 'ultra'">
          <span class="volume-icon">
            <UiIcon :name="volumeIconName" />
          </span>
          <input
            type="range"
            class="volume-slider"
            min="0"
            max="1"
            step="0.01"
            :value="state.isMuted ? 0 : state.volume"
            @input="handleVolumeChange"
            @mousedown.stop
            @touchstart.stop
          />
        </div>
      </div>
      </div>

      <button
        class="playlist-toggle-btn"
        @click.stop="togglePlaylistDrawer"
        :title="`播放列表 (${state.playlist.length})`"
        :aria-label="`播放列表 (${state.playlist.length})`"
      >
        <UiIcon :name="showPlaylistDrawer ? 'playlistClose' : 'playlist'" />
      </button>
    </div>

    <div v-if="displayMode === 'float'" class="drag-hint"><UiIcon name="expand" /></div>

    <div 
      v-if="displayMode === 'float' && isExpanded" 
      class="resize-handle"
      @mousedown="handleResizeStart"
      @touchstart="handleResizeStart"
    >
      <UiIcon name="expand" />
    </div>

    <!-- 区块：播放列表抽屉（悬浮展开与停靠两种模式共用） -->
    <transition name="playlist-drawer-fade">
    <div
      v-if="showPlaylistDrawer && ((displayMode === 'float' && isExpanded) || displayMode === 'dock')"
      ref="dockPlaylistDrawerRef"
      class="playlist-drawer"
      :class="{ 'playlist-drawer--dock': displayMode === 'dock' }"
    >
      <div class="playlist-header">
        <span class="playlist-title">播放列表</span>
        <span class="playlist-count">{{ state.playlist.length }} 首</span>
      </div>
      
      <div class="playlist-content">
        <div 
          v-if="state.playlist.length === 0" 
          class="playlist-empty"
        >
          暂无歌曲
        </div>
        
        <div 
          v-for="(song, index) in state.playlist" 
          :key="song.id"
          class="playlist-item"
          :class="{ 'is-playing': index === state.currentIndex }"
          @click.stop="playAtIndex(index)"
        >
          <img
            :src="song.coverUrl"
            class="playlist-item-cover"
            referrerpolicy="no-referrer"
            @error="handleCoverError"
          />
          <div class="playlist-item-info">
            <div class="playlist-item-title">{{ song.title }}</div>
            <div class="playlist-item-artist">{{ song.artist }}</div>
          </div>
          <span v-if="index === state.currentIndex" class="playlist-item-playing"><UiIcon name="play" /></span>
          <button 
            class="playlist-item-remove"
            @click.stop="removeFromPlaylist(index)"
            title="移除"
            aria-label="移除"
          >
            <UiIcon name="remove" />
          </button>
        </div>
      </div>

      <button 
        class="playlist-close-btn" 
        @click.stop="togglePlaylistDrawer"
        title="收起"
        aria-label="收起"
      >
        <UiIcon name="playlistClose" />
      </button>
    </div>
    </transition>

    <!-- 区块：停靠模式搜索抽屉（从右侧滑入） -->
    <transition name="dock-drawer-slide">
      <div
        v-if="displayMode === 'dock' && showDockSearchDrawer"
        ref="dockSearchDrawerRef"
        class="dock-search-drawer"
        @pointerdown.stop
        @mousedown.stop
      >
        <div class="dock-search-drawer__header">
          <span class="dock-search-drawer__title">搜索音乐</span>
          <button
            class="dock-search-drawer__close"
            type="button"
            @click.stop="toggleDockSearchDrawer"
            title="关闭"
            aria-label="关闭"
          >
            <UiIcon name="close" />
          </button>
        </div>

        <div class="dock-search-drawer__body">
          <div class="search-bar">
            <input
              ref="dockSearchInputRef"
              v-model="searchKey"
              type="text"
              class="search-input"
              placeholder="搜索歌曲、歌手..."
              @keydown.enter.prevent="handleSearch()"
              @mousedown.stop
            />
            <button class="search-button" type="button" @click.stop="handleSearch()" :disabled="isSearching">
              <UiIcon name="search" />
              <span>{{ isSearching ? '搜索中' : '搜索' }}</span>
            </button>
          </div>

          <div v-if="searchResults.length" class="search-results dock-search-drawer__results">
            <div class="search-results__meta">
              共 {{ searchTotal }} 首，已加载 {{ searchResults.length }} 首
            </div>
            <div
              v-for="song in searchResults"
              :key="song.id"
              class="search-item"
              @click.stop="playSong(song)"
            >
              <img
                :src="song.coverUrl"
                class="search-item-cover"
                referrerpolicy="no-referrer"
                @error="handleCoverError"
              />
              <div class="search-item-info">
                <div class="search-item-title">{{ song.title }}</div>
                <div class="search-item-artist">{{ song.artist }}</div>
              </div>
            </div>
            <button
              v-if="searchHasMore"
              type="button"
              class="search-load-more-btn"
              :disabled="isLoadingMoreSearch"
              @click.stop="loadMoreSearch"
            >
              {{ isLoadingMoreSearch ? '加载中...' : '加载更多' }}
            </button>
          </div>
          <div v-else-if="!isSearching && searchKey.trim()" class="search-empty">
            暂无搜索结果
          </div>
          <div v-else class="search-empty dock-search-drawer__placeholder">
            输入关键词后搜索网易云音乐
          </div>
        </div>
      </div>
    </transition>
  </div>

  <!-- 停靠长按进度提示环（Teleport 到 body，避免被停靠栏裁剪） -->
  <Teleport to="body">
    <div
      v-if="isDockPressing"
      class="dock-longpress-ring"
      :style="{
        left: `${dockPressPoint.x}px`,
        top: `${dockPressPoint.y}px`,
        width: `${dockProgressRingSize}px`,
        height: `${dockProgressRingSize}px`,
      }"
      aria-hidden="true"
    >
      <svg :viewBox="`0 0 ${dockProgressRingSize} ${dockProgressRingSize}`">
        <circle
          class="dock-longpress-ring__track"
          :cx="dockProgressRingSize / 2"
          :cy="dockProgressRingSize / 2"
          :r="dockProgressRadius"
        />
        <circle
          class="dock-longpress-ring__value"
          :cx="dockProgressRingSize / 2"
          :cy="dockProgressRingSize / 2"
          :r="dockProgressRadius"
          :style="{
            strokeDasharray: `${dockProgressCircumference}`,
            strokeDashoffset: `${dockProgressOffset}`,
          }"
        />
      </svg>
    </div>
  </Teleport>
</template>

<style scoped>
/* ===== 根容器与形态类 ===== */
.floating-player {
  position: fixed;
  z-index: 9999;
  user-select: none;
  transition: transform var(--player-duration-normal) var(--player-ease), box-shadow var(--player-duration-normal) var(--player-ease);
}

.floating-player.is-dragging {
  transform: scale(1.01);
}

.floating-player.is-docked {
  left: 0;
  right: 0;
  top: auto;
  bottom: 0;
  width: 100%;
  transform: none !important;
}

/* ===== 底部停靠栏 ===== */
.player-dock {
  position: relative;
  height: calc(var(--player-dock-height) + var(--player-dock-safe-bottom));
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: var(--player-border);
  background: var(--player-dock-bg);
  box-shadow: var(--player-dock-shadow);
  backdrop-filter: blur(20px);
  padding: 10px max(14px, env(safe-area-inset-right, 0px)) calc(10px + var(--player-dock-safe-bottom))
    max(14px, env(safe-area-inset-left, 0px));
}

.player-dock__left {
  flex: 1 1 0;
  min-width: 0;
  max-width: calc(50% - 76px);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 1;
  pointer-events: none;
}

.player-dock__left > * {
  pointer-events: auto;
}

.player-dock__cover {
  width: 50px;
  height: 50px;
  flex: none;
  border-radius: 12px;
  overflow: hidden;
  background: var(--player-bg-soft);
}

.player-dock__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-dock__meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-dock__progress {
  height: 16px;
}

.player-dock__center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, calc(-50% - var(--player-dock-safe-bottom) / 2));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 5;
  pointer-events: auto;
}

.player-dock__actions {
  flex: 1 1 0;
  min-width: 0;
  max-width: calc(50% - 76px);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: nowrap;
  z-index: 3;
  pointer-events: none;
}

.player-dock__actions > * {
  pointer-events: auto;
}

.player-dock__actions .dock-action-btn {
  width: var(--player-touch-target-compact);
  height: var(--player-touch-target-compact);
}

.player-dock__hint {
  position: absolute;
  left: 50%;
  bottom: calc(4px + var(--player-dock-safe-bottom));
  transform: translateX(-50%);
  color: var(--color-text-muted);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--player-duration-fast) var(--player-ease);
  z-index: 0;
}

.floating-player.is-long-pressing .player-dock__hint {
  opacity: 0.85;
}

/* ===== 停靠长按进度环 ===== */
.dock-longpress-ring {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
  z-index: 10050;
  border-radius: 50%;
  background: rgba(10, 8, 16, 0.72);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
}

.dock-longpress-ring svg {
  width: 100%;
  height: 100%;
  display: block;
  transform: rotate(-90deg);
}

.dock-longpress-ring__track,
.dock-longpress-ring__value {
  fill: none;
  stroke-width: 3;
}

.dock-longpress-ring__track {
  stroke: rgba(255, 255, 255, 0.28);
}

.dock-longpress-ring__value {
  stroke: var(--color-primary-light);
  stroke-linecap: round;
  transition: stroke-dashoffset 50ms linear;
  filter: drop-shadow(0 0 6px rgba(232, 121, 169, 0.55));
}

/* ===== 悬浮迷你条 ===== */
.player-mini {
  width: clamp(280px, 34vw, var(--player-mini-width));
  height: clamp(62px, 8vh, var(--player-mini-height));
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: clamp(6px, 1.2vw, 10px);
  border: var(--player-border);
  border-radius: var(--player-radius-pill);
  background: var(--player-bg);
  box-shadow: var(--player-panel-shadow);
  padding: clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 10px);
  backdrop-filter: blur(18px);
}

.mini-cover {
  width: clamp(44px, 6vw, 52px);
  height: clamp(44px, 6vw, 52px);
  border-radius: 14px;
  overflow: hidden;
  background: var(--player-bg-soft);
}

.mini-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--player-control-icon);
  background: var(--gradient-primary);
}

.cover-placeholder.large {
  font-size: clamp(26px, 4vw, 44px);
}

.mini-info {
  min-width: 0;
  cursor: pointer;
}

.song-title {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  color: var(--color-text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-controls {
  display: flex;
  gap: clamp(4px, 0.8vw, 6px);
}

.control-btn {
  width: var(--player-touch-target);
  height: var(--player-touch-target);
  border-radius: 50%;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--player-control-bg);
  color: var(--player-icon-color);
  cursor: pointer;
  transition: transform var(--player-duration-fast) var(--player-ease), background var(--player-duration-fast) var(--player-ease);
}

.control-btn:hover {
  background: var(--player-control-bg-hover);
}

.control-btn:active {
  transform: scale(0.95);
}

.play-btn {
  background: var(--player-control-bg-active) !important;
  color: var(--player-icon-color-active);
}

/* ===== 悬浮展开面板（头部 / 操作按钮 / 侧边播放列表开关） ===== */
.player-expanded-shell {
  position: relative;
}

.player-expanded {
  width: 100%;
  height: 100%;
  border: var(--player-border);
  border-radius: var(--player-radius);
  background: var(--player-bg);
  backdrop-filter: blur(18px);
  box-shadow: var(--player-panel-shadow-glow);
  padding: clamp(12px, 1.8vw, 16px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  cursor: move;
}

.header-title {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: clamp(4px, 0.8vw, 6px);
}

.action-btn {
  min-width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: var(--player-control-bg);
  color: var(--player-control-icon-muted);
  padding: 0 10px;
  cursor: pointer;
}

.action-btn:hover {
  background: var(--player-control-bg-hover);
  color: var(--player-control-icon);
}

.icon-action-btn {
  width: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.playlist-toggle-btn {
  position: absolute;
  top: 50%;
  right: -22px;
  transform: translateY(-50%);
  width: 22px;
  min-width: 22px;
  height: clamp(36px, 7vh, 44px);
  min-height: 36px;
  padding: 5px 4px;
  border-radius: 0 7px 7px 0;
  border: var(--player-border);
  border-left: none;
  background: var(--gradient-primary);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  box-shadow: var(--player-panel-shadow);
  transition: transform var(--player-duration-fast) var(--player-ease), filter var(--player-duration-fast) var(--player-ease);
}

.playlist-toggle-btn:hover {
  filter: brightness(1.08);
}

.playlist-toggle-btn:active {
  transform: translateY(-50%) scale(0.96);
}

.playlist-toggle-btn .ui-icon {
  width: 11px;
  height: 11px;
}

/* ===== 登录面板 ===== */
.login-panel,
.player-search,
.player-content {
  flex: 1;
  min-height: 0;
}

.login-panel {
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.login-panel__title {
  font-size: 13px;
  color: var(--color-text-primary);
}

.login-panel__qrcode {
  width: 164px;
  height: 164px;
  margin: 0 auto;
  border-radius: 12px;
}

.login-panel__error {
  color: var(--color-error);
  font-size: 12px;
}

.login-panel__hint {
  color: var(--color-text-muted);
  font-size: 12px;
}

/* ===== 音乐搜索（展开面板与停靠抽屉共用） ===== */
.search-bar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.search-input {
  height: 38px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary);
  padding: 0 14px;
  outline: none;
}

.search-button {
  height: 38px;
  border-radius: 999px;
  border: none;
  padding: 0 14px;
  background: var(--gradient-primary);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.search-results {
  margin-top: 10px;
  max-height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-results__meta {
  flex: none;
  color: var(--color-text-muted);
  font-size: 11px;
  padding: 0 2px 4px;
}

.search-load-more-btn {
  flex: none;
  margin-top: 4px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-text-primary);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color var(--player-duration-fast) var(--player-ease),
    background var(--player-duration-fast) var(--player-ease);
}

.search-load-more-btn:hover:not(:disabled) {
  border-color: var(--color-primary-35);
  background: var(--player-lyric-hover);
}

.search-load-more-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.search-item {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 10px;
  align-items: center;
  padding: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  cursor: pointer;
}

.search-item:hover {
  border-color: var(--color-primary-35);
  background: var(--player-lyric-hover);
}

.search-item-cover {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
}

.search-item-title {
  color: var(--color-text-primary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-item-artist {
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-empty {
  text-align: center;
  color: var(--color-text-muted);
  margin-top: 16px;
}

/* ===== 播放主内容：搜索入口 / 封面 / 进度条 / 控制按钮 / 音量 ===== */
.search-toggle-btn {
  height: 34px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
  margin-bottom: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.player-cover {
  width: clamp(146px, 40vw, var(--player-cover-size));
  height: clamp(146px, 40vw, var(--player-cover-size));
  margin: 0 auto 12px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
}

.player-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-cover img.is-playing {
  animation: player-cover-spin 20s linear infinite;
}

.player-song-info {
  text-align: center;
  margin-bottom: 10px;
}

.player-status {
  margin-top: 4px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.player-status--error {
  color: var(--color-error);
}

.player-progress {
  display: grid;
  grid-template-columns: 34px 1fr 34px;
  gap: 8px;
  align-items: center;
}

.time-label {
  color: var(--color-text-muted);
  font-size: 11px;
  text-align: center;
}

.progress-bar {
  cursor: pointer;
  height: 20px;
  display: flex;
  align-items: center;
}

.progress-track {
  width: 100%;
  height: 5px;
  background: var(--player-progress-track);
  border-radius: 999px;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--player-progress-fill);
  border-radius: inherit;
}

.progress-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  box-shadow: var(--player-thumb-shadow);
}

.player-controls {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: clamp(6px, 1.4vw, 10px);
  flex-wrap: wrap;
}

/* ===== 停靠栏音量：hover 弹出的竖向音量条 ===== */
.player-dock .dock-volume-control {
  position: relative;
  flex: none;
  width: var(--player-touch-target-compact);
  height: var(--player-touch-target-compact);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.player-dock .dock-volume-control__popover {
  position: absolute;
  left: 50%;
  bottom: calc(100% - 4px);
  transform: translateX(-50%);
  padding: 10px 14px 16px;
  border-radius: 12px;
  border: var(--player-border);
  background: var(--player-bg);
  box-shadow: var(--player-panel-shadow);
  backdrop-filter: blur(14px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity var(--player-duration-fast) var(--player-ease),
    visibility var(--player-duration-fast) var(--player-ease);
  z-index: 30;
}

.player-dock .dock-volume-control:hover .dock-volume-control__popover,
.player-dock .dock-volume-control:focus-within .dock-volume-control__popover {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.player-dock .dock-volume-track {
  position: relative;
  width: 6px;
  height: 88px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  cursor: pointer;
  touch-action: none;
}

.player-dock .dock-volume-track__fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 999px;
  background: var(--color-primary-light);
  pointer-events: none;
}

.player-dock .dock-volume-track__thumb {
  position: absolute;
  left: 50%;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.player-volume {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 8px;
  align-items: center;
}

.volume-icon {
  color: var(--player-icon-color-muted);
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.volume-slider {
  width: 100%;
}

/* ===== 拖拽提示与缩放手柄 ===== */
.drag-hint {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--color-text-muted);
  font-size: 12px;
  opacity: 0;
}

.floating-player:hover .drag-hint {
  opacity: 1;
}

.resize-handle {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--gradient-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: se-resize;
  font-size: 12px;
}

/* ===== 播放列表抽屉（悬浮贴边 + 停靠浮动两种定位） ===== */
.playlist-drawer {
  position: absolute;
  top: 0;
  right: -278px;
  width: 270px;
  height: 100%;
  border-radius: 0 16px 16px 0;
  border: var(--player-border);
  background: var(--player-bg);
  backdrop-filter: blur(16px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  transition: transform var(--player-duration-normal) var(--player-ease);
}

.playlist-drawer--dock {
  position: fixed;
  top: auto;
  left: auto;
  right: 12px;
  bottom: calc(var(--player-dock-height) + var(--player-dock-safe-bottom) + 10px);
  width: min(320px, calc(100vw - 24px));
  height: min(42vh, 380px);
  border-radius: 16px;
  box-shadow: var(--player-panel-shadow);
  z-index: 10001;
}

/* ===== 停靠模式搜索抽屉与滑入动效 ===== */
.dock-search-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: calc(var(--player-dock-height) + var(--player-dock-safe-bottom));
  width: min(360px, 92vw);
  z-index: 10002;
  display: flex;
  flex-direction: column;
  padding: 14px 14px 16px;
  border-left: var(--player-border);
  background: var(--player-bg);
  backdrop-filter: blur(18px);
  box-shadow: -10px 0 32px rgba(0, 0, 0, 0.28);
}

.dock-search-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  flex: none;
}

.dock-search-drawer__title {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.dock-search-drawer__close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--player-control-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.dock-search-drawer__close:hover {
  color: #fff;
}

.dock-search-drawer__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dock-search-drawer__results {
  flex: 1;
  min-height: 0;
  max-height: none;
  margin-top: 12px;
}

.dock-search-drawer__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0;
  padding: 24px 12px;
}

.dock-drawer-slide-enter-active,
.dock-drawer-slide-leave-active {
  transition:
    transform var(--player-duration-normal) var(--player-ease),
    opacity var(--player-duration-normal) var(--player-ease);
}

.dock-drawer-slide-enter-from,
.dock-drawer-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* ===== 播放列表条目 ===== */
.playlist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.playlist-title {
  color: var(--color-text-primary);
  font-size: 13px;
}

.playlist-count {
  color: var(--color-text-muted);
  font-size: 12px;
}

.playlist-content {
  flex: 1;
  overflow: auto;
}

.playlist-empty {
  color: var(--color-text-muted);
  text-align: center;
  margin-top: 40px;
}

.playlist-item {
  display: grid;
  grid-template-columns: 40px 1fr auto auto;
  gap: 8px;
  align-items: center;
  border-radius: 10px;
  padding: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}

.playlist-item:hover {
  background: var(--player-lyric-hover);
}

.playlist-item.is-playing {
  border-color: var(--color-primary-35);
  background: rgba(232, 121, 169, 0.15);
}

.playlist-item-cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
}

.playlist-item-title {
  color: var(--color-text-primary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-item-artist {
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-item-playing {
  color: var(--color-primary-light);
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.playlist-item-remove,
.playlist-close-btn {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.playlist-item-remove:hover,
.playlist-close-btn:hover {
  color: #fff;
}

.ui-icon {
  width: var(--player-icon-size);
  height: var(--player-icon-size);
  flex: none;
}

/* ===== 紧凑 / 极简密度适配：缩小控件与图标 ===== */
.player-content.is-compact .control-btn,
.floating-player.density-compact .control-btn {
  width: var(--player-touch-target-compact);
  height: var(--player-touch-target-compact);
}

.player-content.is-compact .ui-icon,
.floating-player.density-compact .ui-icon {
  width: var(--player-icon-size-sm);
  height: var(--player-icon-size-sm);
}

.player-content.is-ultra .player-song-info {
  margin-bottom: 6px;
}

.player-content.is-ultra .player-progress {
  gap: 6px;
}

.player-content.is-ultra .time-label {
  font-size: 10px;
}

.player-content.is-ultra .search-toggle-btn span {
  display: none;
}

/* ===== 移动端响应式 ===== */
@media (max-width: 768px) {
  .player-dock {
    gap: 8px;
    padding: 8px max(10px, env(safe-area-inset-right, 0px)) calc(8px + var(--player-dock-safe-bottom))
      max(10px, env(safe-area-inset-left, 0px));
  }

  .player-dock__cover {
    width: 42px;
    height: 42px;
  }

  .player-dock__center .control-btn,
  .player-dock__actions .dock-action-btn {
    width: var(--player-touch-target-compact);
    height: var(--player-touch-target-compact);
  }

  .player-dock__actions {
    gap: 2px;
  }

  .player-dock__meta .song-artist {
    display: none;
  }

  .player-mini {
    width: min(92vw, 320px);
  }

  .player-expanded-shell {
    width: min(92vw, 340px) !important;
    height: min(78vh, 560px) !important;
  }

  .playlist-toggle-btn {
    right: -20px;
    width: 20px;
    min-width: 20px;
    min-height: 32px;
  }

  .playlist-toggle-btn .ui-icon {
    width: 10px;
    height: 10px;
  }

  .playlist-drawer {
    right: 0;
    top: 0;
    width: 100%;
    height: 100%;
    border-radius: 16px;
    z-index: 2;
  }
}

/* ===== 播放列表抽屉过渡动画 ===== */
.playlist-drawer-fade-enter-active,
.playlist-drawer-fade-leave-active {
  transition: opacity var(--player-duration-normal) var(--player-ease), transform var(--player-duration-normal) var(--player-ease);
}

.playlist-drawer-fade-enter-from,
.playlist-drawer-fade-leave-to {
  opacity: 0;
  transform: translateX(22px);
}
</style>
