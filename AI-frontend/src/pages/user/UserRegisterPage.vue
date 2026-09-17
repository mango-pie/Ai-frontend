<script setup lang="ts">
/**
 * 用户注册页 - 路径：/user/register
 */
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { Lock, ShieldCheck, User, UserPlus } from 'lucide-vue-next'
import { userRegister } from '@/api/userController.ts'
import { siteConfig } from '@/config/site'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'

const router = useRouter()

const formState = reactive<API.UserRegisterRequest>({
  userAccount: '',
  userPassword: '',
  checkPassword: '',
})

const validateCheckPassword = async (_rule: unknown, value: string) => {
  if (!value) return Promise.resolve()
  if (value !== formState.userPassword) return Promise.reject(new Error('两次输入的密码不一致'))
  return Promise.resolve()
}

const handleSubmit = async (values: API.UserRegisterRequest) => {
  const res = await userRegister(values)
  if (res.data.code === 0 && res.data.data) {
    message.success('注册成功，请登录')
    router.push({
      path: '/user/login',
      replace: true,
    })
  } else {
    message.error('注册失败，' + res.data.message)
  }
}
</script>

<template>
  <StationRoomShell brand-path="/" room="auth" escape-to="/">
    <div class="auth-stage">
      <div class="auth-welcome">
        <p class="auth-kana">{{ siteConfig.brandKana }}</p>
        <h1 class="font-display">加入小站</h1>
        <p>创建账号后即可写日记、做实验、继续未完的对话。</p>
      </div>
      <div id="userRegisterPage" class="auth-card station-glass">
        <span class="auth-card__tape font-display" aria-hidden="true">Station · 登记</span>
        <h2 class="title font-display">{{ siteConfig.siteName }} · 注册</h2>
        <p class="desc">账号至少 4 位，密码至少 8 位</p>
        <a-form :model="formState" name="register" autocomplete="off" @finish="handleSubmit">
          <a-form-item
            name="userAccount"
            :rules="[
              { required: true, message: '请输入账号' },
              { min: 4, message: '账号不能小于 4 位' },
            ]"
          >
            <a-input v-model:value="formState.userAccount" placeholder="请输入账号" size="large">
              <template #prefix><User :size="16" class="field-prefix-icon" /></template>
            </a-input>
          </a-form-item>
          <a-form-item
            name="userPassword"
            :rules="[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码不能小于 8 位' },
            ]"
          >
            <a-input-password v-model:value="formState.userPassword" placeholder="请输入密码" size="large">
              <template #prefix><Lock :size="16" class="field-prefix-icon" /></template>
            </a-input-password>
          </a-form-item>
          <a-form-item
            name="checkPassword"
            :rules="[{ required: true, message: '请再次输入密码' }, { validator: validateCheckPassword }]"
          >
            <a-input-password v-model:value="formState.checkPassword" placeholder="确认密码" size="large">
              <template #prefix><ShieldCheck :size="16" class="field-prefix-icon" /></template>
            </a-input-password>
          </a-form-item>
          <div class="tips">
            已有账号？
            <RouterLink to="/user/login">去登录</RouterLink>
          </div>
          <a-form-item>
            <a-button type="primary" html-type="submit">
              <template #icon><UserPlus :size="16" /></template>
              注册
            </a-button>
          </a-form-item>
        </a-form>
      </div>
    </div>
  </StationRoomShell>
</template>

<style scoped>
.field-prefix-icon {
  color: var(--ink-faint);
}
</style>
