<script setup lang="ts">
/**
 * 悬浮歌词窗口：
 * 1. 可拖拽（标题栏按下、document 级移动监听，兼容鼠标与触摸）；
 * 2. 歌词随播放进度自动滚动居中，用户手动滚动时暂停自动滚动，停止操作 1.6s 后恢复；
 * 3. 点击任意歌词行可跳转播放进度（seekLyric），并给出短暂的高亮反馈。
 * 数据来源于全局单例 usePulsePlayer。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { usePulsePlayer } from '@/composables/usePulsePlayer';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const p = usePulsePlayer();

// ---- 拖拽状态：窗口左上角坐标 + 按下时的指针偏移 ----
const position = ref({ x: 100, y: 100 });
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

// ---- 歌词滚动 / 点击反馈状态 ----
const lyricsContainer = ref<HTMLElement | null>(null);
// 用户正在手动滚动歌词时为 true，此时屏蔽自动滚动定位
const isUserScrolling = ref(false);
// 被点击 seek 的歌词行下标，短暂高亮后复位为 -1
const seekFeedbackIndex = ref(-1);
let scrollTimeout: number | null = null;
let seekTimeout: number | null = null;

const lyrics = computed(() => p.lyricDisplayLines.value);
const currentLyricIndex = computed(() => p.lyricIndex.value);
const songTitle = computed(() => p.currentTrack.value?.title || '歌词');

/** 把当前演唱行滚动到容器中央；用户手动滚动期间不干预 */
const scrollToCurrentLyric = () => {
  if (isUserScrolling.value || !lyricsContainer.value) return;

  const currentIndex = currentLyricIndex.value;
  if (currentIndex >= 0) {
    const lyricElement = lyricsContainer.value.children[currentIndex] as HTMLElement;
    lyricElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

/** 用户滚动时标记"手动模式"，停手 1.6s 后自动恢复滚动跟随 */
const handleScroll = () => {
  isUserScrolling.value = true;
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = window.setTimeout(() => {
    isUserScrolling.value = false;
    scrollToCurrentLyric();
  }, 1600);
};

/** 点击歌词行：跳转播放进度到该行时间点，并短暂高亮反馈 */
const handleLyricClick = (_time: number, index: number) => {
  p.seekLyric(index);
  seekFeedbackIndex.value = index;
  if (seekTimeout) clearTimeout(seekTimeout);
  seekTimeout = window.setTimeout(() => {
    seekFeedbackIndex.value = -1;
  }, 520);
};

/** 拖拽开始：记录指针位置与窗口左上角的偏移，兼容触摸事件 */
const handleDragStart = (e: MouseEvent | TouchEvent) => {
  isDragging.value = true;
  const touch = 'touches' in e ? e.touches.item(0) : null;
  const clientX = touch ? touch.clientX : ('clientX' in e ? e.clientX : 0);
  const clientY = touch ? touch.clientY : ('clientY' in e ? e.clientY : 0);
  dragOffset.value = {
    x: clientX - position.value.x,
    y: clientY - position.value.y
  };
  e.preventDefault();
};

/** 拖拽移动：按指针位置换算新坐标，并夹在视口范围内（保留 340x390 的窗口尺寸余量） */
const handleDragMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return;
  const touch = 'touches' in e ? e.touches.item(0) : null;
  const clientX = touch ? touch.clientX : ('clientX' in e ? e.clientX : 0);
  const clientY = touch ? touch.clientY : ('clientY' in e ? e.clientY : 0);
  
  let newX = clientX - dragOffset.value.x;
  let newY = clientY - dragOffset.value.y;
  
  newX = Math.max(10, Math.min(newX, window.innerWidth - 340));
  newY = Math.max(10, Math.min(newY, window.innerHeight - 390));
  
  position.value = { x: newX, y: newY };
};

const handleDragEnd = () => {
  isDragging.value = false;
};

// 当前行变化时自动滚动跟随（用户手动滚动时让位）
watch(currentLyricIndex, () => {
  if (!isUserScrolling.value && lyrics.value.length > 0) {
    scrollToCurrentLyric();
  }
});

// 窗口重新打开时立即定位到当前演唱行
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) scrollToCurrentLyric();
  },
);

// 拖拽的移动/抬起事件挂在 document 上，保证鼠标移出窗口仍能继续拖
onMounted(() => {
  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', handleDragEnd);
  document.addEventListener('touchmove', handleDragMove);
  document.addEventListener('touchend', handleDragEnd);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', handleDragEnd);
  document.removeEventListener('touchmove', handleDragMove);
  document.removeEventListener('touchend', handleDragEnd);
  if (scrollTimeout) clearTimeout(scrollTimeout);
  if (seekTimeout) clearTimeout(seekTimeout);
});
</script>

<template>
  <!-- 淡入淡出的悬浮歌词窗：无歌词或隐藏时不渲染 -->
  <Transition name="fade">
    <div 
      v-if="visible && lyrics.length > 0"
      class="floating-lyric"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      :class="{ 'is-dragging': isDragging }"
    >
      <!-- 标题栏：按下可拖动整个窗口 -->
      <div class="lyric-header" @mousedown="handleDragStart" @touchstart="handleDragStart">
        <span class="lyric-title">{{ songTitle }}</span>
        <button class="close-btn" @click.stop="emit('close')" title="关闭歌词窗">✕</button>
      </div>

      <!-- 歌词滚动区：当前行高亮，被点击 seek 的行有额外高亮反馈 -->
      <div
        ref="lyricsContainer" 
        class="lyrics-container"
        :class="{ 'is-user-scrolling': isUserScrolling }"
        @scroll="handleScroll"
      >
        <div
          v-for="(lyric, index) in lyrics"
          :key="index"
          class="lyric-item"
          :class="{ 'is-current': index === currentLyricIndex, 'is-seeked': seekFeedbackIndex === index }"
          @click="handleLyricClick(lyric.time, index)"
        >
          {{ lyric.text }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.floating-lyric {
  position: fixed;
  z-index: 9998;
  width: 320px;
  background: var(--player-bg);
  border: var(--player-border);
  backdrop-filter: blur(18px);
  border-radius: var(--player-radius);
  box-shadow: var(--player-panel-shadow-glow);
  user-select: none;
  overflow: hidden;
  transition: transform var(--player-duration-normal) var(--player-ease), box-shadow var(--player-duration-normal) var(--player-ease);
}

.floating-lyric.is-dragging {
  cursor: grabbing;
  transform: scale(1.01);
  box-shadow: var(--player-panel-shadow);
}

.lyric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.03);
  cursor: move;
}

.lyric-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: var(--player-control-bg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--player-duration-fast) var(--player-ease), color var(--player-duration-fast) var(--player-ease);
}

.close-btn:hover {
  background: var(--player-control-bg-hover);
  color: var(--color-text-primary);
}

.lyrics-container {
  max-height: 340px;
  overflow-y: auto;
  padding: 14px;
}

.lyric-item {
  padding: 8px 10px;
  border-radius: 10px;
  text-align: center;
  font-size: 14px;
  color: var(--player-lyric-inactive);
  cursor: pointer;
  transition: color var(--player-duration-fast) var(--player-ease), background var(--player-duration-fast) var(--player-ease), transform var(--player-duration-fast) var(--player-ease);
  line-height: 1.6;
}

.lyric-item:hover {
  color: var(--player-lyric-active);
  background: var(--player-lyric-hover);
}

.lyric-item.is-current {
  color: var(--player-lyric-active);
  font-size: 15px;
  font-weight: 600;
  background: linear-gradient(90deg, rgba(232, 121, 169, 0.22) 0%, rgba(124, 156, 224, 0.15) 100%);
}

.lyric-item.is-seeked {
  transform: scale(1.02);
  box-shadow: inset 0 0 0 1px var(--color-primary-35);
}

.lyrics-container.is-user-scrolling .lyric-item.is-current {
  opacity: 0.8;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--player-duration-normal) var(--player-ease), transform var(--player-duration-normal) var(--player-ease);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.lyrics-container::-webkit-scrollbar {
  width: 4px;
}

.lyrics-container::-webkit-scrollbar-track {
  background: transparent;
}

.lyrics-container::-webkit-scrollbar-thumb {
  background: var(--color-border-hover);
  border-radius: 2px;
}

.lyrics-container::-webkit-scrollbar-thumb:hover {
  background: var(--color-primary-35);
}

@media (max-width: 768px) {
  .floating-lyric {
    width: min(92vw, 340px);
  }
}
</style>
