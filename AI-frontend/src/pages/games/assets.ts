/**
 * 游戏图形素材：
 * - Twemoji 开源表情图（npm 包 @twemoji/svg，图形授权 CC-BY 4.0）
 * - 斗兽棋动物剪影（src/assets/games/jungle/，来自 game-icons.net，CC BY 3.0；豹头为本仓库自绘）
 * - 经 vite 别名深引用包内 SVG / 本地资源目录，随构建本地打包，离线可用
 * - 授权与素材清单见同目录 ASSETS.md
 */
import apple from '@twemoji/svg/1f34e.svg'
import avocado from '@twemoji/svg/1f951.svg'
import banana from '@twemoji/svg/1f34c.svg'
import bear from '@twemoji/svg/1f43b.svg'
import boom from '@twemoji/svg/1f4a5.svg'
import carrot from '@twemoji/svg/1f955.svg'
import cat from '@twemoji/svg/1f431.svg'
import cherries from '@twemoji/svg/1f352.svg'
import corn from '@twemoji/svg/1f33d.svg'
import dog from '@twemoji/svg/1f436.svg'
import fox from '@twemoji/svg/1f98a.svg'
import grapes from '@twemoji/svg/1f347.svg'
import hamster from '@twemoji/svg/1f439.svg'
import koala from '@twemoji/svg/1f428.svg'
import lemon from '@twemoji/svg/1f34b.svg'
import mushroom from '@twemoji/svg/1f344.svg'
import panda from '@twemoji/svg/1f43c.svg'
import pear from '@twemoji/svg/1f350.svg'
import peach from '@twemoji/svg/1f351.svg'
import pig from '@twemoji/svg/1f437.svg'
import pineapple from '@twemoji/svg/1f34d.svg'
import rabbit from '@twemoji/svg/1f430.svg'
import ship from '@twemoji/svg/1f6f3.svg'
import snake from '@twemoji/svg/1f40d.svg'
import splash from '@twemoji/svg/1f4a6.svg'
import strawberry from '@twemoji/svg/1f353.svg'
import tangerine from '@twemoji/svg/1f34a.svg'
import tomato from '@twemoji/svg/1f345.svg'
import watermelon from '@twemoji/svg/1f349.svg'
import jElephant from '../../assets/games/jungle/elephant.svg'
import jLion from '../../assets/games/jungle/lion.svg'
import jTiger from '../../assets/games/jungle/tiger.svg'
import jLeopard from '../../assets/games/jungle/leopard.svg'
import jWolf from '../../assets/games/jungle/wolf.svg'
import jDog from '../../assets/games/jungle/dog.svg'
import jCat from '../../assets/games/jungle/cat.svg'
import jMouse from '../../assets/games/jungle/mouse.svg'
import jPlane from '../../assets/games/aeroplane/plane.svg'

/** 连连看 15 种图标 */
export const LINK_ICONS = [
  apple,
  banana,
  cherries,
  tomato,
  tangerine,
  grapes,
  watermelon,
  pear,
  strawberry,
  peach,
  pineapple,
  carrot,
  corn,
  mushroom,
  avocado,
]

/** 记忆翻牌 8 种卡面 */
export const MEMORY_FACES = [cat, dog, rabbit, bear, koala, panda, fox, pig]

/** 海战棋：舰船 / 命中爆炸 / 落空水花 */
export const BATTLESHIP_ART = { ship, boom, splash }

/** 斗兽棋：象8 狮7 虎6 豹5 狼4 狗3 猫2 鼠1（白色剪影 SVG，组件内以 CSS mask 按阵营染色） */
export const JUNGLE_ART = {
  elephant: jElephant,
  lion: jLion,
  tiger: jTiger,
  leopard: jLeopard,
  wolf: jWolf,
  dog: jDog,
  cat: jCat,
  mouse: jMouse,
}

/** 飞行棋：客机剪影（白色单色 SVG，四色阵营以 CSS mask 染色） */
export const PLANE_ART = { plane: jPlane }

/** 贪吃蛇：蛇头 / 食物 */
export const SNAKE_ART = { head: snake, food: apple }

/** 打地鼠：地鼠 */
export const MOLE_ART = { mole: hamster }

export { apple, lemon }