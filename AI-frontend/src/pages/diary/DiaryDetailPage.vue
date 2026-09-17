<script setup lang="ts">
/**
 * 日记详情页（路由 /diary/:id，diary 模块）
 * - 三栏手账版式：左栏返回/迷你日期/操作，中栏正文手账纸，右栏心情火漆、同月足迹与上下篇导航
 * - 数据来自 diary 集成接口：详情 + 上/下一篇并发加载，同月足迹按日记月份二次拉取
 * - 支持左右方向键翻相邻日记；加载失败统一退回日记列表页
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import DiaryRoomShell from '@/components/diary/DiaryRoomShell.vue'
import { deleteDiaryEntry, getDiaryEntryVo, getDiaryPrevNext, listDiaryByMonth } from '@/integrations/diaryController'
import { formatDiaryDate, MOOD_OPTIONS, contentExcerpt } from '@/utils/diaryFormat'
import { MOOD_HEX, MO_SHORT, popCraftAnim } from '@/utils/diaryCraft'
import { useDiaryRoomTheme } from '@/composables/useDiaryRoomTheme'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const route = useRoute()
const router = useRouter()
const { period } = useDiaryRoomTheme()
const entry = ref<API.DiaryEntryVO | null>(null)
// 上一篇/下一篇导航信息（id + 标题 + 日期）
const prevNext = ref<API.DiaryEntryPrevNextVO | null>(null)
// 同月足迹：日记所属月份的全部条目，供右栏快速跳转
const monthStrip = ref<API.DiaryEntryMonthItemVO[]>([])
const loading = ref(true)

const id = computed(() => Number(route.params.id))
// 心情相关展示：中文标签、火漆单字、心情色值
const moodLabel = computed(() => MOOD_OPTIONS.find((x) => x.value === entry.value?.mood)?.label ?? '—')
const moodChar = computed(() => (moodLabel.value === '—' ? '空' : moodLabel.value.slice(0, 1)))
const moodHex = computed(() => (entry.value?.mood ? MOOD_HEX[entry.value.mood] : ''))
// 心情火漆印章的径向渐变底色（取自心情色板）
const waxStyle = computed(() => {
  if (!moodHex.value) return {}
  return {
    background: `radial-gradient(circle at 35% 30%, #fff8, ${moodHex.value} 55%, #6a4a80)`,
  }
})
// 统一取“正午 12 点”构造日期，避免纯日期字符串被解析到 UTC 后日期偏移一天
const dt = computed(() => {
  if (!entry.value?.diaryDate) return null
  return new Date(`${entry.value.diaryDate}T12:00:00`)
})
const miniDay = computed(() => (dt.value ? String(dt.value.getDate()).padStart(2, '0') : '—'))
const miniMo = computed(() =>
  dt.value ? `${dt.value.getFullYear()} · ${MO_SHORT[dt.value.getMonth()]}` : '—',
)
const miniWk = computed(() => (dt.value ? WEEK[dt.value.getDay()] : '—'))
const miniLine = computed(() => `本月 ${monthStrip.value.length} 篇`)
const bodyParagraphs = computed(() => {
  const body = entry.value?.content?.trim()
  if (!body) return []
  return body.split(/\n\n+/)
})
const nextTitle = computed(() =>
  prevNext.value?.nextId ? contentExcerpt(prevNext.value.nextTitle || prevNext.value.nextDate, 24) : '没有更早的日记',
)
const nextEx = computed(() => (prevNext.value?.nextId ? '打开下一篇手账' : '这是时间线尽头。'))
const nextDate = computed(() => prevNext.value?.nextDate || '—')

/** 加载详情与上/下一篇；成功后按日记当月拉“同月足迹”（倒序），任一失败回列表页 */
async function load() {
  loading.value = true
  try {
    // 详情与上下篇导航并发请求
    const [voRes, navRes] = await Promise.all([getDiaryEntryVo({ id: id.value }), getDiaryPrevNext({ id: id.value })])
    if (voRes.data.code === 0 && voRes.data.data) {
      entry.value = voRes.data.data
      const date = entry.value.diaryDate
      if (date) {
        const [y = NaN, m = NaN] = date.split('-').map(Number)
        if (Number.isFinite(y) && Number.isFinite(m)) {
          const monthRes = await listDiaryByMonth({ year: y, month: m })
          if (monthRes.data.code === 0) {
            // 按日期倒序，新日记排在足迹条上方
            monthStrip.value = (monthRes.data.data || [])
              .slice()
              .sort((a, b) => (b.diaryDate || '').localeCompare(a.diaryDate || ''))
          }
        }
      }
    } else {
      message.error(voRes.data.message || '加载失败')
      router.push('/diary')
      return
    }
    prevNext.value = navRes.data.code === 0 ? navRes.data.data ?? null : null
  } catch {
    message.error('加载日记失败')
    router.push('/diary')
  } finally {
    loading.value = false
  }
}

function goEdit() {
  if (entry.value?.diaryDate) {
    router.push({ path: '/diary/write', query: { date: entry.value.diaryDate } })
  }
}
function goPrev() {
  if (prevNext.value?.prevId) router.push(`/diary/${prevNext.value.prevId}`)
}
function goNext() {
  if (prevNext.value?.nextId) router.push(`/diary/${prevNext.value.nextId}`)
}
function openNextSpine() {
  if (prevNext.value?.nextId) goNext()
}
function jumpMonthItem(item: API.DiaryEntryMonthItemVO) {
  if (item.id) router.push(`/diary/${item.id}`)
}
/** 火漆盖章：播放按压动画并短暂提示当前心情 */
function onWax(e: Event) {
  popCraftAnim(e.currentTarget as HTMLElement, 'is-press', 550)
  message.info({ content: `心情火漆 · ${moodLabel.value}`, duration: 1.2 })
}
function onDelete() {
  Modal.confirm({
    title: '删除这篇日记？',
    content: '删除后不可恢复。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      const res = await deleteDiaryEntry({ id: id.value })
      if (res.data.code === 0) {
        message.success('已删除')
        router.push('/diary')
      } else {
        message.error(res.data.message || '删除失败')
      }
    },
  })
}
// 全局键盘：输入框内不拦截；←/→ 翻相邻日记
function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName || ''
  if (tag === 'TEXTAREA' || tag === 'INPUT') return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    goPrev()
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    goNext()
  }
}

// 路由参数 id 变化（点上一篇/下一篇/同月足迹）时重新加载
watch(id, (next, prev) => {
  if (next && next !== prev) load()
})
onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <DiaryRoomShell>
    <div class="shell">
      <!-- 左栏：返回 / 迷你日期卡 / 本篇目录 / 操作 -->
      <aside class="side">
        <div class="side-stack">
          <button type="button" class="back-chip" @click="router.push('/diary')">← 返回列表 · Esc</button>
          <div class="period-chip"><span class="dot" /><span>{{ period.name }}</span></div>
          <div class="mini-date glass">
            <span class="tape sakura" />
            <div class="big">{{ miniDay }}</div>
            <div class="meta">{{ miniMo }}</div>
            <div class="wk">{{ miniWk }}</div>
            <div class="line">{{ miniLine }}</div>
          </div>
          <div class="side-card glass">
            <h3>本篇</h3>
            <div class="toc-item is-on">日期与心情</div>
            <div class="toc-item">正文手账纸</div>
            <div class="toc-item">页末印章</div>
          </div>
          <div class="side-card glass">
            <h3>操作</h3>
            <div class="action-row">
              <button type="button" class="chip-btn primary" @click="goEdit">编辑这篇</button>
              <button type="button" class="chip-btn" @click="onDelete">删除</button>
            </div>
          </div>
          <div class="side-quote glass" style="margin-top: auto">
            <div class="q">「</div>
            <p class="text-pretty">{{ period.quote }}</p>
          </div>
        </div>
      </aside>

      <!-- 中栏：日记正文手账纸（日期 / 标题 / 心情与状态 / 段落正文） -->
      <article class="detail-main glass">
        <span class="page-tape" style="position: absolute; top: -8px; left: 42%; width: 70px; height: 18px; background: color-mix(in srgb, var(--craft-b) 55%, transparent); border-radius: 2px; transform: translateX(-50%) rotate(-2deg); z-index: 2" />
        <header class="detail-hero">
          <div class="date-line">{{ formatDiaryDate(entry?.diaryDate) }}</div>
          <h1>{{ entry?.title || '无标题' }}</h1>
          <div class="meta-row">
            <span class="meta-pill">
              <span v-if="entry?.mood" class="mood-dot" :class="entry.mood" />{{ moodLabel }}
            </span>
            <span class="meta-pill" style="background: var(--c-violet-soft); color: var(--c-violet)">
              {{ entry?.statusText || '私密' }}
            </span>
          </div>
        </header>
        <div class="detail-body text-pretty">
          <p v-for="(p, i) in bodyParagraphs" :key="i" style="white-space: pre-wrap; margin-bottom: 12px">{{ p }}</p>
        </div>
        <div class="detail-actions">
          <button type="button" class="chip-btn" @click="router.push('/diary')">返回列表</button>
          <button type="button" class="chip-btn primary" @click="goEdit">编辑这一天</button>
        </div>
        <footer class="detail-foot-deco" aria-hidden="true">
          <div class="seal-sm">完</div>
          <div class="mark-line" />
          <div class="cap">PAGE · END</div>
        </footer>
      </article>

      <!-- 右栏：心情火漆 / 同月足迹 / 上下篇导航与下一篇书脊卡 -->
      <aside class="deck">
        <div class="deck-panel glass">
          <h3 style="font-size: 15px; letter-spacing: 2px; font-family: 'ZCOOL KuaiLe', sans-serif; margin-bottom: 4px">
            心情火漆
          </h3>
          <div class="mood-wax-panel">
            <button type="button" class="wax-lg craft-hit" :style="waxStyle" title="盖章" @click="onWax">
              {{ moodChar }}
            </button>
            <div class="wax-name">{{ moodLabel }}</div>
            <div class="wax-sub">私密手账</div>
          </div>
          <div class="dw-flower" aria-hidden="true" />
        </div>
        <div class="deck-panel glass">
          <h3 style="font-size: 15px; letter-spacing: 2px; font-family: 'ZCOOL KuaiLe', sans-serif">同月足迹</h3>
          <div class="month-strip">
            <button
              v-for="item in monthStrip"
              :key="item.id ?? item.diaryDate"
              type="button"
              class="chip"
              :class="{ on: item.id === entry?.id }"
              @click="jumpMonthItem(item)"
            >
              {{ item.diaryDate?.slice(5) }}
            </button>
          </div>
        </div>
        <div class="nav-pair">
          <button type="button" class="chip-btn" style="width: 100%" :disabled="!prevNext?.prevId" @click="goPrev">
            上一篇
          </button>
          <button type="button" class="chip-btn" style="width: 100%" :disabled="!prevNext?.nextId" @click="goNext">
            下一篇
          </button>
        </div>
        <div class="detail-keys">← → 相邻日记 · Esc 返回</div>
        <div
          class="spine-card glass grow"
          :class="{ 'is-empty': !prevNext?.nextId }"
          role="button"
          tabindex="0"
          @click="openNextSpine"
          @keydown.enter="openNextSpine"
        >
          <span class="tape" />
          <div class="no">NEXT</div>
          <h4>{{ nextTitle }}</h4>
          <p class="text-pretty">{{ nextEx }}</p>
          <div class="go-row">
            <span>{{ nextDate }}</span>
            <span>打开 →</span>
          </div>
        </div>
      </aside>
    </div>
  </DiaryRoomShell>
</template>
