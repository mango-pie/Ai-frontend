# 知识域整合设计骨架：知识库 × 资料库 × AI 精读

> 状态：**骨架（v2 分支首个专项的起点）**。定稿前需逐节过一遍「待定问题」。
> 关联文档：`AI-frontend/docs/LIBRARY_DESIGN.md`（资料库 v1 设计）、`AI-frontend/docs/GAMES_MODULE_HANDOFF.md`（交接文档格式范式）。

## 1. 现状盘点（v2 摘除后）

| 模块 | 前端入口 | 核心能力 | 依赖 |
| --- | --- | --- | --- |
| 知识库 knowledge | /knowledge 4 页（列表/新建/详情/问答） | 知识库 CRUD、文档管理、RAG 语义检索与问答 | knowledge-ai-pg（pgvector）、MinIO |
| 资料库 library | /library 1 页 | 档案上传/检索（对象存储档案库） | qa-minio(9000) |
| AI 精读 reading* | /admin/knowledge 4 页（采集/列表/审阅/领域知识树） | URL/文档采集 → 蒸馏 → 精读笔记 → 发布 | knowledge.ai.、jina、distill 流水线 |

\* `reading` 实际不参与路由门控，所有精读页 `requireModule: 'knowledge'`；`reading` 只是视觉房间 token 与设置页模块代码。

三者的共性：都是「文档进 → AI 加工 → 检索/问答出」的不同断面，但各自独立成库、
独立导航、独立设置分组，用户要在三个房间之间跳转。

## 2. 整合目标（草案）

1. **一个入口**：单一「知识库」房间承载浏览、检索、问答；资料与精读成为其中的内容形态而非平行模块。
2. **一套检索**：RAG 语义检索统一覆盖 知识库文档 + 资料库档案 + 精读笔记，问答不再区分来源。
3. **一条流水线**：采集（URL/上传）→ 蒸馏/摘要 → 入库（可发布为随笔），精读从 admin 专区下沉为流程而非房间。
4. **导航收敛**：智能组从「知识库/资料库/AI 精读」三项收拢为一项；设置页分组合并。

## 3. 分期建议（每期可独立交付）

- **P0 信息架构**：导航与路由合并（/library、/admin/knowledge/* 迁入 /knowledge 子路由，301 兜底），
  房间内按「文档 / 档案 / 精读」三 Tab 组织。不动数据。
- **P1 统一检索**：语义搜索聚合三源（pgvector 单库多 source 字段或分表聚合），问答引用带来源类型。
- **P2 采集流水线下沉**：内容采集/蒸馏从 admin 专区移入知识库房间（按权限显隐），admin 只留审计。
- **P3 资料库 deepen**：档案预览/标签/与 RAG 索引打通（上传即索引）。

## 4. 待定问题（定稿前必须回答）

1. 资料库档案（qa-minio）是否全部进 RAG 索引？体积/隐私如何过滤？
2. 精读笔记的「发布为随笔」链路是否保留？（blog 模块存活中）
3. reading 作为设置模块代码是否与 knowledge 合并（含 site_setting 行迁移）？
4. 领域知识树（LearningView）留知识库房间还是独立？
5. 权限：精读目前 admin-only，下沉后普通用户是否可自助采集？

## 5. 约束与风险

- 后端改动照例走交接文档（本目录），不在 Ai-Backend 直接改码。
- knowledge-ai-pg 与 qa-minio 随 Docker Desktop 启停，联调前先查容器。
- 检索聚合注意 embedding 维度一致性（ai.embedding_dimension 改动需重建索引）。
