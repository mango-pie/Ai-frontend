<script setup lang="ts">
/**
 * 旧版简易对话页（兼容跳转页）
 * 旧路由 /app/chat 的入口已升级：挂载后立即按是否携带会话 id
 * 重定向到新版对话页（/chat/{id} 或 /chat?new=1），本页仅短暂显示跳转提示。
 */
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 跳转兼容：有 conversationId 则进入对应会话，否则新建会话
onMounted(() => {
  const conversationId = route.params.conversationId
  if (conversationId) {
    router.replace(`/chat/${conversationId}`)
  } else {
    router.replace('/chat?new=1')
  }
})
</script>

<template>
  <div class="simple-chat-page">
    <a-empty description="页面已升级，正在跳转到新版对话页..." />
  </div>
</template>

<style scoped>
.simple-chat-page {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>