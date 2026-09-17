<script setup lang="ts">
/**
 * AdminIdCell 管理后台 ID 单元格
 * 职责：在管理端表格中展示较长的资源 ID；点击即复制到剪贴板并给出成功/失败提示，
 * ID 为空时显示占位符"—"。
 */
import { message } from 'ant-design-vue'

const props = defineProps<{ id?: number | string }>()

// 复制 ID 到剪贴板；剪贴板权限被拒绝时降级为错误提示
async function copyId() {
  if (props.id == null) return
  try {
    await navigator.clipboard.writeText(String(props.id))
    message.success('ID 已复制')
  } catch {
    message.error('复制失败：浏览器未授权剪贴板')
  }
}
</script>

<template>
  <!-- 有 ID：可点击复制；无 ID：占位符 -->
  <button
    v-if="id != null"
    class="admin-id-cell"
    type="button"
    :title="`点击复制：${id}`"
    @click.stop="copyId"
  >
    {{ id }}
  </button>
  <span v-else class="admin-id-cell admin-id-cell--empty">—</span>
</template>

<style scoped>
.admin-id-cell {
  display: inline-block;
  max-width: 108px;
  padding: 1px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: copy;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.admin-id-cell:hover {
  color: var(--color-primary-light);
  border-color: var(--color-border);
}
.admin-id-cell--empty {
  cursor: default;
}
</style>
