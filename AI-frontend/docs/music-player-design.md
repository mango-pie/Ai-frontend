# 音乐播放器模块设计方案

## 一、需求分析

### 1.1 功能需求

| 需求分类 | 功能点 | 描述 | 优先级 |
|---------|--------|------|--------|
| **播放控制** | 播放/暂停 | 控制音乐播放状态切换 | 高 |
| | 上一首/下一首 | 切换到相邻歌曲 | 高 |
| | 进度条拖动 | 跳转到指定播放位置 | 高 |
| | 音量控制 | 调节播放音量 | 高 |
| | 静音切换 | 快速静音/取消静音 | 中 |
| **播放模式** | 顺序播放 | 按列表顺序播放 | 高 |
| | 单曲循环 | 重复播放当前歌曲 | 高 |
| | 列表循环 | 循环播放整个列表 | 高 |
| | 随机播放 | 随机选择下一首 | 高 |
| **播放列表** | 显示列表 | 展示当前播放队列 | 高 |
| | 选择播放 | 点击列表项开始播放 | 高 |
| | 删除歌曲 | 从列表中移除歌曲 | 中 |
| | 清空列表 | 清除所有歌曲 | 中 |
| **歌曲信息** | 封面展示 | 显示歌曲封面图片 | 中 |
| | 歌词显示 | 同步显示歌词 | 中 |
| | 歌曲详情 | 显示歌手、专辑等信息 | 低 |
| **播放状态** | 播放进度 | 实时显示播放时间 | 高 |
| | 当前时间 | 显示已播放时长 | 高 |
| | 总时长 | 显示歌曲总长度 | 高 |
| **快捷键** | 空格播放/暂停 | 空格键控制播放状态 | 中 |
| | 方向键切歌 | 左右方向键切换歌曲 | 中 |
| | 音量快捷键 | 上下方向键调节音量 | 低 |

### 1.2 非功能需求

| 类别 | 要求 |
|------|------|
| **响应性** | 播放状态更新延迟 < 100ms |
| **兼容性** | 支持主流音频格式（MP3, WAV, OGG） |
| **可用性** | 支持键盘快捷键操作 |
| **扩展性** | 支持自定义皮肤、插件扩展 |

---

## 二、架构设计

### 2.1 模块划分

```
src/
├── components/
│   └── MusicPlayer/
│       ├── index.vue           # 主播放器组件
│       ├── PlayerControls.vue  # 播放控制按钮
│       ├── ProgressBar.vue     # 进度条组件
│       ├── VolumeControl.vue   # 音量控制组件
│       ├── PlayList.vue        # 播放列表组件
│       ├── SongInfo.vue        # 歌曲信息展示
│       └── LyricsDisplay.vue   # 歌词显示组件
├── composables/
│   └── useAudioPlayer.ts      # 播放器核心逻辑 Hook
├── stores/
│   └── musicPlayer.ts         # 播放器状态管理
├── types/
│   └── music.ts               # 类型定义
└── utils/
    └── audioHelper.ts         # 音频工具函数
```

### 2.2 核心流程图

```
用户操作 → PlayerControls → useAudioPlayer → HTML5 Audio API → 更新状态 → 渲染UI
                                                           ↓
                                                      触发事件
                                                           ↓
                                                  歌词同步更新
```

### 2.3 状态管理结构

```typescript
interface PlayerState {
  currentSong: Song | null;      // 当前播放歌曲
  playlist: Song[];              // 播放列表
  isPlaying: boolean;            // 是否正在播放
  currentTime: number;           // 当前播放时间（秒）
  duration: number;              // 歌曲总时长（秒）
  volume: number;                // 音量（0-1）
  isMuted: boolean;              // 是否静音
  playMode: PlayMode;            // 播放模式
  currentIndex: number;          // 当前歌曲在列表中的索引
  progress: number;              // 播放进度（0-1）
}

type PlayMode = 'order' | 'single-loop' | 'list-loop' | 'shuffle';
```

---

## 三、数据结构设计

### 3.1 歌曲数据结构

```typescript
// src/types/music.ts
export interface Song {
  id: string;                 // 歌曲唯一标识
  title: string;              // 歌曲名称
  artist: string;             // 歌手名称
  album: string;              // 专辑名称
  coverUrl: string;           // 封面图片URL
  audioUrl: string;           // 音频文件URL
  duration: number;           // 时长（秒）
  lyrics?: Lyric[];           // 歌词数据
  trackNumber?: number;       // 曲目编号
  year?: string;              // 发行年份
}

export interface Lyric {
  time: number;               // 时间点（秒）
  text: string;               // 歌词内容
}

export type PlayMode = 'order' | 'single-loop' | 'list-loop' | 'shuffle';

export interface PlayerState {
  currentSong: Song | null;
  playlist: Song[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playMode: PlayMode;
  currentIndex: number;
  progress: number;
}
```

---

## 四、API 设计

### 4.1 播放器 Hook API

```typescript
// src/composables/useAudioPlayer.ts

export function useAudioPlayer() {
  // 状态
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
  });

  // 播放控制
  const play = () => void;           // 播放
  const pause = () => void;          // 暂停
  const togglePlay = () => void;     // 切换播放/暂停
  const playNext = () => void;       // 下一首
  const playPrev = () => void;       // 上一首
  const playAtIndex = (index: number) => void;  // 播放指定索引的歌曲

  // 进度控制
  const seekTo = (time: number) => void;  // 跳转到指定时间
  const seekBy = (offset: number) => void; // 相对跳转

  // 音量控制
  const setVolume = (volume: number) => void;  // 设置音量
  const adjustVolume = (delta: number) => void; // 调整音量
  const toggleMute = () => void;               // 切换静音

  // 播放模式
  const setPlayMode = (mode: PlayMode) => void;  // 设置播放模式
  const cyclePlayMode = () => void;              // 切换播放模式

  // 播放列表管理
  const addToPlaylist = (song: Song | Song[]) => void;  // 添加歌曲
  const removeFromPlaylist = (index: number) => void;   // 移除歌曲
  const clearPlaylist = () => void;                     // 清空列表
  const replacePlaylist = (songs: Song[]) => void;      // 替换列表

  // 获取当前歌词
  const getCurrentLyric = computed(() => Lyric | null);

  return {
    state,
    play,
    pause,
    togglePlay,
    playNext,
    playPrev,
    playAtIndex,
    seekTo,
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
  };
}
```

### 4.2 快捷键支持

| 快捷键 | 功能 |
|--------|------|
| `Space` | 播放/暂停 |
| `ArrowLeft` | 上一首 |
| `ArrowRight` | 下一首 |
| `ArrowUp` | 音量+10% |
| `ArrowDown` | 音量-10% |
| `M` | 静音切换 |
| `1-4` | 切换播放模式 |

---

## 五、UI 组件设计

### 5.1 主播放器组件

```vue
<!-- src/components/MusicPlayer/index.vue -->
<script setup lang="ts">
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import PlayerControls from './PlayerControls.vue';
import ProgressBar from './ProgressBar.vue';
import VolumeControl from './VolumeControl.vue';
import PlayList from './PlayList.vue';
import SongInfo from './SongInfo.vue';
import LyricsDisplay from './LyricsDisplay.vue';

const { state, togglePlay, playNext, playPrev, setPlayMode, addToPlaylist } = useAudioPlayer();
</script>

<template>
  <div class="music-player">
    <!-- 主播放区域 -->
    <div class="player-main">
      <SongInfo />
      <ProgressBar />
      <PlayerControls />
      <VolumeControl />
    </div>
    
    <!-- 歌词显示 -->
    <LyricsDisplay />
    
    <!-- 播放列表侧边栏 -->
    <PlayList />
  </div>
</template>

<style scoped>
.music-player {
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--shadow-lg);
}

.player-main {
  display: flex;
  align-items: center;
  gap: 20px;
}
</style>
```

### 5.2 播放控制组件

```vue
<!-- src/components/MusicPlayer/PlayerControls.vue -->
<script setup lang="ts">
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { 
  SkipBackOutlined, 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  SkipForwardOutlined,
  RepeatOutlined,
  RepeatOneOutlined,
  ShuffleOutlined
} from '@ant-design/icons-vue';

const { state, togglePlay, playNext, playPrev, cyclePlayMode } = useAudioPlayer();

const modeIcons = {
  'order': RepeatOutlined,
  'single-loop': RepeatOneOutlined,
  'list-loop': RepeatOutlined,
  'shuffle': ShuffleOutlined,
};
</script>

<template>
  <div class="player-controls">
    <a-button 
      type="text" 
      :icon="h(SkipBackOutlined)" 
      @click="playPrev"
    />
    
    <a-button 
      type="text" 
      :icon="h(state.isPlaying ? PauseCircleOutlined : PlayCircleOutlined)" 
      class="play-btn"
      @click="togglePlay"
    />
    
    <a-button 
      type="text" 
      :icon="h(SkipForwardOutlined)" 
      @click="playNext"
    />
    
    <a-button 
      type="text" 
      :icon="h(modeIcons[state.playMode])" 
      class="mode-btn"
      @click="cyclePlayMode"
    />
  </div>
</template>

<style scoped>
.player-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.play-btn {
  font-size: 32px;
}

.mode-btn {
  margin-left: 8px;
}
</style>
```

### 5.3 进度条组件

```vue
<!-- src/components/MusicPlayer/ProgressBar.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';

const { state, seekTo } = useAudioPlayer();

const formattedCurrentTime = computed(() => formatTime(state.currentTime));
const formattedDuration = computed(() => formatTime(state.duration));

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function handleProgressClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  seekTo(percent * state.duration);
}
</script>

<template>
  <div class="progress-bar-container">
    <span class="time-text">{{ formattedCurrentTime }}</span>
    <div class="progress-bar" @click="handleProgressClick">
      <div class="progress-fill" :style="{ width: `${state.progress * 100}%` }" />
      <div class="progress-thumb" :style="{ left: `${state.progress * 100}%` }" />
    </div>
    <span class="time-text">{{ formattedDuration }}</span>
  </div>
</template>

<style scoped>
.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.time-text {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 40px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  position: relative;
  cursor: pointer;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 3px;
  transition: width 0.1s linear;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background: var(--primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: left 0.1s linear;
}
</style>
```

### 5.4 歌词显示组件

```vue
<!-- src/components/MusicPlayer/LyricsDisplay.vue -->
<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';

const { state, getCurrentLyric } = useAudioPlayer();
const lyricsContainer = ref<HTMLElement | null>(null);
const activeLyricIndex = ref(-1);

const lyrics = computed(() => state.currentSong?.lyrics || []);

watch(getCurrentLyric, (lyric) => {
  if (lyric && lyrics.value.length > 0) {
    const index = lyrics.value.findIndex(l => l.time >= state.currentTime);
    activeLyricIndex.value = index > 0 ? index - 1 : 0;
    nextTick(() => {
      const activeElement = lyricsContainer.value?.querySelector('.active-lyric');
      activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
});
</script>

<template>
  <div class="lyrics-container" ref="lyricsContainer">
    <div v-if="lyrics.length === 0" class="no-lyrics">
      <p>暂无歌词</p>
    </div>
    <div v-else class="lyrics-list">
      <div
        v-for="(lyric, index) in lyrics"
        :key="index"
        :class="['lyric-item', { 'active-lyric': index === activeLyricIndex }]"
      >
        {{ lyric.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyrics-container {
  height: 200px;
  overflow-y: auto;
  margin-top: 20px;
  padding: 10px;
}

.no-lyrics {
  text-align: center;
  color: var(--text-secondary);
}

.lyrics-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lyric-item {
  padding: 4px 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.active-lyric {
  color: var(--primary);
  font-size: 16px;
  background: rgba(var(--primary), 0.1);
}
</style>
```

---

## 六、核心实现逻辑

### 6.1 音频播放核心逻辑

```typescript
// src/composables/useAudioPlayer.ts
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Song, PlayerState, PlayMode, Lyric } from '@/types/music';

export function useAudioPlayer() {
  const audioRef = ref<HTMLAudioElement | null>(null);
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
  });

  // 创建音频元素
  const createAudio = () => {
    if (!audioRef.value) {
      audioRef.value = new Audio();
      audioRef.value.volume = state.value.volume;
      audioRef.value.addEventListener('timeupdate', handleTimeUpdate);
      audioRef.value.addEventListener('loadedmetadata', handleLoadedMetadata);
      audioRef.value.addEventListener('ended', handleEnded);
      audioRef.value.addEventListener('error', handleError);
    }
    return audioRef.value;
  };

  // 时间更新处理
  const handleTimeUpdate = () => {
    if (audioRef.value) {
      state.value.currentTime = audioRef.value.currentTime;
      state.value.progress = state.value.duration > 0 
        ? audioRef.value.currentTime / state.value.duration 
        : 0;
    }
  };

  // 元数据加载完成
  const handleLoadedMetadata = () => {
    if (audioRef.value) {
      state.value.duration = audioRef.value.duration;
    }
  };

  // 播放结束处理
  const handleEnded = () => {
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
        }
    }
  };

  // 错误处理
  const handleError = () => {
    console.error('Audio playback error');
    if (state.value.playMode === 'list-loop' || state.value.playMode === 'shuffle') {
      playNext();
    }
  };

  // 播放当前歌曲
  const playCurrent = async () => {
    if (!state.value.currentSong) return;
    const audio = createAudio();
    audio.src = state.value.currentSong.audioUrl;
    state.value.isPlaying = true;
    await audio.play().catch(console.error);
  };

  // 播放
  const play = () => {
    if (!state.value.isPlaying) {
      playCurrent();
    }
  };

  // 暂停
  const pause = () => {
    if (audioRef.value && state.value.isPlaying) {
      audioRef.value.pause();
      state.value.isPlaying = false;
    }
  };

  // 切换播放/暂停
  const togglePlay = () => {
    if (state.value.isPlaying) {
      pause();
    } else {
      play();
    }
  };

  // 播放下一首
  const playNext = () => {
    if (state.value.playlist.length === 0) return;
    
    let nextIndex: number;
    if (state.value.playMode === 'shuffle') {
      nextIndex = Math.floor(Math.random() * state.value.playlist.length);
    } else {
      nextIndex = (state.value.currentIndex + 1) % state.value.playlist.length;
    }
    
    playAtIndex(nextIndex);
  };

  // 播放上一首
  const playPrev = () => {
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
    
    playAtIndex(prevIndex);
  };

  // 播放随机歌曲
  const playRandom = () => {
    const randomIndex = Math.floor(Math.random() * state.value.playlist.length);
    playAtIndex(randomIndex);
  };

  // 播放指定索引的歌曲
  const playAtIndex = async (index: number) => {
    if (index < 0 || index >= state.value.playlist.length) return;
    
    const song = state.value.playlist[index];
    state.value.currentSong = song;
    state.value.currentIndex = index;
    state.value.currentTime = 0;
    state.value.progress = 0;
    
    await playCurrent();
  };

  // 跳转到指定时间
  const seekTo = (time: number) => {
    if (audioRef.value) {
      audioRef.value.currentTime = time;
    }
  };

  // 相对跳转
  const seekBy = (offset: number) => {
    if (audioRef.value) {
      const newTime = Math.max(0, Math.min(audioRef.value.currentTime + offset, state.value.duration));
      audioRef.value.currentTime = newTime;
    }
  };

  // 设置音量
  const setVolume = (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    state.value.volume = clampedVolume;
    if (audioRef.value) {
      audioRef.value.volume = clampedVolume;
    }
  };

  // 调整音量
  const adjustVolume = (delta: number) => {
    setVolume(state.value.volume + delta);
  };

  // 切换静音
  const toggleMute = () => {
    state.value.isMuted = !state.value.isMuted;
    if (audioRef.value) {
      audioRef.value.muted = state.value.isMuted;
    }
  };

  // 设置播放模式
  const setPlayMode = (mode: PlayMode) => {
    state.value.playMode = mode;
  };

  // 循环切换播放模式
  const cyclePlayMode = () => {
    const modes: PlayMode[] = ['order', 'list-loop', 'single-loop', 'shuffle'];
    const currentIndex = modes.indexOf(state.value.playMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    state.value.playMode = modes[nextIndex];
  };

  // 添加歌曲到列表
  const addToPlaylist = (song: Song | Song[]) => {
    if (Array.isArray(song)) {
      state.value.playlist.push(...song);
    } else {
      state.value.playlist.push(song);
    }
    // 如果没有正在播放的歌曲，自动播放第一首
    if (!state.value.currentSong && state.value.playlist.length > 0) {
      playAtIndex(0);
    }
  };

  // 从列表移除歌曲
  const removeFromPlaylist = (index: number) => {
    if (index < 0 || index >= state.value.playlist.length) return;
    
    state.value.playlist.splice(index, 1);
    
    // 如果移除的是当前播放的歌曲
    if (index === state.value.currentIndex) {
      if (state.value.playlist.length > 0) {
        const newIndex = Math.min(index, state.value.playlist.length - 1);
        playAtIndex(newIndex);
      } else {
        state.value.currentSong = null;
        state.value.currentIndex = -1;
        pause();
      }
    } else if (index < state.value.currentIndex) {
      state.value.currentIndex--;
    }
  };

  // 清空列表
  const clearPlaylist = () => {
    state.value.playlist = [];
    state.value.currentSong = null;
    state.value.currentIndex = -1;
    pause();
  };

  // 替换列表
  const replacePlaylist = (songs: Song[]) => {
    clearPlaylist();
    addToPlaylist(songs);
  };

  // 获取当前歌词
  const getCurrentLyric = computed((): Lyric | null => {
    if (!state.value.currentSong?.lyrics) return null;
    
    const lyrics = state.value.currentSong.lyrics;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= state.value.currentTime) {
        return lyrics[i];
      }
    }
    return null;
  });

  // 键盘事件处理
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return; // 如果焦点在输入框中，不处理快捷键
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
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        e.preventDefault();
        const modeIndex = parseInt(e.code.replace('Digit', '')) - 1;
        const modes: PlayMode[] = ['order', 'list-loop', 'single-loop', 'shuffle'];
        if (modeIndex >= 0 && modeIndex < modes.length) {
          setPlayMode(modes[modeIndex]);
        }
        break;
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
    if (audioRef.value) {
      audioRef.value.removeEventListener('timeupdate', handleTimeUpdate);
      audioRef.value.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audioRef.value.removeEventListener('ended', handleEnded);
      audioRef.value.removeEventListener('error', handleError);
      audioRef.value.pause();
      audioRef.value = null;
    }
  });

  return {
    state,
    play,
    pause,
    togglePlay,
    playNext,
    playPrev,
    playAtIndex,
    seekTo,
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
  };
}
```

---

## 七、集成方案

### 7.1 在页面中使用

```vue
<!-- src/pages/MusicPage.vue -->
<script setup lang="ts">
import { onMounted } from 'vue';
import MusicPlayer from '@/components/MusicPlayer';
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import type { Song } from '@/types/music';

const { addToPlaylist } = useAudioPlayer();

// 模拟歌曲数据
const mockSongs: Song[] = [
  {
    id: '1',
    title: '示例歌曲 1',
    artist: '艺术家 A',
    album: '专辑 X',
    coverUrl: 'https://example.com/cover1.jpg',
    audioUrl: 'https://example.com/audio1.mp3',
    duration: 240,
    lyrics: [
      { time: 0, text: '歌曲开始' },
      { time: 30, text: '第一句歌词' },
      { time: 60, text: '第二句歌词' },
    ],
  },
  // ... 更多歌曲
];

onMounted(() => {
  addToPlaylist(mockSongs);
});
</script>

<template>
  <div class="music-page">
    <MusicPlayer />
  </div>
</template>
```

### 7.2 全局注册组件

```typescript
// src/main.ts
import { createApp } from 'vue';
import App from './App.vue';
import MusicPlayer from '@/components/MusicPlayer';

const app = createApp(App);
app.component('MusicPlayer', MusicPlayer);
app.mount('#app');
```

---

## 八、扩展功能建议

### 8.1 歌词同步优化
- 使用 Web Audio API 精确同步
- 支持逐字高亮显示
- 支持歌词编辑和上传

### 8.2 播放列表管理
- 支持保存/加载播放列表
- 支持列表排序（按名称、时长、添加时间）
- 支持收藏歌曲

### 8.3 音效增强
- 均衡器调节
- 音效模式（摇滚、古典、流行等）
- 环绕声效果

### 8.4 社交分享
- 分享当前播放歌曲
- 查看好友正在听的歌曲
- 歌单分享

### 8.5 移动端适配
- 触控手势支持
- 锁屏播放控制
- 后台播放支持

---

## 九、注意事项

### 9.1 浏览器兼容性
- 使用 Web Audio API 需要用户交互后才能播放
- 某些浏览器对音频格式支持有限
- 移动端自动播放策略严格

### 9.2 性能优化
- 使用 Web Worker 处理歌词解析
- 音频缓存策略
- 避免频繁 DOM 更新

### 9.3 安全考虑
- 只加载 HTTPS 音频资源
- 验证音频 URL 来源
- 防止 XSS 攻击

---

## 十、参考资源

- [HTML5 Audio API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
- [Audio Worklet API](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)