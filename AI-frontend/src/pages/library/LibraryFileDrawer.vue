<!--
  资料库 · 文件详情抽屉
  预览 / AI 摘要 / 标签（含 AI 建议与新建）/ 所在合集 / 元信息 / 操作
  所有业务动作通过事件上抛给 LibraryPage，由 useLibrary 数据层执行
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BookMarked, Download, Pencil, RefreshCw, Sparkles, Trash2, X } from 'lucide-vue-next'
import type { LibraryCollection, LibraryFile, LibraryTag } from '@/api/libraryController'
import { fmtSize } from '@/composables/useLibrary'

const props = defineProps<{
  open: boolean
  file: LibraryFile | null
  tags: LibraryTag[]
  collections: LibraryCollection[]
  demo: boolean
}>()

const emit = defineEmits<{
  close: []
  download: [file: LibraryFile]
  'remove-tag': [file: LibraryFile, tagId: number]
  'accept-suggest': [file: LibraryFile, name: string]
  'create-tag': [file: LibraryFile, name: string]
  'add-collection': [file: LibraryFile, collectionId: number]
  'remove-collection': [file: LibraryFile, collectionId: number]
  rename: [file: LibraryFile, name: string]
  'transfer-kb': [file: LibraryFile]
  delete: [file: LibraryFile]
  regen: [file: LibraryFile]
}>()

const tagById = computed(() => new Map(props.tags.map((t) => [t.id, t])))
const colById = computed(() => new Map(props.collections.map((c) => [c.id, c])))

const suggestTags = computed(() => {
  if (!props.file || props.file.aiStatus !== 'DONE') return []
  return ['注意力机制', '论文精读'].filter(
    (name) => !props.file!.tagIds.some((id) => tagById.value.get(id)?.name === name),
  )
})

const categoryLabel = computed(() => {
  const map: Record<string, string> = {
    DOCUMENT: '文档', IMAGE: '图片', AUDIO: '音频', VIDEO: '视频', CODE: '代码', ARCHIVE: '压缩包', OTHER: '其他',
  }
  return props.file ? (map[props.file.category] ?? '其他') : ''
})

/* 内联交互状态：切文件时重置 */
const addingTag = ref(false)
const newTagName = ref('')
const pickingCol = ref(false)
const renamingFile = ref(false)
const newFileName = ref('')

/** 内联输入出现即聚焦 */
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }

watch(
  () => props.file?.id,
  () => {
    addingTag.value = false
    newTagName.value = ''
    pickingCol.value = false
    renamingFile.value = false
  },
)

function submitRename() {
  if (!renamingFile.value) return
  renamingFile.value = false
  const name = newFileName.value.trim()
  if (!name || !props.file || name === props.file.name) return
  emit('rename', props.file, name)
}

const joinableCols = computed(() =>
  props.file ? props.collections.filter((c) => !props.file!.collectionIds.includes(c.id)) : [],
)

function submitTag() {
  const name = newTagName.value.trim()
  if (!name || !props.file) return
  emit('create-tag', props.file, name)
  addingTag.value = false
  newTagName.value = ''
}
</script>

<template>
  <!-- Teleport 到 #stage：脱离 .station-page(z=4) 的层叠上下文，才能盖过 topbar(z=5)；
       仍留在缩放舞台内，fixed 定位与房间令牌不受影响 -->
  <Teleport to="#stage" defer>
    <div>
      <Transition name="libr-fade">
        <div v-if="open && file" class="libr-mask" @click="emit('close')" />
      </Transition>
      <aside class="libr-drawer" :class="{ show: open && file }" role="dialog" aria-modal="true" aria-label="文件详情">
      <template v-if="file">
        <div class="libr-drawer-head">
          <span class="libr-ftype" :class="`cat-${file.category}`">{{ file.ext.toUpperCase().slice(0, 4) }}</span>
          <div>
            <div v-if="renamingFile" class="libr-rename-row">
              <input
                v-model="newFileName"
                v-focus
                class="libr-tag-input"
                style="width: 100%"
                @keydown.enter="submitRename"
                @keydown.esc="renamingFile = false"
                @blur="submitRename"
              />
            </div>
            <div v-else class="t">
              {{ file.name }}
              <button
                class="libr-icon-btn"
                title="重命名"
                aria-label="重命名文件"
                @click="renamingFile = true; newFileName = file.name"
              >
                <Pencil :size="13" />
              </button>
            </div>
            <div class="s">{{ categoryLabel }} · {{ fmtSize(file.size) }} · 上传于 {{ file.uploadedAt }}</div>
          </div>
          <button class="libr-icon-btn close" aria-label="关闭" @click="emit('close')">
            <X :size="16" />
          </button>
        </div>
        <div class="libr-drawer-body">
          <div class="libr-preview">
            <span class="libr-ftype" :class="`cat-${file.category}`">{{ file.ext.toUpperCase().slice(0, 4) }}</span>
            <div>
              {{
                file.category === 'IMAGE'
                  ? '图片预览（预签名 URL 直出）'
                  : file.category === 'DOCUMENT'
                    ? '文档预览 · 点击「下载」新窗口打开'
                    : '该类型暂不支持在线预览'
              }}
            </div>
            <div style="opacity: 0.7">object_key: {{ file.objectKey ?? (demo ? 'demo/local（待后端接入）' : '—') }}</div>
          </div>

          <div v-if="file.aiStatus === 'DONE' && file.aiSummary">
            <div class="libr-section-title">AI 摘要 <span class="en">AI DIGEST</span></div>
            <div class="libr-ai-card" style="margin-top: 8px">
              <div class="ai-head"><Sparkles :size="13" /> 由站点模型自动生成</div>
              <p>{{ file.aiSummary }}</p>
              <button class="regen" @click="emit('regen', file)">
                <RefreshCw :size="12" /> 重新生成
              </button>
            </div>
          </div>
          <div v-else-if="file.aiStatus === 'PENDING'" class="libr-ai-card">
            <div class="ai-head" style="color: color-mix(in srgb, var(--c-sun) 80%, var(--ink))">
              AI 解析排队中…
            </div>
            <p style="color: var(--ink-faint)">解析完成后将自动生成摘要并建议标签</p>
          </div>

          <div>
            <div class="libr-section-title">标签 <span class="en">TAGS</span></div>
            <div class="libr-drawer-tags" style="margin-top: 8px">
              <span
                v-for="t in file.tagIds"
                :key="t"
                class="libr-dtag"
                :class="`tagcolor-${tagById.get(t)?.color ?? 'violet'}`"
              >
                {{ tagById.get(t)?.name ?? t }}
                <button :aria-label="`移除标签 ${tagById.get(t)?.name ?? t}`" @click="emit('remove-tag', file, t)">
                  <X :size="12" />
                </button>
              </span>
              <span
                v-for="s in suggestTags"
                :key="s"
                class="libr-dtag suggest"
                role="button"
                tabindex="0"
                @click="emit('accept-suggest', file, s)"
                @keydown.enter="emit('accept-suggest', file, s)"
              >
                ＋ {{ s }}
              </span>
              <input
                v-if="addingTag"
                v-model="newTagName"
                class="libr-tag-input"
                placeholder="标签名，回车确认"
                autofocus
                @keydown.enter="submitTag"
                @keydown.esc="addingTag = false"
                @blur="submitTag"
              />
              <button v-else class="libr-add-tag" @click="addingTag = true">＋ 标签</button>
            </div>
          </div>

          <div>
            <div class="libr-section-title">所在合集 <span class="en">SHELVES</span></div>
            <div class="libr-drawer-tags" style="margin-top: 8px">
              <template v-if="file.collectionIds.length">
                <span
                  v-for="c in file.collectionIds"
                  :key="c"
                  class="libr-dtag"
                  :class="`tagcolor-${colById.get(c)?.color ?? 'violet'}`"
                >
                  {{ colById.get(c)?.name ?? c }}
                  <button
                    :aria-label="`移出合集 ${colById.get(c)?.name ?? c}`"
                    @click="emit('remove-collection', file, c)"
                  >
                    <X :size="12" />
                  </button>
                </span>
              </template>
              <span v-else class="libr-meta-txt" style="font-size: 12.5px">未加入任何合集</span>
              <template v-if="pickingCol">
                <button
                  v-for="c in joinableCols"
                  :key="c.id"
                  class="libr-add-tag"
                  @click="
                    emit('add-collection', file, c.id);
                    pickingCol = false
                  "
                >
                  {{ c.name }}
                </button>
              </template>
              <button
                v-else-if="joinableCols.length"
                class="libr-add-tag"
                @click="pickingCol = true"
              >
                ＋ 加入合集
              </button>
            </div>
          </div>

          <div>
            <div class="libr-section-title">元信息 <span class="en">META</span></div>
            <dl class="libr-meta-grid" style="margin-top: 8px">
              <dt>SHA-256</dt>
              <dd>{{ file.sha256 ?? '—' }}</dd>
              <dt>存储位置</dt>
              <dd>{{ file.objectKey ? 'MinIO · library-files' : demo ? '本地演示' : '—' }}</dd>
              <dt>下载链接</dt>
              <dd>预签名 · 3600s 有效</dd>
            </dl>
          </div>

          <div class="libr-drawer-actions">
            <button class="libr-btn" @click="emit('download', file)">
              <Download :size="13" /> 下载
            </button>
            <button class="libr-btn primary" @click="emit('transfer-kb', file)">
              <BookMarked :size="13" /> 转入知识库
            </button>
            <button class="libr-btn ghost-danger" @click="emit('delete', file)">
              <Trash2 :size="13" /> 移入回收站
            </button>
          </div>
        </div>
      </template>
    </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.libr-fade-enter-active,
.libr-fade-leave-active {
  transition: opacity 0.25s ease;
}
.libr-fade-enter-from,
.libr-fade-leave-to {
  opacity: 0;
}
</style>
