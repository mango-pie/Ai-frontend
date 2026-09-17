<script setup lang="ts">
/**
 * 个人信息页 - 路径：/user/profile，可从顶栏头像下拉“个人信息”进入
 * 已登录：展示头像、昵称、账号、角色、简介、创建时间；支持编辑昵称/头像/简介，退出登录
 * 未登录：展示 403 结果与“去登录/去注册”按钮
 */
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { Pencil, LogOut, Save, X, LogIn, UserPlus, Copy, Plus, Trash2 } from 'lucide-vue-next'
import IconAction from '@/components/ui/IconAction.vue'
import { useLoginUserStore } from '@/stores/loginUser'
import { userLogout, updateUser } from '@/api/userController'
import { bindPetDevice, listPetDevices, revokePetDevice } from '@/api/petDeviceController'

const router = useRouter()
const loginUserStore = useLoginUserStore()

// 已绑定的 EchoBot 桌宠设备列表（含已撤销项）
const petDevices = ref<API.PetDeviceVO[]>([])
const petLoading = ref(false)
// 最近一次绑定返回的明文 Token：服务端不再二次下发，仅当前会话内可复制
const lastBoundToken = ref('')

/** 拉取设备列表；云端服务未部署时静默保持空态 */
async function loadPetDevices() {
  if (!loginUserStore.loginUser?.id) return
  petLoading.value = true
  try {
    const res = await listPetDevices()
    if (res.data?.code === 0) {
      petDevices.value = res.data.data ?? []
    }
  } catch {
    // 云端设备服务未部署（404 已静默）：保持空态即可
    petDevices.value = []
  } finally {
    petLoading.value = false
  }
}

/** 绑定新设备：明文 Token 只在弹窗展示一次，引导用户立即写入 EchoBot 的 .env */
async function handleBindPet() {
  const res = await bindPetDevice({
    deviceName: 'EchoBot',
    clientInfo: navigator.userAgent.slice(0, 200),
  })
  if (res.data?.code !== 0 || !res.data.data?.token) {
    message.error(res.data?.message || '绑定失败')
    return
  }
  lastBoundToken.value = res.data.data.token
  Modal.success({
    title: '设备已绑定 — 请立即保存 Token',
    width: 560,
    content: `明文令牌只显示一次，写入 EchoBot 的 .env：\n\nSITE_API_BASE_URL=<你的网站>/api\nSITE_DEVICE_TOKEN=${res.data.data.token}`,
    okText: '已复制并关闭',
    async onOk() {
      try {
        await navigator.clipboard.writeText(res.data.data!.token!)
        message.success('Token 已复制')
      } catch {
        /* ignore */
      }
    },
  })
  await loadPetDevices()
}

/** 复制刚生成的 Token；历史设备的明文已不可再查 */
async function copyLastToken() {
  if (!lastBoundToken.value) {
    message.info('仅刚绑定的 token 可复制；历史设备无法再查看明文')
    return
  }
  await navigator.clipboard.writeText(lastBoundToken.value)
  message.success('已复制')
}

/** 撤销设备授权（二次确认），撤销后 EchoBot 需重新绑定 */
async function handleRevokePet(id?: number) {
  if (!id) return
  Modal.confirm({
    title: '撤销该设备？',
    content: '撤销后 EchoBot 将无法再调用云端接口，需重新绑定。',
    okText: '撤销',
    okType: 'danger',
    async onOk() {
      const res = await revokePetDevice({ id })
      if (res.data?.code === 0) {
        message.success('已撤销')
        await loadPetDevices()
      } else {
        message.error(res.data?.message || '撤销失败')
      }
    },
  })
}

// 进入页面时若 store 里还没有用户信息则拉取一次（例如直接访问 /user/profile）
onMounted(async () => {
  if (!loginUserStore.loginUser?.id) {
    await loginUserStore.fetchLoginUser()
  }
  if (loginUserStore.loginUser?.id) {
    await loadPetDevices()
  }
})

/** 是否已登录（有 id 即视为已登录） */
const isLogin = computed(() => Boolean(loginUserStore.loginUser?.id))

/** 是否处于编辑模式 */
const editing = ref(false)

/** 编辑表单（仅可修改的字段） */
const form = reactive<{ userName: string; userAvatar: string; userProfile: string }>({
  userName: '',
  userAvatar: '',
  userProfile: '',
})

/** 进入编辑：从当前用户填充表单 */
const startEdit = () => {
  const u = loginUserStore.loginUser
  form.userName = u?.userName ?? ''
  form.userAvatar = u?.userAvatar ?? ''
  form.userProfile = u?.userProfile ?? ''
  editing.value = true
}

/** 取消编辑 */
const cancelEdit = () => {
  editing.value = false
}

/** 保存修改 */
const saveProfile = async () => {
  const id = loginUserStore.loginUser?.id
  if (!id) return
  const res = await updateUser({
    id,
    userName: form.userName.trim() || undefined,
    userAvatar: form.userAvatar.trim() || undefined,
    userProfile: form.userProfile.trim() || undefined,
  })
  if (res.data?.code === 0 && res.data?.data) {
    message.success('保存成功')
    await loginUserStore.fetchLoginUser()
    editing.value = false
  } else {
    message.error('保存失败，' + (res.data?.message ?? '请稍后重试'))
  }
}

const handleGoLogin = () => router.push('/user/login')
const handleGoRegister = () => router.push('/user/register')

/** 角色徽章文案 */
const roleLabel = (role?: string) =>
  role === 'administrator' ? '管理人' : role === 'admin' ? '管理员' : '站员'

/** 创建时间格式化为中文日期（原接口返回 ISO 串） */
const formatDate = (v?: string) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 退出登录：调用接口后清空 store 并跳转登录页 */
const handleLogout = async () => {
  const res = await userLogout()
  if (res.data.code === 0 && res.data.data) {
    loginUserStore.setLoginUser({ userName: '未登录' })
    message.success('已退出登录')
    router.push({
      path: '/user/login',
      replace: true,
    })
  } else {
    message.error('退出失败，' + res.data.message)
  }
}
</script>

<template>
  <StationRoomShell brand-path="/" note-label="Station · 站员证" room="profile">
  <div class="profile-page">
    <a-card title="个人信息" :bordered="false" class="profile-card">
      <!-- 已登录：站员证 + 设备架 -->
      <template v-if="isLogin">
        <a-space direction="vertical" size="middle" style="width: 100%">
          <!-- 查看模式 -->
          <template v-if="!editing">
            <section class="staff-pass">
              <span class="staff-pass__punch" aria-hidden="true" />
              <a-avatar :size="84" :src="loginUserStore.loginUser.userAvatar" class="staff-pass__avatar">
                {{ (loginUserStore.loginUser.userName || loginUserStore.loginUser.userAccount || '?').slice(0, 1) }}
              </a-avatar>
              <div class="staff-pass__main">
                <div class="staff-pass__name font-display">{{ loginUserStore.loginUser.userName ?? '无名' }}</div>
                <div class="staff-pass__account">账号 · {{ loginUserStore.loginUser.userAccount ?? '-' }}</div>
                <p v-if="loginUserStore.loginUser.userProfile" class="staff-pass__bio">
                  {{ loginUserStore.loginUser.userProfile }}
                </p>
                <div class="staff-pass__row">
                  <span class="role-badge" :data-role="loginUserStore.loginUser.userRole ?? 'user'">
                    {{ roleLabel(loginUserStore.loginUser.userRole) }}
                  </span>
                  <span class="staff-pass__date">入站于 {{ formatDate(loginUserStore.loginUser.createTime) }}</span>
                </div>
              </div>
              <div class="staff-pass__actions">
                <IconAction :icon="Pencil" label="修改信息" variant="primary" motion="pop" @click="startEdit" />
                <IconAction :icon="LogOut" label="退出登录" variant="danger" motion="slide" @click="handleLogout" />
              </div>
            </section>

            <div class="pet-bind">
              <div class="pet-bind-head">
                <strong>EchoBot 桌宠云端绑定</strong>
                <span>本地桌宠用 Device Token 调网站日记 / 聊天，与网页宠物无关。</span>
              </div>
              <a-space style="margin-bottom: 12px">
                <IconAction :icon="Plus" label="绑定新设备" variant="primary" motion="pop" @click="handleBindPet" />
                <IconAction
                  v-if="lastBoundToken"
                  :icon="Copy"
                  label="复制刚生成的 Token"
                  variant="soft"
                  @click="copyLastToken"
                />
              </a-space>
              <a-spin :spinning="petLoading">
                <p v-if="!petDevices.length" class="pet-empty">还没有设备登车 —— 绑定后 EchoBot 即可代你写日记、聊天。</p>
                <div v-else class="pet-shelf">
                  <div
                    v-for="item in petDevices"
                    :key="item.id"
                    class="pet-card"
                    :class="{ 'is-revoked': item.revoked }"
                  >
                    <span class="pet-card__name">{{ item.deviceName || 'EchoBot' }}</span>
                    <span class="pet-card__meta">
                      {{ item.tokenPrefix || '' }}… · {{ item.revoked ? '已撤销' : '有效' }}
                    </span>
                    <span class="pet-card__time">{{ formatDate(item.createdTime) }}</span>
                    <button
                      v-if="!item.revoked"
                      class="pet-card__revoke"
                      type="button"
                      @click="handleRevokePet(item.id)"
                    >
                      <Trash2 :size="12" /> 撤销
                    </button>
                  </div>
                </div>
              </a-spin>
            </div>
          </template>

          <!-- 编辑模式 -->
          <template v-else>
            <a-form layout="vertical" style="max-width: 480px">
              <a-form-item label="用户名">
                <a-input v-model:value="form.userName" placeholder="请输入用户名" allow-clear />
              </a-form-item>
              <a-form-item label="头像地址">
                <a-input v-model:value="form.userAvatar" placeholder="请输入头像图片 URL" allow-clear />
                <template v-if="form.userAvatar">
                  <a-avatar :size="48" :src="form.userAvatar" class="profile-edit-avatar" />
                </template>
              </a-form-item>
              <a-form-item label="个人简介">
                <a-textarea
                  v-model:value="form.userProfile"
                  placeholder="请输入个人简介"
                  :rows="4"
                  allow-clear
                />
              </a-form-item>
              <a-space>
                <IconAction :icon="Save" label="保存" variant="primary" motion="pop" @click="saveProfile" />
                <IconAction :icon="X" label="取消" variant="soft" @click="cancelEdit" />
              </a-space>
            </a-form>
          </template>
        </a-space>
      </template>

      <!-- 未登录：提示并引导去登录/注册 -->
      <template v-else>
        <a-result status="403" title="未登录" sub-title="登录后即可查看个人信息。">
          <template #extra>
            <a-space>
              <IconAction :icon="LogIn" label="去登录" variant="primary" motion="pop" @click="handleGoLogin" />
              <IconAction :icon="UserPlus" label="去注册" variant="soft" motion="pop" @click="handleGoRegister" />
            </a-space>
          </template>
        </a-result>
      </template>
    </a-card>
  </div>
  </StationRoomShell>
</template>

<style scoped>
.profile-page {
  max-width: 880px;
  margin: 0 auto;
}

.profile-card {
  border-radius: var(--radius-lg);
}

.profile-card :deep(.ant-card) {
  background: transparent;
}

/* 覆盖 antd 组件默认样式，适配站点卡片/深色主题 */
.profile-card :deep(.ant-card-head),
.profile-card :deep(.ant-card-body),
.profile-card :deep(.ant-descriptions-view),
.profile-card :deep(.ant-descriptions-row > th),
.profile-card :deep(.ant-descriptions-row > td) {
  background: var(--color-bg-card) !important;
  border-color: var(--color-border) !important;
  color: var(--color-text-primary) !important;
}

.profile-card :deep(.ant-input),
.profile-card :deep(.ant-input-affix-wrapper),
.profile-card :deep(.ant-input-textarea textarea) {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.profile-account {
  color: var(--color-text-muted);
  font-size: 13px;
}

.profile-edit-avatar {
  display: block;
  margin-top: 8px;
  border-radius: 8px;
}

/* ── 站员证 ── */
.staff-pass {
  position: relative;
  display: flex;
  gap: 20px;
  align-items: flex-start;
  padding: 22px 24px;
  border-radius: 20px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
}
.staff-pass__punch {
  position: absolute;
  top: 14px;
  right: 22px;
  width: 64px;
  height: 16px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--color-primary, #9b8ce8) 30%, #fff);
  opacity: 0.7;
  transform: rotate(4deg);
}
.staff-pass__avatar {
  flex-shrink: 0;
  font-family: 'ZCOOL KuaiLe', 'PingFang SC', sans-serif;
  font-size: 30px;
  background: var(--gradient-primary);
  color: #fff;
}
.staff-pass__main {
  flex: 1;
  min-width: 0;
}
.staff-pass__name {
  font-size: 22px;
  color: var(--color-text-primary);
  line-height: 1.2;
}
.staff-pass__account {
  font-size: 12.5px;
  color: var(--color-text-muted);
  margin-top: 3px;
}
.staff-pass__bio {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.staff-pass__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.role-badge {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.role-badge[data-role='administrator'] {
  background: rgba(155, 140, 232, 0.16);
  border-color: rgba(155, 140, 232, 0.5);
  color: #b3a7ef;
}
.role-badge[data-role='admin'] {
  background: rgba(240, 164, 94, 0.14);
  border-color: rgba(240, 164, 94, 0.5);
  color: #f0a45e;
}
.staff-pass__date {
  font-size: 12px;
  color: var(--color-text-muted);
}
.staff-pass__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

/* ── 设备架 ── */
.pet-empty {
  margin: 0;
  padding: 18px;
  font-size: 12.5px;
  color: var(--color-text-muted);
  border: 1.5px dashed var(--color-border);
  border-radius: 14px;
  text-align: center;
}
.pet-shelf {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.pet-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border-radius: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
}
.pet-card.is-revoked {
  opacity: 0.55;
}
.pet-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.pet-card__meta {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.pet-card__time {
  font-size: 11.5px;
  color: var(--color-text-muted);
}
.pet-card__revoke {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11.5px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.pet-card__revoke:hover {
  color: #e5697a;
  border-color: rgba(229, 105, 122, 0.5);
}

/* 桌宠绑定区标题 */
.pet-bind-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.pet-bind-head strong {
  font-size: 15px;
  color: var(--color-text-primary);
}
.pet-bind-head span {
  font-size: 12.5px;
  color: var(--color-text-muted);
}
</style>

