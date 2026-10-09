<script setup lang="ts">
/**
 * 学习任务快速添加输入框
 * 提供一个“输入任务标题 + 回车/点击添加”的轻量入口，
 * 自身不直接创建任务，而是把标题通过 submit 事件交给父组件处理。
 */
import { ref } from 'vue'
import { Plus } from 'lucide-vue-next'

const emit = defineEmits<{
  submit: [title: string]
}>()

// 输入框内容与提交中的加载态（用于禁用输入、按钮转圈，防止重复提交）
const input = ref('')
const loading = ref(false)

// 提交：空标题或提交中直接忽略；上抛标题后清空输入框
async function handleSubmit() {
  const title = input.value.trim()
  if (!title || loading.value) return
  loading.value = true
  try {
    emit('submit', title)
    input.value = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="study-quick-add">
    <!-- 输入框：回车或点击后缀按钮触发提交，提交期间禁用输入 -->
    <a-input
      v-model:value="input"
      placeholder="添加任务，按 Enter 确认…"
      :disabled="loading"
      @press-enter="handleSubmit"
    >
      <template #suffix>
        <a-button type="link" size="small" class="quick-add-btn" :loading="loading" @click="handleSubmit">
          <Plus :size="15" class="quick-add-icon" /> 添加
        </a-button>
      </template>
    </a-input>
  </div>
</template>

<style scoped>
.quick-add-icon {
  vertical-align: -0.16em;
  transition: transform var(--transition-fast);
}
.quick-add-btn:hover .quick-add-icon {
  transform: rotate(90deg) scale(1.1);
}
@media (prefers-reduced-motion: reduce) {
  .quick-add-icon {
    transition: none;
  }
  .quick-add-btn:hover .quick-add-icon {
    transform: none;
  }
}
</style>
