<script setup lang="ts">
/**
 * 实验室页主栏的「试剂调配单」：一句话提示词创建应用
 * - 读取站点设置决定可用性：应用生成关闭时降级为提示条
 * - 由 LabPage 引用，右栏「灵感试纸」通过 ref 调 setPrompt 注入提示词
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { Send } from 'lucide-vue-next'
import { addApp } from '@/api/appController'
import { useLoginUserStore } from '@/stores/loginUser'
import { siteConfig } from '@/config/site'
import { loadAppSettings, type AppUxSettings } from '@/utils/appSettings'
import IconAction from '@/components/ui/IconAction.vue'

// 路由与登录态：创建应用前需要判断登录并支持 ?prompt= 直达
const route = useRoute()
const router = useRouter()
const loginUserStore = useLoginUserStore()
// 提示词输入与提交中的 loading 态
const initPrompt = ref('')
const creating = ref(false)
// 站点级 UX 开关：先按放行默认值渲染，onMounted 后以服务端配置为准
const appUx = ref<AppUxSettings>({
  codegenEnabled: true,
  defaultCodeGenType: 'html',
  deployEnabled: true,
  publicHostDisplay: '',
})

/** 创建应用：通过开关 / 提示词 / 登录态三道前置校验后调 addApp，成功跳转对话页并回传初始提示词 */
const handleCreate = async () => {
  if (!appUx.value.codegenEnabled) {
    message.warning('应用生成已在站点设置中关闭')
    return
  }
  if (!initPrompt.value.trim()) {
    message.warning('请输入提示词')
    return
  }
  if (!loginUserStore.loginUser.id) {
    message.warning('请先登录')
    router.push('/user/login')
    return
  }
  creating.value = true
  try {
    const res = await addApp({
      initPrompt: initPrompt.value.trim(),
      // 应用名默认截取提示词前 20 字
      appName: initPrompt.value.trim().slice(0, 20),
      codeGenType: appUx.value.defaultCodeGenType || 'html',
    })
    if (res.data.code === 0 && res.data.data) {
      router.push('/app/chat/' + res.data.data + '?initPrompt=' + encodeURIComponent(initPrompt.value.trim()))
    } else {
      message.error('创建失败，' + res.data.message)
    }
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  // 拉取站点设置；支持 ?prompt= 预填提示词（供其他入口带参直达）
  appUx.value = await loadAppSettings()
  const q = route.query.prompt
  if (typeof q === 'string' && q.trim()) {
    initPrompt.value = q.trim()
  }
})

/** 供实验室页右栏「灵感试纸」注入提示词 */
function setPrompt(value: string) {
  initPrompt.value = value
}

// 暴露给父组件 LabPage，用于注入灵感提示词
defineExpose({ setPrompt })
</script>

<template>
  <div class="lab-create">
    <!-- 生成开关二态：关闭时显示警示条，开启时显示提示词输入卡片 -->
    <a-alert
      v-if="!appUx.codegenEnabled"
      type="warning"
      show-icon
      style="margin-bottom: 16px"
      message="应用生成已关闭。管理员可在「站点设置 → 应用生成」中重新开启。"
    />
    <div v-else class="lab-create__input-wrap">
      <a-textarea
        v-model:value="initPrompt"
        :placeholder="siteConfig.heroLabPlaceholder"
        :auto-size="{ minRows: 5, maxRows: 10 }"
        class="lab-create__textarea"
        @keydown.enter.exact.prevent="handleCreate"
      />
      <div class="lab-create__footer">
        <IconAction
          :icon="Send"
          label="开始生成"
          variant="primary"
          size="lg"
          motion="send"
          :loading="creating"
          @click="handleCreate"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 输入卡片：聚焦时以房间主题色描边并浮起 */
.lab-create__input-wrap {
  background: rgba(255, 255, 255, 0.72);
  border-radius: 20px;
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  padding: 20px;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.lab-create__input-wrap:focus-within {
  border-color: color-mix(in srgb, var(--room, #c79ae0) 45%, white);
  box-shadow: 0 8px 28px rgba(96, 116, 168, 0.14);
}

/* 文本域：去掉 antd 默认边框/阴影，融入卡片背景 */
.lab-create__textarea {
  border: none !important;
  box-shadow: none !important;
  resize: none;
  font-size: 16px;
  padding: 0;
  background: transparent !important;
  color: var(--ink, #4c5570) !important;
}

.lab-create__textarea::placeholder {
  color: var(--ink-faint, #a5acc4);
}

/* 底部操作区：右对齐的生成按钮 */
.lab-create__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* 快捷标签样式（模板暂未挂载，保留备用） */
.lab-create__quick-tags {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.lab-create__quick-label {
  font-size: 13px;
  color: var(--ink-faint, #a5acc4);
}

.lab-create__quick-tag {
  cursor: pointer;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.95);
  color: var(--ink-soft, #7a83a0);
}

.lab-create__quick-tag:hover {
  border-color: color-mix(in srgb, var(--room, #c79ae0) 40%, white);
  color: var(--ink, #4c5570);
}
</style>
