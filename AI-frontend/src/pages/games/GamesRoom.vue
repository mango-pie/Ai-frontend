<script setup lang="ts">
/**
 * 游戏舱（路由 /games）：单屏房间 —— 左侧机台列 + 右侧游戏/战绩舞台
 * - 三台机台在 v-show 下常驻，切走再回来不丢进度；Esc 由 StationRoomShell 处理
 * - 战绩 / 偏好暂存 localStorage（见 arcade.ts），后端 games 模块上线后可切接口
 * - 样式全部 .arc- 前缀，避免与全局样式撞车（见 docs/qa 全局 CSS 约定）
 */
import { computed, defineAsyncComponent, ref, watchEffect } from 'vue'
import { Modal, Popover, Switch as ASwitch, Input as AInput } from 'ant-design-vue'
import { BarChart3, ChevronRight, Settings2 } from 'lucide-vue-next'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import ArcadeStats from './ArcadeStats.vue'
import {
  ARCADE_GAMES,
  arcadeSound,
  gameMeta,
  relTime,
  useArcadeRecords,
  useArcadeSettings,
  type GameId,
} from './arcade'
import './games.css'

// 21 台游戏机按需分包：整舱静态打包会顶大一个 chunk，改为独立 chunk 懒加载。
// 渲染仍是 v-show 常驻（chunk 加载完成后挂载、切走再回来不丢进度），行为不变。
const Game2048 = defineAsyncComponent(() => import('./Game2048.vue'))
const GameMine = defineAsyncComponent(() => import('./GameMine.vue'))
const GameMemory = defineAsyncComponent(() => import('./GameMemory.vue'))
const GameSnake = defineAsyncComponent(() => import('./GameSnake.vue'))
const GamePuzzle = defineAsyncComponent(() => import('./GamePuzzle.vue'))
const GameBreakout = defineAsyncComponent(() => import('./GameBreakout.vue'))
const GameTetris = defineAsyncComponent(() => import('./GameTetris.vue'))
const GameMole = defineAsyncComponent(() => import('./GameMole.vue'))
const GameSimon = defineAsyncComponent(() => import('./GameSimon.vue'))
const GameFlappy = defineAsyncComponent(() => import('./GameFlappy.vue'))
const GameCatch = defineAsyncComponent(() => import('./GameCatch.vue'))
const GameTicTac = defineAsyncComponent(() => import('./GameTicTac.vue'))
const GameStack = defineAsyncComponent(() => import('./GameStack.vue'))
const GameGomoku = defineAsyncComponent(() => import('./GameGomoku.vue'))
const GameLink = defineAsyncComponent(() => import('./GameLink.vue'))
const GameConnectFour = defineAsyncComponent(() => import('./GameConnectFour.vue'))
const GameReversi = defineAsyncComponent(() => import('./GameReversi.vue'))
const GameBattleship = defineAsyncComponent(() => import('./GameBattleship.vue'))
const GameJungle = defineAsyncComponent(() => import('./GameJungle.vue'))
const GameAeroplane = defineAsyncComponent(() => import('./GameAeroplane.vue'))
const GameMonopoly = defineAsyncComponent(() => import('./GameMonopoly.vue'))

type View = 'game' | 'stats'

const view = ref<View>('game')
const cur = ref<GameId>('g2048')
const { records, aggregate, bestOf, clearRecords } = useArcadeRecords()
const { settings, update, reset } = useArcadeSettings()

watchEffect(() => {
  arcadeSound.enabled = settings.value.sound
})

const crumb = computed(() =>
  view.value === 'stats'
    ? { name: '战绩舱', desc: '你的每一局都被好好记着' }
    : { name: gameMeta(cur.value).name, desc: gameMeta(cur.value).desc },
)

const lastRecord = computed(() => records.value[records.value.length - 1])
const lastText = computed(() => {
  const r = lastRecord.value
  if (!r) return { title: '最近玩过 · —', sub: '还没有对局记录' }
  return { title: '最近玩过 · ' + gameMeta(r.g).name, sub: relTime(r.t) }
})

function playCount(id: GameId) {
  return records.value.filter((r) => r.g === id).length
}
function setGame(id: GameId) {
  cur.value = id
  view.value = 'game'
  arcadeSound.click()
}
function setView(v: View) {
  view.value = v
  arcadeSound.click()
}
function resumeLast() {
  const r = lastRecord.value
  if (r) setGame(r.g)
}
function resetSettings() {
  reset()
  arcadeSound.click()
}
function clearAll() {
  arcadeSound.click()
  Modal.confirm({
    title: '清空战绩数据？',
    content: '将删除本机保存的全部对局记录（含示例数据），此操作不可恢复。',
    okText: '清空',
    okType: 'danger',
    onOk: () => clearRecords(),
  })
}

/** 像素飘落：确定性伪随机（不随重渲染抖动） */
function dustStyle(i: number) {
  const rnd = (n: number) => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  const colors = ['#f490ad', '#9b8ce8', '#c79ae0', '#6aaee8', '#5fc4a5', '#ffcf6e', '#ffa45c']
  const size = 5 + rnd(1) * 7
  return {
    left: rnd(2) * 100 + '%',
    width: size + 'px',
    height: size + 'px',
    background: colors[i % colors.length],
    animationDuration: 9 + rnd(3) * 9 + 's',
    animationDelay: -rnd(4) * 14 + 's',
  }
}
</script>

<template>
  <StationRoomShell brand-path="/" note-label="Game Bay · 街机舱" room="games" fill="frame">
    <div class="arc-root" :data-density="settings.density">
      <!-- 标题带 -->
      <section class="arc-hero">
        <div class="arc-heroleft">
          <div class="arc-kana">ゲームコーナー</div>
          <div class="arc-herorow">
            <h1 class="arc-herotitle">游戏舱</h1>
            <span class="arc-tape">来一把？输赢都要开心</span>
            <div class="arc-herosub">
              <span class="stat">总对局 <b>{{ aggregate.total }}</b> 局</span>
              <span class="stat">累计 <b>{{ aggregate.durMin }}</b> 分钟</span>
              <span class="stat">本周 <b>{{ aggregate.week }}</b> 局</span>
            </div>
          </div>
        </div>
        <button class="arc-lastchip" :title="lastText.title" @click="resumeLast">
          <span class="dot" />
          <span class="main">
            <span class="t">{{ lastText.title }}</span>
            <span class="s">{{ lastText.sub }}</span>
          </span>
          <span class="ico"><ChevronRight :size="13" /></span>
        </button>
      </section>

      <div class="arc-layout">
        <!-- 左侧：机台列（机台多时自动转紧凑模式） -->
        <aside class="arc-sidepanel" :class="{ 'is-many': ARCADE_GAMES.length > 9 }">
          <div class="arc-sectitle">机台 <span class="en">CABINETS</span></div>
          <button
            v-for="g in ARCADE_GAMES"
            :key="g.id"
            class="arc-cabinet"
            :class="{ 'is-active': view === 'game' && cur === g.id }"
            @click="setGame(g.id)"
          >
            <span class="plays">{{ playCount(g.id) ? playCount(g.id) + ' 局' : '新机台' }}</span>
            <span class="ico" :style="{ background: g.grad }"><component :is="g.icon" :size="20" /></span>
            <span class="main">
              <span class="name">{{ g.name }}</span>
              <span class="sub">{{ g.sub }}</span>
            </span>
            <span class="best">
              <b>{{ bestOf(g.id)?.value ?? '—' }}</b>
              <span>{{ bestOf(g.id)?.label ?? '等待开局' }}</span>
            </span>
          </button>
          <div class="arc-sectitle">舱内速报 <span class="en">BRIEFING</span></div>
          <div class="arc-mini">
            <div class="row"><span>综合胜率</span><b>{{ aggregate.winRate ?? '—' }}<em v-if="aggregate.winRate != null">%</em></b></div>
            <div class="row"><span>累计时长</span><b>{{ aggregate.durMin }}<em> 分钟</em></b></div>
          </div>
          <button class="arc-cta" @click="setView(view === 'stats' ? 'game' : 'stats')">
            <BarChart3 :size="15" /> {{ view === 'stats' ? '回到机台' : '进入战绩舱' }}
          </button>
        </aside>

        <!-- 右侧：游戏 / 战绩 -->
        <main class="arc-main">
          <div class="arc-crumbbar">
            <div class="arc-crumb">
              <span class="t">{{ crumb.name }}</span>
              <span class="d">{{ crumb.desc }}</span>
            </div>
            <div class="right">
              <Popover placement="bottomRight" trigger="click" overlay-class-name="arc-pop">
                <template #content>
                  <div class="arc-set">
                    <div class="row"><span>芯片音效</span><ASwitch size="small" :checked="settings.sound" @change="(v: any) => update({ sound: !!v })" /></div>
                    <div class="row"><span>像素飘落</span><ASwitch size="small" :checked="settings.dust" @change="(v: any) => update({ dust: !!v })" /></div>
                    <div class="row"><span>紧凑密度</span><ASwitch size="small" :checked="settings.density === 'compact'" @change="(v: any) => update({ density: v ? 'compact' : 'cozy' })" /></div>
                    <div class="row"><span>2048 撤销辅助</span><ASwitch size="small" :checked="settings.undo2048" @change="(v: any) => update({ undo2048: !!v })" /></div>
                    <div class="row">
                      <span>玩家代号</span>
                      <AInput
                        size="small"
                        :maxlength="12"
                        :value="settings.playerName"
                        placeholder="给将来的排行榜"
                        style="width: 128px"
                        @change="(e: any) => update({ playerName: String(e.target.value || '').trim().slice(0, 12) })"
                      />
                    </div>
                    <button class="arc-btn is-danger is-block" @click="clearAll">清空战绩数据</button>
                    <button class="arc-btn is-block" @click="resetSettings">恢复默认偏好</button>
                  </div>
                </template>
                <button class="arc-btn"><Settings2 :size="14" /> 偏好</button>
              </Popover>
              <div class="arc-seg">
                <span :class="{ 'is-active': view === 'game' }" tabindex="0" @click="setView('game')" @keydown.enter="setView('game')">游戏</span>
                <span :class="{ 'is-active': view === 'stats' }" tabindex="0" @click="setView('stats')" @keydown.enter="setView('stats')">战绩</span>
              </div>
            </div>
          </div>

          <div class="arc-stage">
            <Game2048 v-show="view === 'game' && cur === 'g2048'" :active="view === 'game' && cur === 'g2048'" />
            <GameSnake v-show="view === 'game' && cur === 'snake'" :active="view === 'game' && cur === 'snake'" />
            <GameTetris v-show="view === 'game' && cur === 'tetris'" :active="view === 'game' && cur === 'tetris'" />
            <GameMine v-show="view === 'game' && cur === 'mine'" :active="view === 'game' && cur === 'mine'" />
            <GamePuzzle v-show="view === 'game' && cur === 'puzzle'" :active="view === 'game' && cur === 'puzzle'" />
            <GameMemory v-show="view === 'game' && cur === 'mem'" :active="view === 'game' && cur === 'mem'" />
            <GameMole v-show="view === 'game' && cur === 'mole'" :active="view === 'game' && cur === 'mole'" />
            <GameSimon v-show="view === 'game' && cur === 'simon'" :active="view === 'game' && cur === 'simon'" />
            <GameBreakout v-show="view === 'game' && cur === 'breakout'" :active="view === 'game' && cur === 'breakout'" />
            <GameFlappy v-show="view === 'game' && cur === 'flappy'" :active="view === 'game' && cur === 'flappy'" />
            <GameCatch v-show="view === 'game' && cur === 'catch'" :active="view === 'game' && cur === 'catch'" />
            <GameTicTac v-show="view === 'game' && cur === 'tictac'" :active="view === 'game' && cur === 'tictac'" />
            <GameStack v-show="view === 'game' && cur === 'stack'" :active="view === 'game' && cur === 'stack'" />
            <GameGomoku v-show="view === 'game' && cur === 'gomoku'" :active="view === 'game' && cur === 'gomoku'" />
            <GameLink v-show="view === 'game' && cur === 'link'" :active="view === 'game' && cur === 'link'" />
            <GameConnectFour v-show="view === 'game' && cur === 'connect'" :active="view === 'game' && cur === 'connect'" />
            <GameReversi v-show="view === 'game' && cur === 'reversi'" :active="view === 'game' && cur === 'reversi'" />
            <GameBattleship v-show="view === 'game' && cur === 'battleship'" :active="view === 'game' && cur === 'battleship'" />
            <GameJungle v-show="view === 'game' && cur === 'jungle'" :active="view === 'game' && cur === 'jungle'" />
            <GameAeroplane v-show="view === 'game' && cur === 'aeroplane'" :active="view === 'game' && cur === 'aeroplane'" />
            <GameMonopoly v-show="view === 'game' && cur === 'monopoly'" :active="view === 'game' && cur === 'monopoly'" />
            <ArcadeStats v-if="view === 'stats'" />
          </div>
        </main>
      </div>

      <!-- 像素飘落 -->
      <div v-if="settings.dust" class="arc-dust" aria-hidden="true">
        <i v-for="i in 16" :key="i" :style="dustStyle(i)" />
      </div>
    </div>
  </StationRoomShell>
</template>
