# 部署指南（前端）

> **完整服务器部署流程（从零部署）**请参阅本仓库：  
> **[AI-frontend/docs/DEPLOY_SERVER.md](AI-frontend/docs/DEPLOY_SERVER.md)**  
> （后端仓库也有一份同名文档，内容较旧，以本仓库为准。）

仓库：[mango-pie/Ai-frontend](https://github.com/mango-pie/Ai-frontend)  
后端仓库：[mango-pie/Ai-Backend](https://github.com/mango-pie/Ai-Backend)

## 目录说明

| 路径 | 说明 |
|------|------|
| `AI-frontend/src/` | Vue 3 源码 |
| `AI-frontend/dist/` | 本地构建产物（已出库，不入 git，部署走打包脚本/CI） |
| `AI-frontend/.env.production.example` | 生产环境变量模板 |

## 本地开发

```bash
cd AI-frontend
npm ci
npm run dev
# http://localhost:5173 ，后端需 localhost:8123
```

## 生产构建

```bash
cd AI-frontend
cp .env.production.example .env.production
# 编辑 .env.production（见下方 IP 模式示例）
npm ci
npm run build-only
```

### IP 访问模式（与 Nginx 同域反代）

```env
VITE_API_BASE_URL=/api
VITE_PREVIEW_BASE_URL=/api/static
VITE_DEPLOY_BASE_URL=http://121.43.177.236
```

构建产物在 `AI-frontend/dist/`（本地构建，不入 git），上线走下节 `sync-prod.ps1` 或服务器 `ai-update frontend`（从零部署见顶部 DEPLOY_SERVER.md 第 5 步）。

## 服务器快速更新

dist 已出库、不随 Git 分发，两种上线方式（详见 [DEPLOY_SERVER.md 第 8 步：日常更新](AI-frontend/docs/DEPLOY_SERVER.md)）：

**方式 A — 已 push：服务器自行拉取并构建（推荐）**

```bash
# 本机 git push 后，SSH 到服务器执行
ai-update frontend
```

**方式 B — 未 push：本机构建结果立即上线（仓库根执行）**

```bash
powershell -File AI-frontend/scripts/sync-prod.ps1             # 构建并打包 dist 上传
powershell -File AI-frontend/scripts/sync-prod.ps1 -SkipBuild  # 刚构建过，跳过构建
```

脚本将 `dist/` 打包为 `dist.tgz` 传到服务器，由 `ai-update frontend-tarball` 解压上线。`ai-update` 为服务器既有脚本（`/usr/local/bin/ai-update`，源码未入前后端两仓库），方式 A/B 均依赖它；全新服务器尚未安装时，按 [DEPLOY_SERVER.md 第 5 步](AI-frontend/docs/DEPLOY_SERVER.md) 命令手动兜底（如需脚本化可自行封装）。

脚本默认从 `E:\Quark\新建文件夹\Scene.pem` 读取 SSH 私钥，服务器 `root@121.43.177.236` 写死在脚本内；其他环境用 `-PemPath` 指定私钥或编辑脚本。完整 Nginx、后端、数据库步骤见 [DEPLOY_SERVER.md](AI-frontend/docs/DEPLOY_SERVER.md)。

## GitHub Actions

仅推送 `main` 且 `AI-frontend/` 有变更时自动 `npm run build-only`，Artifact 名 `frontend-dist`（保留 30 天）。注意：当前工作分支（如 `restore-polished-ui`）不会触发；且 `VITE_DEPLOY_BASE_URL` 需在仓库 Variables 配置，否则构建缺省 `https://example.com`。

## 发布新版本

```bash
cd AI-frontend
npm run build-only
cd ..
powershell -File AI-frontend/scripts/sync-prod.ps1 -SkipBuild   # 立即上线本机构建结果（仓库根执行）
git push                                                        # 或 push 后 SSH 服务器执行 ai-update frontend
```

未 push 想立即上线用 `sync-prod.ps1`；已 push 则 SSH 服务器执行 `ai-update frontend` 即可。CI Artifact 仅 `main` 分支产出且需先配好 `VITE_DEPLOY_BASE_URL`（见上节），满足时才可作为产物来源备选。
