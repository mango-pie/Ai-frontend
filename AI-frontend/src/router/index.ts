/**
 * 前端路由配置
 * meta.shell: public | workspace
 * meta.room: 房间标识（视觉 token）
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
import BlogFilterPage from '@/pages/blog/filter/BlogFilterPage.vue'
import BlogCategoryRedirect from '@/pages/blog/BlogCategoryRedirect.vue'
import BlogTagRedirect from '@/pages/blog/BlogTagRedirect.vue'
import WorkLogPage from '@/pages/worklog/WorkLogPage.vue'
import KnowledgeCreatePage from '@/pages/knowledge/KnowledgeCreatePage.vue'
import MusicPage from '@/pages/music/MusicPage.vue'
import ModuleUnavailablePage from '@/pages/ModuleUnavailablePage.vue'
import StudyView from '@/pages/admin/StudyView.vue'
import TestView from '@/examples/PermissionExample.vue'
import BlogHomePage from '@/pages/blog/home/BlogHomePage.vue'
import BlogPostPage from '@/pages/blog/post/BlogPostPage.vue'
import BlogCreatePage from '@/pages/blog/create/BlogCreatePage.vue'
import LabPage from '@/pages/lab/LabPage.vue'
import DiaryHomePage from '@/pages/diary/DiaryHomePage.vue'
import DiaryWritePage from '@/pages/diary/DiaryWritePage.vue'
import DiaryDetailPage from '@/pages/diary/DiaryDetailPage.vue'
import KnowledgeListPage from '@/pages/knowledge/KnowledgeListPage.vue'
import KnowledgeDetailPage from '@/pages/knowledge/KnowledgeDetailPage.vue'
import KnowledgeChatPage from '@/pages/knowledge/KnowledgeChatPage.vue'
import LibraryPage from '@/pages/library/LibraryPage.vue'
import KnowledgeIngestPage from '@/pages/admin/KnowledgeIngestPage.vue'
import KnowledgeNoteListPage from '@/pages/admin/KnowledgeNoteListPage.vue'
import KnowledgeNoteDetailPage from '@/pages/admin/KnowledgeNoteDetailPage.vue'
import LearningView from '@/components/learning/LearningView.vue'
import SiteSettingsPage from '@/pages/admin/SiteSettingsPage.vue'
import SiteSettingsAuditPage from '@/pages/admin/SiteSettingsAuditPage.vue'
import SiteSettingsHealthPage from '@/pages/admin/SiteSettingsHealthPage.vue'
import SiteModulesPage from '@/pages/admin/SiteModulesPage.vue'
import OpsUsagePage from '@/pages/admin/OpsUsagePage.vue'
import OpsLogsStreamPage from '@/pages/admin/OpsLogsStreamPage.vue'
import OpsAuditPage from '@/pages/admin/OpsAuditPage.vue'
import OpsStatsPage from '@/pages/admin/OpsStatsPage.vue'
import OpsAccessLogsPage from '@/pages/admin/OpsAccessLogsPage.vue'

// 两类页面外壳的 meta 预设：public 走门户外壳，workspace 走工作台外壳（App.vue 依据 meta.shell 切换）
const publicMeta = { shell: 'public' as const }
const workspaceMeta = { shell: 'workspace' as const }

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // ---------- 公开门户：主页 / 实验室 / 博客 / 音乐等 ----------

    { path: '/', name: '主页', component: HomePage, meta: { ...publicMeta, room: 'hall' } },
    { path: '/lab', name: '实验室', component: LabPage, meta: { ...publicMeta, room: 'lab', requireModule: 'app-lab' } },
    { path: '/blog', name: '博客首页', component: BlogHomePage, meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/create', name: '发布文章', component: BlogCreatePage, meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/edit/:id', name: '编辑文章', component: BlogCreatePage, meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/filter', name: '博客筛选', component: BlogFilterPage, meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/:id(\\d+)', name: '博客文章', component: BlogPostPage, meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/category/:name', name: '分类文章', component: BlogCategoryRedirect, meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/tag/:name', name: '标签文章', component: BlogTagRedirect, meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/about', name: '关于', component: AboutView, meta: { ...publicMeta, room: 'about' } },
    { path: '/music', name: '音乐播放器', component: MusicPage, meta: { ...publicMeta, room: 'music' } },
    { path: '/module-unavailable', name: '模块未启用', component: ModuleUnavailablePage },
    { path: '/user/login', name: '用户登录', component: UserLoginPage, meta: { ...publicMeta, room: 'auth' } },
    { path: '/user/register', name: '用户注册', component: UserRegisterPage, meta: { ...publicMeta, room: 'auth' } },
    { path: '/test', name: '测试', component: TestView, meta: { ...publicMeta, room: 'public' } },

    // ---------- 功能模块：日记 / 工作日志 / 知识库 / 对话（均带 requireModule 门控） ----------

    { path: '/diary', name: '日记首页', component: DiaryHomePage, meta: { ...publicMeta, room: 'diary', requireModule: 'diary' } },
    { path: '/diary/write', name: '写日记', component: DiaryWritePage, meta: { ...publicMeta, room: 'diary', requireModule: 'diary' } },
    { path: '/diary/:id(\\d+)', name: '日记详情', component: DiaryDetailPage, meta: { ...publicMeta, room: 'diary', requireModule: 'diary' } },
    { path: '/worklog', name: '工作日志', component: WorkLogPage, meta: { ...publicMeta, room: 'worklog', requireModule: 'worklog' } },
    { path: '/knowledge', name: '知识库', component: KnowledgeListPage, meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/library', name: '资料库', component: LibraryPage, meta: { ...publicMeta, room: 'library', requireModule: 'library' } },
    { path: '/knowledge/create', name: '新建知识库', component: KnowledgeCreatePage, meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/knowledge/:kbId', name: '知识库详情', component: KnowledgeDetailPage, meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/knowledge/:kbId/chat', name: '知识库问答', component: KnowledgeChatPage, meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/user/profile', name: '个人信息', component: UserProfilePage, meta: { ...publicMeta, room: 'profile' } },
    { path: '/chat', name: '对话首页', component: ChatHomePage, meta: { ...publicMeta, room: 'chat', requireModule: 'chat' } },
    {
      path: '/chat/:conversationId',
      name: '对话页面',
      component: ChatPage,
      // keepAlive：对话页切走再回来时保留输入与滚动状态
      meta: { ...publicMeta, room: 'chat', keepAlive: true, requireModule: 'chat' },
    },
    { path: '/app/chat/:appId', name: '应用对话', component: AppChatPage, meta: { ...publicMeta, room: 'lab', requireModule: 'app-lab' } },
    { path: '/app/edit/:appId', name: '编辑应用', component: AppEditPage, meta: { ...publicMeta, room: 'lab', requireModule: 'app-lab' } },
    { path: '/administrator/study', name: '学习', component: StudyView, meta: { ...publicMeta, room: 'study', requireModule: 'study' } },

    // ---------- 管理后台：用户/应用/博客/知识库采集/站点设置/运维（角色权限由 access.ts 校验） ----------

    { path: '/admin/userManage', name: '用户管理', component: UserManagerPage, meta: { ...publicMeta, room: 'admin' } },
    { path: '/admin/appManage', name: '应用管理', component: AppManagerPage, meta: { ...publicMeta, room: 'admin', requireModule: 'app-lab' } },
    { path: '/admin/blogManage', name: '博客管理', component: BlogManagePage, meta: { ...publicMeta, room: 'admin', requireModule: 'blog' } },
    { path: '/admin/knowledge', redirect: '/admin/knowledge/ingest' },
    { path: '/admin/knowledge/ingest', name: '内容采集', component: KnowledgeIngestPage, meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/knowledge/jobs', name: '精读任务', redirect: '/admin/knowledge/ingest' },
    { path: '/admin/knowledge/notes', name: '我的文章', component: KnowledgeNoteListPage, meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/knowledge/notes/:noteId', name: '审阅文章', component: KnowledgeNoteDetailPage, meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/knowledge/learning', name: '领域知识树', component: LearningView, meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/chatHistoryManage', name: '对话管理', component: ChatHistoryManagerPage, meta: { ...publicMeta, room: 'admin', requireModule: 'chat' } },
    { path: '/admin/settings', redirect: '/admin/settings/site' },
    { path: '/admin/settings/audit', name: '变更审计', component: SiteSettingsAuditPage, meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/settings/health', name: '依赖健康', component: SiteSettingsHealthPage, meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/settings/modules', name: '业务模块', component: SiteModulesPage, meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/settings/:module', name: '站点设置', component: SiteSettingsPage, meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/ops', redirect: '/admin/ops/usage' },
    { path: '/admin/ops/usage', name: 'AI用量', component: OpsUsagePage, meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/logs', name: '实时日志', component: OpsLogsStreamPage, meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/audit', name: '操作审计', component: OpsAuditPage, meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/stats', name: '业务统计', component: OpsStatsPage, meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/access-logs', name: '访问日志', component: OpsAccessLogsPage, meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
  ],
})

export default router
