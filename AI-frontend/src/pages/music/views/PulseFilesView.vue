<script setup lang="ts">
/**
 * 本地文件视图：负责本地音频的导入（文件选择 / 文件夹 / 拖放）、
 * 下载曲库目录管理、失效授权的恢复提醒，以及本地曲目列表的维护（歌词绑定 / 移除）。
 * 具体导入、扫描、授权逻辑都在播放器单例（props.p）中，本组件只做交互入口。
 */
import { computed, ref } from 'vue'
import {
  FilePlus,
  FileText,
  FolderOpen,
  FolderSync,
  Import,
  Music2,
  ScanSearch,
  Trash2,
} from 'lucide-vue-next'
import { applyCoverFallback } from '@/utils/musicCover'
import type { PulseTrack } from '@/composables/pulse/pulseTypes'
import type { PulsePlayerApi } from '@/pages/music/pulseApi'

const props = defineProps<{ p: PulsePlayerApi }>()
const p = props.p

/** 拖放区是否正被悬停（高亮反馈） */
const dragOver = ref(false)

/** 需要重新授权（FSA 句柄失效）的曲目数量，用于展示恢复授权提醒条 */
const pendingCount = computed(() => p.localTracks.value.filter((t) => t.localNeedsPermission).length)

/** 本地文件的持久化状态徽标 */
function persistBadge(track: PulseTrack) {
  if (track.localNeedsPermission) return { text: '需授权', cls: 'is-warn' }
  switch (track.persistKind) {
    case 'blob':
      return { text: '已入库', cls: 'is-ok' }
    case 'fsa':
    case 'tauri':
      return { text: '已链接', cls: 'is-ok' }
    default:
      return { text: '临时', cls: '' }
  }
}

/** 拖放导入：把拖入的文件交给播放器解析入库 */
function onDrop(e: DragEvent) {
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (files?.length) void p.addFiles(files)
}
</script>

<template>
  <!-- FILES：本地文件的导入、曲库目录、授权与维护 -->
  <section class="view" :class="{ 'is-active': p.view.value === 'files' }" aria-labelledby="filesTitle">
    <div class="page-shell">
      <header class="page-heading">
        <div class="page-heading-copy">
          <span class="page-eyebrow">LOCAL FILES</span>
          <h1 id="filesTitle">本地文件</h1>
          <p>导入、曲库目录与授权都归这里管。{{ p.localHint }}</p>
        </div>
        <div class="heading-actions">
          <button class="action-button" type="button" @click="p.pickFolder()">
            <FolderOpen :size="14" :stroke-width="2" aria-hidden="true" />
            导入文件夹
          </button>
          <button class="action-button primary" type="button" @click="p.pickFiles()">
            <FilePlus :size="14" :stroke-width="2" aria-hidden="true" />
            导入文件
          </button>
        </div>
      </header>

      <!-- 曲库目录 -->
      <div class="files-sink">
        <span class="files-sink-icon" aria-hidden="true">
          <ScanSearch :size="18" :stroke-width="1.8" />
        </span>
        <div class="files-sink-copy">
          <small>LIBRARY FOLDER · 曲库目录</small>
          <strong>{{ p.downloadSinkLabel.value || '尚未设置' }}</strong>
          <p>下载的在线曲会存进这个目录，每首歌一个文件夹（音频 + 封面 + 歌词）。</p>
        </div>
        <div class="files-sink-actions">
          <button class="action-button" type="button" @click="p.pickDownloadLibraryDir()">
            {{ p.downloadSinkLabel.value ? '更换目录' : '选择目录' }}
          </button>
          <button
            v-if="p.downloadSinkLabel.value"
            class="action-button"
            type="button"
            @click="p.scanDownloadLibrary()"
          >
            扫描导入
          </button>
        </div>
      </div>

      <!-- 导入拖放区 -->
      <div
        class="files-drop"
        :class="{ 'is-over': dragOver }"
        role="button"
        tabindex="0"
        aria-label="拖放或点击导入音频文件"
        @click="p.pickFiles()"
        @keydown.enter="p.pickFiles()"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <Import :size="22" :stroke-width="1.6" aria-hidden="true" />
        <strong>把音频文件拖到这里</strong>
        <p>或点击选择文件。支持 MP3 / FLAC / WAV / OGG / M4A，200MB 以内会写入本地库，刷新不丢。</p>
      </div>

      <!-- 授权提醒 -->
      <div v-if="pendingCount" class="files-perm" role="status">
        <p><strong>{{ pendingCount }} 首</strong>本地曲目需要重新授权文件夹才能播放。</p>
        <button class="action-button primary" type="button" @click="p.restoreLocalLibraryAccess()">
          <FolderSync :size="14" :stroke-width="2" aria-hidden="true" />
          一键恢复授权
        </button>
      </div>

      <!-- 文件列表 -->
      <template v-if="p.localTracks.value.length">
        <div class="section-title">
          <span>ON DISK</span>
          <h2>本地文件 · {{ p.localTracks.value.length }} 首</h2>
        </div>
        <div class="result-list">
          <div
            v-for="track in p.localTracks.value"
            :key="track.id"
            class="result-row"
            :class="{ 'is-current': track.id === p.currentId.value }"
          >
            <button class="result-main" type="button" @click="p.playTrack(track.id)">
              <span v-if="p.coverOf(track)" class="track-cover track-cover--sm" aria-hidden="true">
                <img :src="p.coverOf(track)" alt="" @error="applyCoverFallback" />
              </span>
              <span v-else class="signal-cover lib-row-cover" :data-tone="track.tone || undefined" aria-hidden="true">
                <Music2 :size="15" :stroke-width="1.8" />
              </span>
              <span class="result-copy">
                <strong>{{ track.title }}</strong>
                <small>{{ track.artist }} · {{ track.album || '未知专辑' }}</small>
              </span>
              <span class="duration">{{ p.formatTime(track.duration) }}</span>
            </button>
            <span class="result-actions">
              <span class="file-badge" :class="persistBadge(track).cls">{{ persistBadge(track).text }}</span>
              <button
                class="icon-button"
                data-fx="lrc"
                type="button"
                aria-label="选择歌词文件"
                @click="p.pickLrcForTrack(track.id)"
              >
                <FileText :size="16" :stroke-width="2" />
              </button>
              <button
                class="icon-button"
                data-fx="remove"
                type="button"
                aria-label="移出曲库"
                @click="p.removeLocalTrack(track.id)"
              >
                <Trash2 :size="16" :stroke-width="2" />
              </button>
            </span>
          </div>
        </div>
      </template>
      <div v-else class="queue-empty lib-empty">
        <p>还没有本地文件。拖进来、点导入，或把在线曲下载到曲库目录。</p>
      </div>
    </div>
  </section>
</template>
