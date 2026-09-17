/**
 * 设计系统导出入口
 */

// 类型
export * from './types';

// Hooks（网易云扫码登录流程）
export { useNeteaseLogin } from './useNeteaseLogin';

// 组件（注意：FloatingPlayer/useAudioPlayer 属遗留实现，站点播放已迁移到 usePulsePlayer）
export { default as FloatingPlayer } from './FloatingPlayer.vue';
