# Ai-scene 工作区

AI 场景平台仓库。主项目为 `AI-frontend/`（Vue 3 前端，直连 Spring Boot 后端 [mango-pie/Ai-Backend](https://github.com/mango-pie/Ai-Backend)）。

## 目录布局

| 路径 | 说明 |
| --- | --- |
| `AI-frontend/` | 主项目：Vue 3 + TS + Vite 前端，详见其 [README](./AI-frontend/README.md) 与 [docs/ 文档索引](./AI-frontend/docs/README.md) |
| `doc/` | 跨端功能设计与交接文档（博客、学习工作台），见其 [README](./doc/README.md) |
| `DEPLOY.md` | 前端部署速查（构建、dist、服务器同步） |
| `design-drafts/` | 静态设计稿实验场：多风格 HTML 草稿（aesop、linear、y2k 等）与播放器封面方案 |
| `design-preview/` | 视觉方案预览页（Blog / Diary 多版本对比） |
| `starry-night/` | 星空动效静态演示页 |
| `qa-reports/`（位于 `AI-frontend/`） | 模块开关等功能的手工 QA 记录（截图、日志、场景脚本） |

`design-drafts/`、`design-preview/`、`starry-night/` 为独立静态页面，根目录 `package.json` 仅为它们提供预览用的依赖，与主项目构建无关。

## 快速开始

```bash
cd AI-frontend
npm ci
npm run dev   # http://localhost:5173 ，后端需在 localhost:8123
```

部署相关见 [DEPLOY.md](./DEPLOY.md)。
