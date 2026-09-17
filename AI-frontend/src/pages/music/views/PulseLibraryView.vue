<script setup lang="ts">
/**
 * 我的曲库视图：收藏 / 缓存 / 本地曲目的统一浏览入口。
 * 支持「曲目 / 专辑 / 歌手」三种分组浏览：曲目为平铺列表，
 * 专辑、歌手先展示卡片墙，点击卡片进入组内详情。
 * 本组件只做展示与交互，数据与播放能力全部来自播放器单例（props.p）。
 */
import { computed } from 'vue'
import {
  ChevronLeft,
  Download,
  Heart,
  MoreHorizontal,
  Music2,
  Play,
  Search,
} from 'lucide-vue-next'
import { applyCoverFallback, toCoverDisplayUrl } from '@/utils/musicCover'
import type { LibraryTab, PulseTrack } from '@/composables/pulse/pulseTypes'
import type { PulsePlayerApi } from '@/pages/music/pulseApi'

const props = defineProps<{ p: PulsePlayerApi }>()
const p = props.p

const groupTabs: { id: LibraryTab; label: string }[] = [
  { id: 'tracks', label: '曲目' },
  { id: 'albums', label: '专辑' },
  { id: 'artists', label: '歌手' },
]

/** 分组切换：切换 tab 并退出可能打开的组内详情 */
function setGroup(id: LibraryTab) {
  p.libraryTab.value = id
  p.closeLibraryGroup()
}

/** 曲目来源缩写徽标：本地 LOC / QQ / 酷狗 KG / 网易云 NET / 直播 LIVE */
function sourceChip(track: PulseTrack) {
  if (track.source === '本地' || track.file || track.localPath) return 'LOC'
  if (track.source === 'QQ音乐') return 'QQ'
  if (track.source === '酷狗') return 'KG'
  if (track.neteaseId || track.source === '网易云') return 'NET'
  return 'LIVE'
}

const stats = computed(() => p.libraryStats.value)

/** 组内详情封面：取该组第一张可用封面 */
const focusCover = computed(() => {
  const track = p.libraryFocusTracks.value.find((t) => t.coverUrl)
  return toCoverDisplayUrl(track?.coverUrl)
})

/** 组内详情副标题：专辑显示歌手，歌手显示专辑数量 */
const focusMeta = computed(() => {
  const focus = p.libraryFocus.value
  if (!focus) return ''
  const list = p.libraryFocusTracks.value
  if (focus.kind === 'album') return list[0]?.artist || '未知歌手'
  const albums = new Set(list.map((t) => t.album).filter(Boolean))
  return `${albums.size} 张专辑`
})

function playAll() {
  p.playTrackList(p.filteredLibrary.value, undefined, '曲库还是空的')
}

function playFavorites() {
  p.playTrackList(p.favoriteTracks.value, undefined, '还没有收藏的歌，点心形即可收藏')
}

function playGroup() {
  p.playTrackList(p.libraryFocusTracks.value)
}
</script>

<template>
  <!-- LIBRARY：纯浏览消费；导入/授权/维护都去「本地文件」页 -->
  <section class="view" :class="{ 'is-active': p.view.value === 'library' }" aria-labelledby="libraryTitle">
    <div class="page-shell">
      <header class="page-heading">
        <div class="page-heading-copy">
          <span class="page-eyebrow">LIBRARY</span>
          <h1 id="libraryTitle">我的曲库</h1>
          <p>收藏、缓存与本地文件都在这。要导入、授权或清理文件，去「本地」页。</p>
        </div>
        <div class="heading-actions">
          <button class="action-button" type="button" @click="p.switchView('files')">
            管理本地文件
          </button>
          <button class="action-button primary" type="button" @click="playAll">
            <Play :size="14" :stroke-width="2" aria-hidden="true" />
            播放全部
          </button>
        </div>
      </header>

      <div class="lib-hero">
        <button class="lib-fav" type="button" @click="playFavorites">
          <span class="lib-fav-icon" aria-hidden="true">
            <Heart :size="22" :stroke-width="2" fill="currentColor" />
          </span>
          <span class="lib-fav-copy">
            <small>LIKED</small>
            <strong>我喜欢</strong>
            <em>{{ stats.favorites }} 首收藏</em>
          </span>
          <span class="lib-fav-cta" aria-hidden="true">
            <Play :size="15" :stroke-width="2.2" />
          </span>
        </button>
        <div class="library-summary" role="list">
          <div class="summary-cell" role="listitem"><b>{{ stats.tracks }}</b><span>曲目 TRACKS</span></div>
          <div class="summary-cell" role="listitem"><b>{{ stats.albums }}</b><span>专辑 ALBUMS</span></div>
          <div class="summary-cell" role="listitem"><b>{{ stats.artists }}</b><span>歌手 ARTISTS</span></div>
          <div class="summary-cell" role="listitem"><b>{{ stats.local }}</b><span>本地 LOCAL</span></div>
        </div>
      </div>

      <div class="lib-bar">
        <div class="segmented" role="tablist" aria-label="曲库分组">
          <button
            v-for="tab in groupTabs"
            :key="tab.id"
            class="segment"
            :class="{ 'is-active': p.libraryTab.value === tab.id }"
            type="button"
            role="tab"
            :aria-selected="p.libraryTab.value === tab.id"
            @click="setGroup(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>
        <span class="toolbar-spacer" />
        <input
          v-model="p.libraryFilter.value"
          class="compact-search"
          type="search"
          placeholder="筛选曲库…"
          aria-label="筛选曲库"
        />
      </div>

      <!-- 曲目 -->
      <template v-if="p.libraryTab.value === 'tracks'">
        <div v-if="p.filteredLibrary.value.length" class="result-list">
          <div
            v-for="track in p.filteredLibrary.value"
            :key="track.id"
            class="result-row"
            :class="{ 'is-current': track.id === p.currentId.value }"
          >
            <button class="result-main" type="button" @click="p.playTrack(track.id)">
              <span v-if="p.coverOf(track)" class="track-cover track-cover--sm lib-row-cover" aria-hidden="true">
                <img :src="p.coverOf(track)" alt="" @error="applyCoverFallback" />
                <i class="cover-chip">{{ sourceChip(track) }}</i>
              </span>
              <span v-else class="signal-cover lib-row-cover" :data-tone="track.tone || undefined" aria-hidden="true">
                <Music2 :size="15" :stroke-width="1.8" />
                <i class="cover-chip">{{ sourceChip(track) }}</i>
              </span>
              <span class="result-copy">
                <strong>{{ track.title }}</strong>
                <small>{{ track.artist }} · {{ track.album || '未知专辑' }}</small>
              </span>
              <span class="duration">{{ p.formatTime(track.duration) }}</span>
            </button>
            <span class="result-actions">
              <button
                class="icon-button"
                :class="{ 'is-active': track.favorite }"
                data-fx="heart"
                type="button"
                :aria-label="track.favorite ? '取消收藏' : '收藏'"
                @click="p.toggleFavorite(track.id)"
              >
                <Heart :size="16" :stroke-width="2" :fill="track.favorite ? 'currentColor' : 'none'" />
              </button>
              <button
                v-if="p.canDownloadTrack(track)"
                class="icon-button"
                data-fx="download"
                type="button"
                aria-label="下载到本地"
                :disabled="p.downloadBusy.value"
                @click="p.openDownloadPrompt(track)"
              >
                <Download :size="16" :stroke-width="2" />
              </button>
              <button
                class="icon-button"
                data-fx="more"
                type="button"
                aria-label="歌曲详情"
                @click="p.openSongDetail(track)"
              >
                <MoreHorizontal :size="16" :stroke-width="2" />
              </button>
            </span>
          </div>
        </div>
        <div v-else class="queue-empty lib-empty">
          <template v-if="p.isEmptyLibrary.value">
            <p>曲库还是空的。去搜一首在线的歌，或导入本地音频。</p>
            <div class="button-row">
              <button class="action-button primary" type="button" @click="p.switchView('search')">
                <Search :size="14" :stroke-width="2" aria-hidden="true" />
                去搜索
              </button>
              <button class="action-button" type="button" @click="p.switchView('files')">
                导入本地文件
              </button>
            </div>
          </template>
          <p v-else>没有匹配「{{ p.libraryFilter.value }}」的曲目。</p>
        </div>
      </template>

      <!-- 专辑 / 歌手 -->
      <template v-else>
        <!-- 组内详情 -->
        <div v-if="p.libraryFocus.value" class="lib-detail">
          <div class="lib-detail-head">
            <button class="action-button" type="button" @click="p.closeLibraryGroup()">
              <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
              返回
            </button>
            <span
              class="lib-detail-cover"
              :class="{ 'lib-detail-cover--round': p.libraryFocus.value.kind === 'artist' }"
              aria-hidden="true"
            >
              <img v-if="focusCover" :src="focusCover" alt="" @error="applyCoverFallback" />
              <span v-else class="lib-cover-fallback">
                <Music2 v-if="p.libraryFocus.value.kind === 'album'" :size="30" :stroke-width="1.5" />
                <b v-else>{{ p.libraryFocus.value.name.slice(0, 1) }}</b>
              </span>
            </span>
            <div class="lib-detail-copy">
              <span class="page-eyebrow">{{ p.libraryFocus.value.kind === 'album' ? 'ALBUM' : 'ARTIST' }}</span>
              <h2>{{ p.libraryFocus.value.name }}</h2>
              <p>{{ focusMeta }} · {{ p.libraryFocusTracks.value.length }} 首</p>
              <div class="button-row">
                <button class="action-button primary" type="button" @click="playGroup">
                  <Play :size="14" :stroke-width="2" aria-hidden="true" />
                  播放全部
                </button>
              </div>
            </div>
          </div>
          <div class="result-list">
            <div
              v-for="(track, i) in p.libraryFocusTracks.value"
              :key="track.id"
              class="result-row"
              :class="{ 'is-current': track.id === p.currentId.value }"
            >
              <button class="result-main" type="button" @click="p.playTrack(track.id)">
                <span class="duration lib-row-index">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="result-copy">
                  <strong>{{ track.title }}</strong>
                  <small>{{ p.libraryFocus.value?.kind === 'album' ? track.artist : (track.album || '未知专辑') }}</small>
                </span>
                <span class="duration">{{ p.formatTime(track.duration) }}</span>
              </button>
              <span class="result-actions">
                <button
                  class="icon-button"
                  :class="{ 'is-active': track.favorite }"
                  data-fx="heart"
                  type="button"
                  :aria-label="track.favorite ? '取消收藏' : '收藏'"
                  @click="p.toggleFavorite(track.id)"
                >
                  <Heart :size="16" :stroke-width="2" :fill="track.favorite ? 'currentColor' : 'none'" />
                </button>
                <button
                  class="icon-button"
                  data-fx="more"
                  type="button"
                  aria-label="歌曲详情"
                  @click="p.openSongDetail(track)"
                >
                  <MoreHorizontal :size="16" :stroke-width="2" />
                </button>
              </span>
            </div>
          </div>
        </div>

        <!-- 专辑墙 -->
        <div v-else-if="p.libraryTab.value === 'albums'" class="lib-wall">
          <template v-if="p.albumGroups.value.length">
            <div
              v-for="album in p.albumGroups.value"
              :key="album.name"
              class="lib-wall-card"
              role="button"
              tabindex="0"
              @click="p.openLibraryGroup('album', album.name)"
              @keydown.enter="p.openLibraryGroup('album', album.name)"
            >
              <span class="lib-wall-cover" aria-hidden="true">
                <img
                  v-if="toCoverDisplayUrl(album.coverUrl)"
                  :src="toCoverDisplayUrl(album.coverUrl)"
                  alt=""
                  loading="lazy"
                  @error="applyCoverFallback"
                />
                <span v-else class="lib-cover-fallback"><Music2 :size="26" :stroke-width="1.5" /></span>
                <button
                  class="lib-wall-play"
                  type="button"
                  :aria-label="`播放专辑 ${album.name}`"
                  @click.stop="p.playTrackList(album.items)"
                >
                  <Play :size="16" :stroke-width="2.2" />
                </button>
              </span>
              <strong>{{ album.name }}</strong>
              <small>{{ album.items[0]?.artist || '未知歌手' }} · {{ album.count }} 首</small>
            </div>
          </template>
          <div v-else class="queue-empty lib-empty">
            <p>{{ p.isEmptyLibrary.value ? '曲库还是空的，先去搜索或导入。' : '没有匹配的专辑。' }}</p>
          </div>
        </div>

        <!-- 歌手墙 -->
        <div v-else class="lib-wall">
          <template v-if="p.artistGroups.value.length">
            <div
              v-for="artist in p.artistGroups.value"
              :key="artist.name"
              class="lib-wall-card"
              role="button"
              tabindex="0"
              @click="p.openLibraryGroup('artist', artist.name)"
              @keydown.enter="p.openLibraryGroup('artist', artist.name)"
            >
              <span class="lib-wall-cover lib-wall-cover--round" aria-hidden="true">
                <img
                  v-if="toCoverDisplayUrl(artist.coverUrl)"
                  :src="toCoverDisplayUrl(artist.coverUrl)"
                  alt=""
                  loading="lazy"
                  @error="applyCoverFallback"
                />
                <span v-else class="lib-cover-fallback"><b>{{ artist.name.slice(0, 1) }}</b></span>
                <button
                  class="lib-wall-play"
                  type="button"
                  :aria-label="`播放 ${artist.name} 的全部曲目`"
                  @click.stop="p.playTrackList(artist.items)"
                >
                  <Play :size="16" :stroke-width="2.2" />
                </button>
              </span>
              <strong>{{ artist.name }}</strong>
              <small>{{ artist.count }} 首</small>
            </div>
          </template>
          <div v-else class="queue-empty lib-empty">
            <p>{{ p.isEmptyLibrary.value ? '曲库还是空的，先去搜索或导入。' : '没有匹配的歌手。' }}</p>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
