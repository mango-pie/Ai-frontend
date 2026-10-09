# AI-frontend · 某某の小站

一个「空间站」式的个人站点前端：门户、博客、日记、知识库、资料库、AI 对话、游戏舱、运维后台等以**房间**的形式组织在同一外壳之下；另有可独立部署的 **MIKU PULSE** 音乐播放器（PWA / Tauri 桌面端）。技术底座为 Vue 3 + Vite 7 + TypeScript + Ant Design Vue v4。

> 本文以代码为准编写，结构与数字均对应 `package.json` v0.11.0 的实际代码。

---

## 技术栈

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| Vue | ^3.5.29 | 核心框架（Composition API + `<script setup>`） |
| Vue Router | ^5.0.3 | 客户端路由（主站 history 模式 / 播放器 hash 模式） |
| Pinia | ^3.0.4 | 状态管理 |
| Ant Design Vue | ^4.2.6 | UI 组件库（unplugin-vue-components 按需自动注册） |
| Vite | ^7.3.1 | 构建工具（双模式构建 + PWA） |
| TypeScript | ~5.9.3 | 类型系统（vue-tsc 类型检查） |
| Axios | ^1.13.6 | HTTP 客户端（Session Cookie 登录） |
| marked ^17.0.4 / highlight.js ^11.11.1 | — | Markdown 渲染与代码高亮 |
| lucide-vue-next ^1.0.0 | — | 图标 |
| music-metadata ^11.15.0 / browser-id3-writer ^6.4.0 | — | 音频元数据解析 / ID3 写入（播放器） |
| @tauri-apps/api ^2.11.1 | — | Tauri 桌面壳集成（plugin-dialog/fs/http） |
| vite-plugin-pwa ^1.3.0 | — | 独立播放器的 PWA 离线支持 |
| vitest ^5.0.0 | — | 单元测试 |

环境要求：Node.js `^20.19.0 || >=22.12.0`（见 `package.json` 的 `engines`）。

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动主站开发服务器（默认 http://localhost:5173）
npm run dev

# 启动独立音乐播放器开发模式（自动打开 /music.html）
npm run dev:music
```

- 主站业务接口依赖后端服务 `http://localhost:8123`（dev 代理 `/api/uploads` 指向它，见 `vite.config.ts`）。后端需先单独启动：仓库与部署步骤见根目录 `DEPLOY.md`（后端仓库：[mango-pie/Ai-Backend](https://github.com/mango-pie/Ai-Backend)）。
- 音乐相关代理：`/netease-api` → `localhost:3000`、`/meting-api` → `localhost:3300`、`/netease-img` → `p1.music.126.net`、`/hitokoto-api` → `v1.hitokoto.cn`（音源服务如何启动见下方「音乐功能依赖」）。
- **环境变量**（Vite `VITE_` 前缀，见 `.env.development` / `.env.production` / `.env.music-standalone.example`）：
  - `VITE_API_BASE_URL` — 后端 API 根路径（dev 为 `http://localhost:8123/api`，生产为 `/api`）
  - `VITE_PREVIEW_BASE_URL` — 应用预览静态文件根路径
  - `VITE_DEPLOY_BASE_URL` — 部署后应用的访问域名
  - `VITE_NETEASE_API_BASE` — 独立播放器使用的网易云 API 地址（可选）
- 站点文案、房间标题、背景轮换、特效开关（鼠标拖尾 / 气泡菜单 / 桌宠）集中在 `src/config/site.ts`，个人化只需改这一个文件。

### 音乐功能依赖（`/music` 与独立播放器 MIKU PULSE）

在线音源搜索依赖两个本地服务。未启动时不会崩溃：在线搜索无结果，点播时会 toast 提示「获取播放链接失败，请确认网易云服务可用」（与 `docs/DEPLOY_SERVER.md` D.7 的故障现象一致）；本地音频播放不依赖它们：

| 服务 | 端口 | 来源 | 启动 |
| --- | --- | --- | --- |
| 网易云 API（api-enhanced） | 3000 | 第三方仓库，需自行 clone 到 `AI-frontend/api-enhanced/`（已被根 `.gitignore:48` 忽略）：https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced | `node app.js` |
| meting-lite（QQ 音乐 / 酷狗聚合） | 3300 | 本仓库自带 `AI-frontend/meting-lite/server.js`（可用 `PORT` 环境变量覆盖端口） | `node server.js` |

推荐直接用一键启动脚本 `AI-frontend/scripts/start-music-player.bat`：它检测并自动拉起上述两个服务（api-enhanced 缺失时仅警告不阻断），随后提供 dev / preview / Tauri / 打包菜单。

---

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 主站开发服务器（端口 5173） |
| `npm run dev:music` | 独立播放器开发模式（`--mode music-standalone`） |
| `npm run dev:music:tauri` | Tauri 桌面壳联调（`127.0.0.1:5173` strictPort） |
| `npm run build` | 类型检查 + 主站生产构建（并行） |
| `npm run build:deploy` | 同 `build`，部署用途 |
| `npm run build:music` | 独立播放器构建，产物在 `dist-music/` |
| `npm run build-only` | 仅 `vite build`（跳过类型检查） |
| `npm run type-check` | `vue-tsc --build` 类型检查 |
| `npm run preview` | 主站构建产物预览（端口 4173） |
| `npm run preview:music` | 预览 `dist-music/` 产物 |
| `npm run tauri:dev` / `npm run tauri:build` | Tauri 桌面端开发 / 打包 |
| `npm run lint` | oxlint + eslint（**带 `--fix`，会改文件**） |
| `npm run format` | Prettier 格式化 `src/`（**会改文件**） |
| `npm run openapi2ts` | 从后端 OpenAPI 文档重新生成接口层 |

---

## 目录结构

```
AI-frontend/
├── index.html              # 主站入口 HTML（→ src/main.ts）
├── music.html              # 独立播放器入口 HTML（→ src/music-standalone.ts）
├── vite.config.ts          # 双模式构建、antd 按需注册、PWA、媒体代理
├── src-tauri/              # Tauri 桌面壳（tauri.conf.json / Rust 工程）
└── src/
    ├── main.ts             # 主站入口：Pinia + Router + v-permission + 全局路由守卫
    ├── music-standalone.ts # 独立播放器入口：hash 路由单页，浏览器注册 PWA SW
    ├── App.vue             # 根组件：ConfigProvider 主题、双外壳切换、全局浮层
    ├── MusicStandaloneApp.vue # MIKU PULSE 播放器根组件
    ├── access.ts           # 全局前置守卫（副作用导入）：模块门控 + 角色校验
    ├── request.ts          # 全局 Axios 实例（超时/大整数安全解析/40100 分流）
    ├── pwa-register-stub.ts# 主站模式下 virtual:pwa-register 的替身实现
    ├── api/                # 后端接口层（openapi 生成 + 手写扩展，详见下文）
    ├── assets/             # 静态资源与全局样式（base/blog 排版/房间底座等）
    ├── components/         # 通用组件（shared/ 下有 StationRoomShell 等房间外壳）
    ├── composables/        # 组合式函数（时段主题、舞台缩放、背景轮播等）
    ├── config/             # site.ts 站点配置、modules.ts 模块表、permission.ts 权限表
    ├── constants/          # 常量
    ├── design/             # 设计层组件（FloatingPlayer / FloatingLyric 等）
    ├── directives/         # v-permission 自定义指令
    ├── examples/           # 权限示例页（/test 路由）
    ├── integrations/       # 第三方 / 非后端接口（hitokoto、网易云、meting 等）
    ├── layouts/            # PublicLayout（门户）/ WorkspaceLayout（夜航工作台）
    ├── pages/              # 页面组件，按房间分目录（见下文「模块全景」）
    ├── pet/                # 桌宠（PetDango，GIF 渲染）
    ├── router/             # 路由表（全懒加载）
    ├── stores/             # Pinia：loginUser / capabilities / learning-workbench
    ├── types/  utils/      # 类型声明与工具函数
    └── stores/__tests__ 等 # vitest 单测
```

### 页面模块全景（`src/pages/`）

| 房间 | 内容 |
| --- | --- |
| `blog/` | 随笔：首页 / 发布编辑 / 筛选 / 文章详情 / 分类·标签跳转 |
| `diary/` | 日记：首页 / 写日记 / 详情 |
| `worklog/` | 工作日志 |
| `knowledge/` | 知识库：列表 / 新建 / 详情 / AI 问答 |
| `library/` | 资料库 |
| `chat/` | AI 对话：会话列表 / 对话页（keep-alive） |
| `lab/` + `app/` | AI 实验室：一句话生成小应用、应用编辑与应用对话 |
| `games/` | 游戏舱：大厅 + 21 个小游戏（2048、贪吃蛇、俄罗斯方块、五子棋、飞机大战、大富翁、扫雷、记忆翻牌等 `Game*.vue`） |
| `music/` | 主站内 Pulse 舞台播放器（`MusicPage.vue`） |
| `admin/` | 管理后台：用户/应用/博客/对话管理、知识库采集与精读笔记、站点设置（模块开关/审计/健康）、运维中心（AI 用量/实时日志/操作审计/业务统计/访问日志）；学习工作台也在其中（`StudyView.vue`，路由 `/administrator/study`，配套 `src/api/` 下 7 个 study* 接口模块——`src/pages/` 无独立 study/ 目录） |
| `user/` | 登录 / 注册 / 个人信息 |

---

## 架构速览

### 双入口

| 入口 | 文件 | 说明 |
| --- | --- | --- |
| 主站 | `index.html` → `src/main.ts` | 完整路由 + 权限体系 + 模块门控；antd 组件由构建期自动注册（**没有 `app.use(Antd)` 全量注册**，JS 侧的 `message`/`Modal` 仍从 `ant-design-vue` 具名导入） |
| 独立播放器 | `music.html` → `src/music-standalone.ts` | 不加载主站路由与权限体系，单个通配路由渲染 `MusicStandaloneApp`；hash 路由以便 `file://` 或 Tauri 协议打开；浏览器环境注册 PWA Service Worker（离线播放），Tauri 壳内跳过 |

`vite.config.ts` 按 `mode === 'music-standalone'` 切换两套构建：主站模式含 vue-devtools、`virtual:pwa-register` 走替身模块；播放器模式输出到 `dist-music/`、启用 VitePWA（manifest「MIKU PULSE」、workbox 预缓存、音源接口强制 NetworkOnly）。

### 双外壳（`src/App.vue`）

根组件依据 `route.meta.shell` 切换外壳：

- `PublicLayout`（门户外壳）：普通公开页（登录/注册等）渲染公开顶栏、页脚与 A/B 双图层背景轮播；`STATION_ROOMS` 名单里的房间页（blog/diary/knowledge/library/reading/worklog/lab/chat/auth/settings/about/admin/study/profile）与主页**自管 chrome**，外壳退化为透明容器；`/music` 全屏自管。
- `WorkspaceLayout`（夜航工作台外壳）：左侧 WorkspaceRail 常驻、夜航底色随时段偏移色温（晨樱粉 / 午薄荷 / 昏琥珀 / 夜星紫）、房间 accent 色。当前路由表中所有路由均为 `public` 外壳，`workspace` 外壳为预留能力（`router/index.ts` 已定义 `workspaceMeta`，暂无路由启用）。

外壳之外，`App.vue` 还挂载全局浮层：鼠标拖尾（`MouseTrail`）、悬浮播放器与歌词（`FloatingPlayer`/`FloatingLyric`，首页与 `/music` 隐藏）、气泡菜单（`FloatingBubbleMenu`）、桌宠（`PetDango`），开关均由 `siteConfig.effects` 控制；Pulse 播放单例也在根组件初始化一次、全站共享。

### 空间站房间（`meta.room` + `StationRoomShell`）

- 路由表共 52 条记录：**48 条组件路由全部懒加载**（`() => import(...)`，Vite 自动分包）+ 4 条 redirect（`/admin/knowledge`、`/admin/knowledge/jobs`、`/admin/settings`、`/admin/ops`）。
- 每条路由带 `meta.room` 房间视觉标识（hall / blog / diary / music / games / knowledge / library / chat / lab / worklog / study / admin / reading / settings / auth / about / profile 等）。
- `src/components/shared/StationRoomShell.vue` 是「车站房间」通用骨架：左侧 WorkspaceRail、1920×1080 固定舞台等比缩放、时段氛围（`PeriodAtmosphere` 按小时自动换肤）、顶栏时钟、背景轮播与主题/水墨/背景切换悬浮球。`room` 属性支持 11 种房间（worklog/lab/chat/auth/settings/about/library/admin/study/profile/games），CSS 侧由 `data-room` 覆盖 `--room`/`--room-soft` 主题变量实现各房间配色；`fill` 属性区分舞台内滚动与铺满自滚（对话页）。外壳被 keep-alive 缓存，并在激活/挂起时同步全局锁类；Esc 可快速退回房间首页。

### 模块开关门控（12 个模块 key）

- `src/config/modules.ts` 定义 12 个模块 key：`ops` / `blog` / `knowledge` / `library` / `reading` / `chat` / `study` / `diary` / `worklog` / `tts` / `app-lab` / `games`，契约来自后端 `GET /app/modules`，**响应里缺省的 key 一律视为关闭**。
- `src/access.ts` 通过副作用注册全局前置守卫（`main.ts` 中 `import '@/access'`）：
  1. 首次导航并行拉取登录用户与模块能力清单；
  2. 模块门控：优先取路由 `meta.requireModule`，其次按路径前缀推断所属模块，未启用则重定向 `/module-unavailable?module=xxx`；
  3. 会话恢复：回到 `/chat` 时自动跳回上次浏览的具体对话；
  4. 角色校验：按 `src/config/permission.ts` 的 `ROUTE_PERMISSIONS`（路径 → `user`/`admin`/`administrator`）要求登录或管理员，不满足则跳登录页（带回跳地址）或首页。
- 请求层协同（`src/request.ts`）：`40100`（未登录）会结合能力快照区分「模块关闭」与「未登录」分别跳转；模块关闭后其 Controller 不注册、接口 404 时给出友好提示；响应体在 `JSON.parse` 前把 15 位以上整数转为字符串，避免雪花 ID 精度丢失。

### 状态管理（Pinia）

`src/stores/` 下共三个 store：

- `loginUser.ts` — 登录用户：`fetchLoginUser()` 拉取当前用户（未登录静默失败）、`setLoginUser()` 直接覆盖（登出清空）。
- `capabilities.ts` — 模块能力：探测 `GET /app/modules`，探测失败时 **fail-open**（全部视为开启，避免把现有入口藏掉）；并发去重，并把能力快照同步到 localStorage 供 axios 拦截器等非组件环境读取。
- `learning-workbench.store.ts` — 领域知识树工作台状态（领域列表、树快照、选中枝、V2 链路阶段等）。

### 权限的三种用法

1. 路由守卫自动校验（`src/access.ts` + `ROUTE_PERMISSIONS`）；
2. 模板元素显隐：`v-permission` 自定义指令（无权限时移除 DOM，`src/directives/permission.ts`）；
3. 菜单可见性：`MENU_ITEMS` 配置项支持 `requiredRole` 与 `requireModule` 双重过滤。

### API 层

- `src/request.ts` 是全局唯一 Axios 实例（60s 超时、`withCredentials` 携带 Cookie）。
- `src/api/` 覆盖后端各 controller：用户、应用、博客（文章/分类/标签/图片）、对话（会话/历史）、日记、图片上传、资料库、模块开关、学习（清单/专注/习惯/列表/统计/任务/工作台）、TTS、工作日志、桌宠设备、运维观测（含 SSE 实时日志流）、站点设置、知识库（`knowledge/` 子模块）、领域知识树（`learning.ts`）。其中 `userController.ts` 等标准 controller 带 openapi 生成标记（可用 `npm run openapi2ts` 重新生成），`learning.ts`、`opsLogStream.ts`、`siteSettings.ts`、`knowledge/` 等为手写扩展——重新生成时注意不要覆盖。
- `src/integrations/` 存放第三方 / 非后端接口（hitokoto 一言、网易云、meting、播放器运行时等），有独立 `README.md` 说明。

---

## 构建与部署

```bash
# 主站生产构建（类型检查 + vite build 并行），产物 dist/
npm run build

# 独立播放器生产构建（PWA），产物 dist-music/
npm run build:music

# 本地预览
npm run preview          # 主站，端口 4173
npm run preview:music    # 播放器产物
```

部署细节（服务器环境、Nginx 配置、Tauri 打包、独立播放器的三种运行方式等）不在本文展开，见：

- 仓库根 `DEPLOY.md`
- `docs/DEPLOY_SERVER.md`（服务器部署）
- `docs/MUSIC_STANDALONE.md`（MIKU PULSE 独立运行与 Tauri）
