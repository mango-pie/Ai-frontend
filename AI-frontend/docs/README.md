# AI-frontend 文档索引

前端仓库全部文档集中在本目录（`AI-frontend/docs/`），按主题分组如下。
项目简介、技术栈、本地开发见仓库根 [README](../README.md)。

## 项目与部署

| 文档 | 说明 |
| --- | --- |
| [DEPLOY_SERVER.md](./DEPLOY_SERVER.md) | 服务器完整部署手册（后端仓库另有权威版本） |
| [DEPLOY_RECORD.md](./DEPLOY_RECORD.md) | 2026-06-20 服务器部署实录，可用于排障与恢复 |
| [openapi-default.md](./openapi-default.md) | 后端 OpenAPI 文档手动导出快照（离线参考，不随接口自动更新） |

## Knowledge AI 系列

AI 智能知识库 Knowledge AI 的项目需求、阶段规划、简历材料和面试讲解文档。

- [00 项目需求总览](./00-project-overview.md)
- [01 V1 基础后台需求文档](./01-v1-basic-admin.md)
- [02 V2 知识库与文档管理需求文档](./02-v2-knowledge-document.md)
- [03 V3 RAG 核心需求文档](./03-v3-rag-core.md)
- [04 V4 AI 聊天需求文档](./04-v4-ai-chat.md)
- [05 V5 扩展功能需求文档](./05-v5-extensions.md)
- [06 简历与面试材料](./06-resume-and-interview.md)
- [KNOWLEDGE_FRONTEND_SYNC.md](./KNOWLEDGE_FRONTEND_SYNC.md) — 面向前端同学的后端对接说明（登录态、接口约定）

推荐阅读顺序：先读 `00-project-overview.md` 了解整体目标与架构；按 V1→V4 顺序保证主链路完整；核心功能完成后再看 V5 扩展；准备简历面试时重点读 `06-resume-and-interview.md`。

| 阶段 | 文档 | 核心重点 |
| --- | --- | --- |
| 总览 | `00-project-overview.md` | 项目定位、技术栈、总体架构、开发路线 |
| V1 | `01-v1-basic-admin.md` | Spring Security、JWT、Redis、用户管理 |
| V2 | `02-v2-knowledge-document.md` | 知识库管理、文档上传、MinIO、MySQL 元数据 |
| V3 | `03-v3-rag-core.md` | 文档解析、文本切块、Embedding、pgvector |
| V4 | `04-v4-ai-chat.md` | RAG 问答、多轮对话、Prompt、SSE 流式输出 |
| V5 | `05-v5-extensions.md` | 多模型、Prompt 管理、Token 统计、MCP |
| 面试 | `06-resume-and-interview.md` | 简历描述、项目亮点、面试讲解主线 |

## 功能设计

| 文档 | 说明 |
| --- | --- |
| [AI_READING_DESIGN.md](./AI_READING_DESIGN.md) | AI 精读模块：设计思想、需求与 UI 风格总览 |
| [LIBRARY_DESIGN.md](./LIBRARY_DESIGN.md) | 资料库模块：多维分类文件存储（合集/标签/类型/AI），分期施工图 |
| [prototypes/library-prototype.html](./prototypes/library-prototype.html) | 资料库最终效果交互原型（单文件 HTML，浏览器直接打开） |
| [AI_READING_DESIGN_REVIEW.md](./AI_READING_DESIGN_REVIEW.md) | 精读模块设计评审与改进建议 |
| [READING_WORKBENCH_ISSUES.md](./READING_WORKBENCH_ISSUES.md) | 精读工作台当前问题归档（仅记录，暂不改代码） |
| [music-player-design.md](./music-player-design.md) | 音乐播放器模块设计方案（MIKU PULSE） |
| [theme-design.md](./theme-design.md) | 网页灵动设计与全站主题系统（背景图轮换）方案 |
| [MUSIC_PLAYER_IMPROVEMENTS.md](./MUSIC_PLAYER_IMPROVEMENTS.md) | MIKU PULSE 播放器改进意见（覆盖全部 7 个视图） |
| [MUSIC_STANDALONE.md](./MUSIC_STANDALONE.md) | 播放器独立运行的三种启动方式（不影响站内 `/music`） |

## 开发指南（guides/）

| 文档 | 说明 |
| --- | --- |
| [guides/chat-conversation-frontend-guide.md](./guides/chat-conversation-frontend-guide.md) | 聊天会话模型（会话/消息/角色）前端对接 |
| [guides/chat-astrbot-frontend-guide.md](./guides/chat-astrbot-frontend-guide.md) | Ask 模式 AstrBot SSE 流式对接与分段解析 |
| [guides/chat-agent-frontend-guide.md](./guides/chat-agent-frontend-guide.md) | Agent 模式聊天（依赖上两篇，含链路总览） |
| [guides/frontend-tts-api.md](./guides/frontend-tts-api.md) | 前端 TTS 代理接口（类 BFF 模式） |

## 工作日志归档

| 文档 | 说明 |
| --- | --- |
| [WORKLOG-MIKU-PULSE-2026-08.md](./WORKLOG-MIKU-PULSE-2026-08.md) | MIKU PULSE 播放器：问题排查→功能接入→全面改进完整会话 |
| [worklog-import-2026-08.md](./worklog-import-2026-08.md) | 每日工作日志页面兼容的会话归档（2026-08-14 ~ 08-17） |
