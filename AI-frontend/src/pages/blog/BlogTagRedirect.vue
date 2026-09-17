<script setup lang="ts">
/**
 * 博客标签名称跳转页
 * 职责：将旧式的 /blog/tag/:name 链接转换为统一的筛选页地址。
 * 做法：从标签云接口按名称匹配出标签 id，再 replace 到 /blog/filter 并携带标签 id；
 * 查不到（标签已删改）或接口异常时兜底跳到无筛选条件的 /blog/filter。
 */
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTagCloud } from '@/api/blogTagController'
import { buildFilterQuery } from '@/utils/blogFilterQuery'

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  // 路由参数里的中文标签名可能被编码，需先解码再匹配
  const name = decodeURIComponent(String(route.params.name || ''))
  try {
    // 拉取标签云，按名称找到对应 id，把“名称链接”翻译成“id 筛选”
    const res = await getTagCloud()
    const list = res.data.data || []
    const hit = list.find((t) => t.name === name)
    if (hit?.id) {
      await router.replace({ path: '/blog/filter', query: buildFilterQuery([], [hit.id]) })
      return
    }
  } catch {
    /* fall through */
  }
  // 匹配失败或请求出错时，兜底跳转到不带标签条件的筛选页
  await router.replace('/blog/filter')
})
</script>

<template>
  <div style="padding: 48px; text-align: center; color: #888">正在跳转筛选…</div>
</template>
