<script setup lang="ts">
/**
 * 「正在播放」舞台页：左侧大封面演出区（含空舞台快捷入口、频谱、唱片演唱会氛围、
 * 舞台 MV 停靠、即将播放卡），右侧同步歌词面板（行点击跳转进度）。
 */
import { computed, ref } from 'vue'
import { Clock, FolderOpen, Heart, Languages, Maximize2, Music, Search, Video } from 'lucide-vue-next'
import { applyCoverFallback } from '@/utils/musicCover'
import { usePulseLyricUi } from '@/composables/pulse/usePulseLyricUi'
import type { PulsePlayerApi } from '@/pages/music/pulseApi'

const props = defineProps<{ p: PulsePlayerApi }>()
const p = props.p
const { lyricFlowRef, lyricToneClass, onLyricLineEnter, onLyricLineLeave, onLyricLineClick, markLyricUserScroll } =
  usePulseLyricUi(p)
// 鼠标是否悬停在舞台演出区（悬停时退出唱片模式，展示文案）
const stageHot = ref(false)
// MV 是否停靠在舞台（停靠时封面区被视频替换）
const stageMv = computed(() => p.mvMode.value === 'stage')
// 唱片演唱会氛围的启用条件：设置开启 + 有曲目 + 舞台页 + 无舞台 MV
const stageConcert = computed(
  () =>
    p.stageConcertFx.value &&
    !!p.currentTrack.value &&
    p.view.value === 'stage' &&
    !stageMv.value,
)
// live 态 = 唱片氛围且鼠标不在舞台上（离开后封面收成旋转唱片）
const stageLive = computed(() => stageConcert.value && !stageHot.value)
// 唱片环形频谱的灯条数量（一圈均匀分布）
const VINYL_EQ_BARS = 56
</script>

<template>
          <!-- STAGE -->
          <section
            id="view-stage"
            class="view view-stage"
            :class="{ 'is-active': p.view.value === 'stage' }"
            aria-label="正在播放舞台"
          >
            <div class="stage-grid">
              <!-- 演出区（封面/视频停靠宿主）：空舞台给快捷入口，有曲目给封面 + 频谱 + 氛围 + 即将播放 -->
              <figure
                class="panel art-panel"
                data-stage-art
                :class="{
                  'has-track': !!p.currentTrack.value,
                  'is-stage-hot': stageHot,
                  'is-stage-concert': stageConcert,
                  'is-stage-live': stageLive,
                  'is-stage-mv': stageMv,
                }"
                @mouseenter="stageHot = true"
                @mouseleave="stageHot = false"
              >
                <span class="stage-kicker">NIGHT ROOM // STAGE</span>
                <h1 v-if="!p.currentTrack.value" class="stage-title stage-title--empty">
                  listen<br />into<br /><span>night</span>
                </h1>
                <span class="stage-01" aria-hidden="true">01</span>

                <div class="stage-overlay">
                  <nav v-if="!p.currentTrack.value" class="stage-shortcuts" aria-label="快捷入口">
                    <button type="button" @click="p.switchView('search')">
                      <Search :size="16" :stroke-width="2" aria-hidden="true" />
                      搜索
                    </button>
                    <button type="button" @click="p.pickFiles()">
                      <FolderOpen :size="16" :stroke-width="2" aria-hidden="true" />
                      本地
                    </button>
                    <button type="button" @click="p.openPlaylist('favorites')">
                      <Heart :size="16" :stroke-width="2" aria-hidden="true" />
                      收藏
                    </button>
                    <button type="button" @click="p.openPlaylist('history')">
                      <Clock :size="16" :stroke-width="2" aria-hidden="true" />
                      最近
                    </button>
                  </nav>

                  <template v-if="p.currentTrack.value">
                    <!-- 封面（点击播放/暂停）+ 曲名歌手 + MV 入口 -->
                    <div class="stage-hero">
                      <button
                        class="stage-cover"
                        type="button"
                        :aria-label="p.isPlaying.value ? '暂停' : '播放'"
                        @click="p.togglePlay()"
                      >
                        <img
                          v-if="p.currentCover.value"
                          :src="p.currentCover.value"
                          alt=""
                          referrerpolicy="no-referrer"
                          @error="applyCoverFallback"
                        />
                        <span v-else class="stage-cover-fallback" aria-hidden="true" />
                      </button>
                      <div class="stage-hero-copy">
                        <span class="quality">{{ p.qualityLabel(p.currentTrack.value) }}</span>
                        <h2 class="stage-track-title">{{ p.currentTrack.value.title }}</h2>
                        <p class="stage-track-meta">
                          {{ p.currentTrack.value.artist }} · {{ p.currentTrack.value.album }}
                        </p>
                        <button
                          v-if="p.hasMv.value"
                          class="icon-button"
                          data-fx="mv"
                          type="button"
                          :aria-label="p.mvLoading.value ? 'MV 加载中' : p.mvMode.value === 'off' ? '播放 MV' : '正在播放 MV'"
                          :disabled="p.mvLoading.value"
                          @click="p.openMvPip()"
                        >
                          <Video :size="16" :stroke-width="2" />
                        </button>
                      </div>
                    </div>

                    <!-- 实时频谱：高度来自 analyser 的每档电平 -->
                    <div
                      class="wave-deck wave-deck--live"
                      aria-hidden="true"
                      :class="{ 'is-active': p.isPlaying.value && p.motionOn.value }"
                    >
                      <i
                        v-for="(level, i) in p.spectrumLevels.value"
                        :key="i"
                        :style="{ height: `${Math.max(10, Math.round(level * 100))}%` }"
                      />
                    </div>
                    <!-- 唱片演唱会氛围层：光晕/光斑/轨道/浮尘（纯装饰） -->
                    <div v-if="stageConcert" class="vinyl-atmosphere" aria-hidden="true">
                      <span class="vinyl-wash vinyl-wash--a" />
                      <span class="vinyl-wash vinyl-wash--b" />
                      <span class="vinyl-glow" />
                      <span class="vinyl-spot" />
                      <span class="vinyl-floor" />
                      <span class="vinyl-orbit vinyl-orbit--outer" />
                      <span class="vinyl-orbit vinyl-orbit--mid" />
                      <span class="vinyl-orbit vinyl-orbit--inner" />
                      <span class="vinyl-mote" style="--x:16%;--y:20%;--d:2.8s" />
                      <span class="vinyl-mote" style="--x:78%;--y:16%;--d:3.6s" />
                      <span class="vinyl-mote" style="--x:88%;--y:54%;--d:4.2s" />
                      <span class="vinyl-mote" style="--x:10%;--y:62%;--d:3.1s" />
                      <span class="vinyl-mote" style="--x:72%;--y:78%;--d:4.8s" />
                      <span class="vinyl-mote" style="--x:26%;--y:84%;--d:3.4s" />
                      <span class="vinyl-mote" style="--x:48%;--y:12%;--d:2.4s" />
                      <span class="vinyl-mote" style="--x:58%;--y:88%;--d:3.9s" />
                      <em class="vinyl-ghost">{{ p.currentTrack.value.title }}</em>
                    </div>
                    <!-- 环形频谱灯条：56 根绕唱片一圈，--i 供 CSS 做波浪相位 -->
                    <div v-if="stageConcert" class="vinyl-eq" aria-hidden="true">
                      <i
                        v-for="i in VINYL_EQ_BARS"
                        :key="`v-${i}`"
                        :style="{
                          transform: `rotate(${(360 / VINYL_EQ_BARS) * (i - 1)}deg)`,
                          '--i': String(i - 1),
                        }"
                      >
                        <b />
                      </i>
                    </div>
                    <div v-if="stageConcert" class="vinyl-pulse" aria-hidden="true">
                      <span /><span /><span />
                    </div>

                    <button
                      v-if="p.upNextTrack.value"
                      class="stage-upnext"
                      type="button"
                      :aria-label="`即将播放：${p.upNextTrack.value.title}`"
                      @click="p.playTrack(p.upNextTrack.value.id)"
                    >
                      <span class="upnext-label">即将播放</span>
                      <span v-if="p.coverOf(p.upNextTrack.value)" class="upnext-cover" aria-hidden="true">
                        <img
                          :src="p.coverOf(p.upNextTrack.value)"
                          alt=""
                          referrerpolicy="no-referrer"
                          @error="applyCoverFallback"
                        />
                      </span>
                      <span v-else class="upnext-cover upnext-cover--fallback" aria-hidden="true">
                        <Music :size="14" :stroke-width="2" />
                      </span>
                      <strong class="upnext-title">{{ p.upNextTrack.value.title }}</strong>
                    </button>
                  </template>

                  <div v-else class="stage-empty">
                    <p class="stage-empty-lead">舞台已就绪。搜一首歌，或导入本地音频。</p>
                    <div class="button-row">
                      <button class="action-button primary" type="button" @click="p.switchView('search')">
                        <Search :size="14" :stroke-width="2" aria-hidden="true" />
                        去搜索
                      </button>
                      <button class="action-button" type="button" @click="p.pickFiles()">
                        <FolderOpen :size="14" :stroke-width="2" aria-hidden="true" />
                        导入本地
                      </button>
                    </div>
                  </div>
                </div>

                <figcaption class="art-credit">封面是当前曲目。背景在设置里调：设计天空或动漫轮播。</figcaption>
              </figure>

              <div class="context">
                <!-- 同步歌词面板：按行高亮当前句，行内进度条、点击行 seek；滚轮/触摸视为用户滚动暂停自动跟随 -->
                <section class="panel lyrics-panel" aria-labelledby="lyricsTitle">
                  <header class="panel-head">
                    <span class="panel-index">02 / LYRICS</span>
                    <h2 id="lyricsTitle">同步歌词</h2>
                    <span class="spacer" />
                    <button
                      v-if="p.canShowLyricTranslation.value"
                      class="icon-button"
                      data-fx="translate"
                      :class="{ 'is-active': p.showLyricTranslation.value }"
                      type="button"
                      :aria-label="p.showLyricTranslation.value ? '关闭翻译' : '显示翻译'"
                      :aria-pressed="p.showLyricTranslation.value"
                      @click="p.toggleLyricTranslation()"
                    >
                      <Languages :size="16" :stroke-width="2" />
                    </button>
                    <button class="icon-button" data-fx="lyrics" type="button" aria-label="打开全屏歌词" @click="p.openTheater()">
                      <Maximize2 :size="16" :stroke-width="2" />
                    </button>
                  </header>
                  <div class="lyrics-meta lyrics-meta--compact">
                    <small>
                      {{
                        p.lyricLoading.value
                          ? 'LOADING LYRICS…'
                          : p.hasRealLyrics.value
                            ? `NOW SINGING // ${p.currentTrack.value?.source || 'LIVE'}`
                            : 'NO LYRICS YET'
                      }}
                    </small>
                    <p>
                      {{
                        p.currentTrack.value
                          ? `${p.currentTrack.value.shortTitle} · ${p.currentTrack.value.artist}`
                          : '在线歌曲可自动拉取歌词'
                      }}
                    </p>
                  </div>
                  <div class="lyric-progress" aria-hidden="true">
                    <i :style="{ width: (p.hasRealLyrics.value ? p.lyricProgressWithin.value : 0) + '%' }" />
                  </div>
                  <div
                    v-if="p.lyricLines.value.length"
                    ref="lyricFlowRef"
                    class="lyric-flow"
                    aria-label="同步歌词"
                    @wheel="markLyricUserScroll"
                    @scroll.passive="markLyricUserScroll"
                    @touchstart.passive="markLyricUserScroll"
                  >
                    <div class="lyric-flow-spacer" aria-hidden="true" />
                    <button
                      v-for="(line, i) in p.lyricDisplayLines.value"
                      :key="`${line.time}-${i}`"
                      class="lyric-line"
                      :class="lyricToneClass(i)"
                      type="button"
                      @mouseenter="onLyricLineEnter(i)"
                      @mouseleave="onLyricLineLeave"
                      @click="onLyricLineClick(i)"
                    >
                      <span class="lyric-line-main">
                        <span class="lyric-line-copy">
                          <span class="lyric-line-text">{{ line.text }}</span>
                          <small v-if="line.translation" class="lyric-sub">{{ line.translation }}</small>
                        </span>
                        <time class="lyric-line-time" :datetime="`PT${Math.floor(line.time)}S`">
                          {{ p.formatTime(line.time) }}
                        </time>
                      </span>
                      <span
                        v-if="i === p.lyricIndex.value"
                        class="lyric-line-progress"
                        aria-hidden="true"
                      >
                        <i :style="{ width: p.lyricProgressWithin.value + '%' }" />
                      </span>
                    </button>
                    <div class="lyric-flow-spacer" aria-hidden="true" />
                  </div>
                  <div v-else class="lyric-empty">
                    <p v-if="!p.currentTrack.value">还没有正在播放的歌曲。</p>
                    <p v-else-if="p.lyricLoading.value">正在获取歌词…</p>
                    <p v-else-if="p.currentTrack.value.source === '本地'">本地曲目没有歌词时，可导入同名 lrc，或在曲库点曲目旁「歌词」。</p>
                    <p v-else>暂无歌词，试试其他曲目或确认网易云代理可用。</p>
                    <div class="button-row" style="margin-top: 12px">
                      <button class="action-button primary" type="button" @click="p.switchView('search')">去搜索</button>
                      <button class="action-button" type="button" @click="p.pickFiles()">导入本地</button>
                    </div>
                  </div>
                  <footer class="lyrics-foot">
                    <span>CLICK A LINE TO SEEK</span>
                    <span>{{ p.hasRealLyrics.value ? `${p.lyricLines.value.length} 行` : '等待歌词' }}</span>
                  </footer>
                </section>
              </div>
            </div>
          </section>
</template>
