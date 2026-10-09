<script setup lang="ts">
/**
 * 大富翁机台：100 格小站蜿蜒棋盘（热座 + 机器人，含交易/拍卖/小黑屋/实习生赎身）
 * - 游戏本体是独立静态页（public/games/monopoly/index.html + engine.js），iframe 挂载
 * - 终局通过 postMessage 上报人类玩家自身资产与是否夺冠，落 arcade 战绩舱
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useArcadeRecords } from './arcade'

defineOptions({ name: 'GameMonopolyBoard' })

defineProps<{ active: boolean }>()

const gameSrc = `${import.meta.env.BASE_URL}games/monopoly/index.html?embed=1`
const frame = ref<HTMLIFrameElement | null>(null)

const { addRecord } = useArcadeRecords()

interface MonoRecordMessage {
  type?: string
  score?: number
  win?: boolean
  dur?: number
}

function onMessage(e: MessageEvent) {
  if (frame.value && e.source !== frame.value.contentWindow) return
  const d = e.data as MonoRecordMessage | null
  if (!d || d.type !== 'mono-record') return
  addRecord({
    g: 'monopoly',
    score: Math.round(d.score ?? 0),
    win: !!d.win,
    dur: Math.max(1, Math.round(d.dur ?? 0)),
  })
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="arc-mono">
    <iframe ref="frame" class="arc-mono-frame" :src="gameSrc" title="小站大富翁" />
  </div>
</template>

<style scoped>
.arc-mono {
  width: 100%;
  height: 100%;
  display: flex;
  min-height: 0;
}

.arc-mono-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 14px;
  background: #fffdf8;
}
</style>
