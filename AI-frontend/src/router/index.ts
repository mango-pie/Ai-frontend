/**
 * 前端路由配置
 * meta.shell: public | workspace
 * meta.room: 房间标识（视觉 token）
 * 页面组件一律懒加载（() => import(...)）：Vite 按路由自动分包，首屏只下载当前页所需代码
 */
import { createRouter, createWebHistory } from 'vue-router'

// 两类页面外壳的 meta 预设：public 走门户外壳，workspace 走工作台外壳（App.vue 依据 meta.shell 切换）
const publicMeta = { shell: 'public' as const }
const workspaceMeta = { shell: 'workspace' as const }

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // ---------- 公开门户：主页 / 实验室 / 博客 / 音乐等 ----------

    { path: '/', name: '主页', component: () => import('@/pages/HomePage.vue'), meta: { ...publicMeta, room: 'hall' } },
    { path: '/lab', name: '实验室', component: () => import('@/pages/lab/LabPage.vue'), meta: { ...publicMeta, room: 'lab', requireModule: 'app-lab' } },
    { path: '/blog', name: '博客首页', component: () => import('@/pages/blog/home/BlogHomePage.vue'), meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/create', name: '发布文章', component: () => import('@/pages/blog/create/BlogCreatePage.vue'), meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/edit/:id', name: '编辑文章', component: () => import('@/pages/blog/create/BlogCreatePage.vue'), meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/filter', name: '博客筛选', component: () => import('@/pages/blog/filter/BlogFilterPage.vue'), meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/blog/:id(\\d+)', name: '博客文章', component: () => import('@/pages/blog/post/BlogPostPage.vue'), meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/category/:name', name: '分类文章', component: () => import('@/pages/blog/BlogCategoryRedirect.vue'), meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/tag/:name', name: '标签文章', component: () => import('@/pages/blog/BlogTagRedirect.vue'), meta: { ...publicMeta, room: 'blog', requireModule: 'blog' } },
    { path: '/about', name: '关于', component: () => import('@/pages/AboutView.vue'), meta: { ...publicMeta, room: 'about' } },
    { path: '/music', name: '音乐播放器', component: () => import('@/pages/music/MusicPage.vue'), meta: { ...publicMeta, room: 'music' } },
    { path: '/games', name: '游戏舱', component: () => import('@/pages/games/GamesRoom.vue'), meta: { ...publicMeta, room: 'games', requireModule: 'games', keepAlive: true } },
    { path: '/module-unavailable', name: '模块未启用', component: () => import('@/pages/ModuleUnavailablePage.vue') },
    { path: '/user/login', name: '用户登录', component: () => import('@/pages/user/UserLoginPage.vue'), meta: { ...publicMeta, room: 'auth' } },
    { path: '/user/register', name: '用户注册', component: () => import('@/pages/user/UserRegisterPage.vue'), meta: { ...publicMeta, room: 'auth' } },
    { path: '/test', name: '测试', component: () => import('@/examples/PermissionExample.vue'), meta: { ...publicMeta, room: 'public' } },

    // ---------- 功能模块：日记 / 工作日志 / 知识库 / 对话（均带 requireModule 门控） ----------

    { path: '/diary', name: '日记首页', component: () => import('@/pages/diary/DiaryHomePage.vue'), meta: { ...publicMeta, room: 'diary', requireModule: 'diary' } },
    { path: '/diary/write', name: '写日记', component: () => import('@/pages/diary/DiaryWritePage.vue'), meta: { ...publicMeta, room: 'diary', requireModule: 'diary' } },
    { path: '/diary/:id(\\d+)', name: '日记详情', component: () => import('@/pages/diary/DiaryDetailPage.vue'), meta: { ...publicMeta, room: 'diary', requireModule: 'diary' } },
    { path: '/worklog', name: '工作日志', component: () => import('@/pages/worklog/WorkLogPage.vue'), meta: { ...publicMeta, room: 'worklog', requireModule: 'worklog' } },
    { path: '/knowledge', name: '知识库', component: () => import('@/pages/knowledge/KnowledgeListPage.vue'), meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/library', name: '资料库', component: () => import('@/pages/library/LibraryPage.vue'), meta: { ...publicMeta, room: 'library', requireModule: 'library' } },
    { path: '/knowledge/create', name: '新建知识库', component: () => import('@/pages/knowledge/KnowledgeCreatePage.vue'), meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/knowledge/:kbId', name: '知识库详情', component: () => import('@/pages/knowledge/KnowledgeDetailPage.vue'), meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/knowledge/:kbId/chat', name: '知识库问答', component: () => import('@/pages/knowledge/KnowledgeChatPage.vue'), meta: { ...publicMeta, room: 'knowledge', requireModule: 'knowledge' } },
    { path: '/user/profile', name: '个人信息', component: () => import('@/pages/user/UserProfilePage.vue'), meta: { ...publicMeta, room: 'profile' } },
    { path: '/chat', name: '对话首页', component: () => import('@/pages/chat/ChatHomePage.vue'), meta: { ...publicMeta, room: 'chat', requireModule: 'chat' } },
    {
      path: '/chat/:conversationId',
      name: '对话页面',
      component: () => import('@/pages/chat/ChatPage.vue'),
      // keepAlive：对话页切走再回来时保留输入与滚动状态
      meta: { ...publicMeta, room: 'chat', keepAlive: true, requireModule: 'chat' },
    },
    { path: '/app/chat/:appId', name: '应用对话', component: () => import('@/pages/app/AppChatPage.vue'), meta: { ...publicMeta, room: 'lab', requireModule: 'app-lab' } },
    { path: '/app/edit/:appId', name: '编辑应用', component: () => import('@/pages/app/AppEditPage.vue'), meta: { ...publicMeta, room: 'lab', requireModule: 'app-lab' } },
    { path: '/administrator/study', name: '学习', component: () => import('@/pages/admin/StudyView.vue'), meta: { ...publicMeta, room: 'study', requireModule: 'study' } },

    // ---------- 管理后台：用户/应用/博客/知识库采集/站点设置/运维（角色权限由 access.ts 校验） ----------

    { path: '/admin/userManage', name: '用户管理', component: () => import('@/pages/admin/UserManagerPage.vue'), meta: { ...publicMeta, room: 'admin' } },
    { path: '/admin/appManage', name: '应用管理', component: () => import('@/pages/admin/AppManagerPage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'app-lab' } },
    { path: '/admin/blogManage', name: '博客管理', component: () => import('@/pages/admin/BlogManagePage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'blog' } },
    { path: '/admin/knowledge', redirect: '/admin/knowledge/ingest' },
    { path: '/admin/knowledge/ingest', name: '内容采集', component: () => import('@/pages/admin/KnowledgeIngestPage.vue'), meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/knowledge/jobs', name: '精读任务', redirect: '/admin/knowledge/ingest' },
    { path: '/admin/knowledge/notes', name: '我的文章', component: () => import('@/pages/admin/KnowledgeNoteListPage.vue'), meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/knowledge/notes/:noteId', name: '审阅文章', component: () => import('@/pages/admin/KnowledgeNoteDetailPage.vue'), meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/knowledge/learning', name: '领域知识树', component: () => import('@/components/learning/LearningView.vue'), meta: { ...publicMeta, room: 'reading', requireModule: 'knowledge' } },
    { path: '/admin/chatHistoryManage', name: '对话管理', component: () => import('@/pages/admin/ChatHistoryManagerPage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'chat' } },
    { path: '/admin/settings', redirect: '/admin/settings/site' },
    { path: '/admin/settings/audit', name: '变更审计', component: () => import('@/pages/admin/SiteSettingsAuditPage.vue'), meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/settings/health', name: '依赖健康', component: () => import('@/pages/admin/SiteSettingsHealthPage.vue'), meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/settings/modules', name: '业务模块', component: () => import('@/pages/admin/SiteModulesPage.vue'), meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/settings/:module', name: '站点设置', component: () => import('@/pages/admin/SiteSettingsPage.vue'), meta: { ...publicMeta, room: 'settings' } },
    { path: '/admin/ops', redirect: '/admin/ops/usage' },
    { path: '/admin/ops/usage', name: 'AI用量', component: () => import('@/pages/admin/OpsUsagePage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/logs', name: '实时日志', component: () => import('@/pages/admin/OpsLogsStreamPage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/audit', name: '操作审计', component: () => import('@/pages/admin/OpsAuditPage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/stats', name: '业务统计', component: () => import('@/pages/admin/OpsStatsPage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
    { path: '/admin/ops/access-logs', name: '访问日志', component: () => import('@/pages/admin/OpsAccessLogsPage.vue'), meta: { ...publicMeta, room: 'admin', requireModule: 'ops' } },
  ],
})

export default router
