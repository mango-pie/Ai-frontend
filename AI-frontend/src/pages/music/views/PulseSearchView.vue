<script setup lang="ts">
/**
 * 搜索页：同时检索本地曲库与在线音乐（网易云/QQ/酷狗）。
 * 空闲态展示搜索历史与热门搜索；结果支持单曲/歌手/专辑/歌单四种类型，
 * 单曲结果可播放、下一首播放、加队列、下载、加入歌单。
 */
import { computed } from 'vue'
import { Download, ListMusic, ListPlus, MoreHorizontal, Plus, RefreshCw, Search, X } from 'lucide-vue-next'
import { toCoverDisplayUrl } from '@/utils/musicCover'
import type { PulseDiscoverApi, PulsePlayerApi } from '@/pages/music/pulseApi'

const props = defineProps<{
  p: PulsePlayerApi
  discover: PulseDiscoverApi
  searchShortcut?: string
}>()
const p = props.p
const discover = props.discover
const shortcut = computed(() => props.searchShortcut || 'Ctrl+K')

// 输入清空时立即重置全部搜索状态，回到「探索」默认页
function onSearchInput() {
  if (!p.searchQuery.value.trim()) {
    p.searchResults.value = []
    p.searchAlbumResults.value = []
    p.searchPlaylistResults.value = []
    p.searchArtistResults.value = []
    p.searchHasMore.value = false
    p.searchState.value = 'idle'
  }
}

// 是否展示「探索区」（历史 + 热搜）：空闲态或无关键词时
const showSearchExplore = computed(
  () => p.searchState.value === 'idle' || !p.searchQuery.value.trim(),
)
</script>

<template>
          <!-- SEARCH -->
          <section class="view" :class="{ 'is-active': p.view.value === 'search' }" aria-labelledby="searchTitle">
            <div class="page-shell">
              <header class="page-heading">
                <div class="page-heading-copy">
                  <span class="page-eyebrow">SEARCH</span>
                  <h1 id="searchTitle">搜索曲库与在线音乐</h1>
                  <p>同时检索本地曲库、网易云、QQ音乐与酷狗。点选结果即可加入队列并播放。</p>
                </div>
                <div
                  v-if="p.searchKind.value === 'song' && p.searchResults.value.length"
                  class="heading-actions"
                >
                  <button
                    class="action-button"
                    type="button"
                    :disabled="p.downloadBusy.value"
                    @click="p.openDownloadPrompt(p.searchResults.value.filter((t) => p.provider.value === '全部' || t.source === p.provider.value))"
                  >
                    <Download :size="14" :stroke-width="2" aria-hidden="true" />
                    下载本页
                  </button>
                </div>
              </header>

              <!-- 搜索控制台：关键词输入（回车搜索）+ 搜索按钮 -->
              <div class="search-console">
                <label class="search-field">
                  <span class="search-glyph" aria-hidden="true"><Search :size="14" :stroke-width="2" /></span>
                  <input
                    id="pulse-search-input"
                    v-model="p.searchQuery.value"
                    type="search"
                    placeholder="搜索歌曲、歌手、专辑…"
                    autocomplete="off"
                    @keydown.enter="p.runSearch()"
                    @input="onSearchInput"
                  />
                  <kbd>{{ shortcut }}</kbd>
                </label>
                <button class="action-button primary" type="button" @click="p.runSearch()">
                  <Search :size="14" :stroke-width="2" aria-hidden="true" />
                  搜索
                </button>
              </div>

              <!-- 搜索类型切换：单曲 / 歌手 / 专辑 / 歌单 -->
              <div class="provider-strip" aria-label="搜索类型">
                <button
                  v-for="kind in [
                    { id: 'song', label: '单曲' },
                    { id: 'artist', label: '歌手' },
                    { id: 'album', label: '专辑' },
                    { id: 'playlist', label: '歌单' },
                  ] as const"
                  :key="kind.id"
                  class="provider-chip"
                  :class="{ 'is-active': p.searchKind.value === kind.id }"
                  type="button"
                  @click="p.setSearchKind(kind.id)"
                >
                  {{ kind.label }}
                </button>
              </div>

              <!-- 来源筛选（仅单曲搜索可用）：全部 / 本地 / 网易云 / QQ音乐 / 酷狗 -->
              <div class="provider-strip" aria-label="内容来源筛选">
                <button
                  v-for="src in ['全部', '本地', '网易云', 'QQ音乐', '酷狗']"
                  :key="src"
                  class="provider-chip"
                  :class="{ 'is-active': p.provider.value === src }"
                  type="button"
                  :disabled="p.searchKind.value !== 'song'"
                  @click="p.provider.value = src"
                >
                  {{ src }}
                </button>
              </div>

              <!-- 探索区：搜索历史（可单条删/清空）与热门搜索（前三名高亮） -->
              <div
                v-if="showSearchExplore"
                class="search-explore"
              >
                <section v-if="p.searchHistory.value.length" class="search-explore-block" aria-label="搜索历史">
                  <header class="search-explore-head">
                    <h2>搜索历史</h2>
                    <button class="text-button" type="button" @click="p.clearSearchHistory()">清空</button>
                  </header>
                  <div class="search-chip-row">
                    <button
                      v-for="kw in p.searchHistory.value"
                      :key="`hist-${kw}`"
                      class="search-chip"
                      type="button"
                      @click="p.applySearchKeyword(kw)"
                    >
                      <span>{{ kw }}</span>
                      <i
                        class="search-chip-x"
                        role="button"
                        tabindex="0"
                        aria-label="删除该历史"
                        @click.stop="p.removeSearchHistory(kw)"
                        @keydown.enter.stop="p.removeSearchHistory(kw)"
                      ><X :size="12" :stroke-width="2.4" /></i>
                    </button>
                  </div>
                </section>

                <section class="search-explore-block" aria-label="热门搜索">
                  <header class="search-explore-head">
                    <h2>热门搜索</h2>
                    <button
                      class="text-button"
                      type="button"
                      :disabled="p.hotSearchLoading.value"
                      @click="p.loadHotSearches(true)"
                    >
                      <RefreshCw :size="13" :stroke-width="2" aria-hidden="true" />
                      {{ p.hotSearchLoading.value ? '刷新中…' : '刷新' }}
                    </button>
                  </header>
                  <div v-if="p.hotSearchLoading.value && !p.hotSearches.value.length" class="search-explore-hint">
                    正在拉取热搜…
                  </div>
                  <div v-else-if="!p.hotSearches.value.length" class="search-explore-hint">
                    暂无热搜，请刷新试试；仍不行说明音乐服务未连接。
                  </div>
                  <div v-else class="search-chip-row">
                    <button
                      v-for="(item, i) in p.hotSearches.value"
                      :key="`hot-${item.searchWord}`"
                      class="search-chip"
                      :class="{ 'is-hot': i < 3 }"
                      type="button"
                      :title="item.content || item.searchWord"
                      @click="p.applySearchKeyword(item.searchWord)"
                    >
                      <em v-if="i < 3" aria-hidden="true">{{ i + 1 }}</em>
                      <span>{{ item.searchWord }}</span>
                    </button>
                  </div>
                </section>
              </div>

              <!-- 搜索过程态：加载中 / 空结果（附历史热搜引导）/ 服务失败可重试 -->
              <template v-else>
              <div v-if="p.searchState.value === 'loading'" class="state-panel is-visible">
                <div class="state-copy">
                  <div class="state-code">…</div>
                  <h2>正在搜索</h2>
                  <p>查询本地曲库与在线音乐（网易云 / QQ音乐 / 酷狗）。</p>
                </div>
              </div>
              <div v-else-if="p.searchState.value === 'empty'" class="state-panel is-visible">
                <div class="state-copy">
                  <div class="state-code">Ø</div>
                  <h2>没有结果</h2>
                  <p>换个关键词，或从下方热搜 / 历史再试一次。</p>
                </div>
                <div class="search-explore search-explore--compact">
                  <div v-if="p.searchHistory.value.length" class="search-chip-row">
                    <button
                      v-for="kw in p.searchHistory.value.slice(0, 8)"
                      :key="`empty-hist-${kw}`"
                      class="search-chip"
                      type="button"
                      @click="p.applySearchKeyword(kw)"
                    >
                      <span>{{ kw }}</span>
                    </button>
                  </div>
                  <div v-if="p.hotSearches.value.length" class="search-chip-row">
                    <button
                      v-for="(item, i) in p.hotSearches.value.slice(0, 8)"
                      :key="`empty-hot-${item.searchWord}`"
                      class="search-chip"
                      :class="{ 'is-hot': i < 3 }"
                      type="button"
                      @click="p.applySearchKeyword(item.searchWord)"
                    >
                      <span>{{ item.searchWord }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div v-else-if="p.searchState.value === 'error'" class="state-panel is-visible">
                <div class="state-copy">
                  <div class="state-code">!</div>
                  <h2>搜索失败</h2>
                  <p>音乐服务未连接，请检查启动器中的 API 窗口；或仅使用本地曲库。</p>
                  <button class="action-button primary" type="button" @click="p.runSearch()">
                    <RefreshCw :size="14" :stroke-width="2" aria-hidden="true" />
                    重试
                  </button>
                </div>
              </div>
              <!-- 结果区：按搜索类型分四种渲染；歌手/专辑/歌单跳发现页详情，单曲就地播放 -->
              <div v-else class="result-list">
                <template v-if="p.searchKind.value === 'artist'">
                  <button
                    v-for="artist in p.searchArtistResults.value"
                    :key="artist.id"
                    class="result-row"
                    type="button"
                    @click="discover.openArtist(artist.id); p.switchView('discover')"
                  >
                    <span v-if="toCoverDisplayUrl(artist.coverUrl)" class="track-cover track-cover--sm">
                      <img :src="toCoverDisplayUrl(artist.coverUrl)" alt="" />
                    </span>
                    <span class="result-copy">
                      <strong>{{ artist.name }}</strong>
                      <small>{{ artist.alias || (artist.albumSize ? `${artist.albumSize} 张专辑` : '歌手') }}</small>
                    </span>
                    <span class="source-badge">歌手</span>
                  </button>
                </template>
                <template v-else-if="p.searchKind.value === 'album'">
                  <button
                    v-for="album in p.searchAlbumResults.value"
                    :key="album.id"
                    class="result-row"
                    type="button"
                    @click="discover.openAlbum(album.id); p.switchView('discover')"
                  >
                    <span v-if="toCoverDisplayUrl(album.coverUrl)" class="track-cover track-cover--sm">
                      <img :src="toCoverDisplayUrl(album.coverUrl)" alt="" />
                    </span>
                    <span class="result-copy">
                      <strong>{{ album.name }}</strong>
                      <small>{{ album.artist }} · {{ album.size }} 首</small>
                    </span>
                    <span class="source-badge">专辑</span>
                  </button>
                </template>
                <template v-else-if="p.searchKind.value === 'playlist'">
                  <button
                    v-for="pl in p.searchPlaylistResults.value"
                    :key="pl.id"
                    class="result-row"
                    type="button"
                    @click="discover.openPlaylist(pl.id); p.switchView('discover')"
                  >
                    <span v-if="toCoverDisplayUrl(pl.coverUrl)" class="track-cover track-cover--sm">
                      <img :src="toCoverDisplayUrl(pl.coverUrl)" alt="" />
                    </span>
                    <span class="result-copy">
                      <strong>{{ pl.name }}</strong>
                      <small>{{ pl.trackCount }} 首 · {{ discover.formatPlayCount(pl.playCount) }}</small>
                    </span>
                    <span class="source-badge">歌单</span>
                  </button>
                </template>
                <template v-else>
                  <div
                    v-for="(track, i) in p.searchResults.value.filter(
                      (t) => p.provider.value === '全部' || t.source === p.provider.value,
                    )"
                    :key="track.id"
                    class="result-row"
                    :class="{ 'is-current': track.id === p.currentId.value }"
                  >
                    <button class="result-main" type="button" @click="p.playSearchResult(track)">
                      <span v-if="p.coverOf(track)" class="track-cover track-cover--sm" aria-hidden="true">
                        <img :src="p.coverOf(track)" alt="" />
                      </span>
                      <span v-else class="signal-cover" :data-tone="track.tone || undefined">
                        <b>{{ track.source === '本地' ? 'LOC' : track.source === '网易云' ? 'NET' : track.source === 'QQ音乐' ? 'QQ' : track.source === '酷狗' ? 'KG' : 'NET' }}</b>
                      </span>
                      <span class="result-copy">
                        <strong>{{ track.title }}</strong>
                        <small>{{ track.artist }} · {{ track.album }} · {{ track.source }}</small>
                      </span>
                      <span class="duration">{{ p.formatTime(track.duration) }}</span>
                    </button>
                    <span class="result-actions">
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
                        class="icon-button"
                        data-fx="next"
                        type="button"
                        aria-label="下一首播放"
                        @click="p.addToQueue(track, { next: true })"
                      >
                        <ListPlus :size="16" :stroke-width="2" />
                      </button>
                      <button
                        class="icon-button"
                        data-fx="queue"
                        type="button"
                        aria-label="加入队列"
                        @click="p.addToQueue(track)"
                      >
                        <ListMusic :size="16" :stroke-width="2" />
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
                        v-if="p.userPlaylists.value.length"
                        class="icon-button"
                        data-fx="more"
                        type="button"
                        aria-label="加入歌单"
                        @click="p.addTrackToUserPlaylist(p.playlistKey.value.startsWith('user:') ? p.playlistKey.value.slice(5) : p.userPlaylists.value[0]!.id, track)"
                      >
                        <Plus :size="16" :stroke-width="2" />
                      </button>
                    </span>
                  </div>
                </template>
                <div v-if="p.searchHasMore.value" class="queue-empty" style="padding: 12px">
                  <button
                    class="action-button"
                    type="button"
                    :disabled="p.neteaseLoading.value"
                    @click="p.loadMoreSearch()"
                  >
                    {{ p.neteaseLoading.value ? '加载中…' : '加载更多' }}
                  </button>
                </div>
              </div>
              </template>
            </div>
          </section>
</template>
