<script setup lang="ts">
/**
 * 歌单与电台页：左侧收藏脊柱（队列/收藏/最近/本地/云歌单）+ 右侧歌单详情。
 * 支持本地歌单的编辑模式（多选批量下载/移出、拖拽排序），以及听歌统计面板。
 */
import { computed, ref } from 'vue'
import { BarChart3, ChevronLeft, Download, GripVertical, MoreHorizontal, Pencil, Play, Shuffle, Trash2, X } from 'lucide-vue-next'
import type { PulsePlayerApi } from '@/pages/music/pulseApi'

const props = defineProps<{ p: PulsePlayerApi }>()
const p = props.p
// 新建本地歌单的输入框内容
const newPlaylistName = ref('')

/** 本地用户歌单的编辑模式（多选 + 拖拽排序） */
const editing = ref(false)
const selected = ref<Set<string>>(new Set())
const dragIndex = ref(-1)

/** 听歌统计面板开合 */
const showStats = ref(false)

// 当前歌单是否为本地用户歌单（playlistKey 形如 user:<id>）
const isUserPlaylist = computed(() => p.playlistKey.value.startsWith('user:'))
const userPlaylistId = computed(() => (isUserPlaylist.value ? p.playlistKey.value.slice(5) : ''))

// 勾选中的曲目集合（编辑模式批量操作用）
const selectedTracks = computed(() =>
  p.playlistTracks.value.filter((t) => selected.value.has(t.id)),
)

function enterEdit() {
  editing.value = true
  selected.value = new Set()
}
function exitEdit() {
  editing.value = false
  selected.value = new Set()
  dragIndex.value = -1
}
function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll() {
  const all = p.playlistTracks.value.map((t) => t.id)
  selected.value = selected.value.size === all.length ? new Set() : new Set(all)
}
// 批量移出选中曲目（仅本地歌单）
function batchRemove() {
  if (!selected.value.size) return
  p.batchRemoveFromUserPlaylist(userPlaylistId.value, [...selected.value])
  selected.value = new Set()
}

// 批量打开下载弹窗（下载选中曲目）
function batchDownload() {
  if (!selectedTracks.value.length) return
  p.openDownloadPrompt(selectedTracks.value)
  selected.value = new Set()
}

// ---- 编辑模式的行拖拽排序 ----
function onRowDragStart(index: number) {
  if (!editing.value) return
  dragIndex.value = index
}
function onRowDragOver(e: DragEvent, index: number) {
  if (!editing.value || dragIndex.value < 0) return
  e.preventDefault()
  if (dragIndex.value !== index) {
    // 用一个简单 hover 提示目标位置
  }
}
function onRowDrop(index: number) {
  if (!editing.value || dragIndex.value < 0) return
  if (dragIndex.value !== index) {
    // 交给播放器持久化新的曲目顺序
    p.reorderUserPlaylist(userPlaylistId.value, dragIndex.value, index)
  }
  dragIndex.value = -1
}
</script>

<template>
          <!-- PLAYLISTS -->
          <section class="view" :class="{ 'is-active': p.view.value === 'playlists' }" aria-labelledby="playlistsTitle">
            <div class="page-shell">
              <header class="page-heading">
                <div class="page-heading-copy">
                  <span class="page-eyebrow">PLAYLISTS</span>
                  <h1 id="playlistsTitle">歌单与电台</h1>
                  <p>队列、收藏、最近播放、本地曲库，以及登录后的网易云歌单。</p>
                </div>
                <div class="heading-actions">
                  <button
                    class="action-button"
                    type="button"
                    :class="{ 'is-active': showStats }"
                    @click="showStats = !showStats"
                  >
                    <BarChart3 :size="14" :stroke-width="2" aria-hidden="true" />
                    听歌统计
                  </button>
                  <button
                    v-if="isUserPlaylist && !showStats"
                    class="action-button"
                    type="button"
                    @click="editing ? exitEdit() : enterEdit()"
                  >
                    <Pencil :size="14" :stroke-width="2" aria-hidden="true" />
                    {{ editing ? '完成' : '编辑' }}
                  </button>
                  <button class="action-button" type="button" @click="p.switchView('discover')">
                    <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
                    返回发现
                  </button>
                </div>
              </header>

              <!-- 听歌统计面板：累计播放/时长/歌曲数 + 热门歌曲/歌手榜 -->
              <div v-if="showStats" class="stats-panel">
                <header class="panel-head">
                  <span class="panel-index">LISTENING STATS</span><h2>听歌统计</h2>
                </header>
                <div class="stats-summary">
                  <div class="stat-tile"><strong>{{ p.listenStats.value.totalPlays }}</strong><small>累计播放</small></div>
                  <div class="stat-tile"><strong>{{ p.formatTime(p.listenStats.value.totalSeconds) }}</strong><small>收听时长</small></div>
                  <div class="stat-tile"><strong>{{ p.listenStats.value.songCount }}</strong><small>听过歌曲</small></div>
                </div>
                <div v-if="!p.listenStats.value.topSongs.length" class="queue-empty" style="padding: 18px">
                  <p>还没有播放记录。多听听，统计会在这里生长。</p>
                  <button class="action-button primary" type="button" @click="p.switchView('search')">去听歌</button>
                </div>
                <template v-else>
                  <h3 class="stats-subhead">热门歌曲</h3>
                  <div class="result-list">
                    <button
                      v-for="(t, i) in p.listenStats.value.topSongs"
                      :key="t.id"
                      class="result-row"
                      type="button"
                      @click="p.playTrack(t.id)"
                    >
                      <span class="duration">{{ String(i + 1).padStart(2, '0') }}</span>
                      <span class="result-copy"><strong>{{ t.title }}</strong><small>{{ t.artist }}</small></span>
                      <span class="duration">{{ p.playStats.value[t.id]?.plays ?? 0 }} 次</span>
                    </button>
                  </div>
                  <h3 class="stats-subhead">热门歌手</h3>
                  <div class="result-list">
                    <div
                      v-for="(a, i) in p.listenStats.value.topArtists"
                      :key="a.name"
                      class="result-row"
                    >
                      <span class="duration">{{ String(i + 1).padStart(2, '0') }}</span>
                      <span class="result-copy"><strong>{{ a.name }}</strong><small>共 {{ a.plays }} 次播放</small></span>
                      <span class="duration">{{ p.formatTime(a.seconds) }}</span>
                    </div>
                  </div>
                </template>
              </div>

              <!-- 歌单主布局：左侧收藏脊柱（各类集合入口 + 新建本地歌单）+ 右侧歌单详情 -->
              <div v-else-if="!showStats" class="playlist-layout">
                <section class="content-panel collection-spine">
                  <header class="panel-head">
                    <span class="panel-index">COLLECTION</span><h2>我的歌单</h2>
                  </header>
                  <div class="collection-list">
                    <button
                      v-for="pl in p.playlists"
                      :key="pl.key"
                      class="collection-item"
                      :class="{ 'is-active': p.playlistKey.value === pl.key }"
                      type="button"
                      @click="exitEdit(); p.playlistKey.value = pl.key"
                    >
                      <span class="signal-cover" :data-tone="pl.tone || undefined"><b>{{ pl.label }}</b></span>
                      <span><strong>{{ pl.name }}</strong><small>{{ pl.meta }}</small></span>
                    </button>
                    <button
                      v-if="p.likedTrackIds.value.length"
                      class="collection-item"
                      :class="{ 'is-active': p.playlistKey.value === 'liked' }"
                      type="button"
                      @click="exitEdit(); p.playlistKey.value = 'liked'"
                    >
                      <span class="signal-cover" data-tone="magenta"><b>♥</b></span>
                      <span><strong>我喜欢的音乐</strong><small>LIKED · {{ p.likedTrackIds.value.length }}</small></span>
                    </button>
                    <button
                      v-for="pl in p.userPlaylists.value"
                      :key="`user-${pl.id}`"
                      class="collection-item"
                      :class="{ 'is-active': p.playlistKey.value === `user:${pl.id}` }"
                      type="button"
                      @click="exitEdit(); p.playlistKey.value = `user:${pl.id}`"
                    >
                      <span
                        v-if="p.coverOf(p.trackById(pl.trackIds[0]))"
                        class="track-cover track-cover--sm collection-item-cover"
                      >
                        <img :src="p.coverOf(p.trackById(pl.trackIds[0]))" alt="" />
                      </span>
                      <span v-else class="signal-cover" data-tone="yellow"><b>MINE</b></span>
                      <span><strong>{{ pl.name }}</strong><small>LOCAL · {{ pl.trackIds.length }}</small></span>
                    </button>
                    <button
                      v-for="pl in p.neteaseAccountPlaylists.value"
                      :key="`net-${pl.id}`"
                      class="collection-item"
                      :class="{ 'is-active': p.playlistKey.value === `net:${pl.id}` }"
                      type="button"
                      @click="exitEdit(); p.openNeteaseAccountPlaylist(pl.id)"
                    >
                      <span class="signal-cover" data-tone="ice"><b>NET</b></span>
                      <span>
                        <strong>{{ pl.name }}</strong>
                        <small>NETEASE · {{ pl.trackCount }}</small>
                      </span>
                    </button>
                  </div>
                  <div class="button-row" style="padding: 12px 16px">
                    <input
                      v-model="newPlaylistName"
                      class="compact-search"
                      type="text"
                      maxlength="40"
                      placeholder="新建本地歌单名称"
                      aria-label="新建本地歌单名称"
                      @keydown.enter="p.createUserPlaylist(newPlaylistName); newPlaylistName = ''"
                    />
                    <button
                      class="action-button"
                      type="button"
                      @click="p.createUserPlaylist(newPlaylistName); newPlaylistName = ''"
                    >
                      新建
                    </button>
                  </div>
                </section>

                <!-- 歌单详情：横幅（封面/描述/播放全部/下载/随机/删除）+ 曲目行列表 -->
                <section class="content-panel playlist-detail">
                  <div class="playlist-banner">
                    <span class="signal-cover" :data-tone="p.activePlaylist.value.tone || undefined">
                      <b>{{ p.activePlaylist.value.label }}</b>
                    </span>
                    <div>
                      <span class="page-eyebrow">{{ p.activePlaylist.value.meta }}</span>
                      <h1>{{ p.activePlaylist.value.name }}</h1>
                      <p>{{ p.activePlaylist.value.description }}</p>
                      <div class="button-row">
                        <button class="action-button primary" type="button" @click="exitEdit(); p.playPlaylist()">
                          <Play :size="14" :stroke-width="2" aria-hidden="true" />
                          播放全部
                        </button>
                        <button
                          class="action-button"
                          type="button"
                          :disabled="p.downloadBusy.value || !p.playlistTracks.value.length"
                          @click="p.openDownloadPrompt(p.playlistTracks.value)"
                        >
                          <Download :size="14" :stroke-width="2" aria-hidden="true" />
                          下载本页
                        </button>
                        <button class="action-button" type="button" @click="exitEdit(); p.toggleShuffle(); p.playPlaylist()">
                          <Shuffle :size="14" :stroke-width="2" aria-hidden="true" />
                          随机播放
                        </button>
                        <button
                          v-if="isUserPlaylist"
                          class="action-button"
                          type="button"
                          @click="p.deleteUserPlaylist(userPlaylistId)"
                        >
                          <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
                          删除歌单
                        </button>
                      </div>
                      <small v-if="editing" class="playlist-edit-hint">勾选后批量操作；拖拽行首手柄可调整顺序。</small>
                    </div>
                  </div>
                  <div v-if="p.neteasePlaylistLoading.value" class="queue-empty" style="padding: 18px">正在加载歌单…</div>
                  <div v-else class="result-list" style="margin-top: 18px">
                    <div
                      v-for="(track, i) in p.playlistTracks.value"
                      :key="track.id"
                      class="result-row"
                      :class="{
                        'is-current': track.id === p.currentId.value,
                        'is-selected': selected.has(track.id),
                        'is-drag-zone': editing,
                      }"
                      @dragover.prevent="editing && onRowDragOver($event, i)"
                      @drop.prevent="editing && onRowDrop(i)"
                    >
                      <button class="result-main" type="button" @click="p.playTrack(track.id)">
                        <span v-if="p.coverOf(track)" class="track-cover track-cover--sm" aria-hidden="true">
                          <img :src="p.coverOf(track)" alt="" />
                        </span>
                        <span class="result-copy"><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span>
                        <span class="duration">{{ p.formatTime(track.duration) }}</span>
                      </button>
                      <span class="result-actions">
                        <label v-if="editing" class="playlist-select" :aria-label="`选择 ${track.title}`">
                          <input
                            type="checkbox"
                            :checked="selected.has(track.id)"
                            @change="toggleSelect(track.id)"
                          />
                        </label>
                        <button
                          v-if="editing"
                          class="icon-button playlist-drag"
                          type="button"
                          aria-label="拖拽排序"
                          draggable="true"
                          @dragstart="onRowDragStart(i)"
                        >
                          <GripVertical :size="16" :stroke-width="2" />
                        </button>
                        <template v-else-if="isUserPlaylist">
                          <button
                            class="icon-button"
                            data-fx="more"
                            type="button"
                            aria-label="歌曲详情"
                            @click="p.openSongDetail(track)"
                          >
                            <MoreHorizontal :size="16" :stroke-width="2" />
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
                            data-fx="remove"
                            type="button"
                            aria-label="移出歌单"
                            @click="p.removeTrackFromUserPlaylist(userPlaylistId, track.id)"
                          >
                            <X :size="16" :stroke-width="2" />
                          </button>
                        </template>
                        <button
                          v-else
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
                  <div v-if="!p.playlistTracks.value.length" class="queue-empty" style="padding: 18px">
                    <p>这个列表还是空的。搜索或导入曲目后会出现在这里。</p>
                    <button class="action-button primary" type="button" @click="p.switchView('search')">去搜索</button>
                  </div>
                  <!-- 编辑模式的批量操作条：全选/已选计数/批量下载/批量移出 -->
                  <div v-if="editing && isUserPlaylist" class="playlist-batch-bar">
                    <button class="text-button" type="button" @click="toggleAll">
                      {{ selected.size === p.playlistTracks.value.length && p.playlistTracks.value.length ? '全不选' : '全选' }}
                    </button>
                    <span class="playlist-batch-count">已选 {{ selected.size }} 首</span>
                    <span class="spacer" />
                    <button
                      class="action-button"
                      type="button"
                      :disabled="!selectedTracks.length || p.downloadBusy.value"
                      @click="batchDownload"
                    >
                      <Download :size="13" :stroke-width="2" /> 下载
                    </button>
                    <button
                      class="action-button danger"
                      type="button"
                      :disabled="!selected.size"
                      @click="batchRemove"
                    >
                      <Trash2 :size="13" :stroke-width="2" /> 移出
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </section>
</template>
