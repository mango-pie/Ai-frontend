<script setup lang="ts">
/**
 * 日记主页
 * 职责：按月历浏览日记 —— 左侧"关于/写今日"卡片，中间月历 + 当日内容预览，
 * 右侧日期徽章、通用草稿本（localStorage 自动保存）与编辑入口。
 * 支持键盘快捷键：← → 换日、Enter 编辑、T 回今日、Ctrl+S 保存草稿。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import DiaryRoomShell from '@/components/diary/DiaryRoomShell.vue'
import DiaryDecoCorner from '@/components/diary/DiaryDecoCorner.vue'
import DiaryJournalDeco from '@/components/diary/DiaryJournalDeco.vue'
import { getDiaryByDate } from '@/integrations/diaryController'
import { useDiaryCalendar } from '@/composables/useDiaryCalendar'
import { siteConfig } from '@/config/site'
import { formatDiaryDate, todayDateString, MOOD_OPTIONS } from '@/utils/diaryFormat'
import { MO_SHORT, diaryStreakFromDates, popCraftAnim } from '@/utils/diaryCraft'

// 草稿持久化用的 localStorage key 与中文月份/星期文案
const DRAFT_KEY = 'diary-vue-draft'
const MO_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const router = useRouter()
// 选中日期（YYYY-MM-DD）与当日日记；草稿本文本及其保存状态
const today = todayDateString()
const selectedDate = ref(today)
const dayEntry = ref<API.DiaryEntryVO | null>(null)
const draftText = ref('')
const draftStatus = ref<'saved' | 'dirty'>('saved')
// 翻页动画开关；两个定时器分别用于草稿防抖保存与翻页动画收尾
const pageSwitching = ref(false)
let draftTimer: ReturnType<typeof setTimeout> | null = null
let switchTimer: ReturnType<typeof setTimeout> | null = null

// 月历数据源（当前年月、每日条目、翻月操作）
const { year, month, monthItems, loadMonth, prevMonth, nextMonth, itemByDate } = useDiaryCalendar()

// 以下为页面各处的派生展示数据：标题、右侧日历牌、本月篇数、连续天数、心情标签等
const monthSticker = computed(() => MO_SHORT[month.value - 1])
const calTitle = computed(() => `${year.value} · ${MO_CN[month.value - 1]}`)
// 统一取中午 12 点构造 Date，避免时区问题导致日期偏移
const selectedDt = computed(() => new Date(`${selectedDate.value}T12:00:00`))
const deckDay = computed(() => String(selectedDt.value.getDate()).padStart(2, '0'))
const deckMo = computed(() => MO_SHORT[selectedDt.value.getMonth()])
const deckWeek = computed(() => WEEK[selectedDt.value.getDay()])
const monthCount = computed(() => monthItems.value.length)
// 连续写日记天数：由本月份的日记日期序列推算
const streak = computed(() =>
  diaryStreakFromDates(
    monthItems.value.map((x) => x.diaryDate).filter(Boolean) as string[],
    today,
  ),
)
const moodLabel = computed(() => {
  const m = dayEntry.value?.mood
  return MOOD_OPTIONS.find((x) => x.value === m)?.label ?? ''
})
const editCta = computed(() => (dayEntry.value ? '编辑这篇' : '写这一天'))

// 月历格子：周一开头，含前置空白格（mute）与"有日记/今日/选中"三种标记
const calCells = computed(() => {
  const y = year.value
  const m = month.value - 1
  const first = new Date(y, m, 1)
  const days = new Date(y, m + 1, 0).getDate()
  const offset = (first.getDay() + 6) % 7
  const weeks = Math.ceil((offset + days) / 7)
  const map = itemByDate()
  const cells: Array<{
    key: string
    day?: number
    date?: string
    mute?: boolean
    has?: boolean
    today?: boolean
    selected?: boolean
  }> = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = i - offset + 1
    if (d < 1 || d > days) {
      cells.push({ key: `m-${i}`, mute: true })
      continue
    }
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      key: date,
      day: d,
      date,
      has: map.has(date),
      today: date === today,
      selected: date === selectedDate.value,
    })
  }
  return cells
})

const bodyParagraphs = computed(() => {
  const body = dayEntry.value?.content?.trim()
  if (!body) return []
  return body.split(/\n\n+/)
})

async function loadDay(date: string) {
  try {
    const res = await getDiaryByDate({ date })
    dayEntry.value = res.data.code === 0 ? res.data.data ?? null : null
  } catch {
    dayEntry.value = null
  }
}

function selectDate(date: string, animate = true) {
  if (animate && date !== selectedDate.value) {
    pageSwitching.value = true
    if (switchTimer) clearTimeout(switchTimer)
    switchTimer = setTimeout(() => {
      selectedDate.value = date
      pageSwitching.value = false
    }, 150)
  } else {
    selectedDate.value = date
  }
  const dt = new Date(`${date}T12:00:00`)
  if (dt.getFullYear() !== year.value || dt.getMonth() + 1 !== month.value) {
    loadMonth(dt.getFullYear(), dt.getMonth() + 1)
  }
}

function shiftDate(delta: number) {
  const dt = new Date(`${selectedDate.value}T12:00:00`)
  dt.setDate(dt.getDate() + delta)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  selectDate(`${y}-${m}-${d}`)
}

function writeDate(date?: string) {
  router.push({ path: '/diary/write', query: { date: date || selectedDate.value } })
}

function openDetail() {
  if (dayEntry.value?.id != null) {
    router.push(`/diary/${dayEntry.value.id}`)
  }
}

function queueDraftSave() {
  draftStatus.value = 'dirty'
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, draftText.value.slice(0, 280))
      draftStatus.value = 'saved'
    } catch {
      message.error('草稿未能写入本地')
    }
  }, 450)
}

function clearDraft() {
  draftText.value = ''
  queueDraftSave()
  message.success('草稿已清空')
}

function saveDraftNow() {
  if (draftTimer) clearTimeout(draftTimer)
  try {
    localStorage.setItem(DRAFT_KEY, draftText.value.slice(0, 280))
    draftStatus.value = 'saved'
    message.success('草稿已保存')
  } catch {
    message.error('草稿未能写入本地')
  }
}

function onSeal(e: Event) {
  popCraftAnim(e.currentTarget as HTMLElement, 'is-pop', 450)
  message.info({ content: '日期徽章 · 记', duration: 1.2 })
}

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName || ''
  const typing = tag === 'TEXTAREA' || tag === 'INPUT'
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveDraftNow()
    return
  }
  if (typing) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    shiftDate(-1)
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    shiftDate(1)
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    writeDate()
  }
  if (e.key.toLowerCase() === 't') {
    e.preventDefault()
    selectDate(today)
  }
}

watch(selectedDate, (d) => {
  loadDay(d)
})

onMounted(async () => {
  try {
    draftText.value = localStorage.getItem(DRAFT_KEY) || ''
  } catch {
    draftText.value = ''
  }
  const now = new Date()
  await loadMonth(now.getFullYear(), now.getMonth() + 1)
  await loadDay(selectedDate.value)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (draftTimer) clearTimeout(draftTimer)
  if (switchTimer) clearTimeout(switchTimer)
})
</script>

<template>
  <DiaryRoomShell>
    <div class="shell">
      <aside class="side">
        <div class="side-card glass">
          <span class="tape" />
          <h3>关于日记</h3>
          <p class="about text-pretty">{{ siteConfig.diarySubtitle }}</p>
        </div>
        <div class="side-card glass">
          <h3>写今日</h3>
          <button type="button" class="chip-btn primary block" @click="writeDate(today)">写今日</button>
        </div>
        <DiaryDecoCorner :date="selectedDate" :entry="dayEntry" />
      </aside>

      <div class="list-main">
        <div class="list-head">
          <div>
            <div class="eyebrow">DIARY ROOM</div>
            <h1>日记<span class="sticker">{{ monthSticker }}</span></h1>
            <div class="sub">一日一篇 · 左历选日 · 右栏草稿</div>
          </div>
          <button type="button" class="chip-btn primary" @click="writeDate(today)">写今日</button>
        </div>

        <div class="list-body">
          <div class="mid-left">
            <div class="cal-panel glass">
              <span class="tape mint" />
              <div class="cal-top">
                <div class="ym">{{ calTitle }}</div>
                <div class="cal-nav">
                  <button type="button" aria-label="上月" @click="prevMonth">‹</button>
                  <button type="button" aria-label="下月" @click="nextMonth">›</button>
                </div>
                <button type="button" class="today-link" @click="selectDate(today)">回到今日</button>
              </div>
              <div class="cal-grid">
                <div v-for="d in ['一', '二', '三', '四', '五', '六', '日']" :key="d" class="cal-dow">{{ d }}</div>
                <button
                  v-for="cell in calCells"
                  :key="cell.key"
                  type="button"
                  class="cal-cell"
                  :class="{
                    mute: cell.mute,
                    has: cell.has,
                    today: cell.today,
                    selected: cell.selected,
                  }"
                  :disabled="cell.mute"
                  @click="cell.date && selectDate(cell.date)"
                  @dblclick="cell.date && writeDate(cell.date)"
                >
                  <template v-if="!cell.mute">
                    {{ cell.day }}
                    <span v-if="cell.has" class="mark" />
                  </template>
                </button>
              </div>
              <div class="cal-foot">
                <span class="leg"><span class="swatch" />有日记</span>
                <span>单击阅读 · 双击编辑</span>
              </div>
              <div class="hint-keys">← → 换日 · Enter 编辑 · T 今日 · Esc 列表</div>
            </div>

            <DiaryJournalDeco :date="selectedDate" :entry="dayEntry" />
          </div>

          <div class="day-reader">
            <article class="day-page" :class="{ 'is-switching': pageSwitching }">
              <span class="page-tape" />
              <template v-if="dayEntry">
                <header class="day-head">
                  <div class="when">
                    <span v-if="dayEntry.mood" class="mood-dot" :class="dayEntry.mood" />
                    {{ formatDiaryDate(dayEntry.diaryDate) }}
                  </div>
                  <h2 class="day-title-hit" @click="openDetail">{{ dayEntry.title || '无标题' }}</h2>
                  <div class="meta">
                    <span v-if="moodLabel" class="meta-pill">
                      <span class="mood-dot" :class="dayEntry.mood" />{{ moodLabel }}
                    </span>
                    <span class="meta-pill" style="background: var(--c-violet-soft); color: var(--c-violet)">
                      {{ dayEntry.statusText || '私密' }}
                    </span>
                  </div>
                </header>
                <div class="day-body text-pretty">
                  <p v-for="(p, i) in bodyParagraphs" :key="i" style="white-space: pre-wrap">{{ p }}</p>
                </div>
                <div class="day-actions">
                  <button type="button" class="chip-btn" @click="openDetail">阅读详情</button>
                  <button type="button" class="chip-btn primary" @click="writeDate()">编辑这一天</button>
                </div>
                <footer class="day-foot-deco" aria-hidden="true">
                  <div class="seal-sm">完</div>
                  <div class="mark-line" />
                  <div class="cap">PAGE · END</div>
                </footer>
              </template>
              <div v-else class="day-empty">
                <div class="t">这一天还是空白</div>
                <div class="s text-pretty">{{ formatDiaryDate(selectedDate) }} · 一日一篇，点右下角开始写</div>
                <button type="button" class="chip-btn primary" @click="writeDate()">编辑这一天</button>
              </div>
            </article>
          </div>
        </div>
      </div>

      <aside class="deck">
        <div class="deck-panel glass date-badge">
          <button type="button" class="seal craft-hit" title="盖章" @click="onSeal">记</button>
          <div class="row">
            <div class="big">{{ deckDay }}</div>
            <div class="side-meta">
              <div class="mo">{{ deckMo }}</div>
              <div class="wk">{{ deckWeek }}</div>
            </div>
          </div>
          <div class="line">
            <span>本月 <b>{{ monthCount }}</b> 篇</span>
            <span class="dot" />
            <span>连续 <b>{{ streak }}</b> 天</span>
          </div>
        </div>

        <div class="deck-panel glass grow">
          <h3 style="font-size: 15px; letter-spacing: 2px; font-family: 'ZCOOL KuaiLe', sans-serif">草稿本</h3>
          <div class="draft-pad">
            <span class="washi" aria-hidden="true" />
            <div class="lines" aria-hidden="true" />
            <div class="label">DRAFT</div>
            <div class="hint">通用打草稿 · 不绑某一天</div>
            <textarea
              v-model="draftText"
              maxlength="280"
              placeholder="随手记下灵感… 自动保存 · Ctrl+S"
              @input="queueDraftSave"
            />
            <div class="tools">
              <span class="draft-status" :class="draftStatus">
                {{ draftText.length }}/280 · {{ draftStatus === 'saved' ? '已同步' : '未保存' }}
              </span>
              <div style="display: flex; gap: 6px">
                <button type="button" class="chip-btn sm" @click="clearDraft">清空</button>
                <button type="button" class="chip-btn sm primary" @click="saveDraftNow">保存</button>
              </div>
            </div>
          </div>
        </div>

        <div class="deck-foot glass" role="button" tabindex="0" @click="writeDate()" @keydown.enter="writeDate()">
          <div>
            <div class="k">选中日</div>
            <div class="v">{{ editCta }}</div>
          </div>
          <span class="go">→</span>
        </div>
      </aside>
    </div>
  </DiaryRoomShell>
</template>
