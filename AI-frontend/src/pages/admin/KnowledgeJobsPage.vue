<script setup lang="ts">
/**
 * 知识库任务页（旧路由兼容）：
 * 原独立的“任务进度”页面已合并进知识摄取工作台，
 * 访问本路由时立即重定向，保持旧链接可用。
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

/** 任务进度已并入工作台；本路由仅作兼容跳转 */
const router = useRouter()
onMounted(() => {
  router.replace('/admin/knowledge/ingest')
})
</script>

<template>
  <div class="jobs-redirect">正在进入工作台…</div>
</template>

<style scoped>
.jobs-redirect {
  padding: 48px 24px;
  text-align: center;
  color: #667;
  font-size: 14px;
}
</style>
