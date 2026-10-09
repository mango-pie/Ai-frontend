<script setup lang="ts">
/**
 * 日记书写页
 * 按“一日一篇”模式编辑某天的日记：中栏为日期 + 标题 + 正文编辑区，
 * 右栏提供心情选择、可见性（私密/公开）、检查清单与草稿对照（草稿可一键插入正文）。
 * 保存走 useDiaryAutoSave 自动保存（Ctrl+S 立即保存），离开页面时若有未保存内容会二次确认；
 * 日期来自路由 query（?date=YYYY-MM-DD），切换日期自动加载对应日记。
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import DiaryRoomShell from '@/components/diary/DiaryRoomShell.vue'
import { getDiaryByDate } from '@/integrations/diaryController'
import { useDiaryAutoSave } from '@/composables/useDiaryAutoSave'
import { isDiaryAiEnabled, openDiaryAiPanel } from '@/composables/useDiaryAi'
import { MOOD_OPTIONS, formatDiaryDate, todayDateString } from '@/utils/diaryFormat'
import { diaryDefaultStatus, loadDiarySettings } from '@/utils/diarySettings'
import { MO_SHORT } from '@/utils/diaryCraft'
import { useDiaryRoomTheme } from '@/composables/useDiaryRoomTheme'

// 本地草稿在 localStorage 中的键名
const DRAFT_KEY = 'diary-vue-draft'

const router = useRouter()
const route = useRoute()
const { period } = useDiaryRoomTheme()

// 页面状态：加载中 / 有未保存修改 / 首次加载完成（自动保存就绪）
const loading = ref(true)
const dirty = ref(false)
const ready = ref(false)
// 列表页写下的本地草稿内容（只读展示，可插入正文）
const draftMirror = ref('')
// 新建日记的默认可见性（从日记 UX 设置读取）
let defaultNewStatus = 0

// 日记表单：日期、标题、正文、心情、可见性
const form = reactive({
  diaryDate: todayDateString(),
  title: '',
  content: '',
  mood: undefined as string | undefined,
  status: 0,
})

// 左栏邮戳的年/月/日展示值（取中午 12 点避免时区跨日问题）
const displayDate = computed(() => formatDiaryDate(form.diaryDate))
const stampDt = computed(() => new Date(`${form.diaryDate}T12:00:00`))
const stampM = computed(() => MO_SHORT[stampDt.value.getMonth()])
const stampD = computed(() => String(stampDt.value.getDate()).padStart(2, '0'))
const stampY = computed(() => String(stampDt.value.getFullYear()))

// 接入自动保存组合式函数：传入表单快照 getter，首次加载完成（ready）后启用
const { saveStatus, entryId, markDirty, saveNow } = useDiaryAutoSave(
  () => ({
    diaryDate: form.diaryDate,
    title: form.title,
    content: form.content,
    mood: form.mood,
    status: form.status,
  }),
  { enabled: ready },
)

// 侧栏状态文案：编辑已有篇 / 空白日新写（由是否已存在日记 id 决定）
const sideStatusText = computed(() => (entryId.value ? '编辑已有篇' : '空白日新写'))
// 工具栏保存状态文案：自动映射保存中/已保存/失败/未保存/就绪
const toolbarStatus = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return '保存中…'
    case 'saved':
      return '已保存'
    case 'error':
      return '保存失败'
    default:
      return dirty.value ? '未保存' : '就绪'
  }
})

// 完成度检查清单：日期 / 标题 / 正文是否已填写（右栏逐项打勾）
const checks = computed(() => [
  { ok: !!form.diaryDate, label: '已选日期' },
  { ok: !!form.title.trim(), label: '已写标题' },
  { ok: form.content.trim().length > 0, label: '正文不少于一行' },
])

// 按日期加载日记：已有则回填表单并记录 entryId，没有则清空为“新写”状态；
// 无论成败都在结束后放开自动保存（ready）
async function loadByDate(date: string) {
  loading.value = true
  ready.value = false
  try {
    const res = await getDiaryByDate({ date })
    if (res.data.code === 0) {
      const data = res.data.data
      if (data) {
        form.title = data.title ?? ''
        form.content = data.content ?? ''
        form.mood = data.mood
        form.status = data.status ?? 0
        entryId.value = data.id ?? null
      } else {
        form.title = ''
        form.content = ''
        form.mood = undefined
        form.status = defaultNewStatus
        entryId.value = null
      }
      dirty.value = false
    }
  } catch {
    message.error('加载日记失败')
  } finally {
    loading.value = false
    ready.value = true
  }
}

// 监听 Agent 工具触发的 UI 事件：日记相关动作（如 AI 写日记）后按当前日期重新加载
if (typeof window !== 'undefined') {
  window.addEventListener('agent-ui-action', (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.type === 'refresh' && detail.module === 'diary_day') {
      loadByDate(form.diaryDate)
    }
  })
}

// 任意表单字段变化：标记脏状态并通知自动保存
function onFieldChange() {
  dirty.value = true
  markDirty()
}

function setMood(mood: string) {
  form.mood = mood
  onFieldChange()
}

function setStatus(status: number) {
  form.status = status
  onFieldChange()
}

// 把本地草稿追加到正文末尾（空正文时直接作为正文）
function insertDraft() {
  const text = draftMirror.value.trim()
  if (!text) {
    message.info('暂无草稿可插入')
    return
  }
  form.content = form.content ? `${form.content.trimEnd()}\n\n${text}` : text
  onFieldChange()
  message.success('已插入草稿')
}

// 立即保存：成功后清除脏标记并提示
async function handleSave() {
  const ok = await saveNow()
  if (ok) {
    dirty.value = false
    message.success('已保存')
  } else {
    message.error('保存失败')
  }
}

function handleBack() {
  router.push('/diary')
}

// 打开日记 AI 助手面板（按功能开关显示入口）
function handleAiClick() {
  openDiaryAiPanel({ entryId: entryId.value ?? undefined, date: form.diaryDate })
}

// 全局快捷键：Ctrl/Cmd + S 手动保存
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    handleSave()
  }
}

// 挂载：读取本地草稿、加载日记设置中的默认可见性、解析路由 ?date 参数并加载日记
onMounted(async () => {
  try {
    draftMirror.value = localStorage.getItem(DRAFT_KEY) || ''
  } catch {
    draftMirror.value = ''
  }
  const diaryUx = await loadDiarySettings()
  defaultNewStatus = diaryDefaultStatus(diaryUx)
  form.status = defaultNewStatus
  const queryDate = route.query.date
  if (typeof queryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
    form.diaryDate = queryDate
  }
  await loadByDate(form.diaryDate)
  window.addEventListener('keydown', onKeydown)
})

// 路由 ?date 变化（如从日历切日期进入）时同步表单日期
watch(
  () => route.query.date,
  (date) => {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== form.diaryDate) {
      form.diaryDate = date
    }
  },
)

// 表单日期变化（初次加载完成后）时重新加载该日日记
watch(
  () => form.diaryDate,
  (newDate, oldDate) => {
    if (oldDate && newDate !== oldDate && ready.value) {
      loadByDate(newDate)
    }
  },
)

// 离开页面前守卫：有未保存内容时弹确认框，取消则留在本页
onBeforeRouteLeave((_to, _from, next) => {
  if (dirty.value && saveStatus.value !== 'saved') {
    const leave = window.confirm('有未保存的内容，确定离开吗？')
    next(leave)
    return
  }
  next()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <DiaryRoomShell>
    <div class="shell">
      <!-- 左栏：返回入口 / 主题时段 / 一日一篇说明 / 日期邮戳 / 编辑状态 -->
      <aside class="side">
        <div class="side-stack">
          <button type="button" class="back-chip" @click="handleBack">← 返回列表 · Esc</button>
          <div class="period-chip"><span class="dot" /><span>{{ period.name }}</span></div>
          <div class="side-card glass">
            <span class="tape mint" />
            <h3>一日一篇</h3>
            <p class="about text-pretty">编辑选中日的唯一一篇。右栏草稿可插入正文。</p>
          </div>
          <div class="side-card glass" style="text-align: center">
            <h3 style="margin-bottom: 8px">写这一天</h3>
            <div class="write-stamp">
              <div>
                <div class="m">{{ stampM }}</div>
                <div class="d">{{ stampD }}</div>
                <div class="y">{{ stampY }}</div>
              </div>
            </div>
          </div>
          <div class="side-card glass">
            <h3>状态</h3>
            <p class="save-status on">{{ sideStatusText }}</p>
            <p class="hint-keys" style="margin-top: 8px">Ctrl+S 保存 · Esc 回列表</p>
          </div>
          <div class="side-quote glass" style="margin-top: auto">
            <div class="q">「</div>
            <p class="text-pretty">{{ period.quote }}</p>
          </div>
        </div>
      </aside>

      <!-- 中栏：编辑区（日期 + 标题 + 正文），底部工具栏含保存状态与 插入草稿/AI 助手/保存 -->
      <div class="write-main glass">
        <span class="page-tape write-page-tape" />
        <div class="write-head">
          <div class="date-line">{{ displayDate || '—' }}</div>
          <input
            v-model="form.title"
            class="write-title"
            type="text"
            placeholder="给这一天起个标题…"
            :disabled="loading"
            @input="onFieldChange"
          />
        </div>
        <textarea
          v-model="form.content"
          class="write-area text-pretty"
          placeholder="写一点给自己的话…"
          :disabled="loading"
          @input="onFieldChange"
        />
        <div class="write-toolbar">
          <div class="save-status" :class="{ on: saveStatus === 'saved' }">{{ toolbarStatus }}</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button type="button" class="chip-btn" @click="insertDraft">插入草稿</button>
            <button
              v-if="isDiaryAiEnabled"
              type="button"
              class="chip-btn"
              @click="handleAiClick"
            >
              AI 助手
            </button>
            <button type="button" class="chip-btn primary" title="Ctrl+S" @click="handleSave">保存</button>
          </div>
        </div>
      </div>

      <!-- 右栏：心情选择 / 可见性切换 / 检查清单 / 本地草稿对照 -->
      <aside class="deck">
        <div class="deck-panel glass">
          <h3 style="font-size: 15px; letter-spacing: 2px; font-family: 'ZCOOL KuaiLe', sans-serif; margin-bottom: 10px">
            心情
          </h3>
          <div class="mood-row">
            <button
              v-for="m in MOOD_OPTIONS"
              :key="m.value"
              type="button"
              class="mood-chip"
              :class="{ on: form.mood === m.value }"
              @click="setMood(m.value)"
            >
              <span class="mood-dot" :class="m.value" />{{ m.label }}
            </button>
          </div>
        </div>
        <div class="deck-panel glass">
          <h3 style="font-size: 15px; letter-spacing: 2px; font-family: 'ZCOOL KuaiLe', sans-serif; margin-bottom: 10px">
            可见性
          </h3>
          <div class="status-seg">
            <button type="button" :class="{ on: form.status === 0 }" @click="setStatus(0)">私密</button>
            <button type="button" :class="{ on: form.status === 1 }" @click="setStatus(1)">公开</button>
          </div>
        </div>
        <div class="deck-panel glass">
          <h3 style="font-size: 15px; letter-spacing: 2px; font-family: 'ZCOOL KuaiLe', sans-serif; margin-bottom: 10px">
            检查清单
          </h3>
          <div class="check-list">
            <div v-for="item in checks" :key="item.label" class="check-item" :class="{ done: item.ok }">
              <span class="box">
                <svg v-if="item.ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              {{ item.label }}
            </div>
          </div>
        </div>
        <div class="deck-panel glass grow" style="display: flex; flex-direction: column">
          <h3 style="font-size: 15px; letter-spacing: 2px; font-family: 'ZCOOL KuaiLe', sans-serif; margin-bottom: 8px">
            草稿对照
          </h3>
          <div class="draft-mirror text-pretty" style="flex: 1">
            <div class="dm-label">DRAFT</div>
            <div>{{ draftMirror.trim() || '暂无草稿 · 可在列表右栏书写' }}</div>
          </div>
          <div class="pen-rest" aria-hidden="true" />
        </div>
      </aside>
    </div>
  </DiaryRoomShell>
</template>
