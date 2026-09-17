/**
 * 主站应用入口：
 * 1. 创建 Vue 应用并注册 Pinia（状态管理）、Vue Router（路由）、Ant Design Vue（组件库）
 * 2. 注册 v-permission 自定义指令（按角色控制元素显隐）
 * 3. `import '@/access'` 触发全局路由守卫注册（登录/权限/模块门控）
 * 4. 挂载到 #app
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { permissionDirective } from '@/directives/permission'

import App from './App.vue'
import router from './router'

import Antd from 'ant-design-vue'

// 全局样式：antd 重置样式、站酷快乐体字体、基础样式与博客排版/外壳样式
import 'ant-design-vue/dist/reset.css'
import '@fontsource/zcool-kuaile'
import '@/assets/base.css'
import '@/assets/blog-prose.css'
import '@/assets/blog-shell.css'
// 副作用导入：注册全局路由守卫（权限校验、模块门控、会话恢复）
import '@/access'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Antd)

// v-permission 指令：无对应角色权限时移除该 DOM 元素
app.directive('permission', permissionDirective)

app.mount('#app')
