/**
 * 遗留播放引擎，站点已改用 `usePulsePlayer` 单例。
 * 不要从 `@/design` 再导出或接入 FloatingPlayer，以免出现第二套 Audio。
 */
import { ref } from 'vue';
import type { Song, PlayMode, PlayerState } from './types';

// 播放器状态
const state = ref<PlayerState>({
  currentSong: null,
  playlist: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  isMuted: false,
  playMode: 'order',
  currentIndex: -1,
  progress: 0,
  isBuffering: false,
  playError: '',
  isSeeking: false,
  seekingProgress: null,
});

// 音频元素（模块级单例，全站共享同一个 Audio 实例）
let audioElement: HTMLAudioElement | null = null;
// 播放请求自增序号：切歌会产生新的 play() 异步调用，用于丢弃旧请求的过期结果，防止竞态
let playRequestId = 0;

/** AbortError 是"play() 被后续操作打断"的正常现象（如快速切歌），不算真正失败，无需提示用户 */
function isIgnorablePlayError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * 初始化音频元素
 */
function initAudio() {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.volume = state.value.volume;
    
    // 事件监听
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('play', () => { state.value.isPlaying = true; });
    audioElement.addEventListener('pause', () => { state.value.isPlaying = false; });
    audioElement.addEventListener('waiting', () => { state.value.isBuffering = true; });
    audioElement.addEventListener('seeking', () => { state.value.isBuffering = true; });
    audioElement.addEventListener('playing', () => { state.value.isBuffering = false; state.value.playError = ''; });
    audioElement.addEventListener('canplay', () => { state.value.isBuffering = false; });
    audioElement.addEventListener('seeked', () => { state.value.isBuffering = false; });
    audioElement.addEventListener('error', handleError);
  }
  return audioElement;
}

/**
 * 时间更新处理
 */
function handleTimeUpdate() {
  if (audioElement) {
    state.value.currentTime = audioElement.currentTime;
    state.value.duration = audioElement.duration || 0;
    if (state.value.isSeeking) return;
    state.value.progress = state.value.duration > 0
      ? audioElement.currentTime / state.value.duration 
      : 0;
  }
}

/**
 * 元数据加载完成
 */
function handleLoadedMetadata() {
  if (audioElement) {
    state.value.duration = audioElement.duration;
    state.value.isBuffering = false;
  }
}

/**
 * 播放结束处理：按播放模式决定下一首行为；顺序模式播完最后一首则停下
 */
function handleEnded() {
  switch (state.value.playMode) {
    case 'single-loop':
      playCurrent();
      break;
    case 'list-loop':
      playNext();
      break;
    case 'shuffle':
      playRandom();
      break;
    default:
      if (state.value.currentIndex < state.value.playlist.length - 1) {
        playNext();
      } else {
        state.value.isPlaying = false;
      }
  }
}

/**
 * 错误处理
 */
function handleError(e: Event) {
  console.error('Audio playback error:', e);
  const mediaError = audioElement?.error;
  const errorMessages: Record<number, string> = {
    1: '播放被中止',
    2: '网络错误导致播放失败',
    3: '音频解码失败',
    4: '音频资源不可用',
  };
  state.value.playError = mediaError?.code ? errorMessages[mediaError.code] || '播放失败，请尝试切换歌曲' : '播放失败，请尝试切换歌曲';
  state.value.isBuffering = false;
  // 自动尝试播放下一首
  if (state.value.playMode === 'list-loop' || state.value.playMode === 'shuffle') {
    playNext();
  }
}

/**
 * 播放当前歌曲
 */
async function playCurrent() {
  if (!state.value.currentSong) return;

  const audioUrl = state.value.currentSong.audioUrl?.trim();
  if (!audioUrl) {
    state.value.playError = '暂无播放地址';
    state.value.isBuffering = false;
    state.value.isPlaying = false;
    return;
  }

  const audio = initAudio();
  // 记录本次请求序号；await 之后若序号已变，说明期间又切了歌，本次结果作废
  const requestId = ++playRequestId;
  state.value.playError = '';
  state.value.isBuffering = true;

  audio.pause();
  if (audio.src !== audioUrl) {
    audio.src = audioUrl;
    audio.load();
  }

  try {
    await audio.play();
    if (requestId !== playRequestId) return;
    state.value.isPlaying = true;
    state.value.isBuffering = false;
  } catch (error) {
    if (requestId !== playRequestId || isIgnorablePlayError(error)) return;
    console.error('Play error:', error);
    state.value.playError = error instanceof Error ? error.message : '播放失败';
    state.value.isBuffering = false;
    state.value.isPlaying = false;
  }
}

/**
 * 播放
 */
async function play() {
  if (!state.value.currentSong) {
    // 如果没有正在播放的歌曲，自动播放第一首
    if (state.value.playlist.length > 0) {
      await playAtIndex(0);
    }
    return;
  }
  
  if (!state.value.isPlaying) {
    const audio = initAudio();
    // 如果 src 没变，直接播放（避免从头开始）
    if (audio.src && audio.src !== state.value.currentSong.audioUrl) {
      audio.src = state.value.currentSong.audioUrl;
    }
    
    try {
      state.value.playError = '';
      state.value.isBuffering = true;
      await audio.play();
      state.value.isPlaying = true;
      state.value.isBuffering = false;
    } catch (error) {
      if (isIgnorablePlayError(error)) return;
      console.error('Play error:', error);
      state.value.playError = error instanceof Error ? error.message : '播放失败';
      state.value.isBuffering = false;
    }
  }
}

/**
 * 暂停
 */
function pause() {
  if (audioElement && state.value.isPlaying) {
    audioElement.pause();
    state.value.isPlaying = false;
  }
}

/**
 * 切换播放/暂停
 */
function togglePlay() {
  if (state.value.isPlaying) {
    pause();
  } else {
    play();
  }
}

/**
 * 播放下一首
 */
async function playNext() {
  if (state.value.playlist.length === 0) return;
  
  let nextIndex: number;
  
  if (state.value.playMode === 'shuffle') {
    // 随机播放，排除当前歌曲
    const availableIndices = state.value.playlist
      .map((_, i) => i)
      .filter(i => i !== state.value.currentIndex);
    nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)] ?? state.value.currentIndex;
  } else {
    nextIndex = (state.value.currentIndex + 1) % state.value.playlist.length;
  }
  
  await playAtIndex(nextIndex);
}

/**
 * 播放上一首
 */
async function playPrev() {
  if (state.value.playlist.length === 0) return;
  
  let prevIndex: number;
  
  if (state.value.playMode === 'shuffle') {
    prevIndex = Math.floor(Math.random() * state.value.playlist.length);
  } else {
    prevIndex = state.value.currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = state.value.playlist.length - 1;
    }
  }
  
  await playAtIndex(prevIndex);
}

/**
 * 播放随机歌曲
 */
async function playRandom() {
  if (state.value.playlist.length === 0) return;
  const randomIndex = Math.floor(Math.random() * state.value.playlist.length);
  await playAtIndex(randomIndex);
}

/**
 * 播放指定索引的歌曲
 */
async function playAtIndex(index: number) {
  if (index < 0 || index >= state.value.playlist.length) return;
  
  const song = state.value.playlist[index];
  if (!song) return;
  state.value.currentSong = song;
  state.value.currentIndex = index;
  state.value.currentTime = 0;
  state.value.progress = 0;
  
  await playCurrent();
}

/**
 * 播放指定歌曲
 */
async function playSong(song: Song) {
  const index = state.value.playlist.findIndex(s => s.id === song.id);
  if (index >= 0) {
    await playAtIndex(index);
  }
}

/**
 * 跳转到指定时间
 */
function seekTo(time: number) {
  if (audioElement) {
    const safeDuration = state.value.duration || audioElement.duration || 0;
    const clampedTime = Math.max(0, Math.min(time, safeDuration));
    audioElement.currentTime = clampedTime;
    state.value.currentTime = clampedTime;
    state.value.progress = safeDuration > 0 ? clampedTime / safeDuration : 0;
    state.value.isSeeking = false;
    state.value.seekingProgress = null;
  }
}

/** 拖动进度条过程中持续调用：只更新 UI 上的临时进度，不真正 seek 音频，避免拖动时频繁跳针 */
function setSeekingProgress(progress: number) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  state.value.isSeeking = true;
  state.value.seekingProgress = clampedProgress;
  state.value.progress = clampedProgress;
  state.value.currentTime = (state.value.duration || 0) * clampedProgress;
}

/** 松手提交：把拖动结束时的进度真正写入 audio.currentTime */
function commitSeekingProgress(progress?: number) {
  if (typeof progress === 'number') {
    setSeekingProgress(progress);
  }
  const finalProgress = state.value.seekingProgress ?? state.value.progress;
  const targetTime = (state.value.duration || 0) * finalProgress;
  seekTo(targetTime);
}

/** 取消拖动（如点击弹层关闭）：丢弃临时进度，回滚到音频真实播放位置 */
function cancelSeekingProgress() {
  state.value.isSeeking = false;
  state.value.seekingProgress = null;
  if (!audioElement) return;
  state.value.currentTime = audioElement.currentTime;
  state.value.progress = state.value.duration > 0 ? audioElement.currentTime / state.value.duration : 0;
}

/**
 * 相对跳转
 */
function seekBy(offset: number) {
  if (audioElement) {
    const newTime = Math.max(
      0, 
      Math.min(audioElement.currentTime + offset, state.value.duration)
    );
    audioElement.currentTime = newTime;
  }
}

/**
 * 设置音量
 */
function setVolume(volume: number) {
  const clampedVolume = Math.max(0, Math.min(1, volume));
  state.value.volume = clampedVolume;
  
  if (audioElement) {
    audioElement.volume = clampedVolume;
  }
  
  // 取消静音
  if (state.value.isMuted && clampedVolume > 0) {
    state.value.isMuted = false;
  }
}

/**
 * 调整音量
 */
function adjustVolume(delta: number) {
  setVolume(state.value.volume + delta);
}

/**
 * 切换静音
 */
function toggleMute() {
  if (audioElement) {
    state.value.isMuted = !state.value.isMuted;
    audioElement.muted = state.value.isMuted;
  }
}

/**
 * 设置播放模式
 */
function setPlayMode(mode: PlayMode) {
  state.value.playMode = mode;
}

/**
 * 循环切换播放模式
 */
function cyclePlayMode() {
  const modes: PlayMode[] = ['order', 'list-loop', 'single-loop', 'shuffle'];
  const currentIndex = modes.indexOf(state.value.playMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  state.value.playMode = modes[nextIndex] ?? 'order';
}

/**
 * 添加歌曲到播放列表
 */
function addToPlaylist(song: Song | Song[], autoPlay = false) {
  const startIndex = state.value.playlist.length;
  if (Array.isArray(song)) {
    state.value.playlist.push(...song);
  } else {
    state.value.playlist.push(song);
  }
  
  // 如果没有正在播放的歌曲且设置了自动播放，自动播放第一首
  // 注意：浏览器限制要求用户先交互才能播放音频
  if (autoPlay && !state.value.currentSong && state.value.playlist.length > 0) {
    playAtIndex(startIndex);
  }
}

/**
 * 从播放列表移除歌曲
 */
function removeFromPlaylist(index: number) {
  if (index < 0 || index >= state.value.playlist.length) return;
  
  state.value.playlist.splice(index, 1);
  
  // 如果移除的是当前播放的歌曲
  if (index === state.value.currentIndex) {
    if (state.value.playlist.length > 0) {
      // 播放被删歌曲的下一首（删掉末尾时退回新的最后一首）
      const newIndex = Math.min(index, state.value.playlist.length - 1);
      playAtIndex(newIndex);
    } else {
      state.value.currentSong = null;
      state.value.currentIndex = -1;
      pause();
    }
  } else if (index < state.value.currentIndex) {
    // 删除的是当前歌曲之前的歌，当前下标前移一位即可
    state.value.currentIndex--;
  }
}

/**
 * 清空播放列表
 */
function clearPlaylist() {
  state.value.playlist = [];
  state.value.currentSong = null;
  state.value.currentIndex = -1;
  pause();
}

/**
 * 替换播放列表
 */
function replacePlaylist(songs: Song[]) {
  clearPlaylist();
  addToPlaylist(songs);
}

/**
 * 获取当前歌词：倒序找到最后一行时间 <= 当前播放时间的歌词，实现歌词滚动同步
 */
function getCurrentLyric() {
  if (!state.value.currentSong?.lyrics) return null;
  
  const lyrics = state.value.currentSong.lyrics;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    const line = lyrics[i];
    if (line && line.time <= state.value.currentTime) {
      return line;
    }
  }
  return null;
}

/**
 * 键盘事件处理：空格播放/暂停、左右切歌、上下调音量、M 静音
 */
function handleKeydown(e: KeyboardEvent) {
  // 如果焦点在输入框中，不处理快捷键
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      playPrev();
      break;
    case 'ArrowRight':
      e.preventDefault();
      playNext();
      break;
    case 'ArrowUp':
      e.preventDefault();
      adjustVolume(0.1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      adjustVolume(-0.1);
      break;
    case 'KeyM':
      e.preventDefault();
      toggleMute();
      break;
  }
}

/**
 * 初始化播放器
 */
function initPlayer() {
  initAudio();
  window.addEventListener('keydown', handleKeydown);
}

/**
 * 清理播放器
 */
function cleanupPlayer() {
  window.removeEventListener('keydown', handleKeydown);
  
  if (audioElement) {
    audioElement.removeEventListener('timeupdate', handleTimeUpdate);
    audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.removeEventListener('ended', handleEnded);
    audioElement.pause();
    audioElement.src = '';
    audioElement = null;
  }
}

/**
 * 音频播放器 Hook
 */
export function useAudioPlayer() {
  return {
    state,
    play,
    pause,
    togglePlay,
    playNext,
    playPrev,
    playAtIndex,
    playSong,
    seekTo,
    setSeekingProgress,
    commitSeekingProgress,
    cancelSeekingProgress,
    seekBy,
    setVolume,
    adjustVolume,
    toggleMute,
    setPlayMode,
    cyclePlayMode,
    addToPlaylist,
    removeFromPlaylist,
    clearPlaylist,
    replacePlaylist,
    getCurrentLyric,
    initPlayer,
    cleanupPlayer,
  };
}
