<script setup lang="ts">
/**
 * 日记页的手账装饰组件：书签、翻页本、压花、日期章、票根、火漆、心情点等一页小物
 * - 纯展示 + 点击小动效（popCraftAnim）与轻提示，不承担日记编辑逻辑
 * - 由 DiaryHomePage 引用，根据所选日期与当日日记渲染氛围
 */
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  MOOD_HEX,
  MO_SHORT,
  SEASON_LINE,
  moodLitDots,
  popCraftAnim,
  seasonOfMonth,
} from '@/utils/diaryCraft'
import { MOOD_OPTIONS, todayDateString } from '@/utils/diaryFormat'

/** date：当前展示日期（YYYY-MM-DD）；entry：该日日记，null 表示尚未落笔的空白日 */
const props = defineProps<{
  date: string
  entry: API.DiaryEntryVO | null
}>()

// 四季书签选项（id 与 seasonOfMonth 的季节编号一致）
const SEASONS = [
  { id: 0, label: '春' },
  { id: 1, label: '夏' },
  { id: 2, label: '秋' },
  { id: 3, label: '冬' },
] as const

// 手动覆盖季节（点击书签后生效），null 时跟随日期的自然季节
const overrideSeason = ref<number | null>(null)

// 用当天 12:00 构造 Date，避免时区边界把日期算偏到前后一天
const dt = computed(() => new Date(`${props.date}T12:00:00`))
const naturalSeason = computed(() => seasonOfMonth(dt.value.getMonth()))
const activeSeason = computed(() => (overrideSeason.value != null ? overrideSeason.value : naturalSeason.value))

const stampM = computed(() => MO_SHORT[dt.value.getMonth()])
const stampD = computed(() => String(dt.value.getDate()).padStart(2, '0'))
const stampY = computed(() => String(dt.value.getFullYear()))

// 票根文案：有标题用标题，否则显示「月.日 · 空白票根」
const ticketText = computed(() => {
  if (props.entry?.title?.trim()) return props.entry.title.trim()
  const md = `${String(dt.value.getMonth() + 1).padStart(2, '0')}.${stampD.value}`
  return `${md} · 空白票根`
})

// 心情派生量：主题色、标签、火漆首字与点亮的点数（moodLitDots 折算为 1~5 格）
const mood = computed(() => props.entry?.mood)
const moodHex = computed(() => (mood.value ? MOOD_HEX[mood.value] : ''))
const moodLabel = computed(() => MOOD_OPTIONS.find((x) => x.value === mood.value)?.label ?? '')
const waxChar = computed(() => (moodLabel.value ? moodLabel.value.slice(0, 1) : '空'))
const lit = computed(() => moodLitDots(mood.value))
const stampStyle = computed(() => {
  if (!moodHex.value) return { opacity: '0.55' }
  return { opacity: '0.9', borderColor: moodHex.value, color: moodHex.value }
})
const waxStyle = computed(() => {
  if (!moodHex.value) return {}
  return {
    background: `radial-gradient(circle at 35% 30%, #fff8, ${moodHex.value} 55%, #9a6fb8)`,
    transform: 'rotate(12deg) scale(1.05)',
  }
})
// 两枚标签：A 显示心情名（空白日为「空白页」）；B 提示落笔状态（今天可写 / 过往可补记）
const labelA = computed(() => moodLabel.value || '空白页')
const labelB = computed(() => {
  if (props.entry) return '已落笔'
  return props.date === todayDateString() ? '写今日' : '可补记'
})

/** 轻提示（1.2s 自动消失），用于各小物的点击反馈 */
function toast(text: string) {
  message.info({ content: text, duration: 1.2 })
}

// 切换季节书签并念出该季节的一句台词
function onSeason(id: number) {
  overrideSeason.value = id
  toast(SEASON_LINE[id] || SEASONS[id]?.label || '')
}

/** 在点击目标上触发一次小动效：cls 为动画类名，ms 毫秒后由 popCraftAnim 自动移除；可附带 toast 文案 */
function bump(e: Event, cls: string, ms: number, msg?: string) {
  popCraftAnim(e.currentTarget as HTMLElement, cls, ms)
  if (msg) toast(msg)
}
</script>

<template>
  <div class="journal-deco glass" aria-label="手账装饰，可点击">
    <span class="tape sakura" />
    <h3>手账页</h3>

    <!-- 季节书签：点击覆盖当前季节主题 -->
    <div class="jd-bookmarks">
      <button
        v-for="s in SEASONS"
        :key="s.id"
        type="button"
        class="jd-tab craft-hit"
        :class="{ lit: activeSeason === s.id, dim: activeSeason !== s.id }"
        :title="s.label"
        @click="onSeason(s.id)"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- 手工互动区：翻页本 / 压花 / 日期章 -->
    <div class="jd-craft-row">
      <div
        class="jd-open-book craft-hit"
        role="button"
        tabindex="0"
        title="翻一页"
        @click="bump($event, 'is-flip', 550, '翻过一页')"
        @keydown.enter="bump($event, 'is-flip', 550, '翻过一页')"
      >
        <div class="jd-page" />
        <div class="jd-page" />
      </div>
      <div
        class="jd-pressed-flower craft-hit"
        role="button"
        tabindex="0"
        title="压花"
        @click="bump($event, 'is-flutter', 550, '压花轻轻抖了抖')"
        @keydown.enter="bump($event, 'is-flutter', 550, '压花轻轻抖了抖')"
      />
      <div
        class="jd-date-stamp craft-hit"
        role="button"
        tabindex="0"
        title="日期章"
        :style="stampStyle"
        @click="bump($event, 'is-spin', 500, '日期章')"
        @keydown.enter="bump($event, 'is-spin', 500, '日期章')"
      >
        <div>
          <div class="m">{{ stampM }}</div>
          <div class="d">{{ stampD }}</div>
          <div class="y">{{ stampY }}</div>
        </div>
      </div>
    </div>

    <!-- 票根 + 火漆：样式随当日心情着色 -->
    <div class="jd-row">
      <div
        class="jd-ticket craft-hit"
        role="button"
        tabindex="0"
        title="票根"
        @click="bump($event, 'is-lift', 450, ticketText)"
        @keydown.enter="bump($event, 'is-lift', 450, ticketText)"
      >
        <div class="k">TICKET · DAY</div>
        <div class="v">{{ ticketText }}</div>
      </div>
      <div
        class="jd-wax craft-hit"
        role="button"
        tabindex="0"
        title="火漆"
        :style="waxStyle"
        @click="bump($event, 'is-press', 550, '火漆按下')"
        @keydown.enter="bump($event, 'is-press', 550, '火漆按下')"
      >
        {{ waxChar }}
      </div>
    </div>

    <!-- 心情点条：按情绪值点亮 1~5 格 -->
    <div
      class="jd-mood-ribbon craft-hit"
      role="button"
      tabindex="0"
      title="心情点"
      @click="toast(moodLabel ? `情绪条 · ${moodLabel}` : '空白日 · 还没落心情')"
      @keydown.enter="toast(moodLabel ? `情绪条 · ${moodLabel}` : '空白日 · 还没落心情')"
    >
      <span>MOOD</span>
      <span class="dots">
        <i
          v-for="i in 5"
          :key="i"
          class="dot"
          :class="{ on: i <= lit }"
          :style="
            i <= lit && moodHex
              ? { background: moodHex, borderColor: moodHex }
              : undefined
          "
        />
      </span>
    </div>

    <!-- 状态标签：心情名 + 落笔状态 -->
    <div class="jd-labels">
      <button
        type="button"
        class="jd-label craft-hit"
        @click="bump($event, 'is-pop', 400)"
      >
        {{ labelA }}
      </button>
      <button
        type="button"
        class="jd-label b craft-hit"
        @click="bump($event, 'is-pop', 400)"
      >
        {{ labelB }}
      </button>
    </div>

    <!-- 和纸胶带 + 文具（回形针、钢笔） -->
    <div class="jd-washi" />
    <div class="jd-tools">
      <div
        class="jd-clip craft-hit"
        role="button"
        tabindex="0"
        title="回形针"
        @click="bump($event, 'is-wiggle', 450, '回形针')"
        @keydown.enter="bump($event, 'is-wiggle', 450, '回形针')"
      />
      <div
        class="jd-pen craft-hit"
        role="button"
        tabindex="0"
        title="钢笔"
        @click="bump($event, 'is-write', 500, '钢笔想写字了')"
        @keydown.enter="bump($event, 'is-write', 500, '钢笔想写字了')"
      />
    </div>
  </div>
</template>
