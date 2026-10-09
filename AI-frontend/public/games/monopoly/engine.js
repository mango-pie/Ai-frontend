/**
 * 小站大富翁 · 规则引擎（棋盘 / RNG / 经济 / 成就）
 * 无 DOM。页面与自检脚本共用。
 */
(function (root) {
  'use strict';

  function createRng(seed, state) {
    let a = (state != null ? state : seed) | 0;
    if (!a) a = 0xA5A5A5A5;
    function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      seed: seed >>> 0,
      random,
      getState() { return a >>> 0; },
      rnd(lo, hi) { return lo + random() * (hi - lo); },
      pick(arr) { return arr[Math.floor(random() * arr.length)]; },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
      },
      dice() { return 1 + Math.floor(random() * 6); },
    };
  }

  function parseSeed(str) {
    const t = String(str == null ? '' : str).trim();
    if (!t) {
      return ((Date.now() ^ Math.imul((Math.random() * 0x7fffffff) | 0, 2654435761)) >>> 0) || 1;
    }
    if (/^\d+$/.test(t)) return (Number(t) || 1) >>> 0;
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
  }

  const P = (name, g, price, rent) => ({ t: 'prop', name, g, price, rent });
  const GROUP_DEFS = [
    { key: 'g1', name: '手账组', color: '#c9a0dc', build: 500, prices: [600, 600, 600], rents: [[20, 100, 300, 800, 1300, 1800], [30, 120, 350, 900, 1400, 1900], [40, 150, 420, 1000, 1500, 2000]], names: ['日记手账', '深夜日记', '工作日志'] },
    { key: 'g2', name: '创作组', color: '#f490ad', build: 600, prices: [800, 800, 800], rents: [[50, 200, 550, 1300, 2000, 2600], [60, 220, 600, 1400, 2100, 2700], [70, 240, 650, 1500, 2200, 2800]], names: ['随笔杂志', '专栏连载', '草稿箱'] },
    { key: 'g3', name: '对话组', color: '#9b8ce8', build: 700, prices: [1000, 1000, 1200], rents: [[60, 280, 800, 1800, 2600, 3400], [70, 300, 850, 1900, 2700, 3500], [80, 350, 900, 2000, 2800, 3600]], names: ['随手聊', '语音合成', '桌宠小窝'] },
    { key: 'g4', name: '知识组', color: '#6aaee8', build: 1000, prices: [1400, 1400, 1600], rents: [[100, 450, 1200, 2800, 3800, 4800], [110, 480, 1300, 2900, 3900, 4900], [120, 520, 1400, 3000, 4000, 5000]], names: ['知识库', '资料库', 'AI 精读'] },
    { key: 'g5', name: '游戏舱·电竞区', color: '#ffa45c', build: 1000, prices: [1800, 1800, 2000], rents: [[140, 600, 1600, 3200, 4300, 5400], [150, 640, 1700, 3300, 4400, 5500], [160, 700, 1800, 3400, 4500, 5600]], names: ['2048', '贪吃蛇', '俄罗斯方块'] },
    { key: 'g6', name: '游戏舱·休闲区', color: '#ffcf6e', build: 1500, prices: [2200, 2200, 2400], rents: [[180, 750, 2000, 3800, 5000, 6200], [190, 780, 2100, 3900, 5100, 6300], [200, 850, 2200, 4000, 5200, 6400]], names: ['扫雷', '打地鼠', '飞行棋'] },
    { key: 'g7', name: '管理组', color: '#5fc4a5', build: 1500, prices: [2600, 2600, 2800], rents: [[220, 900, 2400, 4200, 5400, 6800], [230, 940, 2500, 4300, 5500, 6900], [240, 1000, 2600, 4400, 5600, 7000]], names: ['学习计划', '应用管理', '用户管理'] },
    { key: 'g8', name: '音乐舱', color: '#7fd8c8', build: 2000, prices: [3000, 3000, 3200], rents: [[260, 1100, 2800, 4800, 6000, 7200], [270, 1140, 2900, 4900, 6100, 7300], [280, 1200, 3000, 5000, 6200, 7400]], names: ['Pulse 舞台', '点歌台', '深夜电台'] },
    { key: 'g9', name: '实验组', color: '#a78bfa', build: 2000, prices: [3400, 3400, 3600], rents: [[300, 1300, 3200, 5200, 6500, 7600], [310, 1340, 3300, 5300, 6600, 7700], [320, 1400, 3400, 5400, 6700, 7800]], names: ['实验舱', '一句话应用', '代码生成器'] },
    { key: 'g10', name: 'AI 前沿', color: '#e879a9', build: 2500, prices: [3800, 3800, 4200], rents: [[350, 1500, 3600, 5600, 7000, 8000], [400, 1600, 3800, 5800, 7200, 8000], [450, 1700, 4000, 6000, 7400, 8000]], names: ['智能体工坊', '大语言模型', 'AI 绘画'] },
  ];
  const BOARD_N = 100;
  const RAIL_RENT = [0, 250, 500, 1000, 2000, 3500, 5000];
  const DECOR_MULT = 1.25;
  const PATH_FLAVOR = [
    { name: '石板路', ico: '🪨' }, { name: '巷口灯', ico: '🏮' }, { name: '长椅', ico: '🪑' }, { name: '邮箱', ico: '📭' },
    { name: '自行车架', ico: '🚲' }, { name: '告示牌', ico: '🪧' }, { name: '梧桐荫', ico: '🌳' }, { name: '天桥', ico: '🌉' },
    { name: '台阶', ico: '🪜' }, { name: '围墙涂鸦', ico: '🎨' }, { name: '喷泉边', ico: '⛲' }, { name: '报刊亭', ico: '📰' },
    { name: '花坛', ico: '🌷' }, { name: '路灯', ico: '💡' }, { name: '井盖', ico: '⭕' }, { name: '斑马线', ico: '🚶' },
    { name: '门廊', ico: '🚪' }, { name: '晾衣绳', ico: '👕' }, { name: '风铃', ico: '🎐' }, { name: '雨棚', ico: '☂️' },
    { name: '自行车道', ico: '🚴' }, { name: '猫窝纸箱', ico: '📦' }, { name: '邮筒', ico: '📮' }, { name: '路标', ico: '🧭' },
  ];
  const SCENIC = [
    { name: '温泉', amt: 200 }, { name: '猫咖', amt: 150 }, { name: '灯会', amt: 180 }, { name: '钟楼广场', amt: 120 },
    { name: '夜市小摊', amt: 100 }, { name: '天台夜景', amt: 160 }, { name: '竹林步道', amt: 140 }, { name: '樱花道', amt: 170 },
    { name: '河灯码头', amt: 130 }, { name: '旧书店', amt: 110 }, { name: '天文台', amt: 190 }, { name: '唱片行', amt: 150 },
  ];
  const SPECIALS = [
    { t: 'rail', name: '时光机', price: 2000 }, { t: 'rail', name: '搜索框', price: 2000 },
    { t: 'rail', name: '快捷指令', price: 2000 }, { t: 'rail', name: '传送门', price: 2000 },
    { t: 'rail', name: '钟楼电梯', price: 2000 }, { t: 'rail', name: '缆车', price: 2000 },
    { t: 'util', name: 'WiFi 音场', price: 1500 }, { t: 'util', name: '充电桩', price: 1500 }, { t: 'util', name: '饮水机', price: 1500 },
    { t: 'tax', name: '熬夜税', rate: 0.10, cap: 2000 }, { t: 'tax', name: '手滑设置费', flat: 1000 },
  ];
  const MAP_COLS = 16, MAP_ROWS = 11;
  const SALARY = 2000, JAIL_FINE = 500, REDEEM = 3000, REDEEM_CASH = 2000, ITEM_CAP = 3;
  const SAVE_VER = 3;
  const SAVE_KEY = 'stationpoly.save.v2';

  function terrainOf(y) {
    if (y >= 9) return { key: 'water', name: '码头水岸', tint: '#dceef8', bonus: 'water' };
    if (y >= 7) return { key: 'old', name: '老城街巷', tint: '#f2ede2', bonus: null };
    if (y >= 5) return { key: 'neon', name: '霓虹市集', tint: '#fde8f1', bonus: null };
    if (y >= 3) return { key: 'cloud', name: '云端街区', tint: '#e9e6fb', bonus: null };
    return { key: 'snow', name: '雪径', tint: '#eef4fb', bonus: 'snow' };
  }

  function takeEven(free, n) {
    const out = [];
    if (n <= 0 || !free.length) return out;
    const count = Math.min(n, free.length);
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const k = Math.floor(i * free.length / count);
      if (!seen.has(free[k])) { seen.add(free[k]); out.push(free[k]); }
    }
    for (let i = 0; i < free.length && out.length < count; i++) {
      if (!seen.has(free[i])) { seen.add(free[i]); out.push(free[i]); }
    }
    const set = new Set(out);
    for (let i = free.length - 1; i >= 0; i--) if (set.has(free[i])) free.splice(i, 1);
    return out;
  }

  function span(a, b, fn) {
    const p = [];
    const step = a <= b ? 1 : -1;
    for (let i = a; ; i += step) { p.push(fn(i)); if (i === b) break; }
    return p;
  }

  /* 手绘闭环：外圈大富翁环 + 内圈 + 北侧小回廊。起点 (0,10) 与终点 (1,10) 相邻。 */
  function boardPath() {
    return []
      .concat(span(10, 0, y => [0, y]))
      .concat(span(1, 15, x => [x, 0]))
      .concat(span(1, 10, y => [15, y]))
      .concat(span(14, 2, x => [x, 10]))
      .concat(span(2, 14, x => [x, 9]))
      .concat(span(8, 1, y => [14, y]))
      .concat(span(13, 8, x => [x, 1]))
      .concat(span(2, 5, y => [8, y]))
      .concat([[7, 5]])
      .concat(span(5, 1, y => [6, y]))
      .concat(span(5, 1, x => [x, 1]))
      .concat(span(2, 9, y => [1, y]))
      .concat([[1, 10]]);
  }

  /* 路上擦肩而过的近道，按跨度从短到长；junctionCount 取前 N 条。 */
  const DESIGNED_ALTS = [
    [44, 53],
    [36, 61],
    [26, 69],
    [49, 98],
  ];

  function buildS(rng, randomLayout, junctionCount) {
    const pts = boardPath();
    const nJunc = junctionCount == null ? 0 : Math.max(0, junctionCount | 0);
    const altLinks = DESIGNED_ALTS.slice(0, nJunc);
    const order = randomLayout === false
      ? GROUP_DEFS.map((_, i) => i)
      : rng.shuffle(GROUP_DEFS.map((_, i) => i));
    const GROUPS = {};
    GROUP_DEFS.forEach(g => { GROUPS[g.key] = { name: g.name, color: g.color, build: g.build }; });
    const propPlan = [];
    order.forEach(gi => {
      const def = GROUP_DEFS[gi];
      def.names.forEach((n, j) => propPlan.push({ g: def.key, name: n, price: def.prices[j], rent: def.rents[j] }));
    });
    const types = Array(BOARD_N).fill(null);
    types[0] = 'go'; types[25] = 'jail'; types[50] = 'park'; types[75] = 'gotojail';
    const free = [];
    for (let i = 0; i < BOARD_N; i++) if (!types[i]) free.push(i);
    takeEven(free, 30).forEach(i => types[i] = 'prop');
    takeEven(free, 6).forEach(i => types[i] = 'rail');
    takeEven(free, 3).forEach(i => types[i] = 'util');
    takeEven(free, 2).forEach(i => types[i] = 'tax');
    takeEven(free, 8).forEach(i => types[i] = 'chance');
    takeEven(free, 6).forEach(i => types[i] = 'fate');
    takeEven(free, 3).forEach(i => types[i] = 'lottery');
    takeEven(free, 2).forEach(i => types[i] = 'academy');
    takeEven(free, 12).forEach(i => types[i] = 'scenic');
    free.forEach(i => types[i] = 'path');

    const rails = SPECIALS.filter(s => s.t === 'rail').map(s => Object.assign({}, s));
    const utils = SPECIALS.filter(s => s.t === 'util').map(s => Object.assign({}, s));
    const taxes = SPECIALS.filter(s => s.t === 'tax').map(s => Object.assign({}, s));
    let ri = 0, ui = 0, ti = 0, pi = 0, si = 0, pai = 0;
    const S = [];
    for (let i = 0; i < BOARD_N; i++) {
      const y = pts[Math.min(i, pts.length - 1)][1], tn = terrainOf(y);
      const t = types[i];
      let tile;
      if (t === 'go') tile = { t: 'go', name: '门厅 · 出发', ico: '🎫' };
      else if (t === 'jail') tile = { t: 'jail', name: '小黑屋 · 探视', ico: '🐰' };
      else if (t === 'park') tile = { t: 'park', name: '下午茶角落', ico: '🍰' };
      else if (t === 'gotojail') tile = { t: 'gotojail', name: '被桌宠抓包', ico: '❗' };
      else if (t === 'rail') tile = rails[ri++] || { t: 'rail', name: '传送点', price: 2000 };
      else if (t === 'util') tile = utils[ui++] || { t: 'util', name: '充电桩', price: 1500 };
      else if (t === 'tax') tile = taxes[ti++] || { t: 'tax', name: '熬夜税', rate: 0.10, cap: 2000 };
      else if (t === 'chance') tile = { t: 'chance', name: '便利贴', ico: '🗒️' };
      else if (t === 'fate') tile = { t: 'fate', name: '悄悄话', ico: '🧷' };
      else if (t === 'lottery') tile = { t: 'lottery', name: '盲盒机', ico: '🎁' };
      else if (t === 'academy') tile = { t: 'academy', name: '进修班', ico: '📚' };
      else if (t === 'prop') {
        const pp = propPlan[pi++] || { g: 'g1', name: '空地', price: 600, rent: [20, 100, 300, 800, 1300, 1800] };
        tile = P(pp.name, pp.g, pp.price, pp.rent);
      } else if (t === 'scenic') {
        const s = SCENIC[si++] || SCENIC[SCENIC.length - 1];
        tile = { t: 'scenic', name: s.name, amt: s.amt };
      } else {
        const s = PATH_FLAVOR[pai++] || PATH_FLAVOR[0];
        tile = { t: 'path', name: s.name, ico: s.ico };
      }
      delete tile.alt;
      tile.terrain = tn.key;
      tile.pos = pts[Math.min(i, pts.length - 1)];
      tile.next = (i + 1) % BOARD_N;
      S.push(tile);
    }
    altLinks.forEach(([a, b]) => { if (S[a] && b >= 0 && b < S.length) S[a].alt = b; });
    return { S, GROUPS };
  }

  function groupIdxs(S, g) { return S.map((s, i) => s.g === g ? i : -1).filter(i => i >= 0); }
  function ownsGroup(S, G, p, g) { return groupIdxs(S, g).every(i => G.own[i] === p.id); }
  function completesGroup(S, G, p, i) {
    const g = S[i].g;
    return groupIdxs(S, g).filter(x => x !== i).every(x => G.own[x] === p.id);
  }
  function minLvl(S, G, g) { return Math.min(...groupIdxs(S, g).map(i => G.lvl[i] || 0)); }
  function maxLvl(S, G, g) { return Math.max(...groupIdxs(S, g).map(i => G.lvl[i] || 0)); }
  function stripBrokenGroups(S, G, GROUPS) {
    if (!G || !GROUPS) return;
    Object.keys(GROUPS).forEach(g => {
      const idxs = groupIdxs(S, g);
      if (idxs.length < 2) return;
      const o0 = G.own[idxs[0]];
      if (o0 == null || idxs.some(i => G.own[i] !== o0)) idxs.forEach(i => { G.lvl[i] = 0; });
    });
  }
  function assignOwn(S, G, GROUPS, i, pid) {
    G.own[i] = pid;
    stripBrokenGroups(S, G, GROUPS);
  }
  function canBuild(S, G, p, i) {
    const sq = S[i]; if (sq.t !== 'prop') return false;
    if (G.own[i] !== p.id || G.mort[i] || (G.lvl[i] || 0) >= 5) return false;
    if (!ownsGroup(S, G, p, sq.g)) return false;
    if (groupIdxs(S, sq.g).some(x => G.mort[x])) return false;
    return (G.lvl[i] || 0) === minLvl(S, G, sq.g);
  }
  function canSellLvl(S, G, p, i) {
    const sq = S[i]; if (sq.t !== 'prop') return false;
    return G.own[i] === p.id && G.lvl[i] > 0 && G.lvl[i] === maxLvl(S, G, sq.g);
  }
  function canMort(S, G, p, i) {
    const sq = S[i]; if (!sq.price) return false;
    if (G.own[i] !== p.id || G.mort[i] || G.lvl[i] > 0) return false;
    if (sq.t === 'prop' && groupIdxs(S, sq.g).some(x => G.lvl[x] > 0)) return false;
    return true;
  }
  function unmortCost(S, i) { return Math.ceil(S[i].price * 1.1 / 100) * 100; }
  function rentOf(S, G, GROUPS, i, rollSum, mods) {
    const sq = S[i], owner = G.players[G.own[i]];
    let r = 0;
    if (sq.t === 'prop') r = sq.rent[G.lvl[i] || 0] || 0;
    if (sq.t === 'prop' && G.decor && G.decor[sq.g]) r = Math.round(r * DECOR_MULT);
    else if (sq.t === 'rail') {
      const n = S.reduce((a, s, k) => a + (s.t === 'rail' && G.own[k] === owner.id ? 1 : 0), 0);
      r = RAIL_RENT[Math.min(n, RAIL_RENT.length - 1)] || 0;
    } else if (sq.t === 'util') {
      const n = S.reduce((a, s, k) => a + (s.t === 'util' && G.own[k] === owner.id ? 1 : 0), 0);
      r = rollSum * (n >= 3 ? 140 : n >= 2 ? 100 : 40);
    }
    if (mods && mods.rent) r = Math.round(r * mods.rent);
    return r;
  }
  function scoreOf(S, G, GROUPS, p) {
    let s = p.cash + p.fund + (p.stonk || 0) * (G.stonk || 100);
    S.forEach((sq, i) => {
      if (G.own[i] === p.id) {
        s += G.mort[i] ? Math.floor(sq.price / 2) : sq.price;
        s += (G.lvl[i] || 0) * (sq.t === 'prop' ? GROUPS[sq.g].build : 0);
      }
    });
    return s;
  }

  const ACHIEVE_KEY = 'stationpoly.achieve.v1';
  const ACHIEVEMENTS = [
    { id: 'first_finish', name: '完赛纪念', desc: '看过一次终局盘点' },
    { id: 'champion', name: '站长之位', desc: '人类玩家总资产第一' },
    { id: 'intern', name: '工牌战士', desc: '破产当过实习生' },
    { id: 'group', name: '圈地运动', desc: '集齐一组同色地块' },
    { id: 'hotel', name: '上线狂魔', desc: '同时拥有 2 处上线' },
    { id: 'gamble', name: '手气爆棚', desc: '赢下一次下午茶轮盘' },
    { id: 'trade', name: '社交达人', desc: '完成一笔交易' },
    { id: 'raider', name: '恶意并购', desc: '成功收购 1 处地块' },
    { id: 'rails', name: '传送全通', desc: '同时持有全部 6 条传送设施' },
  ];
  function loadAchievements() {
    try {
      const r = JSON.parse(root.localStorage ? root.localStorage.getItem(ACHIEVE_KEY) || '{}' : '{}');
      return r && typeof r === 'object' ? r : {};
    } catch (e) { return {}; }
  }
  function saveAchievements(map) {
    try { if (root.localStorage) root.localStorage.setItem(ACHIEVE_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function unlockAchievement(id) {
    const map = loadAchievements();
    if (map[id]) return false;
    map[id] = Date.now();
    saveAchievements(map);
    return true;
  }
  function scanAchievements(S, G, p) {
    const unlocked = [];
    const tryId = id => { if (unlockAchievement(id)) unlocked.push(id); };
    if (!p || !G || !S) return unlocked;
    if (Object.keys(GROUPS_FROM(S)).some(g => ownsGroup(S, G, p, g))) tryId('group');
    if (S.filter((s, i) => G.own[i] === p.id && (G.lvl[i] || 0) >= 5).length >= 2) tryId('hotel');
    if (S.filter((s, i) => s.t === 'rail' && G.own[i] === p.id).length >= 6) tryId('rails');
    if ((p.gambleWins || 0) >= 1) tryId('gamble');
    if ((p.tradeCount || 0) >= 1) tryId('trade');
    if ((p.takeoverCount || 0) >= 1) tryId('raider');
    return unlocked;
  }
  function GROUPS_FROM(S) {
    const g = {};
    S.forEach(s => { if (s.g) g[s.g] = true; });
    return g;
  }

  function padOwnArrays(G, n) {
    if (!G) return G;
    G.own = G.own || [];
    G.lvl = G.lvl || [];
    G.mort = G.mort || [];
    while (G.own.length < n) G.own.push(null);
    while (G.lvl.length < n) G.lvl.push(0);
    while (G.mort.length < n) G.mort.push(false);
    return G;
  }

  function migrateSave(data) {
    if (!data || !data.G || !data.G.started) return null;
    const G = data.G;
    const n = (G.layout && G.layout.S && G.layout.S.length) || BOARD_N;
    padOwnArrays(G, n);
    if (G.seed == null) G.seed = parseSeed('');
    data.v = SAVE_VER;
    return data;
  }

  root.StationPolyEngine = {
    createRng, parseSeed,
    P, GROUP_DEFS, BOARD_N, RAIL_RENT, DECOR_MULT, PATH_FLAVOR, SCENIC, SPECIALS,
    MAP_COLS, MAP_ROWS, SALARY, JAIL_FINE, REDEEM, REDEEM_CASH, ITEM_CAP, SAVE_VER, SAVE_KEY,
    terrainOf, buildS, boardPath,
    groupIdxs, ownsGroup, completesGroup, minLvl, maxLvl,
    stripBrokenGroups, assignOwn, canBuild, canSellLvl, canMort, unmortCost, rentOf, scoreOf,
    ACHIEVEMENTS, loadAchievements, unlockAchievement, scanAchievements, padOwnArrays, migrateSave,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
