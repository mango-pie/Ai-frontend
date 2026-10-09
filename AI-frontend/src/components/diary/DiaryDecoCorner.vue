<script setup lang="ts">
/**
 * 手账房间“装饰角”组件
 * 房间侧边的氛围小部件：时段徽章、可翻转拍立得、心情刻度条、装饰印章与时段寄语。
 * 除读取当日条目的心情外不含业务操作，交互均为本地动画加轻提示。
 */
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { MOOD_HEX, MOOD_LEVEL, MO_SHORT, popCraftAnim } from '@/utils/diaryCraft'
import { MOOD_OPTIONS } from '@/utils/diaryFormat'
import { useDiaryRoomTheme } from '@/composables/useDiaryRoomTheme'

const props = defineProps<{
  date: string
  entry: API.DiaryEntryVO | null
}>()

// 房间时段主题信息（名称/提示/寄语），随手账房间主题联动
const { period } = useDiaryRoomTheme()
// 拍立得翻转开关：正面为相框占位，背面为时段提示
const flipped = ref(false)
const cap = computed(() => `${MO_SHORT[new Date(`${props.date}T12:00:00`).getMonth()]} · 手账`)

// 当日心情 → 展示名 / 刻度条宽度与渐变色，均由心情等级映射表驱动
const mood = computed(() => props.entry?.mood)
const moodName = computed(() => {
  if (!mood.value) return '未记'
  return MOOD_OPTIONS.find((x) => x.value === mood.value)?.label ?? '未记'
})
const fillWidth = computed(() => (mood.value ? `${MOOD_LEVEL[mood.value] ?? 8}%` : '8%'))
const fillStyle = computed(() => {
  if (!mood.value) return { width: fillWidth.value }
  const hex = MOOD_HEX[mood.value]
  return {
    width: fillWidth.value,
    background: `linear-gradient(90deg, ${hex}, color-mix(in srgb, ${hex} 55%, #f490ad))`,
  }
})
// 相框底色随心情色轻微晕染；未记心情时保持中性样式
const frameStyle = computed(() => {
  if (!mood.value) return {}
  const hex = MOOD_HEX[mood.value]
  return {
    background: `radial-gradient(80px 50px at 30% 40%, ${hex}55, transparent 70%), linear-gradient(160deg, #f7f0fa, #eef6f8)`,
    borderColor: `${hex}66`,
  }
})

// 轻提示：短暂弹出文案，不打断操作
function toast(text: string) {
  message.info({ content: text, duration: 1.2 })
}

// 播放一次性手工小动画（popCraftAnim）并给出对应提示，纯装饰性反馈
function bump(e: Event, cls: string, ms: number, msg: string) {
  popCraftAnim(e.currentTarget as HTMLElement, cls, ms)
  toast(msg)
}
</script>

<template>
  <div class="deco-corner glass">
    <span class="tape sun" />
    <div class="period-chip"><span class="dot" /><span>{{ period.name }}</span></div>
    <h3 style="font-size: 15px; letter-spacing: 2px">私密手账</h3>

    <!-- 拍立得：点击整卡翻转，正面为 1:1 相框占位，背面为时段提示 -->
    <button
      type="button"
      class="polaroid craft-hit"
      :class="{ 'is-flipped': flipped }"
      title="点击翻转"
      @click="flipped = !flipped"
    >
      <div class="polaroid-inner">
        <div class="polaroid-face front">
          <div class="frame" :style="frameStyle">[image] 1:1</div>
          <div class="cap">{{ cap }}</div>
        </div>
        <div class="polaroid-face back">
          <div class="bk-period">{{ period.name }}</div>
          <div class="bk-hint text-pretty">{{ period.hint }}</div>
        </div>
      </div>
    </button>

    <!-- 心情刻度条：点击/回车后以轻提示播报当日心情 -->
    <div
      class="mood-meter craft-hit"
      role="button"
      tabindex="0"
      title="点一下看心情"
      @click="
        bump($event, 'is-pulse', 600, moodName !== '未记' ? `心情 · ${moodName}` : '这一天还没记心情')
      "
      @keydown.enter="
        bump($event, 'is-pulse', 600, moodName !== '未记' ? `心情 · ${moodName}` : '这一天还没记心情')
      "
    >
      <div class="mm-title">MOOD</div>
      <div class="mm-fill"><i :style="fillStyle" /></div>
      <div class="mm-name">{{ moodName }}</div>
    </div>

    <!-- 装饰印章按钮：仅播放盖章动画与提示 -->
    <div class="stamp-row">
      <button
        type="button"
        class="stamp craft-hit"
        title="盖章"
        @click="bump($event, 'is-pop', 500, '盖章 · 私密')"
      >
        私密
      </button>
      <button
        type="button"
        class="stamp b craft-hit"
        title="盖章"
        @click="bump($event, 'is-pop', 500, '盖章 · 一日一篇')"
      >
        一日
      </button>
    </div>

    <div class="deco-quote">
      <div class="q">「</div>
      <p class="text-pretty">{{ period.quote }}</p>
    </div>
  </div>
</template>
