# 模块下线交接文档：对话（chat）/ 实验室（app-lab）/ 语音合成（tts）

> 给后端仓库（`E:\java_demo\Ai-Backend`，mango-pie/Ai-Backend）的最小改动清单。
> 前端已在 `v2` 分支完成三模块摘除（归档分支 `legacy/v0.11` 保留完整旧版）。
> 本文档约定按 `GAMES_MODULE_HANDOFF.md` 同款格式编写：后端按节依次执行即可。

## 1. 背景与范围

v2 起站点聚焦「知识域」（知识库 / 资料库 / AI 精读，后续整合）+ 创作 + 音乐 + 游戏舱。
以下三个模块的前端代码（页面、路由、导航、API controller、房间卡/样式/文案）已全部移除：

| 模块 key | 中文名 | 前端摘除内容 |
| --- | --- | --- |
| `chat` | 对话 | /chat 两页、/admin/chatHistoryManage、chatController、chatHistoryController、chatAttachmentController、chatSession 工具、导航/房间卡 |
| `app-lab` | 实验室 | /lab、/app/chat/:id、/app/edit/:id、/admin/appManage、appController、appSettings、首页 Hero 实验室输入卡与精选实验灵感窗 |
| `tts` | 语音合成 | ttsController（原本只服务对话页朗读） |

**未摘除而只是"入口下线"的能力：无。** 三模块前端已物理删除。

## 2. 后端必须保留（桌宠依赖，勿动）

桌宠 AI 对话不经过对话模块页面，直连以下接口，**全部保留**：

| 接口 | 用途 |
| --- | --- |
| `POST /chat/chat`（SSE） | 桌宠对话流式回复 |
| `GET /chat/configs` | 桌宠按关键词挑选角色配置 |
| `POST /chat/conversations/resolve` | 桌宠会话定位/重建 |
| `/chat/conversations` 系列（列表等） | `chatConversationController` 其余会话接口 |

依赖代码：`AI-frontend/src/pet/composables/usePetAiChat.ts`、`src/utils/sseChatStream.ts`、
`src/utils/chatSegmentDisplay.ts`、`src/composables/useSegmentTypewriter.ts`、`src/api/chatConversationController.ts`。

## 3. 后端可下线的接口（建议按组下线）

### 3.1 对话模块（保留 §2 之外的部分）
- `GET /chat/agent/config`、`GET /chat/types`、`POST /chat/attachment`
- `/chatHistory/*` 全部（admin 对话管理、latest、aiMessage/userMessage 埋点等）
- 注意：`/chatHistory` 若被运维统计引用，先确认再删

### 3.2 实验室模块
- `/app/add`、`/app/update`、`/app/delete`、`/app/update/admin`、`/app/delete/admin`
- `/app/my/list/page`、`/app/featured/list/page`、`/app/list/page/admin`
- `/app/chat/gen/code`、`/app/deploy`（代码生成与应用部署）
- **`GET /app/modules` 必须保留**（全站模块开关的数据源）

### 3.3 语音合成模块
- `/tts/*` 全部（config、health、ref/init、synthesize、voice/add 等）

## 4. 模块开关与站点设置清理

`GET /app/modules` 返回中移除 `chat`、`tts`、`app-lab` 三个 key（前端缺省即视为关闭，多返回不报错但建议清理）。

`site_setting` 表清理（先备份）：

```sql
-- 模块开关行
DELETE FROM site_setting WHERE config_key IN ('module_chat', 'module_tts', 'module_app_lab');
-- 若开关行用其他命名，按 LIKE 兜底核对一遍
SELECT * FROM site_setting WHERE config_key LIKE 'module%';

-- 对话模块配置
DELETE FROM site_setting WHERE config_key LIKE 'chat.%'
  OR config_key LIKE 'agent.%'
  OR config_key LIKE 'image_caption.%'
  OR config_key LIKE 'segmentation.%'
  OR config_key = 'attachment_cache_ttl_minutes';

-- TTS 配置
DELETE FROM site_setting WHERE config_key LIKE 'tts.%';

-- 实验室/代码生成配置
DELETE FROM site_setting WHERE config_key LIKE 'codegen.%'
  OR config_key LIKE 'app.deploy.%'
  OR (config_key LIKE 'deploy.%' AND config_key NOT LIKE 'deployed%');
```

## 5. 依赖健康（/admin/settings/health）

health targets 中移除 `agent`、`tts`（前端标签映射已同步删除，后端不再返回这两项即可）。
`codegen` target 随代码生成下线时可一并移除。

## 6. 前端已完成（无需后端参与）

- 路由 7 条、导航四组、模块注册表（MODULE_KEYS 收缩为 9 个）、权限表、moduleGate 前缀表
- 首页：Hero 实验室输入卡、实验室/对话房间卡、精选实验灵感窗（整屏移除，翻页 4→3）
- 站点设置页 chat/tts/app 分组、依赖健康标签、桌宠台词与路由反应清理
- 房间主题色 token（base.css / station-room.css 的 data-room chat/lab）
- 单测同步更新（50 例全过）、vue-tsc 无新增错误（存量 11 个 antd 类型问题不变）
- dist 已彻底出库（移除 184 个历史误跟踪文件，与 DEPLOY.md「不入 git」约定对齐）

## 7. QA 清单

- [ ] `GET /app/modules` 不再返回 chat / tts / app-lab
- [ ] 桌宠：双击对话正常流式回复、切页后记忆仍在（§2 接口未受影响）
- [ ] `/chat`、`/lab`、`/app/*` 深链返回 404 或由前端网关兜底（前端已无这些路由）
- [ ] 管理台站点设置不再出现 聊天 / TTS / 代码生成 分组
- [ ] 依赖健康页无 agent / tts 项
