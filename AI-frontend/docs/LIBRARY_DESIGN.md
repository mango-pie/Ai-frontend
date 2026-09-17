# 资料库（Library）模块设计文档

> 状态：设计稿 v1（2026-09-13），待评审后作为一期施工图。
> 范围：后端 `E:\java_demo\Ai-Backend`（Spring Boot 3.5 / MyBatis-Flex / MySQL / MinIO），前端 `AI-frontend`（Vue 3 / ant-design-vue）。
> 交互原型：[prototypes/library-prototype.html](./prototypes/library-prototype.html)（单文件 HTML，浏览器直接打开；station 房间视觉，右下角 Tweaks 可切时段/墨色/分期视角）。

## 1. 背景与目标

学习场景下会积累大量异构资料（PDF 论文、课件、代码片段、音频课、数据集压缩包……），现有能力分散且各有局限：

- 图片上传走本地磁盘（`ImageUploadController`），知识库文档走 MinIO（`KnowledgeDocumentController`），两套体系并存；
- 没有独立的"文件"域模型：无标签、无合集、无跨维度检索；
- 前端 4 个页面各自手写上传逻辑，无通用上传组件。

**目标**：新增一个"资料库"模块，提供大容量文件存储 + 多维分类（合集 / 标签 / 自动类型 / 学习领域）+ 检索，并预留 AI 自动标签、一键转知识库 RAG 的能力。

**非目标（本期不做）**：多人共享与权限体系（单用户隔离即可）、在线协同编辑、Office 在线预览、断点续传。

## 2. 设计原则：文件本体与分类解耦

单一文件夹树的经典痛点是"一个文件只能待在一个地方"，学习资料恰恰经常跨领域。因此**不做层级文件夹**，改为多维正交分类：

| 维度 | 形态 | 维护方式 |
| --- | --- | --- |
| 合集 Collection | 扁平列表（类似歌单/相册），一个文件可进多个合集 | 手动 |
| 标签 Tag | 多对多，自由命名 + 颜色 | 手动 + AI 建议（三期） |
| 类型 Category | 按 mime/扩展名自动分 7 组 | 上传时自动判定，零维护 |
| 学习领域 | 挂接 learning 领域树（前端 `DomainTree` 已有，后端待实现） | 三期接入 |

文件本体（`library_file`）只管存储与元数据，与任何分类维度通过关联表衔接；删除合集/标签不影响文件本体。

## 3. 总体架构：复用与新增

```
复用（已存在，不动或小改）                新增（本模块）
─────────────────────────              ─────────────────────────
KnowledgeStorageService 接口+MinIO实现   service/storage/FileStorageService
  → 抽象为通用 FileStorageService        service/library/*（文件/合集/标签）
knowledge_document 元数据落库范式          model/entity/library/* + mapper
knowledge presigned 下载链路              controller/library/Library*Controller
site_setting + ConditionalOnModule        前端 /library 页面 + FileUploader 组件
pgvector + langchain4j 管线（三期复用）     V21__library.sql（Flyway 双轨）
```

存储服务策略：一期即抽通用 `FileStorageService`（签名沿用现有四方法：upload/download/delete/getPresignedUrl，bucket 参数化），library 直接接入；**knowledge 包迁移到新抽象放到二期**，避免一期同时动 knowledge 引入回归。

## 4. 数据模型

新增 5 张表，Flyway 编号从 **V21** 起（当前最高 V20），同步双轨：`resources/db/migration/V21__library.sql` + `resources/sql/library_schema.sql` + 在 `sql/README-modules.md` 登记。主键为雪花 ID（MyBatis-Flex codegen 生成 entity/mapper）。

### 4.1 library_file（文件本体）

```sql
CREATE TABLE IF NOT EXISTS library_file (
    id BIGINT NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL COMMENT '上传用户',
    file_name VARCHAR(255) NOT NULL COMMENT '显示名，可改名',
    origin_name VARCHAR(255) NOT NULL COMMENT '上传时原始文件名',
    file_ext VARCHAR(32) NOT NULL COMMENT '小写扩展名，无点',
    mime_type VARCHAR(128) DEFAULT NULL,
    file_size BIGINT NOT NULL COMMENT '字节',
    category VARCHAR(32) NOT NULL DEFAULT 'OTHER' COMMENT 'DOCUMENT/IMAGE/AUDIO/VIDEO/CODE/ARCHIVE/OTHER',
    bucket_name VARCHAR(128) NOT NULL,
    object_key VARCHAR(512) NOT NULL,
    sha256 CHAR(64) NOT NULL COMMENT '内容指纹，秒传/去重',
    summary VARCHAR(1024) DEFAULT NULL COMMENT 'AI 摘要（三期）',
    ai_status VARCHAR(32) NOT NULL DEFAULT 'NONE' COMMENT 'NONE/PENDING/RUNNING/DONE/FAILED',
    knowledge_document_id BIGINT DEFAULT NULL COMMENT '转知识库后回写关联（三期）',
    deleted_at DATETIME DEFAULT NULL COMMENT '进回收站时间，is_delete=1 时写入',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_delete TINYINT NOT NULL DEFAULT 0,
    KEY idx_libfile_user_deleted (user_id, is_delete),
    KEY idx_libfile_category (user_id, category, is_delete),
    KEY idx_libfile_sha (user_id, sha256),
    KEY idx_libfile_create (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资料库文件';
```

类型判定表（上传时由扩展名映射，未命中归 OTHER）：

| category | 扩展名 |
| --- | --- |
| DOCUMENT | pdf doc docx ppt pptx xls xlsx txt md csv epub |
| IMAGE | jpg jpeg png gif webp svg bmp |
| AUDIO | mp3 wav flac aac m4a |
| VIDEO | mp4 mkv mov avi webm |
| CODE | java py ts js tsx jsx vue html css sql json xml yml yaml sh |
| ARCHIVE | zip rar 7z tar gz |

### 4.2 library_collection（合集）与 library_tag（标签）

```sql
CREATE TABLE IF NOT EXISTS library_collection (
    id BIGINT NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(64) NOT NULL,
    icon VARCHAR(64) DEFAULT NULL COMMENT 'emoji 或图标名',
    color VARCHAR(16) DEFAULT NULL,
    description VARCHAR(255) DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_delete TINYINT NOT NULL DEFAULT 0,
    KEY idx_libcol_user (user_id, is_delete, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资料库合集';

CREATE TABLE IF NOT EXISTS library_tag (
    id BIGINT NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(64) NOT NULL,
    color VARCHAR(16) DEFAULT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'USER' COMMENT 'USER/AI',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_delete TINYINT NOT NULL DEFAULT 0,
    KEY idx_libtag_user (user_id, is_delete, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资料库标签';
```

同名约束在 Service 层保证（逻辑删除下唯一索引会产生冲突，不建 UK）：合集重名校验拒绝；标签重名直接复用已有未删标签（幂等），标签被删且无引用时物理清理。

### 4.3 关联表（多对多）

```sql
CREATE TABLE IF NOT EXISTS library_file_collection (
    id BIGINT NOT NULL PRIMARY KEY,
    file_id BIGINT NOT NULL,
    collection_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_libfc (file_id, collection_id),
    KEY idx_libfc_collection (collection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件-合集关联';

CREATE TABLE IF NOT EXISTS library_file_tag (
    id BIGINT NOT NULL PRIMARY KEY,
    file_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_libft (file_id, tag_id),
    KEY idx_libft_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件-标签关联';
```

合集的 `file_count` 查询时实时 count（个人数据量级下无压力），不做冗余计数。

## 5. 对象存储规范

- **Bucket**：`library-files`，独立于 `knowledge-documents`；应用启动时 ensureBucket（不存在则创建）。
- **Object Key**：`library/{userId}/{yyyyMM}/{snowflakeId}.{ext}`，与 knowledge 的范式一致。
- **上传路径（一期）**：走后端 multipart（≤50MB），沿用 `spring.servlet.multipart` 上限。
- **下载/预览**：`GET /download-url` 返回 MinIO 预签名 URL（有效期读配置，默认 3600s）；图片直接以 URL 渲染，PDF/文本新窗口打开，Office 一期不做在线预览。
- **秒传**：前端增量计算 SHA-256（crypto-js）→ `POST /files/check` → 命中同 `user_id + sha256` 则不重复上传，后端对源对象做 MinIO 服务端 copyObject + 新建元数据行。仅同用户去重，避免跨用户内容泄露。后端收到上传时复核 hash（≤50MB 服务端计算耗时可忽略）。
- **删除**：回收站恢复期内对象保留；`purge` 时执行 removeObject 并物理删元数据行。

## 6. 后端接口清单

用户态接口，base path `/library`，响应统一 `BaseResponse<T>`，Knife4j 注解。所有查询强制带 `user_id`（取自登录态）隔离。

### 6.1 文件

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/library/files` | multipart 批量上传（`files[]` + 可选 `collectionIds`），逐个落库，返回成功/失败明细 |
| POST | `/library/files/check` | 秒传探测：`{sha256, fileName, fileSize}` → 命中即建新元数据行（copyObject） |
| GET | `/library/files` | 分页列表。过滤参数：`keyword`（文件名/摘要 LIKE）、`category`、`collectionId`、`tagIds`、`deleted`（回收站视图）、`sort`（time/name/size ±）。tagIds 多值时 AND 语义（同时含所有标签） |
| GET | `/library/files/{id}` | 详情（含合集列表、标签列表） |
| PUT | `/library/files/{id}` | 改名 / 编辑摘要 |
| DELETE | `/library/files/{id}` | 移入回收站（逻辑删 + deleted_at） |
| POST | `/library/files/{id}/restore` | 从回收站恢复 |
| DELETE | `/library/files/{id}/purge` | 彻底删除（removeObject + 物理删行） |
| GET | `/library/files/{id}/download-url` | 预签名下载 URL |
| PUT | `/library/files/{id}/tags` | 整体设置标签 `{tagIds[]}` |

### 6.2 合集

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/library/collections` | 列表（含实时 file_count），按 sort_order |
| POST | `/library/collections` | 创建 `{name, icon?, color?, description?}` |
| PUT | `/library/collections/{id}` | 改名 / 图标 / 排序 |
| DELETE | `/library/collections/{id}` | 删除合集，仅解绑关联，文件本体不动 |
| POST | `/library/collections/{id}/files` | 批量加入 `{fileIds[]}` |
| DELETE | `/library/collections/{id}/files` | 批量移出 `{fileIds[]}` |

### 6.3 标签

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/library/tags` | 列表（含 file_count，按引用数排序） |
| POST | `/library/tags` | 创建，重名幂等返回已有 |
| PUT | `/library/tags/{id}` | 改名 / 颜色 |
| DELETE | `/library/tags/{id}` | 删除并解绑全部关联 |

### 6.4 二期追加（预签名直传）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/library/uploads/presign` | `{fileName, fileSize, contentType}` → 预登记元数据行 + `{fileId, objectKey, uploadUrl}`，浏览器 PUT 直传 MinIO，绕开 50MB multipart 上限 |
| POST | `/library/uploads/{fileId}/complete` | 后端 statObject 确认对象存在 + 校验 sha256 后置为可用 |

### 6.5 三期追加（AI）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/library/files/{id}/ai-enrich` | 触发异步 AI 任务：按 §6.6 信号阶梯提取信号 → 生成摘要 + 建议标签，写入 summary/ai_status，标签以 source=AI 落库待确认 |
| POST | `/library/files/{id}/to-knowledge` | `{knowledgeBaseId}` 复用 knowledge IngestionService 走 chunk + 向量化，回写 knowledge_document_id |

### 6.6 AI 打标的信号阶梯（类型兜底策略）

AI 打标签不依赖"读全文"，按 category 分发到不同的 Enricher（策略模式），信号从强到弱逐档退化，任何类型都有兜底路径：

| 档位 | 类型 | AI 拿到的信号 | 实现依托 |
| --- | --- | --- | --- |
| 1 全文 | PDF/DOCX/MD/TXT/CSV/代码 | 抽取的全文文本 | 复用 knowledge ingestion 已有的解析器 |
| 2 视觉 | 图片 | 图像描述 + OCR 文本 | 复用 chat 模块"图片附件→视觉模型"链路（DashScope qwen-vl） |
| 3 清单 | 压缩包 | zip entry 文件名树 | 解包列清单即可，不读内容；文件名树本身就是强分类信号 |
| 4 转写 | 音频/视频 | ASR 转写稿；视频可 ffmpeg 抽帧走视觉档 | DashScope Paraformer；成本高，可选增强，默认降级到第 5 档 |
| 5 元数据 | 二进制/未知 | 文件名分词 + 扩展名 + 嵌入式元数据（ID3/EXIF/Office 属性） | 纯规则 + 词典匹配，零模型成本 |

配套约束：

1. **建议而非断言**：AI 标签（source=AI）一律虚线待确认态，用户点选后才转正（原型已如此呈现），打错零代价。
2. **封闭词表优先**：打标请求携带用户现有标签词表，模型优先从中选择，单次最多提议 2 个新标签，防止标签库膨胀出同义词垃圾。文件名与标签词典的确定性匹配作为第一道免费兜底。
3. **诚实降级**：信号不足时返回低置信度，仅建议类型级标签或标记"建议手动打标"（ai_status=DONE + low_confidence），禁止编造。
4. enrich 为异步任务，失败/超时不影响上传主流程；三期先实现第 1、2、5 档，第 3、4 档按需追加（各为一个 Enricher 实现类）。

## 7. 模块开关接入（两端）

沿用 `site_setting` 实时开关 + `ConditionalOnModule` Bean 级开关的既有机制：

**后端：**
1. `application.yml` 增加 `app.modules.library: true`（Bean 级条件装配）；
2. 新增 `setting/module/LibraryModule.java`：schema 含 `max_file_size_mb`（≤50，与 multipart 硬上限一致）、`allowed_ext`（默认白名单，按 §4.1 类型表）、`presign_expire_seconds`；
3. `/app/modules`（`ModuleCapabilitiesController`）自动带出，管理端 `SiteModulesPage` 可实时切换（插 `site_setting(modules.library)` 行）。

**前端：**
1. `src/config/modules.ts`：`MODULE_KEYS` 增 `'library'`，`MODULE_LABELS` 增 `library: '资料库'`，`MODULE_PATH_PREFIXES` 增 `{ prefix: '/library', module: 'library' }`；
2. 路由 `/library` + 导航入口（WorkspaceRail / GlobalHeader），`moduleGate` 自动生效（关闭时入口隐藏 + 路由拦截 40100）。

## 8. 前端设计

### 8.0 视觉规范（station 房间，非 admin 后台样式）

页面走**新版全站 station 视觉**（与主页/博客/日记一致），不用 `admin-theme.css` 的暗色卡片风：

- 外壳复用 `StationRoomShell.vue`：房间标识 `room: 'library'`，需在 `station-room.css` 与 `PublicLayout.vue` 的 `STATION_ROOMS` 注册房间色——`data-room='library'` → `--room:#6aaee8`（蓝，与知识库紫区分）、`--room-soft:#d8ebfb`；
- 页面元素遵循 home-v3 令牌：白玻璃卡（`1.5px solid rgba(255,255,255,.95)` + `--shadow-1` + 20px 圆角）、墨色三阶文字（`--ink/--ink-soft/--ink-faint`）、标签/类型徽标用软糖色板（`--c-sakura/violet/lilac/blue/mint/sun` 及 soft 变体）、标题 `ZCOOL KuaiLe`、hover/选中一律 `color-mix(room x%, …)`；
- 房间便签（note-chip）文案：`Library · 资料储藏室 — 学习文件的多维分类仓库`；
- **主页签名元素**（对齐 HomePage v3 观感，实现时可抽成小组件复用）：居中胶囊导航 + 品牌标 + 时钟芯片的 HomeTopbar、问候便签、渐变展示标题（ZCOOL KuaiLe + sakura→violet→blue 渐变）与斜贴和纸胶带、右侧"天空窗"插画卡（拍立得文件卡 + 上传幽灵框 + "最近取出"胶囊）、全屏飘落花瓣（CSS 动画，可关）；侧栏合集条目用彩色"书脊"造型。

### 8.1 文件结构

```
src/api/library/
  library.types.ts        # 类型定义
  libraryFile.ts          # §6.1 接口
  libraryCollection.ts    # §6.2 接口
  libraryTag.ts           # §6.3 接口
src/pages/library/LibraryPage.vue      # 主页面
src/components/shared/FileUploader.vue # 通用拖拽上传组件
src/utils/libraryFormat.ts             # LIBRARY_UPLOAD_ACCEPT / 大小格式化 / 类型图标映射
```

### 8.2 页面布局（LibraryPage）

```
┌──────────────────────────────────────────────────┐
│ 搜索框   [上传]   视图切换(列表/网格)   回收站入口  │
├──────────┬───────────────────────────────────────┤
│ 类型过滤  │  文件列表/网格                          │
│  文档 12 │  ├ 名称 · 大小 · 时间 · 标签chips       │
│  图片 8  │  ├ hover: 下载 / 加合集 / 打标签        │
│ ──────── │  └ 多选批量操作栏                       │
│ 我的合集  │                                       │
│  ▸ ML入门│                                       │
│ ──────── │                                       │
│ 标签云    │                                       │
│  #pdf #ml│                                       │
└──────────┴───────────────────────────────────────┘
   点击文件 → 右侧 Drawer：预览（图片直出/PDF新窗）、
   元信息、标签编辑、摘要、（三期）转知识库按钮
```

筛选状态（keyword/category/collectionId/tagIds）同步到路由 query，可分享/刷新保持。回收站为 `deleted=1` 的独立视图，仅提供恢复与彻底删除。

### 8.3 FileUploader 组件（通用）

- drag & drop + 点击选择，多文件，逐个进度条；
- 前置校验：扩展名白名单 + 大小上限（读 `LibraryModule` 设置）；
- 上传前 SHA-256 增量计算 → 调 `/files/check`，命中提示"秒传成功"；
- 设计为与 knowledge/blog 解耦的通用组件，二期反向替换 `KnowledgeDetailPage` / `KnowledgeIngestPage` / `BlogCreatePage` 各自手写的上传逻辑。

## 9. 分期计划

| 期 | 内容 | 验收要点 |
| --- | --- | --- |
| 一期 | 5 张表（V21 双轨）+ `FileStorageService` 抽象 + 文件/合集/标签全部 §6.1–6.3 接口 + 秒传 + 回收站 + 前端 LibraryPage / FileUploader / 模块双端注册 | 上传→分类→多维筛选→改名→回收站→恢复→下载 全链路可用；模块开关关掉后入口与路由双双消失 |
| 二期 | 预签名直传（破 50MB）+ FileUploader 推广替换三个旧页面 + knowledge 迁移到通用存储抽象 + 回收站 30 天自动清理 @Scheduled | 100MB+ 文件浏览器直传 MinIO 成功；旧上传入口行为不回退 |
| 三期 | `ai-enrich` 自动摘要/标签 + `to-knowledge` 转 RAG + learning 领域树后端补齐（`/admin/knowledge/learning/*`，前端 `learning.ts` 与 11 个组件已就绪，当前 404）| 上传 PDF 一键变知识库可问答；文件可挂领域枝 |

## 10. 约束与风险

- **50MB 上限**：一期受 multipart 硬限制（`application.yml` + `LibraryModule` 校验双层一致），大文件需求等二期直传；不要单独调大 yml 绕过。
- **建表双轨**：Flyway V21 与 `resources/sql/library_schema.sql` 必须同步，且在 `sql/README-modules.md` 登记，否则环境重建时会漂移。
- **逻辑删除与唯一索引**：关联表带 UK 可物理删重加；主表同名约束一律 Service 层校验。
- **hash 信任边界**：前端 hash 仅做秒传索引，服务端收到文件后复核 SHA-256 防伪造。
- **流程**：后端仓库改动按惯例出交接文档；本仓库提交受 Mimosa 门禁拦截，提交需走用户本机其它工具完成。
