# 游戏舱素材来源与授权

游戏舱（`src/pages/games/`）图形素材有两处来源，均随构建本地打包，离线可用：

1. **Twemoji** 开源表情图项目，通过 npm 包 `@twemoji/svg`（Twitter Twemoji 的维护版分支
   jdecked/twemoji 发布）；
2. **game-icons.net** 游戏图标库（斗兽棋动物剪影），存放在 `src/assets/games/jungle/`。

## 授权

- Twemoji 图形授权：**CC-BY 4.0**（`node_modules/@twemoji/svg/LICENSE-GRAPHICS`）
- game-icons.net 图形授权：**CC-BY 3.0**，归属各图标作者（见 `src/assets/games/jungle/` 内
  每个 SVG 的首行注释）
- 归属要求：使用时注明 "Twemoji by Twitter and other contributors, licensed under CC-BY 4.0"；
  "game-icons by Lorc, Delapouite and contributors, licensed under CC-BY 3.0"
- 代码授权（若引用其脚本部分）：Twemoji 相关为 MIT

## 素材清单（按用途）

| 用途 | 素材（Unicode 码位） | 使用组件 |
| --- | --- | --- |
| 连连看 15 种图标 | 1f34e 苹果 · 1f34c 香蕉 · 1f352 樱桃 · 1f345 番茄 · 1f34a 橘子 · 1f347 葡萄 · 1f349 西瓜 · 1f350 梨 · 1f353 草莓 · 1f351 桃 · 1f34d 菠萝 · 1f955 胡萝卜 · 1f33d 玉米 · 1f344 蘑菇 · 1f951 牛油果 | GameLink.vue |
| 记忆翻牌 8 种卡面 | 1f431 猫 · 1f436 狗 · 1f430 兔 · 1f43b 熊 · 1f428 考拉 · 1f43c 熊猫 · 1f98a 狐狸 · 1f437 猪 | GameMemory.vue |
| 海战棋 | 1f6f3 渡轮（舰船）· 1f4a5 爆炸（命中）· 1f4a6 水花（落空） | GameBattleship.vue |
| 贪吃蛇 | 1f40d 蛇（蛇头）· 1f34e 苹果（食物） | GameSnake.vue |
| 打地鼠 | 1f439 仓鼠（地鼠） | GameMole.vue |
| 斗兽棋 8 兽剪影 | elephant 象（delapouite）· lion 狮（lorc）· tiger-head 虎（delapouite）· leopard 豹（本仓库自绘）· wolf-head 狼（lorc）· sitting-dog 狗（delapouite）· cat 猫（lorc）· seated-mouse 鼠（lorc），均出自 game-icons.net，CC-BY 3.0 | GameJungle.vue |
| 飞行棋棋子 | commercial-airplane 客机（delapouite），出自 game-icons.net，CC-BY 3.0 | GameAeroplane.vue |

## 技术说明

- Twemoji 统一经 `src/pages/games/assets.ts` 引出，组件不直接 import 码位路径。
- 该 npm 包 `exports` 为空对象，`vite.config.ts` 中以正则别名
  `@twemoji/svg/` → `node_modules/@twemoji/svg/` 放行深层引用。
- 引入的 SVG 会作为构建产物按 hash 打包，未引用的素材不会进入产物。
- 斗兽棋剪影为「白色图形 + 透明底」的单色 SVG，组件内以 CSS `mask-image` 引用并用
  阵营渐变染色（红队/蓝队共用同一份文件），因此不需要按队伍各存一份。
