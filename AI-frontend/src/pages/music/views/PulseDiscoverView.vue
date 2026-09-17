<script setup lang="ts">
/**
 * 发现视图：音乐内容的聚合首页，包含我的歌单、每日推荐、歌单补给站、
 * 场景电台（Meting 多平台搜索一键成队）、QQ/酷狗热门榜单、网易云榜单、
 * DJ 电台与新碟速递；点击卡片进入详情页（歌单/专辑/歌手）浏览曲目。
 * 推荐数据来自 discover（usePulseDiscover），播放能力来自播放器单例 p。
 */
import { ref } from 'vue'
import { ChevronLeft, Download, Play, RefreshCw, Search, TrendingUp, Coffee, BookOpen, Moon, Wind } from 'lucide-vue-next'
import { applyCoverFallback, toCoverDisplayUrl } from '@/utils/musicCover'
import { songToPulseTrack } from '@/composables/pulse/pulseTypes'
import { searchMeting, type MetingServer, type MetingSong } from '@/integrations/metingMusic'
import type { PulseTrack } from '@/composables/usePulsePlayer'
import type { PulseDiscoverApi, PulsePlayerApi } from '@/pages/music/pulseApi'

const props = defineProps<{ p: PulsePlayerApi; discover: PulseDiscoverApi }>()
const p = props.p
const discover = props.discover

/** 展开哪个榜单的曲目列表；-1 = 全部收起 */
const expandedChart = ref(-1)

/** 场景电台：固定氛围关键词，一键成队 */
const scenes: Array<{ label: string; desc: string; icon: typeof Coffee; server: MetingServer; query: string }> = [
  { label: '专注学习', desc: '轻音乐 · 白噪音', icon: BookOpen, server: 'qq', query: '学习 轻音乐 钢琴' },
  { label: '深度工作', desc: '无歌词 · 纸面编程', icon: Wind, server: 'kugou', query: '纯音乐 工作 专注' },
  { label: '放松入眠', desc: '助眠 · 舒缓', icon: Moon, server: 'qq', query: '助眠 舒缓 钢琴曲' },
  { label: '周末咖啡', desc: '沙发 · 爵士', icon: Coffee, server: 'kugou', query: '爵士 咖啡馆 轻音乐' },
]
/** 正在加载的场景电台 label（同一时间只允许一个场景请求） */
const sceneBusy = ref('')

/** Meting 聚合搜索结果 -> 播放器曲目：id 带 source 前缀避免跨平台撞 id */
function metingToPulse(s: MetingSong): PulseTrack {
  return {
    id: `${s.source}-scene-${s.id}`,
    title: s.name,
    shortTitle: s.name.split(/[／/]/)[0]?.trim() || s.name,
    artist: s.artist,
    album: s.album,
    source: s.source === 'qq' ? 'QQ音乐' : '酷狗',
    duration: s.duration,
    url: '',
    coverUrl: s.pic || '',
    favorite: false,
    remoteServer: s.source,
    remoteId: s.id,
  }
}

/** 播放场景电台：按氛围关键词在指定平台搜索，取前 30 首整队入列并跳转舞台 */
async function playScene(scene: (typeof scenes)[number]) {
  if (sceneBusy.value) return
  sceneBusy.value = scene.label
  try {
    const songs = await searchMeting(scene.server, scene.query)
    if (!songs.length) {
      p.showToast('该场景暂无匹配曲目，稍后再试')
      return
    }
    const tracks = songs.slice(0, 30).map(metingToPulse)
    for (const t of tracks) p.ingestTrack?.(t)
    p.playTrack(tracks[0]!.id)
    p.switchView('stage')
    p.showToast(`已开启「${scene.label}」电台 · ${tracks.length} 首`)
  } catch {
    p.showToast('场景电台加载失败，请确认音乐服务已连接')
  } finally {
    sceneBusy.value = ''
  }
}

/** 整榜播放：榜单全部曲目入列后从第一首播起 */
function playChartAll(index: number) {
  const chart = discover.charts.value[index]
  if (!chart?.songs.length) return
  for (const track of chart.songs) p.ingestTrack?.(track)
  p.playTrack(chart.songs[0]!.id)
  p.switchView('stage')
}

/** 榜单单曲播放：仅入列该曲并播放，同时跳到舞台视图 */
function playChartTrack(index: number, trackIndex: number) {
  const chart = discover.charts.value[index]
  const track = chart?.songs[trackIndex]
  if (!track) return
  p.ingestTrack?.(track)
  void p.playTrack(track.id)
  p.switchView('stage')
}

/** 批量下载详情页全部曲目：先登记曲目再弹出下载确认框 */
function downloadDiscoverPage() {
  const songs = discover.detailSongs.value
  if (!songs.length) return
  p.upsertNeteaseTracks(songs, { enqueue: false })
  p.openDownloadPrompt(songs.map((song) => songToPulseTrack(song)))
}
</script>

<template>
          <!-- DISCOVER -->
          <section class="view" :class="{ 'is-active': p.view.value === 'discover' }" aria-labelledby="discoverTitle">
            <div class="page-shell discover-shell">
              <header class="page-heading">
                <div class="page-heading-copy">
                  <span class="page-eyebrow">DISCOVER</span>
                  <h1 id="discoverTitle">
                    {{ discover.pane.value === 'detail' ? discover.activeCollection.value?.name || '详情' : '发现' }}
                  </h1>
                  <p>
                    {{
                      discover.pane.value === 'detail'
                        ? discover.activeCollection.value?.subtitle || '选择曲目加入队列并播放'
                        : '今日推荐、歌单补给与新碟，点进详情后再播。'
                    }}
                  </p>
                </div>
                <div class="heading-actions">
                  <template v-if="discover.pane.value === 'home'">
                    <button
                      class="action-button"
                      type="button"
                      :disabled="discover.homeLoading.value"
                      @click="discover.loadHome(true)"
                    >
                      <RefreshCw :size="14" :stroke-width="2" aria-hidden="true" />
                      刷新
                    </button>
                    <button class="action-button" type="button" @click="p.switchView('search')">
                      <Search :size="14" :stroke-width="2" aria-hidden="true" />
                      搜索
                    </button>
                  </template>
                  <template v-else>
                    <button class="action-button" type="button" @click="discover.closeDetail()">
                      <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
                      返回发现
                    </button>
                    <button
                      class="action-button primary"
                      type="button"
                      :disabled="!discover.detailSongs.value.length || discover.detailLoading.value"
                      @click="discover.playDetailAll()"
                    >
                      <Play :size="14" :stroke-width="2" aria-hidden="true" />
                      播放全部
                    </button>
                    <button
                      class="action-button"
                      type="button"
                      :disabled="!discover.detailSongs.value.length || discover.detailLoading.value || p.downloadBusy.value"
                      @click="downloadDiscoverPage()"
                    >
                      <Download :size="14" :stroke-width="2" aria-hidden="true" />
                      下载本页
                    </button>
                  </template>
                </div>
              </header>

              <!-- QQ 式首页 -->
              <div v-if="discover.pane.value === 'home'" class="discover-home">
                <div v-if="discover.homeLoading.value && !discover.homeLoaded.value" class="discover-state">
                  正在加载推荐…
                </div>
                <div
                  v-else-if="discover.homeError.value && !discover.playlists.value.length && !discover.dailySongs.value.length"
                  class="discover-state is-error"
                >
                  <p>{{ discover.homeError.value }}</p>
                  <button class="action-button primary" type="button" @click="discover.loadHome(true)">重试</button>
                </div>
                <template v-else>
                  <section class="discover-section" aria-labelledby="minePlTitle">
                    <div class="discover-section-head">
                      <h2 id="minePlTitle">我的歌单</h2>
                      <button class="discover-link" type="button" @click="p.switchView('playlists')">查看全部 →</button>
                    </div>
                    <div class="mine-pl-row" role="list">
                      <button
                        v-for="pl in p.playlists"
                        :key="pl.key"
                        class="mine-pl-card"
                        type="button"
                        role="listitem"
                        @click="p.openPlaylist(pl.key)"
                      >
                        <strong>{{ pl.name }}</strong>
                        <small>{{ pl.meta }}</small>
                      </button>
                      <button
                        v-for="pl in p.userPlaylists.value"
                        :key="`user-${pl.id}`"
                        class="mine-pl-card"
                        type="button"
                        role="listitem"
                        @click="p.openPlaylist(`user:${pl.id}`)"
                      >
                        <strong>{{ pl.name }}</strong>
                        <small>LOCAL · {{ pl.trackIds.length }}</small>
                      </button>
                      <button
                        v-for="pl in p.neteaseAccountPlaylists.value"
                        :key="`net-${pl.id}`"
                        class="mine-pl-card"
                        type="button"
                        role="listitem"
                        @click="p.openNeteaseAccountPlaylist(pl.id)"
                      >
                        <strong>{{ pl.name }}</strong>
                        <small>NETEASE · {{ pl.trackCount }}</small>
                      </button>
                    </div>
                  </section>

                  <!-- 今日为你推荐 -->
                  <section class="discover-section" aria-labelledby="todayRecoTitle">
                    <div class="discover-section-head">
                      <h2 id="todayRecoTitle">今日为你推荐</h2>
                      <button class="discover-link" type="button" @click="p.switchView('library')">查看曲库 →</button>
                    </div>
                    <div class="reco-row">
                      <button class="reco-hero" type="button" @click="discover.playDailyQuick()">
                        <span class="reco-hero-copy">
                          <span class="reco-kicker">DAILY PICK</span>
                          <strong>每日推荐</strong>
                          <small>{{ discover.dailySongs.value.length || 30 }} 首 · 按口味更新</small>
                          <span class="reco-hero-play" aria-hidden="true">▶ 立即播放</span>
                        </span>
                        <span class="reco-hero-art">
                          <img
                            v-if="discover.dailyCover.value"
                            :src="discover.dailyCover.value"
                            alt=""
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">39</span>
                        </span>
                      </button>

                      <button class="reco-card" type="button" @click="discover.openDailyRecommend()">
                        <span class="reco-card-cover">
                          <img
                            v-if="discover.dailyCover.value"
                            :src="discover.dailyCover.value"
                            alt=""
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">39</span>
                          <span class="reco-card-badge">今日 30</span>
                        </span>
                        <strong>每日 30 首</strong>
                        <small>打开列表挑选</small>
                      </button>

                      <button class="reco-card" type="button" @click="discover.openNewSongs()">
                        <span class="reco-card-cover">
                          <img
                            v-if="discover.newsongCover.value"
                            :src="discover.newsongCover.value"
                            alt=""
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">39</span>
                          <span class="reco-card-badge tone-mint">新歌</span>
                        </span>
                        <strong>新歌速递</strong>
                        <small>{{ discover.newSongs.value.length || '—' }} 首上新</small>
                      </button>

                      <button class="reco-card" type="button" @click="discover.openFavorites()">
                        <span class="reco-card-cover reco-card-cover--fav">
                          <span class="reco-fav-mark" aria-hidden="true">♥</span>
                          <span class="reco-card-badge tone-rose">收藏</span>
                        </span>
                        <strong>我喜欢</strong>
                        <small>本地收藏歌单</small>
                      </button>

                      <button
                        class="reco-card"
                        type="button"
                        :disabled="!discover.albums.value[0]"
                        @click="discover.albums.value[0] && discover.openAlbum(discover.albums.value[0].id)"
                      >
                        <span class="reco-card-cover">
                          <img
                            v-if="discover.albums.value[0]?.coverUrl"
                            :src="discover.albums.value[0].coverUrl"
                            alt=""
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">39</span>
                          <span class="reco-card-badge tone-amber">新碟</span>
                        </span>
                        <strong>{{ discover.albums.value[0]?.name || '新碟速递' }}</strong>
                        <small>{{ discover.albums.value[0]?.artist || '最新发行' }}</small>
                      </button>
                    </div>
                  </section>

                  <!-- 歌单补给站 -->
                  <section class="discover-section" aria-labelledby="playlistSupplyTitle">
                    <div class="discover-section-head">
                      <h2 id="playlistSupplyTitle">你的歌单补给站</h2>
                      <button class="discover-link" type="button" @click="discover.loadHome(true)">换一批</button>
                    </div>
                    <div v-if="!discover.playlists.value.length" class="discover-state compact">暂无推荐歌单</div>
                    <div v-else class="playlist-wall" role="list">
                      <button
                        v-for="pl in discover.playlists.value"
                        :key="pl.id"
                        class="playlist-tile"
                        type="button"
                        role="listitem"
                        @click="discover.openPlaylist(pl.id)"
                      >
                        <span class="playlist-tile-cover">
                          <img
                            v-if="pl.coverUrl"
                            :src="pl.coverUrl"
                            :alt="pl.name"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">39</span>
                          <span class="playlist-playcount">{{ discover.formatPlayCount(pl.playCount) }}</span>
                        </span>
                        <strong class="playlist-tile-title">{{ pl.name }}</strong>
                      </button>
                    </div>
                  </section>

                  <!-- 场景电台 -->
                  <section class="discover-section" aria-labelledby="sceneRadioTitle">
                    <div class="discover-section-head">
                      <h2 id="sceneRadioTitle">场景电台</h2>
                      <span class="discover-link" aria-hidden="true">一键成队 · 多平台</span>
                    </div>
                    <div class="scene-radio-row" role="list">
                      <button
                        v-for="scene in scenes"
                        :key="scene.label"
                        class="scene-radio"
                        type="button"
                        role="listitem"
                        :disabled="!!sceneBusy"
                        @click="playScene(scene)"
                      >
                        <span class="scene-radio-icon" aria-hidden="true">
                          <component :is="scene.icon" :size="20" :stroke-width="2" />
                        </span>
                        <span class="scene-radio-copy">
                          <strong>{{ scene.label }}</strong>
                          <small>{{ scene.desc }}</small>
                        </span>
                        <Play :size="14" :stroke-width="2" aria-hidden="true" />
                      </button>
                    </div>
                  </section>

                  <!-- 热门榜单（QQ / 酷狗 多平台） -->
                  <section
                    v-if="discover.charts.value.some((c) => c.songs.length) || discover.charts.value.some((c) => c.loading)"
                    class="discover-section"
                    aria-labelledby="chartTitle"
                  >
                    <div class="discover-section-head">
                      <h2 id="chartTitle">热门榜单</h2>
                      <button class="discover-link" type="button" @click="discover.loadCharts(true)">换一批</button>
                    </div>
                    <div class="chart-wall" role="list">
                      <div
                        v-for="(chart, i) in discover.charts.value"
                        :key="`${chart.server}-${chart.id}`"
                        class="chart-card"
                        role="listitem"
                      >
                        <div class="chart-card-head">
                          <span v-if="toCoverDisplayUrl(chart.songs[0]?.coverUrl)" class="track-cover">
                            <img
                              :src="toCoverDisplayUrl(chart.songs[0]?.coverUrl)"
                              :alt="chart.name"
                              loading="lazy"
                              referrerpolicy="no-referrer"
                              @error="applyCoverFallback"
                            />
                          </span>
                          <span v-else class="signal-cover" data-tone="amber"><b>TOP</b></span>
                          <div class="chart-card-copy">
                            <strong class="chart-card-name">{{ chart.name }}</strong>
                            <small>{{ chart.loading ? '加载中…' : `${chart.songs.length} 首热歌` }}</small>
                          </div>
                          <button
                            class="action-button primary chart-card-play"
                            type="button"
                            :disabled="!chart.songs.length"
                            @click="playChartAll(i)"
                          >
                            <Play :size="13" :stroke-width="2" />
                            播放
                          </button>
                        </div>
                        <template v-if="!chart.loading">
                          <div class="chart-preview">
                            <button
                              v-for="(pre, pi) in chart.songs.slice(0, 5)"
                              :key="pre.id"
                              class="chart-preview-row"
                              type="button"
                              @click="playChartTrack(i, pi)"
                            >
                              <em>{{ String(pi + 1).padStart(2, '0') }}</em>
                              <span class="chart-preview-copy"
                                ><b>{{ pre.title }}</b
                                ><small>{{ pre.artist }}</small></span
                              >
                              <Play :size="12" :stroke-width="2" />
                            </button>
                          </div>
                          <button
                            v-if="chart.songs.length > 5"
                            class="text-button chart-more"
                            type="button"
                            @click="expandedChart = expandedChart === i ? -1 : i"
                          >
                            <TrendingUp :size="12" :stroke-width="2" />
                            {{ expandedChart === i ? '收起' : `展开全部 ${chart.songs.length} 首` }}
                          </button>
                          <div v-if="expandedChart === i" class="chart-preview">
                            <button
                              v-for="(tr, ti) in chart.songs.slice(5)"
                              :key="tr.id"
                              class="chart-preview-row"
                              type="button"
                              @click="playChartTrack(i, ti + 5)"
                            >
                              <em>{{ String(ti + 6).padStart(2, '0') }}</em>
                              <span class="chart-preview-copy"
                                ><b>{{ tr.title }}</b
                                ><small>{{ tr.artist }}</small></span
                              >
                              <Play :size="12" :stroke-width="2" />
                            </button>
                          </div>
                        </template>
                        <p v-else class="discover-state compact">正在加载榜单…</p>
                      </div>
                    </div>
                  </section>

                  <!-- 网易云榜单 -->
                  <section
                    v-if="discover.neteaseChartsLoading.value || discover.neteaseCharts.value.length"
                    class="discover-section"
                    aria-labelledby="neteaseChartTitle"
                  >
                    <div class="discover-section-head">
                      <h2 id="neteaseChartTitle">网易云榜单</h2>
                      <button class="discover-link" type="button" @click="discover.loadNeteaseCharts(true)">刷新</button>
                    </div>
                    <div v-if="discover.neteaseChartsLoading.value && !discover.neteaseCharts.value.length" class="discover-state compact">
                      正在加载榜单…
                    </div>
                    <div v-else class="album-rail" role="list">
                      <button
                        v-for="tl in discover.neteaseCharts.value.slice(0, 12)"
                        :key="tl.id"
                        class="album-tile"
                        type="button"
                        role="listitem"
                        @click="discover.openNeteaseToplist(tl.id)"
                      >
                        <span class="album-tile-cover">
                          <img
                            v-if="toCoverDisplayUrl(tl.coverUrl)"
                            :src="toCoverDisplayUrl(tl.coverUrl)"
                            :alt="tl.name"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">39</span>
                          <span class="album-tile-badge">{{ discover.formatPlayCount(tl.playCount) }}</span>
                        </span>
                        <strong class="album-tile-title">{{ tl.name }}</strong>
                      </button>
                    </div>
                  </section>

                  <!-- 电台（DJ 主播） -->
                  <section
                    v-if="discover.djLoading.value || discover.djRadios.value.length"
                    class="discover-section"
                    aria-labelledby="djTitle"
                  >
                    <div class="discover-section-head">
                      <h2 id="djTitle">电台 · 主播</h2>
                      <button class="discover-link" type="button" @click="discover.loadDj(true)">刷新</button>
                    </div>
                    <div v-if="discover.djLoading.value && !discover.djRadios.value.length" class="discover-state compact">
                      正在加载电台…
                    </div>
                    <div v-else class="album-rail" role="list">
                      <button
                        v-for="dj in discover.djRadios.value.slice(0, 10)"
                        :key="dj.id"
                        class="album-tile"
                        type="button"
                        role="listitem"
                        @click="discover.openDjRadio(dj.id)"
                      >
                        <span class="album-tile-cover">
                          <img
                            v-if="toCoverDisplayUrl(dj.coverUrl)"
                            :src="toCoverDisplayUrl(dj.coverUrl)"
                            :alt="dj.name"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">DJ</span>
                          <span class="album-tile-badge">{{ discover.formatPlayCount(dj.playCount) }}</span>
                        </span>
                        <strong class="album-tile-title">{{ dj.name }}</strong>
                        <small class="album-tile-meta">{{ dj.programCount }} 期节目</small>
                      </button>
                    </div>
                  </section>

                  <!-- 新碟速递 -->
                  <section v-if="discover.albums.value.length" class="discover-section" aria-labelledby="newAlbumTitle">
                    <div class="discover-section-head">
                      <h2 id="newAlbumTitle">新碟速递</h2>
                    </div>
                    <div class="album-rail" role="list">
                      <button
                        v-for="album in discover.albums.value"
                        :key="album.id"
                        class="album-tile"
                        type="button"
                        role="listitem"
                        @click="discover.openAlbum(album.id)"
                      >
                        <span class="album-tile-cover">
                          <img
                            v-if="album.coverUrl"
                            :src="album.coverUrl"
                            :alt="album.name"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            @error="applyCoverFallback"
                          />
                          <span v-else class="album-tile-fallback">39</span>
                        </span>
                        <strong class="album-tile-title">{{ album.name }}</strong>
                        <small class="album-tile-meta">{{ album.artist }}</small>
                      </button>
                    </div>
                  </section>
                </template>
              </div>

              <!-- 详情（歌单/专辑/歌手/每日/新歌） -->
              <div v-else class="album-detail" aria-live="polite">
                <aside class="album-detail-hero">
                  <div class="album-detail-cover">
                    <img
                      v-if="discover.activeCollection.value?.coverUrl"
                      :src="discover.activeCollection.value.coverUrl"
                      :alt="discover.activeCollection.value.name"
                      referrerpolicy="no-referrer"
                      @error="applyCoverFallback"
                    />
                    <span v-else class="album-tile-fallback" aria-hidden="true">39</span>
                  </div>
                  <div class="album-detail-copy">
                    <span class="page-eyebrow">{{
                      discover.activeCollection.value?.kind === 'album'
                        ? 'ALBUM'
                        : discover.activeCollection.value?.kind === 'playlist'
                          ? 'PLAYLIST'
                          : discover.activeCollection.value?.kind === 'artist'
                            ? 'ARTIST'
                            : 'COLLECTION'
                    }}</span>
                    <h2>{{ discover.activeCollection.value?.name || '详情' }}</h2>
                    <p>{{ discover.activeCollection.value?.subtitle || '' }}</p>
                    <p class="album-detail-count">{{ discover.detailTrackCount.value }} 首曲目</p>
                    <div class="button-row">
                      <button
                        class="action-button primary"
                        type="button"
                        :disabled="!discover.detailSongs.value.length || discover.detailLoading.value"
                        @click="discover.playDetailAll()"
                      >
                        播放全部
                      </button>
                      <button
                        class="action-button"
                        type="button"
                        :disabled="!discover.detailSongs.value.length || discover.detailLoading.value || p.downloadBusy.value"
                        @click="downloadDiscoverPage()"
                      >
                        <Download :size="14" :stroke-width="2" aria-hidden="true" />
                        下载本页
                      </button>
                      <button class="action-button" type="button" @click="discover.closeDetail()">返回</button>
                    </div>
                  </div>
                </aside>

                <section class="album-detail-tracks content-panel pulse-list" aria-label="曲目列表">
                  <div class="pulse-list-head">
                    <strong>曲目列表</strong>
                    <span>
                      {{
                        discover.detailLoading.value
                          ? 'LOADING'
                          : discover.detailSongs.value.length
                            ? `TRACKS / ${discover.detailSongs.value.length}`
                            : 'EMPTY'
                      }}
                    </span>
                  </div>

                  <div v-if="discover.detailLoading.value" class="discover-state compact">正在加载曲目…</div>
                  <div
                    v-else-if="discover.detailError.value && !discover.detailSongs.value.length"
                    class="discover-state compact is-error"
                  >
                    <p>{{ discover.detailError.value }}</p>
                  </div>
                  <template v-else>
                    <div class="result-list">
                    <div
                      v-for="(song, i) in discover.detailSongs.value"
                      :key="song.id"
                      class="result-row"
                      :class="{ 'is-current': p.currentId.value === `net-${song.id}` }"
                    >
                      <button class="result-main" type="button" @click="discover.playDetailTrack(song)">
                        <span>{{ String(i + 1).padStart(2, '0') }}</span>
                        <span class="result-copy">
                          <strong>{{ song.title }}</strong>
                          <small>{{ song.artist }}</small>
                        </span>
                        <span class="duration">{{ p.formatTime(song.duration) }}</span>
                      </button>
                      <span class="result-actions">
                        <button
                          class="text-button"
                          type="button"
                          :disabled="p.downloadBusy.value"
                          @click="p.openDownloadPrompt(songToPulseTrack(song))"
                        >
                          下载
                        </button>
                      </span>
                    </div>
                    </div>
                    <div v-if="!discover.detailSongs.value.length" class="queue-empty" style="padding: 18px">
                      <p>暂无曲目</p>
                    </div>
                  </template>
                </section>
              </div>
            </div>
          </section>
</template>
