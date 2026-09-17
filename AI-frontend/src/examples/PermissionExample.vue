<!--
  权限组件使用示例
  展示三种权限控制方式的用法
-->
<script setup lang="ts">
/**
 * 权限控制示例页：演示 PermissionWrapper 组件、v-permission 指令、
 * 工具函数 + v-if 三种权限控制方式的用法
 */
import { computed } from 'vue'
import PermissionWrapper from '@/components/PermissionWrapper.vue'
import { useLoginUserStore } from '@/stores/loginUser'
import {
  hasPermission,
  isAdmin,
  isSuperAdmin,
  isLoggedIn,
  checkCustomPermission,
} from '@/utils/permission'

const loginUserStore = useLoginUserStore()
// 当前登录用户信息与 id，供页面展示和自定义权限判断使用
const loginUser = computed(() => loginUserStore.loginUser)
const currentUserId = computed(() => loginUser.value.id)
</script>
<template>
  <div class="permission-example">
    <h2>权限控制示例</h2>

    <!-- 方式1: 使用 PermissionWrapper 组件 -->
    <section>
      <h3>1. 使用 PermissionWrapper 组件</h3>

      <PermissionWrapper required="user">
        <div class="box">仅登录用户可见</div>
      </PermissionWrapper>

      <PermissionWrapper required="admin">
        <div class="box admin">仅管理员可见</div>
      </PermissionWrapper>

      <PermissionWrapper required="administrator">
        <div class="box super-admin">仅高级管理员可见</div>
      </PermissionWrapper>

      <PermissionWrapper :custom-check="(user) => user.userAccount === 'admin'">
        <div class="box custom">用户名为 admin 的用户可见</div>
      </PermissionWrapper>
    </section>

    <!-- 方式2: 使用 v-permission 指令 -->
    <section>
      <h3>2. 使用 v-permission 指令</h3>

      <button v-permission="'user'" class="btn">登录用户可见按钮</button>
      <button v-permission="'admin'" class="btn admin">管理员可见按钮</button>
      <button v-permission="'administrator'" class="btn super-admin">高级管理员可见按钮</button>
      <button v-permission="{ custom: (user: { id?: number }) => user.id && user.id > 100 }" class="btn custom">
        ID > 100 的用户可见
      </button>
    </section>

    <!-- 方式3: 使用工具函数 + v-if -->
    <section>
      <h3>3. 使用工具函数 + v-if</h3>

      <div v-if="isLoggedIn()" class="box">登录用户可见（v-if）</div>
      <div v-if="isAdmin()" class="box admin">管理员可见（v-if）</div>
      <div v-if="isSuperAdmin()" class="box super-admin">高级管理员可见（v-if）</div>
      <div v-if="hasPermission('user')" class="box">使用 hasPermission 检查</div>
      <div v-if="checkCustomPermission((user) => user.id === currentUserId)" class="box custom">
        自定义权限检查（v-if）
      </div>
    </section>

    <!-- 当前用户信息 -->
    <section>
      <h3>当前用户信息</h3>
      <pre>{{ JSON.stringify(loginUser, null, 2) }}</pre>
    </section>
  </div>
</template>



<style scoped>
/* ===== 页面布局与分区 ===== */
.permission-example {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

h2 {
  color: #333;
  margin-bottom: 20px;
}

h3 {
  color: #666;
  margin-bottom: 15px;
  font-size: 18px;
}

/* ===== 权限提示盒：按权限等级配色 ===== */
.box {
  padding: 15px;
  margin: 10px 0;
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
  border-radius: 4px;
}

.box.admin {
  background: #fff3e0;
  border-left-color: #ff9800;
}

.box.super-admin {
  background: #fce4ec;
  border-left-color: #e91e63;
}

.box.custom {
  background: #f3e5f5;
  border-left-color: #9c27b0;
}

/* ===== 权限按钮：按权限等级配色 ===== */
.btn {
  padding: 10px 20px;
  margin: 5px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #2196f3;
  color: white;
  font-size: 14px;
}

.btn.admin {
  background: #ff9800;
}

.btn.super-admin {
  background: #e91e63;
}

.btn.custom {
  background: #9c27b0;
}

.btn:hover {
  opacity: 0.9;
}

/* ===== 当前用户信息预览 ===== */
pre {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  overflow-x: auto;
}
</style>
