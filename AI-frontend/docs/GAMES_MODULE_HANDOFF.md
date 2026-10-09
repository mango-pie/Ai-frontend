# 游戏舱（games 模块）后端交接文档

> 状态：前端已完整接入（v0.12.0），等待后端开启模块 key。本文档给后端仓库（`E:\java_demo\Ai-Backend`）
> 提供**最小改动清单**与后续统计接口的二期规划。范式参照 `docs/LIBRARY_DESIGN.md`。

## 1. 背景与范围

- 前端新增 `games` 模块（游戏舱）：路由 `/games`，内含 2048 / 扫雷 / 记忆翻牌三台机台与战绩舱。
- 一期战绩与偏好全部存浏览器 localStorage（`ai-arcade-records-v1` / `ai-arcade-settings-v1`），**不依赖后端**。
- 后端本期只需要一件事：**把 `games` key 加进 `GET /app/modules` 的清单**，让站点模块开关板能控制它。
- 二期（可选）：对局记录表 + 提交/排行接口，见 §4。

## 2. 后端最小改动（必须，共 4 处 + 1 行配置）

`/app/modules` 的 key 清单硬编码在后端，仅插 `site_setting` 行不会出现在响应里。以下按
`ModuleEnablementService.snapshot()` 现状给出精确改法：

| 文件 | 改法 |
| --- | --- |
| `src/main/java/com/ai/config/AppModuleProperties.java` | 字段区加 `private boolean games = true;`；`isEnabled` 的 switch 加 `case "games" -> games;` |
| `src/main/java/com/ai/setting/runtime/ModuleEnablementService.java` | `snapshot()` 末尾（`pet` 之后）加 `map.put("games", resolve("games", overrides, appModuleProperties.isGames()));` |
| `src/main/java/com/ai/setting/module/ModulesModule.java` | `schema()` 加 `flag("games", "游戏舱", "关闭后隐藏游戏舱入口"),`（管理后台设置中心即出现开关） |
| `src/main/resources/application.yml` | `app.modules` 段（`pet` 附近）加 `games: true`；若 `application-prod.yml` 覆盖了该段需同步 |

改完重打包部署 jar 后，即可用 SQL 或管理后台实时开关（写路径自动 evict 缓存，`GET /app/modules` 立即生效）：

```sql
-- 开启
INSERT INTO site_setting (`module`,`setting_key`,`setting_value`,`value_type`,`sensitive`)
VALUES ('modules','games','true','bool',0);
-- 关闭
UPDATE site_setting SET setting_value='false' WHERE module='modules' AND setting_key='games';
```

## 3. 前端已完成（无需后端参与）

- 模块注册：`src/config/modules.ts`（key `games` / 标签「游戏舱」/ 路径前缀 `/games`）
- 路由：`src/router/index.ts` → `/games`（`requireModule: 'games'`、`room: 'games'`、`keepAlive: true`）
- 导航：`workspaceNav.ts` 顶栏 link 组 + rail 独立入口；`permission.ts` MENU_ITEMS；`HomeTopbar.vue` 支持 link 型分组按模块过滤
- 房间页：`src/pages/games/`（GamesRoom + Game2048/GameMine/GameMemory/ArcadeStats + arcade.ts + games.css，样式全 `.arc-` 前缀）
- 房间色：`station-room.css` `data-room='games'` → `--room:#ffa45c`
- 行为约定：后端未返回 `games` key 时，导航隐藏、`/games` 重定向 `/module-unavailable`；探测失败（后端不可达）时全站 fail-open，与其它模块一致

## 4. 二期规划：对局记录持久化（可选）

若要把战绩上服务器（排行榜基础），按 library 的 `@ConditionalOnModule` 模式新增：

```java
@ConditionalOnModule("games")
@RestController
@RequestMapping("/games")
public class GamesController { ... }   // POST /games/records 提交对局、GET /games/records/my 分页、GET /games/rank 排行
```

建表迁移 `src/main/resources/db/migration/V24__games.sql`（当前最新为 V23，V15–V18 空缺沿用）：

```sql
CREATE TABLE IF NOT EXISTS `game_record` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `game` VARCHAR(16) NOT NULL,            -- g2048 / mine / mem
  `score` INT NULL,                       -- 2048 得分
  `win` TINYINT(1) NULL,                  -- 扫雷/翻牌 是否达成
  `duration` INT NULL,                    -- 用时（秒）
  `difficulty` VARCHAR(16) NULL,          -- easy / hard / master
  `moves` INT NULL,                       -- 翻牌步数
  `meta` TEXT NULL,                       -- 预留（如翻牌规格 4x4/6x4）
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_user_game` (`user_id`,`game`),
  KEY `idx_game_score` (`game`,`score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

前端切换点集中在 `src/pages/games/arcade.ts` 的 `useArcadeRecords()`：把 localStorage 读写替换为
`/games/records` 接口封装（`src/api/gamesController.ts`），组件层无需改动。

## 5. QA 清单

1. 后端按 §2 改动并重打 jar → 部署。
2. `GET /app/modules` 响应应含 `"games": true`。
3. 站点顶栏 / rail 出现「游戏舱」入口；`/games` 可直达。
4. 管理后台「站点设置 → 业务模块」出现「游戏舱」开关；关闭后导航隐藏、`/games` 跳模块未启用页。
5. 未部署新 jar 前：导航隐藏（探测成功时），属预期行为。
