<script setup lang="ts">
/**
 * 「Tweaks」外观调校悬浮球：各房间右下角的设置面板
 * - 受控组件：主题/自动主题/水墨模式/背景模式均由父壳持有，本组件只负责展示与 emit 事件
 * - 点击悬浮球展开面板，点击面板外任意区域自动收起
 */
import { onMounted, onUnmounted, ref } from 'vue'
import type { HomeTheme } from '@/composables/useHomeTheme'
import type { InkMode } from '@/composables/useInkMode'
import type { StationBgMode } from '@/composables/useBackgroundMode'
import { hasBackgroundImages } from '@/composables/useBackgroundSlideshow'

defineProps<{
  theme: HomeTheme
  autoTheme: boolean
  inkMode: InkMode
  bgMode: StationBgMode
}>()

// 所有调整动作都以事件上抛，由父壳（各 RoomShell）统一落地
const emit = defineEmits<{
  setTheme: [HomeTheme]
  setAutoTheme: [boolean]
  setInkMode: [InkMode]
  setBgMode: [StationBgMode]
}>()

// 面板展开态与根节点引用（用于判断点击是否落在面板外）
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

// 三个分组的选择项：时段主题 / 阅读模式 / 背景模式
const themes: { key: HomeTheme; label: string }[] = [
  { key: 'morning', label: '晨' },
  { key: 'noon', label: '午' },
  { key: 'dusk', label: '昏' },
  { key: 'night', label: '夜' },
]

const inks: { key: InkMode; label: string }[] = [
  { key: 'day', label: '日间' },
  { key: 'night', label: '夜间' },
]

const bgModes: { key: StationBgMode; label: string }[] = [
  { key: 'period', label: '时段' },
  { key: 'carousel', label: '轮播' },
]

/** 点击到面板外部时收起面板（经典 outside-click 关闭模式） */
const onDocClick = (e: MouseEvent) => {
  if (!rootRef.value?.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div id="tweaks" ref="rootRef" :class="{ open }">
    <!-- 调校面板：open 时展开，收起态由 CSS 隐藏 -->
    <div class="panel">
      <h4>TWEAKS</h4>
      <!-- 时段主题：开启「跟随时间」时禁用手动选择，避免与自动切换打架 -->
      <div class="row">
        <label>时段</label>
        <div class="seg">
          <button
            v-for="t in themes"
            :key="t.key"
            type="button"
            :class="{ on: theme === t.key }"
            :disabled="autoTheme"
            @click="emit('setTheme', t.key)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>
      <!-- 是否跟随真实时间自动切换主题 -->
      <div class="row">
        <label>跟随时间</label>
        <button
          type="button"
          class="switch"
          :class="{ on: autoTheme }"
          aria-label="跟随真实时间"
          @click="emit('setAutoTheme', !autoTheme)"
        />
      </div>
      <!-- 日间/夜间阅读（水墨）模式 -->
      <div class="row">
        <label>阅读模式</label>
        <div class="seg">
          <button
            v-for="m in inks"
            :key="m.key"
            type="button"
            :class="{ on: inkMode === m.key }"
            @click="emit('setInkMode', m.key)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
      <!-- 背景模式：站点未配置背景图时禁用「轮播」选项 -->
      <div class="row">
        <label>背景</label>
        <div class="seg">
          <button
            v-for="b in bgModes"
            :key="b.key"
            type="button"
            :class="{ on: bgMode === b.key }"
            :disabled="b.key === 'carousel' && !hasBackgroundImages"
            @click="emit('setBgMode', b.key)"
          >
            {{ b.label }}
          </button>
        </div>
      </div>
      <!-- 预留扩展位：父组件可塞入额外调校项 -->
      <slot />
    </div>
    <!-- 右下角悬浮球按钮：点击展开面板 -->
    <button class="fab" type="button" @click="open = true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
        <circle cx="16" cy="8" r="2.4" />
        <circle cx="8" cy="16" r="2.4" />
      </svg>
      Tweaks
    </button>
  </div>
</template>
