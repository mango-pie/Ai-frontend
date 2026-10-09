<script setup lang="ts">
/**
 * 战绩舱面板：总览数字滚动 / 机台纪录 / 近 7 日对局柱状图 / 最近对局列表
 * 数据来自 useArcadeRecords（localStorage），清空走二次确认
 */
import { computed, onMounted, ref } from 'vue'
import { Modal } from 'ant-design-vue'
import { Trash2 } from 'lucide-vue-next'
import { countUp, fmtDur, fmtInt, gameMeta, relTime, useArcadeRecords, useArcadeSettings, type ArcadeRecord } from './arcade'

const weekCN = ['日', '一', '二', '三', '四', '五', '六']

const { records, aggregate, bestOf, clearRecords } = useArcadeRecords()
const { settings } = useArcadeSettings()

const totalEl = ref<HTMLElement | null>(null)
const durEl = ref<HTMLElement | null>(null)
const weekEl = ref<HTMLElement | null>(null)
const winEl = ref<HTMLElement | null>(null)

onMounted(() => {
  if (totalEl.value) countUp(totalEl.value, aggregate.value.total)
  if (durEl.value) countUp(durEl.value, aggregate.value.durMin)
  if (weekEl.value) countUp(weekEl.value, aggregate.value.week)
  if (winEl.value && aggregate.value.winRate != null) countUp(winEl.value, aggregate.value.winRate)
})

interface DayBar {
  label: string
  n: number
  today: boolean
}

const last7 = computed<DayBar[]>(() => {
  const out: DayBar[] = []
  for (let i = 6; i >= 0; i--) {
    const t = Date.now() - i * 86400e3
    const d = new Date(t)
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    out.push({
      label: i === 0 ? '今天' : '周' + weekCN[d.getDay()],
      n: records.value.filter((r) => {
        const rd = new Date(r.t)
        const rk = rd.getFullYear() + '-' + String(rd.getMonth() + 1).padStart(2, '0') + '-' + String(rd.getDate()).padStart(2, '0')
        return rk === key
      }).length,
      today: i === 0,
    })
  }
  return out
})
const maxN = computed(() => Math.max(1, ...last7.value.map((d) => d.n)))

interface RecentRow {
  record: ArcadeRecord
  text: string
  val: string
}

const recent = computed<RecentRow[]>(() =>
  records.value
    .slice(-8)
    .reverse()
    .map((r) => {
      let text = ''
      let val = ''
      if (r.g === 'g2048') {
        text = '得分 ' + fmtInt(r.score ?? 0)
        val = r.win ? '达成 2048' : '冲分'
      }
      if (r.g === 'mine') {
        text = r.win ? '通关 ' + fmtDur(r.dur) : '未通关'
        val = { easy: '入门', hard: '进阶', master: '大师' }[r.diff ?? 'easy']
      }
      if (r.g === 'mem') {
        text = fmtInt(r.moves ?? 0) + ' 步配对完成'
        val = fmtDur(r.dur) + (r.cols === 6 ? ' · 6×4' : '')
      }
      if (r.g === 'snake') {
        text = '吃到 ' + fmtInt(r.score ?? 0) + ' 颗'
        val = fmtDur(r.dur)
      }
      if (r.g === 'puzzle') {
        text = fmtInt(r.moves ?? 0) + ' 步复原完成'
        val = fmtDur(r.dur)
      }
      if (r.g === 'breakout') {
        text = '得分 ' + fmtInt(r.score ?? 0) + (r.win ? ' · 全清' : '')
        val = fmtDur(r.dur)
      }
      if (r.g === 'tetris') {
        text = '得分 ' + fmtInt(r.score ?? 0) + ' · 消 ' + fmtInt(r.lines ?? 0) + ' 行'
        val = fmtDur(r.dur)
      }
      if (r.g === 'mole') {
        text = '敲中 ' + fmtInt(Math.round((r.score ?? 0) / 10)) + ' 只'
        val = fmtDur(r.dur)
      }
      if (r.g === 'simon') {
        text = '连过 ' + fmtInt(r.score ?? 0) + ' 关'
        val = fmtDur(r.dur)
      }
      if (r.g === 'flappy') {
        text = '穿过 ' + fmtInt(r.score ?? 0) + ' 根管道'
        val = fmtDur(r.dur)
      }
      if (r.g === 'catch') {
        text = '接住 ' + fmtInt(r.score ?? 0) + ' 颗水果'
        val = fmtDur(r.dur)
      }
      if (r.g === 'tictac') {
        text = r.win === true ? '战胜 AI' : r.win === false ? '败给 AI' : '握手言和'
        val = '连胜 ' + fmtInt(r.score ?? 0)
      }
      if (r.g === 'connect') {
        text = r.win === true ? '四连制胜' : r.win === false ? '败给 AI' : '握手言和'
        val = '连胜 ' + fmtInt(r.score ?? 0)
      }
      if (r.g === 'reversi') {
        text = r.win === true ? '占领棋盘' : r.win === false ? '败给 AI' : '握手言和'
        val = '连胜 ' + fmtInt(r.score ?? 0)
      }
      if (r.g === 'stack') {
        text = '叠到 ' + fmtInt(r.score ?? 0) + ' 层'
        val = fmtDur(r.dur)
      }
      if (r.g === 'gomoku') {
        text = r.win === true ? '战胜 AI' : r.win === false ? '败给 AI' : '握手言和'
        val = '连胜 ' + fmtInt(r.score ?? 0)
      }
      if (r.g === 'link') {
        text = '全部消除'
        val = fmtDur(r.dur)
      }
      if (r.g === 'battleship') {
        text = r.win === true ? '全歼敌舰' : r.win === false ? '舰队沉没' : '握手言和'
        val = '连胜 ' + fmtInt(r.score ?? 0)
      }
      return { record: r, text, val }
    }),
)

function barGeom(index: number, n: number) {
  const bw = 26
  const gap = 18
  const x = 14 + index * (bw + gap)
  const h = Math.max(4, (n / maxN.value) * 84)
  return { x, y: 100 - h, w: bw, h }
}

function onClear() {
  Modal.confirm({
    title: '清空战绩数据？',
    content: '将删除本机保存的全部对局记录（含示例数据），此操作不可恢复。',
    okText: '清空',
    okType: 'danger',
    onOk: () => {
      clearRecords()
    },
  })
}
</script>

<template>
  <div class="arc-pane arc-pstats">
    <div class="arc-sectitle">
      总览<template v-if="settings.playerName"> · {{ settings.playerName }}</template>
      <span class="en">OVERVIEW</span>
      <button class="arc-btn is-danger" @click="onClear"><Trash2 :size="13" /> 清空战绩</button>
    </div>
    <div class="arc-overview">
      <div class="arc-ovcard"><div class="lab">总对局</div><div class="val"><span ref="totalEl">0</span><em>局</em></div></div>
      <div class="arc-ovcard"><div class="lab">累计时长</div><div class="val"><span ref="durEl">0</span><em>分钟</em></div></div>
      <div class="arc-ovcard"><div class="lab">本周对局</div><div class="val"><span ref="weekEl">0</span><em>局</em></div></div>
      <div class="arc-ovcard"><div class="lab">综合胜率</div><div class="val"><span ref="winEl">{{ aggregate.winRate == null ? '—' : 0 }}</span><em v-if="aggregate.winRate != null">%</em></div></div>
    </div>

    <div class="arc-sectitle">机台纪录 <span class="en">BESTS</span></div>
    <div class="arc-best">
      <div v-for="g in ['g2048', 'mine', 'mem'] as const" :key="g" class="arc-bestcard">
        <span class="ico" :style="{ background: gameMeta(g).grad }">
          <component :is="gameMeta(g).icon" :size="19" />
        </span>
        <span class="main">
          <span class="name">{{ gameMeta(g).name }} · {{ bestOf(g)?.label ?? '纪录' }}</span>
          <span class="val" :class="{ 'is-none': !bestOf(g) }">{{ bestOf(g)?.value ?? '等待首个纪录' }}</span>
        </span>
      </div>
    </div>

    <div class="arc-sectitle">近况 <span class="en">RECENT</span></div>
    <div class="arc-chartrow">
      <div class="arc-chartpanel">
        <div class="lab">近 7 日对局</div>
        <svg viewBox="0 0 320 120" preserveAspectRatio="xMidYMid meet">
          <template v-if="records.length">
            <template v-for="(d, i) in last7" :key="d.label">
              <rect
                :x="barGeom(i, d.n).x"
                :y="barGeom(i, d.n).y"
                :width="barGeom(i, d.n).w"
                :height="barGeom(i, d.n).h"
                rx="7"
                :fill="d.today ? 'var(--room)' : 'color-mix(in srgb, var(--room) 30%, transparent)'"
              ><title>{{ d.label }} · {{ d.n }} 局</title></rect>
              <text
                :x="barGeom(i, d.n).x + 13"
                :y="116"
                text-anchor="middle"
                font-size="9.5"
                fill="var(--ink-faint)"
              >{{ d.label }}</text>
              <text
                v-if="d.n"
                :x="barGeom(i, d.n).x + 13"
                :y="barGeom(i, d.n).y - 5"
                text-anchor="middle"
                font-size="9.5"
                font-weight="600"
                fill="var(--ink-soft)"
              >{{ d.n }}</text>
            </template>
          </template>
          <text v-else x="160" y="64" text-anchor="middle" font-size="11" fill="var(--ink-faint)">还没有对局记录</text>
        </svg>
      </div>
      <div class="arc-recentpanel">
        <div class="lab">最近对局</div>
        <div v-if="recent.length" class="arc-recentlist">
          <div v-for="row in recent" :key="row.record.t + row.record.g" class="arc-rrow">
            <span class="ric" :style="{ background: gameMeta(row.record.g).grad }">
              <component :is="gameMeta(row.record.g).icon" :size="13" />
            </span>
            <span class="main">
              <span class="t">{{ gameMeta(row.record.g).name }} · {{ row.text }}</span>
              <span class="s">{{ row.val }}</span>
            </span>
            <span class="when">{{ relTime(row.record.t) }}</span>
          </div>
        </div>
        <div v-else class="arc-emptyhint">还没有对局记录<br />去左边挑一台机台开玩吧</div>
      </div>
    </div>
  </div>
</template>
