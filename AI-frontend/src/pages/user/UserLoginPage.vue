<script setup lang="ts">
/**
 * 用户登录页 - 路径：/user/login
 */
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LogIn, Lock, User } from 'lucide-vue-next'
import { useLoginUserStore } from '@/stores/loginUser.ts'
import { userLogin } from '@/api/userController.ts'
import { message } from 'ant-design-vue'
import { siteConfig } from '@/config/site'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'

const formState = reactive<API.UserLoginRequest>({
  userAccount: '',
  userPassword: '',
})
const router = useRouter()
const route = useRoute()
const loginUserStore = useLoginUserStore()

const handleSubmit = async (values: API.UserLoginRequest) => {
  try {
    const res = await userLogin(values)
    if (res.data.code === 0 && res.data.data) {
      await loginUserStore.fetchLoginUser()
      message.success('登录成功')
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
      await router.push(redirect.startsWith('/') ? redirect : '/')
    } else {
      message.error('登录失败，' + (res.data.message || '请检查账号密码'))
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string }
    message.error(err?.response?.data?.message || err?.message || '登录请求失败，请稍后重试')
  }
}
</script>

<template>
  <StationRoomShell brand-path="/" room="auth" escape-to="/">
    <div class="auth-stage">
      <div class="auth-welcome">
        <p class="auth-kana">{{ siteConfig.brandKana }}</p>
        <h1 class="font-display">欢迎回来</h1>
        <p>{{ siteConfig.siteSubtitle }}</p>
      </div>
      <div id="userLoginPage" class="auth-card station-glass">
        <span class="auth-card__tape font-display" aria-hidden="true">Station · 入站</span>
        <h2 class="title font-display">{{ siteConfig.siteName }} · 登录</h2>
        <p class="desc">用同一套导航走进日记、实验室和对话</p>
        <a-form :model="formState" name="basic" autocomplete="off" @finish="handleSubmit">
          <a-form-item name="userAccount" :rules="[{ required: true, message: '请输入账号' }]">
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
          <div class="tips">
            没有账号？
            <RouterLink to="/user/register">去注册</RouterLink>
          </div>
          <a-form-item>
            <a-button type="primary" html-type="submit">
              <template #icon><LogIn :size="16" /></template>
              登录
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
