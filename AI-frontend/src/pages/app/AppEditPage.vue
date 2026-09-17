<script setup lang="ts">
/**
 * 应用信息修改页 - /app/edit/:appId
 * 普通用户：只读字段展示 + 可编辑应用名称 + 应用信息表格
 * 管理员：额外可编辑封面URL + 优先级
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { Save, RotateCcw, MessagesSquare } from 'lucide-vue-next'
import IconAction from '@/components/ui/IconAction.vue'
import { getAppById, getAppByIdByAdmin, updateApp, updateAppByAdmin } from '@/api/appController'
import { useLoginUserStore } from '@/stores/loginUser'
import { isAdminRole } from '@/config/permission'
import { loadAppSettings, resolveDeployBaseUrl, type AppUxSettings } from '@/utils/appSettings'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'

const route = useRoute()
const router = useRouter()
const loginUserStore = useLoginUserStore()
const appId = Number(route.params.appId) || 0

const appInfo = ref<API.AppVO | null>(null)
const loading = ref(false)
const submitting = ref(false)
const appUx = ref<AppUxSettings>({
  codegenEnabled: true,
  defaultCodeGenType: 'html',
  deployEnabled: true,
  publicHostDisplay: '',
})

/** 是否管理员：决定拉取 / 更新走哪套接口，以及可编辑字段范围 */
const isAdmin = computed(() => isAdminRole(loginUserStore.loginUser.userRole))

const form = ref({
  appName: '',
  cover: '',
  priority: 0,
})

/** 拉取应用详情：管理员走 admin 接口；普通用户访问他人应用时跳回首页 */
const fetchApp = async () => {
  loading.value = true
  try {
    const res = isAdmin.value
      ? await getAppByIdByAdmin({ id: appId })
      : await getAppById({ id: appId })
    if (res.data.code === 0 && res.data.data) {
      appInfo.value = res.data.data
      if (!isAdmin.value && res.data.data.userId !== loginUserStore.loginUser.id) {
        message.error('无权编辑该应用')
        router.push('/')
        return
      }
      form.value.appName = res.data.data.appName ?? ''
      form.value.cover = res.data.data.cover ?? ''
      form.value.priority = res.data.data.priority ?? 0
    } else {
      message.error('获取应用信息失败')
      router.push('/')
    }
  } finally {
    loading.value = false
  }
}

/** 放弃未保存的修改，恢复为最近拉取到的应用信息 */
const handleReset = () => {
  form.value.appName = appInfo.value?.appName ?? ''
  form.value.cover = appInfo.value?.cover ?? ''
  form.value.priority = appInfo.value?.priority ?? 0
}

/** 保存修改：管理员额外提交封面与优先级字段 */
const handleSubmit = async () => {
  if (!form.value.appName?.trim()) {
    message.warning('请输入应用名称')
    return
  }
  submitting.value = true
  try {
    const payload: API.AppUpdateRequest = { id: appId, appName: form.value.appName.trim() }
    if (isAdmin.value) {
      payload.cover = form.value.cover?.trim() || undefined
      payload.priority = form.value.priority
    }
    const res = isAdmin.value ? await updateAppByAdmin(payload) : await updateApp(payload)
    if (res.data.code === 0 && res.data.data) {
      message.success('修改成功')
      await fetchApp()
    } else {
      message.error('修改失败：' + res.data.message)
    }
  } finally {
    submitting.value = false
  }
}

const goToChat = () => router.push(`/app/chat/${appId}`)

/** 部署后的访问地址（站点设置根地址 + deployKey），未部署返回空串 */
const deployUrl = computed(() => {
  const key = appInfo.value?.deployKey
  if (!key) return ''
  const base = resolveDeployBaseUrl(appUx.value, import.meta.env.VITE_DEPLOY_BASE_URL as string)
  return `${base}/${key.replace(/^\/+/, '')}/`
})

onMounted(async () => {
  appUx.value = await loadAppSettings()
  await fetchApp()
})
</script>

<template>
  <StationRoomShell brand-path="/lab" note-label="Lab · 实验档案" room="lab">
  <div class="edit-page">
    <a-spin :spinning="loading">
      <div class="edit-layout">
        <!-- 左侧：编辑表单 -->
        <a-card class="edit-card" title="编辑应用">
          <a-form layout="vertical" :model="form">
            <!-- 应用名称（所有人可编辑） -->
            <a-form-item label="应用名称">
              <a-input
                v-model:value="form.appName"
                placeholder="请输入应用名称"
                :maxlength="50"
                show-count
                allow-clear
              />
            </a-form-item>

            <!-- 只读字段 -->
            <a-form-item label="初始提示词">
              <a-textarea
                :value="appInfo?.initPrompt ?? '—'"
                :auto-size="{ minRows: 3, maxRows: 6 }"
                readonly
                class="readonly-field"
              />
            </a-form-item>

            <a-form-item label="生成类型">
              <a-input :value="appInfo?.codeGenType ?? '—'" readonly class="readonly-field" />
            </a-form-item>

            <a-form-item label="部署密钥">
              <a-input :value="appInfo?.deployKey ?? '未部署'" readonly class="readonly-field" />
            </a-form-item>

            <!-- 管理员专属字段 -->
            <template v-if="isAdmin">
              <a-form-item label="封面图片 URL">
                <a-input v-model:value="form.cover" placeholder="请输入封面图片地址" allow-clear />
                <img v-if="form.cover" :src="form.cover" class="cover-preview" alt="封面预览" />
              </a-form-item>
              <a-form-item label="优先级（99 = 精选）">
                <a-input-number
                  v-model:value="form.priority"
                  :min="0"
                  :max="999"
                  style="width: 100%"
                />
              </a-form-item>
            </template>

            <!-- 操作按钮 -->
            <a-form-item>
              <a-space>
                <IconAction :icon="Save" label="保存修改" variant="primary" motion="pop" :loading="submitting" @click="handleSubmit" />
                <IconAction :icon="RotateCcw" label="重置" variant="soft" motion="spin" @click="handleReset" />
                <IconAction :icon="MessagesSquare" label="进入对话" variant="soft" motion="pop" @click="goToChat" />
              </a-space>
            </a-form-item>
          </a-form>
        </a-card>

        <!-- 右侧：应用信息 -->
        <a-card class="info-card" title="应用信息">
          <a-descriptions :column="1" bordered size="small">
            <a-descriptions-item label="应用 ID">
              {{ appInfo?.id ?? '—' }}
            </a-descriptions-item>
            <a-descriptions-item label="创建者">
              {{ appInfo?.user?.userName ?? appInfo?.userId ?? '—' }}
            </a-descriptions-item>
            <a-descriptions-item label="创建时间">
              {{ appInfo?.createTime ?? '—' }}
            </a-descriptions-item>
            <a-descriptions-item label="更新时间">
              {{ appInfo?.updateTime ?? '—' }}
            </a-descriptions-item>
            <a-descriptions-item label="部署时间">
              {{ appInfo?.deployedTime ?? '未部署' }}
            </a-descriptions-item>
            <a-descriptions-item label="访问链接">
              <a v-if="deployUrl" :href="deployUrl" target="_blank">{{ deployUrl }}</a>
              <span v-else>未部署</span>
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </div>
    </a-spin>
  </div>
  </StationRoomShell>
</template>

<style scoped>
/* 页面布局 */
.edit-page {
  padding: 32px 24px;
  min-height: calc(100vh - 64px);
  background: transparent;
}

.edit-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  max-width: 1000px;
  margin: 0 auto;
}

.edit-card {
  flex: 1;
  min-width: 0;
}

.info-card {
  width: 340px;
  flex-shrink: 0;
}

/* 深度覆盖 antd 卡片 / 表单控件配色，贴合站点主题 */
.edit-layout :deep(.ant-card) {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.edit-layout :deep(.ant-card-head),
.edit-layout :deep(.ant-card-body),
.edit-layout :deep(.ant-descriptions-view),
.edit-layout :deep(.ant-descriptions-row > th),
.edit-layout :deep(.ant-descriptions-row > td) {
  background: transparent !important;
  border-color: var(--color-border) !important;
  color: var(--color-text-primary) !important;
}

.edit-layout :deep(.ant-input),
.edit-layout :deep(.ant-input-number),
.edit-layout :deep(.ant-input-affix-wrapper),
.edit-layout :deep(.ant-input-textarea textarea) {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

/* 只读字段与封面预览 */
.readonly-field {
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-secondary);
  cursor: default;
}

.cover-preview {
  margin-top: 8px;
  max-width: 100%;
  max-height: 160px;
  border-radius: 8px;
  display: block;
}
</style>
