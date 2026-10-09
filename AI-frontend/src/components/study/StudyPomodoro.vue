<script setup lang="ts">
/**
 * 番茄钟（专注计时器）
 * 以环形进度展示剩余时间，支持选择预设时长、开始/暂停/继续/完成/放弃专注。
 * 计时会话的状态（进行中、暂停、剩余秒数、历史记录）全部来自学习模块共享上下文，
 * 本组件只做展示与操作触发，保证侧栏多个入口看到的是同一个会话。
 */
import { computed, inject, ref, watch } from 'vue'
import { studyContextKey } from '@/composables/study/useStudyContext'
import { FOCUS_STATUS } from '@/constants/study'
import { Play, Pause, Check, RotateCcw } from 'lucide-vue-next'
import IconAction from '@/components/ui/IconAction.vue'

const ctx = inject(studyContextKey)!

// 用户选定的专注时长（分钟），初始取自学习设置的默认专注时长
const selectedMinutes = ref(ctx.studySettings.value.focusDefaultMinutes)

// 设置中的默认时长变化时同步本地选项；已有进行中的会话则不打扰
watch(
  () => ctx.studySettings.value.focusDefaultMinutes,
  (m) => {
    if (!ctx.activeFocus.value) selectedMinutes.value = m
  },
)

const session = computed(() => ctx.activeFocus.value)
// 会话运行状态派生：是否计时中 / 是否暂停 / 是否存在未结束的会话
const isRunning = computed(() => session.value?.status === FOCUS_STATUS.RUNNING)
const isPaused = computed(() => session.value?.status === FOCUS_STATUS.PAUSED)
const hasActive = computed(
  () => session.value && (isRunning.value || isPaused.value),
)

// 剩余秒数格式化为 mm:ss 倒计时文案
const displayTime = computed(() => {
  const sec = ctx.remainingSeconds.value
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// 环形进度：已专注比例 = 1 - 剩余/计划总秒数（未指定计划时用当前选中时长）
const progress = computed(() => {
  const planned = (session.value?.plannedMinutes ?? selectedMinutes.value) * 60
  if (!planned) return 0
  return 1 - ctx.remainingSeconds.value / planned
})

// 状态文案：空闲/暂停/专注中，专注关联任务时附带任务名
const statusLabel = computed(() => {
  if (!hasActive.value) return '准备专注'
  if (isPaused.value) return '已暂停'
  return session.value?.taskTitle ? `专注：${session.value.taskTitle}` : '专注中'
})

// 以下操作均委托上下文完成，保证计时状态与全局一致
// 以当前选中时长启动一段自由专注（未绑定具体任务）
async function start() {
  await ctx.startFocusSession(undefined, selectedMinutes.value)
}

// 暂停当前专注计时
async function pause() {
  await ctx.pauseFocusSession()
}

// 从暂停中恢复计时
async function resume() {
  await ctx.resumeFocusSession()
}

// 提前标记本次专注完成（按已专注时长计入统计）
async function complete() {
  await ctx.completeFocusSession()
}

// 放弃本次专注（不计入完成的统计）
async function abandon() {
  await ctx.abandonFocusSession()
}
</script>

<template>
  <div class="study-pomodoro">
    <!-- 环形倒计时：进度由 --progress 变量驱动，中心显示剩余时间与状态文案 -->
    <div class="study-pomodoro__ring" :style="{ '--progress': progress }">
      <div class="study-pomodoro__ring-inner">
        <div class="study-pomodoro__time">{{ displayTime }}</div>
        <div class="study-pomodoro__label">{{ statusLabel }}</div>
      </div>
    </div>

    <!-- 时长预设：仅在空闲（无进行中会话）时可选 -->
    <div v-if="!hasActive" class="study-pomodoro__presets">
      <a-button
        v-for="m in ctx.focusPresets.value"
        :key="m"
        size="small"
        :type="selectedMinutes === m ? 'primary' : 'default'"
        @click="selectedMinutes = m"
      >
        {{ m }} 分钟
      </a-button>
    </div>

    <!-- 操作按钮：空闲时仅“开始专注”；计时/暂停中提供暂停、继续、完成、放弃 -->
    <div class="study-pomodoro__actions" :class="{ 'is-running': isRunning }">
      <template v-if="!hasActive">
        <IconAction :icon="Play" label="开始专注" variant="primary" motion="pop" @click="start" />
      </template>
      <template v-else>
        <IconAction v-if="isRunning" :icon="Pause" label="暂停" variant="soft" @click="pause" />
        <IconAction v-if="isPaused" :icon="Play" label="继续" variant="primary" motion="pop" @click="resume" />
        <IconAction :icon="Check" label="完成" variant="primary" motion="pop" @click="complete" />
        <IconAction :icon="RotateCcw" label="放弃" variant="danger" motion="shake" @click="abandon" />
      </template>
    </div>

    <!-- 最近专注记录：展示最近 5 条，含任务名（自由专注无任务名）与实际专注分钟数 -->
    <div v-if="ctx.focusHistory.value.length" class="study-focus-history">
      <div class="study-sidebar__section-label">最近专注</div>
      <div
        v-for="item in ctx.focusHistory.value.slice(0, 5)"
        :key="item.id"
        class="study-focus-history__item"
      >
        <span>{{ item.taskTitle || '自由专注' }}</span>
        <span>{{ Math.round((item.actualSeconds ?? 0) / 60) }} 分钟</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.study-pomodoro__actions.is-running :deep(.icon-action--soft) {
  animation: pomodoroBreath 2.4s ease-in-out infinite;
}
@keyframes pomodoroBreath {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.28); }
  50% { box-shadow: 0 0 0 5px rgba(124, 58, 237, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .study-pomodoro__actions.is-running :deep(.icon-action--soft) {
    animation: none;
  }
}
</style>
