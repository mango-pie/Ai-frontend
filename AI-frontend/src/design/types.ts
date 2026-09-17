/**
 * 播放器类型定义
 */

/** 播放模式 */
export type PlayMode = 'order' | 'single-loop' | 'list-loop' | 'shuffle';
/** 播放器展示形态：float = 悬浮胶囊，dock = 底部停靠栏 */
export type PlayerDisplayMode = 'float' | 'dock';

/** 歌曲信息 */
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  audioUrl: string;
  duration: number;
  lyrics?: Lyric[];
  trackNumber?: number;
  year?: string;
  /** 网易云官方 MV id，空字符串表示确认无 MV */
  mvId?: string;
  /** 网易云歌手 id（取 ar[0]） */
  artistId?: string;
}

/** 相关 / 歌手 MV 列表项 */
export interface MvSummary {
  id: string;
  name: string;
  coverUrl: string;
  artist?: string;
  duration?: number;
}

/** 歌词项 */
export interface Lyric {
  time: number;
  text: string;
}

/** 播放器状态 */
export interface PlayerState {
  currentSong: Song | null;
  playlist: Song[];
  isPlaying: boolean;
  /** 是否处于缓冲/加载中（waiting、seeking 时为 true） */
  isBuffering: boolean;
  playError: string;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  /** 用户正在拖动进度条，此时暂停 timeupdate 回写进度，避免跳变 */
  isSeeking: boolean;
  /** 拖动进度条期间的临时进度（0~1），松手后清空 */
  seekingProgress: number | null;
  playMode: PlayMode;
  /** 当前歌曲在 playlist 中的下标，-1 表示未播放 */
  currentIndex: number;
  /** 播放进度 0~1，由 currentTime / duration 计算而来 */
  progress: number;
}
