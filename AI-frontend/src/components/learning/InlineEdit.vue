<script setup lang="ts">
/**
 * 行内编辑输入框 — 双击激活、Enter 确认、Esc 取消、blur 保存
 * 用于 DomainTree 的改名和新建枝操作
 */
import { nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    autofocus?: boolean
  }>(),
  {
    placeholder: '输入标题',
    autofocus: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  confirm: [value: string]
  cancel: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)
/** 本地编辑副本：确认前不回写父组件，取消时直接丢弃 */
const text = ref(props.modelValue)
/** 防止 Enter 确认后紧接着 blur 再触发一次 */
const settled = ref(false)

/** 聚焦并全选文本，方便直接覆盖输入 */
function focusIt() {
  void nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

watch(
  () => props.autofocus,
  (v) => {
    if (v) focusIt()
  },
)

onMounted(() => {
  if (props.autofocus) focusIt()
})

function finishConfirm(v: string) {
  if (settled.value) return
  settled.value = true
  emit('confirm', v)
}

function finishCancel() {
  if (settled.value) return
  settled.value = true
  emit('cancel')
}

/** 键盘交互：Enter 提交（空值忽略），Esc 取消 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    const v = text.value.trim()
    if (v) finishConfirm(v)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    finishCancel()
  }
}

/** 失焦兜底：有内容视为保存，空内容视为取消 */
function onBlur() {
  const v = text.value.trim()
  if (v) finishConfirm(v)
  else finishCancel()
}
</script>

<template>
  <input
    ref="inputRef"
    v-model="text"
    class="ld-inline-edit"
    :placeholder="placeholder"
    type="text"
    @keydown="onKeydown"
    @blur="onBlur"
  />
</template>

<style scoped>
.ld-inline-edit {
  width: 100%;
  border: 1.5px solid color-mix(in srgb, var(--room, #9b8ce8) 35%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink, #4c5570);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  padding: 6px 10px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.ld-inline-edit:focus {
  border-color: var(--room, #9b8ce8);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--room-soft, #e4dffd) 80%, transparent);
}
</style>
