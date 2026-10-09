<script setup lang="ts">
/**
 * 首页时钟卡片：支持「文字时钟」与「模拟钟表盘」两种模式切换。
 * variant 控制嵌入形态：default 独立卡片 / embedded 嵌入侧栏 / plain 无底色。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Type, Clock } from 'lucide-vue-next'

type ClockMode = 'text' | 'analog'

withDefaults(
  defineProps<{
    variant?: 'default' | 'embedded' | 'plain'
  }>(),
  {
    variant: 'default',
  },
)

// 当前展示模式 + 每秒刷新一次的当前时间
const mode = ref<ClockMode>('analog')
const now = ref(new Date())
let timer: number | undefined

const modeOptions = [
  { label: '文字', value: 'text' },
  { label: '钟表', value: 'analog' },
]

// ---- 文字模式用的派生文本 ----
const weekdayText = computed(() => {
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return weekday[now.value.getDay()]
})

const dateText = computed(() => {
  const y = now.value.getFullYear()
  const m = String(now.value.getMonth() + 1).padStart(2, '0')
  const d = String(now.value.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
})

const timeText = computed(() => {
  const h = String(now.value.getHours()).padStart(2, '0')
  const m = String(now.value.getMinutes()).padStart(2, '0')
  const s = String(now.value.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
})

// ---- 模拟表盘三根指针的角度 ----
// 时针：每小时 30°，再按分钟补上 0.5°/分，避免跳变
const hourHandStyle = computed(() => {
  const hour = now.value.getHours() % 12
  const minute = now.value.getMinutes()
  const degree = hour * 30 + minute * 0.5
  return { transform: `translateX(-50%) rotate(${degree}deg)` }
})

// 分针：每分 6°，按秒平滑补 0.1°/秒
const minuteHandStyle = computed(() => {
  const minute = now.value.getMinutes()
  const second = now.value.getSeconds()
  const degree = minute * 6 + second * 0.1
  return { transform: `translateX(-50%) rotate(${degree}deg)` }
})

const secondHandStyle = computed(() => {
  const second = now.value.getSeconds()
  return { transform: `translateX(-50%) rotate(${second * 6}deg)` }
})

// 表盘 12 个刻度（每 30° 一个）
const tickMarks = Array.from({ length: 12 }, (_, index) => index)

onMounted(() => {
  // 每秒推进 now，所有 computed 随之联动
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (timer) {
    window.clearInterval(timer)
  }
})
</script>

<template>
  <section
    class="clock-card"
    :class="{
      'clock-card--embedded': variant === 'embedded',
      'clock-card--plain': variant === 'plain',
    }"
  >
    <div class="clock-card__header">
      <a-segmented v-model:value="mode" :options="modeOptions" size="small" class="clock-card__switcher">
        <template #label="{ value, label }">
          <span class="clock-switch-label">
            <component :is="value === 'text' ? Type : Clock" :size="13" :stroke-width="2" />
            <span>{{ label }}</span>
          </span>
        </template>
      </a-segmented>
    </div>

    <!-- 模式切换（文字 / 钟表），切换带淡入淡出 -->
    <transition name="clock-fade" mode="out-in">
      <div v-if="mode === 'text'" key="text" class="text-clock">
        <p class="text-clock__time">{{ timeText }}</p>
        <p class="text-clock__date">{{ dateText }} · {{ weekdayText }}</p>
      </div>

      <div v-else key="analog" class="analog-clock">
        <div class="analog-clock__dial">
          <span
            v-for="mark in tickMarks"
            :key="mark"
            class="analog-clock__tick"
            :style="{ transform: `translateX(-50%) rotate(${mark * 30}deg)` }"
          />
          <span class="analog-clock__hand analog-clock__hand--hour" :style="hourHandStyle" />
          <span class="analog-clock__hand analog-clock__hand--minute" :style="minuteHandStyle" />
          <span class="analog-clock__hand analog-clock__hand--second" :style="secondHandStyle" />
          <span class="analog-clock__center" />
        </div>
        <p class="analog-clock__date">{{ dateText }} · {{ weekdayText }}</p>
      </div>
    </transition>
  </section>
</template>

<style scoped>
.clock-card {
  --dial-size: min(220px, 70vw);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-md);
  padding: 24px;
}

.clock-card--embedded {
  --dial-size: 148px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: none;
  padding: 14px 16px;
}

.clock-card--plain {
  --dial-size: 160px;
  background: transparent;
  border: none;
  border-radius: 0;
  backdrop-filter: none;
  box-shadow: none;
  padding: 0;
  width: 100%;
}

.clock-card--plain .text-clock,
.clock-card--plain .analog-clock__date {
  text-align: center;
}

.clock-card--plain .analog-clock {
  align-items: center;
}

.clock-card__header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.clock-card--embedded .clock-card__header,
.clock-card--plain .clock-card__header {
  margin-bottom: 8px;
}

.clock-card__switcher {
  flex-shrink: 0;
}

:deep(.clock-card__switcher.ant-segmented) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border);
}

:deep(.clock-card__switcher .ant-segmented-item-label) {
  color: var(--color-text-secondary);
  font-size: 12px;
}

:deep(.clock-card__switcher .ant-segmented-item-selected .ant-segmented-item-label) {
  color: var(--color-text-primary);
  font-weight: 600;
}

:deep(.clock-card__switcher .ant-segmented-thumb) {
  background: var(--gradient-primary);
}

.clock-switch-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.clock-switch-label :deep(svg) {
  flex-shrink: 0;
}

.text-clock {
  padding: 4px 0;
  text-align: right;
}

.clock-card--embedded .text-clock {
  padding: 0;
}

.clock-card--plain .text-clock {
  padding: 0;
  text-align: center;
}

.text-clock__time {
  font-size: clamp(32px, 6vw, 48px);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.1;
}

.clock-card--embedded .text-clock__time {
  font-size: clamp(24px, 5vw, 32px);
  letter-spacing: 0.03em;
}

.clock-card--plain .text-clock__time {
  font-size: clamp(24px, 5vw, 32px);
  letter-spacing: 0.03em;
}

.text-clock__date {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.clock-card--embedded .text-clock__date {
  margin-top: 6px;
  font-size: 12px;
}

.analog-clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.clock-card--embedded .analog-clock {
  align-items: center;
}

.clock-card--plain .analog-clock {
  align-items: center;
}

.analog-clock__dial {
  position: relative;
  width: var(--dial-size);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px solid var(--color-border-hover);
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.06) 0%, rgba(26, 22, 37, 0.72) 66%);
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.28), var(--shadow-glow);
}

.analog-clock__tick {
  position: absolute;
  left: 50%;
  top: 6px;
  transform-origin: 50% calc(var(--dial-size) / 2 - 6px);
  width: 2px;
  height: calc(var(--dial-size) * 0.07);
  border-radius: 2px;
  background: var(--color-text-secondary);
}

.analog-clock__hand {
  position: absolute;
  left: 50%;
  bottom: 50%;
  transform-origin: center bottom;
  border-radius: 999px;
}

.analog-clock__hand--hour {
  width: 5px;
  height: calc(var(--dial-size) * 0.22);
  background: var(--color-text-primary);
}

.analog-clock__hand--minute {
  width: 3px;
  height: calc(var(--dial-size) * 0.32);
  background: var(--color-secondary-light);
}

.analog-clock__hand--second {
  width: 2px;
  height: calc(var(--dial-size) * 0.36);
  background: var(--color-primary);
}

.analog-clock__center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gradient-primary);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 14px rgba(232, 121, 169, 0.45);
}

.analog-clock__date {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: right;
}

.clock-card--embedded .analog-clock__date {
  text-align: center;
}

.clock-card--plain .analog-clock__date {
  text-align: center;
}

.clock-fade-enter-active,
.clock-fade-leave-active {
  transition: opacity var(--transition-normal), transform var(--transition-normal);
}

.clock-fade-enter-from,
.clock-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 900px) {
  .clock-card--embedded {
    align-self: flex-end;
  }

  .clock-card--embedded .text-clock,
  .clock-card--embedded .analog-clock__date {
    text-align: center;
  }

  .clock-card--embedded .analog-clock {
    align-items: center;
  }
}
</style>
