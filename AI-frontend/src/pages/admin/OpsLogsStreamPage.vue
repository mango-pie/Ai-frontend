<script setup lang="ts">
/**
 * 运维中心 · 实时日志
 * AstrBot 式滚动日志流：SSE 订阅系统日志 + 审计事件。
 * 路由：/admin/ops/logs
 */
import AdminRoomShell from '@/components/shared/AdminRoomShell.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import OpsCenterNav from '@/components/admin/OpsCenterNav.vue'
import { connectOpsLogStream, type OpsLogEntry } from '@/api/opsLogStream'
import '@/assets/admin-theme.css'

const MAX_ROWS = 2000

const entries = ref<OpsLogEntry[]>([])
const paused = ref(false)
const debugLevel = ref(false)
const autoScroll = ref(true)
const keyword = ref('')
const status = ref<'connecting' | 'open' | 'closed'>('connecting')

const levelFilter = ref<Record<string, boolean>>({
  DEBUG: false,
  INFO: true,
  WARN: true,
  ERROR: true,
})

let stream: { close: () => void } | null = null
let pendingQueue: OpsLogEntry[] = []
let flushTimer: number | null = null

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return entries.value.filter((e) => {
    if (!levelFilter.value[e.level] && !(e.kind === 'audit' && levelFilter.value.INFO)) {
      return false
    }
    if (kw) {
      const hay = `${e.logger} ${e.message}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const counts = computed(() => {
  const c = { error: 0, warn: 0, audit: 0 }
  for (const e of entries.value) {
    if (e.level === 'ERROR') c.error++
    else if (e.level === 'WARN') c.warn++
    if (e.kind === 'audit') c.audit++
  }
  return c
})

function pushEntries(batch: OpsLogEntry[]) {
  pendingQueue.push(...batch)
  if (flushTimer != null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    if (paused.value) {
      return
    }
    if (pendingQueue.length) {
      entries.value.push(...pendingQueue)
      if (entries.value.length > MAX_ROWS) {
        entries.value.splice(0, entries.value.length - MAX_ROWS)
      }
      pendingQueue = []
      if (autoScroll.value) void scrollToBottom()
    }
  }, 120)
}

function levelClass(entry: OpsLogEntry): string {
  if (entry.kind === 'audit') return 'is-audit'
  switch (entry.level) {
    case 'ERROR':
    case 'FATAL':
      return 'is-error'
    case 'WARN':
    case 'WARNING':
      return 'is-warn'
    case 'DEBUG':
    case 'TRACE':
      return 'is-debug'
    default:
      return 'is-info'
  }
}

const logEl = ref<HTMLElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  const el = logEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function onScroll() {
  const el = logEl.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  autoScroll.value = atBottom
}

function clearEntries() {
  entries.value = []
  pendingQueue = []
}

function copyVisible() {
  const text = filtered.value
    .map((e) => `[${e.time}] [${e.level}] [${e.logger}] ${e.message}`)
    .join('\n')
  void navigator.clipboard
    .writeText(text)
    .then(() => message.success('已复制当前日志'))
    .catch(() => message.warning('复制失败'))
}

function connect() {
  stream?.close()
  stream = connectOpsLogStream({ debug: debugLevel.value }, {
    onEntry: (entry) => pushEntries([entry]),
    onStatusChange: (s) => {
      status.value = s
    },
  })
}

onMounted(() => {
  connect()
})

watch(debugLevel, () => {
  connect()
})

onBeforeUnmount(() => {
  stream?.close()
  stream = null
  if (flushTimer != null) window.clearTimeout(flushTimer)
})
</script>

<template>
  <AdminRoomShell note-label="Station · 运维中心">
    <template #nav>
      <OpsCenterNav active-key="实时日志" />
    </template>
  <div class="ops-center-page admin-theme-page">
      <section class="ops-main">
        <div class="stream-toolbar">
          <span class="stream-status" :class="`is-${status}`">
            <span class="dot" />
            {{ status === 'open' ? '已连接' : status === 'connecting' ? '连接中…' : '已断开（重连中）' }}
          </span>

          <span class="stream-counts">
            <em v-if="counts.error" class="c-err">{{ counts.error }} 错误</em>
            <em v-if="counts.warn" class="c-warn">{{ counts.warn }} 警告</em>
            <em v-if="counts.audit" class="c-audit">{{ counts.audit }} 审计</em>
          </span>

          <a-input
            v-model:value="keyword"
            allow-clear
            placeholder="过滤关键字…"
            class="kw-input"
          />

          <div class="level-switch">
            <button
              v-for="(on, lv) in levelFilter"
              :key="lv"
              type="button"
              class="lv-btn"
              :class="[`lv-${lv.toLowerCase()}`, { on }]"
              @click="levelFilter[lv] = !on"
            >
              {{ lv }}
            </button>
          </div>

          <div class="stream-actions">
            <a-button size="small" @click="debugLevel = !debugLevel">
              {{ debugLevel ? 'DEBUG 级别' : 'INFO 级别' }}
            </a-button>
            <a-button size="small" :type="paused ? 'primary' : 'default'" @click="paused = !paused">
              {{ paused ? '已暂停' : '暂停' }}
            </a-button>
            <a-button size="small" @click="clearEntries">清屏</a-button>
            <a-button size="small" @click="copyVisible">复制</a-button>
          </div>
        </div>

        <div ref="logEl" class="stream-terminal" @scroll="onScroll">
          <div v-if="!filtered.length" class="stream-empty">
            {{ entries.length ? '当前过滤条件下没有日志' : '等待日志流入…' }}
          </div>
          <div
            v-for="(e, i) in filtered"
            :key="i"
            class="stream-row"
            :class="levelClass(e)"
          >
            <span class="t">{{ e.time }}</span>
            <span class="lv">{{ e.kind === 'audit' ? 'AUDIT' : e.level }}</span>
            <span class="lg">{{ e.logger }}</span>
            <span class="msg">{{ e.message }}</span>
            <span v-if="e.throwable" class="thr">{{ e.throwable }}</span>
          </div>
        </div>

        <div class="stream-footer">
          共 {{ entries.length }} 条 · 显示 {{ filtered.length }} 条 · 最多保留 {{ MAX_ROWS }} 条
          <span v-if="paused" class="paused-hint">（已暂停接收）</span>
        </div>
      </section>
  </div>
  </AdminRoomShell>
</template>

<style scoped>
.stream-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.stream-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.stream-status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted, #999);
}

.stream-status.is-open .dot {
  background: #52c41a;
  box-shadow: 0 0 6px rgb(82 196 26 / 60%);
}

.stream-status.is-connecting .dot {
  background: #faad14;
}

.stream-status.is-closed .dot {
  background: #ff4d4f;
}

.stream-counts {
  display: inline-flex;
  gap: 8px;
  font-size: 12px;
}

.stream-counts .c-err {
  color: #ff4d4f;
}

.stream-counts .c-warn {
  color: #faad14;
}

.stream-counts .c-audit {
  color: #b37feb;
}

.kw-input {
  width: 200px;
}

.level-switch {
  display: inline-flex;
  gap: 4px;
}

.lv-btn {
  border: 1px solid var(--color-border, #ddd);
  background: transparent;
  border-radius: 6px;
  font-size: 11px;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  cursor: pointer;
  opacity: 0.45;
  color: inherit;
}

.lv-btn.on {
  opacity: 1;
}

.lv-btn.lv-info.on {
  border-color: #52c41a;
  color: #52c41a;
}

.lv-btn.lv-warn.on {
  border-color: #faad14;
  color: #faad14;
}

.lv-btn.lv-error.on {
  border-color: #ff4d4f;
  color: #ff4d4f;
}

.lv-btn.lv-debug.on {
  border-color: #8c8c8c;
  color: #8c8c8c;
}

.stream-actions {
  margin-left: auto;
  display: inline-flex;
  gap: 6px;
}

.stream-terminal {
  background: #101418;
  color: #d6e2f0;
  border-radius: 10px;
  border: 1px solid #232a33;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.55;
  height: calc(100vh - 320px);
  min-height: 320px;
  overflow-y: auto;
  padding: 12px 14px;
}

.stream-empty {
  color: #5b6673;
  text-align: center;
  padding: 48px 0;
}

.stream-row {
  white-space: pre-wrap;
  word-break: break-all;
  padding: 1px 0;
}

.stream-row .t {
  color: #5b6673;
  margin-right: 8px;
}

.stream-row .lv {
  display: inline-block;
  min-width: 46px;
  font-weight: 600;
  margin-right: 8px;
}

.stream-row .lg {
  color: #7f95ad;
  margin-right: 10px;
}

.stream-row .thr {
  display: block;
  color: #ff7875;
  padding-left: 96px;
}

.stream-row.is-info .lv {
  color: #61a675;
}

.stream-row.is-warn {
  color: #ffc53d;
}

.stream-row.is-warn .lv {
  color: #faad14;
}

.stream-row.is-error {
  color: #ff9c99;
}

.stream-row.is-error .lv {
  color: #ff4d4f;
}

.stream-row.is-debug {
  color: #6b7684;
}

.stream-row.is-audit {
  color: #cfa9ff;
}

.stream-row.is-audit .lv {
  color: #b37feb;
}

.stream-footer {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-muted, #888);
}

.paused-hint {
  color: #faad14;
}
</style>
