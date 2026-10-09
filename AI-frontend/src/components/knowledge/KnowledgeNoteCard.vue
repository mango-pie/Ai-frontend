<script setup lang="ts">
/**
 * 知识库笔记卡片
 * 展示单条精读笔记：标题、标签、发布/入库双状态徽章与更新时间，
 * 并按来源类型（URL/文件/Agent）以左侧色带区分；
 * 发布、同步、索引、重建、重新蒸馏、删除等操作经事件上抛，由父级页面执行。
 */
import { computed } from 'vue'
import { Eye, MoreHorizontal, Tag as TagIcon, Clock } from 'lucide-vue-next'
import IconAction from '@/components/ui/IconAction.vue'
import KnowledgeStatusChip from '@/components/knowledge/KnowledgeStatusChip.vue'
import { vTilt } from '@/composables/useTilt'
import {
  canIndexKb,
  canPublishBlog,
  canReindexKb,
  canSyncBlog,
} from '@/utils/knowledgeNoteStatus'

const props = defineProps<{
  note: API.KnowledgeNoteVO
}>()

const emit = defineEmits<{
  (e: 'open', id?: number | string, action?: string): void
  (e: 'redistill', note: API.KnowledgeNoteVO): void
  (e: 'delete', note: API.KnowledgeNoteVO): void
}>()

// 来源类型 → 卡片色带修饰类（URL 蓝 / 文件绿 / Agent 主题色 / 其余中性）
const sourceClass = computed(() => {
  const t = (props.note.sourceType || '').toUpperCase()
  if (t === 'URL') return 'is-url'
  if (t === 'FILE') return 'is-file'
  if (t === 'AGENT') return 'is-agent'
  return 'is-default'
})

// 标签字符串按中英文逗号与空白切分，最多展示 4 个
const tagList = computed(() =>
  (props.note.tags || '')
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4),
)

// 时间标签：优先取更新时间，无则取创建时间，格式化为 yyyy-MM-dd HH:mm
const updatedLabel = computed(() => {
  const t = props.note.updateTime || props.note.createTime
  if (!t) return '-'
  return String(t).replace('T', ' ').slice(0, 16)
})

// 下拉菜单分发：把菜单 key 映射为对应事件上抛，具体动作由父级页面实现
const onMenuClick = ({ key }: { key: string }) => {
  const id = props.note.id
  const actions: Record<string, () => void> = {
    publish: () => emit('open', id, 'publish'),
    sync: () => emit('open', id, 'sync'),
    index: () => emit('open', id, 'index'),
    reindex: () => emit('open', id, 'reindex'),
    redistill: () => emit('redistill', props.note),
    delete: () => emit('delete', props.note),
  }
  actions[key]?.()
}
</script>

<template>
  <article v-tilt class="kb-note-card" :class="sourceClass">
    <span class="kb-note-card__band" aria-hidden="true" />

    <header class="kb-note-card__head">
      <h3 class="kb-note-card__title" :title="note.title || '（无标题）'" @click="emit('open', note.id)">
        {{ note.title || '（无标题）' }}
      </h3>
      <KnowledgeStatusChip type="source" :status="note.sourceType" />
    </header>

    <!-- 标签区：有标签展示标签，无标签用占位文案保持卡片高度一致 -->
    <div v-if="tagList.length" class="kb-note-card__tags">
      <TagIcon :size="13" :stroke-width="2" class="kb-note-card__tags-icon" />
      <span v-for="t in tagList" :key="t" class="kb-note-card__tag">{{ t }}</span>
    </div>
    <div v-else class="kb-note-card__tags kb-note-card__tags--empty">暂无标签</div>

    <!-- 发布 / 入库双状态徽章 -->
    <div class="kb-note-card__status">
      <KnowledgeStatusChip type="publish" :status="note.publishStatus" />
      <KnowledgeStatusChip type="index" :status="note.indexStatus" />
    </div>

    <footer class="kb-note-card__foot">
      <span class="kb-note-card__time">
        <Clock :size="13" :stroke-width="2" />
        {{ updatedLabel }}
      </span>
      <div class="kb-note-card__actions">
        <IconAction :icon="Eye" size="sm" variant="soft" label="预览" @click="emit('open', note.id)" />
        <!-- 更多操作菜单：按笔记当前状态条件渲染可用动作，删除固定置底 -->
        <a-dropdown :trigger="['click']" placement="bottomRight">
          <IconAction :icon="MoreHorizontal" size="sm" variant="ghost" aria-label="更多操作" />
          <template #overlay>
            <a-menu @click="onMenuClick">
              <a-menu-item v-if="canPublishBlog(note.publishStatus)" key="publish">发布博客</a-menu-item>
              <a-menu-item v-if="canSyncBlog(note.publishStatus)" key="sync">同步博客</a-menu-item>
              <a-menu-item v-if="canIndexKb(note.indexStatus)" key="index">加入知识库</a-menu-item>
              <a-menu-item v-if="canReindexKb(note.indexStatus)" key="reindex">重建索引</a-menu-item>
              <a-menu-item v-if="note.status === 'FAILED'" key="redistill">重新蒸馏</a-menu-item>
              <a-menu-divider />
              <a-menu-item key="delete" danger>
                <span style="color: var(--color-error)">删除</span>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.kb-note-card {
  --band: var(--color-primary);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 14px 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transform: perspective(900px) rotateX(var(--rx, 0)) rotateY(var(--ry, 0));
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.kb-note-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-glow);
}

.kb-note-card.is-url {
  --band: #93b4f5;
}
.kb-note-card.is-file {
  --band: #34d399;
}
.kb-note-card.is-agent {
  --band: var(--color-primary);
}
.kb-note-card.is-default {
  --band: var(--color-text-muted);
}

.kb-note-card__band {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--band);
  opacity: 0.9;
}

.kb-note-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.kb-note-card__title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  margin: 0;
  cursor: pointer;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color var(--transition-fast);
}
.kb-note-card__title:hover {
  color: var(--color-primary-light);
}

.kb-note-card__tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 22px;
  color: var(--color-text-secondary);
}
.kb-note-card__tags--empty {
  color: var(--color-text-muted);
  font-size: 12px;
}
.kb-note-card__tags-icon {
  color: var(--color-text-muted);
}
.kb-note-card__tag {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-primary-08);
  border: 1px solid var(--color-primary-20);
  color: var(--color-text-secondary);
}

.kb-note-card__status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kb-note-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.kb-note-card__time {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.kb-note-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .kb-note-card {
    transform: none !important;
  }
}
</style>
