/**
 * 前端路由配置
 * - 公开页：首页、登录、注册、关于
 * - 需登录：个人信息 /user/profile（在 src/config/permission.ts 的 ROUTE_PERMISSIONS 中配置）
 * - 需管理员：/admin/*（同上或按路径前缀默认）
 * - 模块门控：业务页通过 meta.requireModule 对齐 GET /app/modules；关闭时由 access 守卫转到 /module-unavailable
 * 具体鉴权逻辑在 src/access.ts 与 src/config/permission.ts 中统一处理
 */
import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'
import UserRegisterPage from '@/pages/user/UserRegisterPage.vue'
import UserLoginPage from '@/pages/user/UserLoginPage.vue'
import UserProfilePage from '@/pages/user/UserProfilePage.vue'
import UserManagerPage from '@/pages/admin/UserManagerPage.vue'
import AppManagerPage from '@/pages/admin/AppManagerPage.vue'
import ChatHistoryManagerPage from '@/pages/admin/ChatHistoryManagerPage.vue'
import BlogManagePage from '@/pages/admin/BlogManagePage.vue'
import AppChatPage from '@/pages/app/AppChatPage.vue'
import AppEditPage from '@/pages/app/AppEditPage.vue'
import ChatHomePage from '@/pages/chat/ChatHomePage.vue'
import ChatPage from '@/pages/chat/ChatPage.vue'
 import AboutView from '@/pages/AboutView.vue'
import StudyView from '@/pages/admin/StudyView.vue'
import TestView from '@/examples/PermissionExample.vue'
import BlogHomePage from '@/pages/blog/BlogHomePage.vue'
import BlogPostPage from '@/pages/blog/BlogPostPage.vue'
import BlogCategoryPage from '@/pages/blog/BlogCategoryPage.vue'
import BlogTagPage from '@/pages/blog/BlogTagPage.vue'
import BlogCreatePage from '@/pages/blog/BlogCreatePage.vue'
import LabPage from '@/pages/lab/LabPage.vue'
import DiaryHomePage from '@/pages/diary/DiaryHomePage.vue'
import DiaryWritePage from '@/pages/diary/DiaryWritePage.vue'
import DiaryDetailPage from '@/pages/diary/DiaryDetailPage.vue'
import ModuleUnavailablePage from '@/pages/ModuleUnavailablePage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: '主页', component: HomePage },
    { path: '/lab', name: '实验室', component: LabPage, meta: { requireModule: 'app-lab' } },
    { path: '/blog', name: '博客首页', component: BlogHomePage, meta: { requireModule: 'blog' } },
    { path: '/blog/create', name: '发布文章', component: BlogCreatePage, meta: { requireModule: 'blog' } },
    { path: '/blog/edit/:id', name: '编辑文章', component: BlogCreatePage, meta: { requireModule: 'blog' } },
    { path: '/blog/:id', name: '博客文章', component: BlogPostPage, meta: { requireModule: 'blog' } },
    { path: '/diary', name: '日记首页', component: DiaryHomePage, meta: { requireModule: 'diary' } },
    { path: '/diary/write', name: '写日记', component: DiaryWritePage, meta: { requireModule: 'diary' } },
    { path: '/diary/:id', name: '日记详情', component: DiaryDetailPage, meta: { requireModule: 'diary' } },
    { path: '/category/:name', name: '分类文章', component: BlogCategoryPage, meta: { requireModule: 'blog' } },
    { path: '/tag/:name', name: '标签文章', component: BlogTagPage, meta: { requireModule: 'blog' } },
    { path: '/user/login', name: '用户登录', component: UserLoginPage },
    { path: '/user/register', name: '用户注册', component: UserRegisterPage },
    { path: '/user/profile', name: '个人信息', component: UserProfilePage },
    { path: '/admin/userManage', name: '用户管理', component: UserManagerPage },
    { path: '/admin/appManage', name: '应用管理', component: AppManagerPage, meta: { requireModule: 'app-lab' } },
    { path: '/admin/blogManage', name: '博客管理', component: BlogManagePage, meta: { requireModule: 'blog' } },
    { path: '/admin/chatHistoryManage', name: '对话管理', component: ChatHistoryManagerPage, meta: { requireModule: 'app-lab' } },
    { path: '/app/chat/:appId', name: '应用对话', component: AppChatPage, meta: { requireModule: 'app-lab' } },
    { path: '/app/edit/:appId', name: '编辑应用', component: AppEditPage, meta: { requireModule: 'app-lab' } },
    { path: '/about', name: '关于', component: AboutView },
    { path: '/administrator/study', name: '学习', component: StudyView, meta: { requireModule: 'study' } },
    { path: '/test', name: '测试', component: TestView },
    { path: '/chat', name: '对话首页', component: ChatHomePage, meta: { requireModule: 'chat' } },
    { path: '/chat/:conversationId', name: '对话页面', component: ChatPage, meta: { keepAlive: true, requireModule: 'chat' } },
    { path: '/module-unavailable', name: '模块未启用', component: ModuleUnavailablePage },
  ],
})

export default router
