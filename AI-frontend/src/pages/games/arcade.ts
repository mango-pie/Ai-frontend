/**
 * 游戏舱共享逻辑：机台元信息 / 对局战绩仓库 / 偏好设置 / 芯片音效 / 小工具
 * - 战绩与偏好暂存 localStorage（首访内置少量示例数据便于演示，可一键清空）
 * - 后端 games 模块上线后，战绩可平滑切换为接口持久化（见 docs/GAMES_MODULE_HANDOFF.md）
 */
import { computed, ref } from 'vue'
import { AudioWaveform, Bird, Blocks, Bomb, Cherry, CircleDot, Coins, Contrast, Dices, Gavel, Grid3X3, Hash, Joystick, Layers, Link, PawPrint, Plane, Puzzle, Ship, SquareStack, Worm } from 'lucide-vue-next'

export type GameId =
  | 'g2048'
  | 'snake'
  | 'tetris'
  | 'mine'
  | 'puzzle'
  | 'mem'
  | 'mole'
  | 'simon'
  | 'breakout'
  | 'flappy'
  | 'catch'
  | 'tictac'
  | 'stack'
  | 'gomoku'
  | 'link'
  | 'connect'
  | 'reversi'
  | 'battleship'
  | 'jungle'
  | 'aeroplane'
  | 'monopoly'
export type MineDiff = 'easy' | 'hard' | 'master'
/** 人机对战难度（井字棋 / 五子棋 / 四子棋 / 黑白棋 / 海战棋 / 斗兽棋共用） */
export type VsDiff = 'easy' | 'normal' | 'hard'

export interface ArcadeGameMeta {
  id: GameId
  name: string
  sub: string
  desc: string
  icon: typeof Hash
  /** 机台图标的品牌渐变（与站点粉紫暖橘家族一致） */
  grad: string
}

export const ARCADE_GAMES: ArcadeGameMeta[] = [
  { id: 'g2048', name: '2048', sub: 'GAME 2048', desc: '滑动合并，冲向 2048', icon: Hash, grad: 'linear-gradient(140deg,#ffcf6e,#f490ad)' },
  { id: 'snake', name: '贪吃蛇', sub: 'SNAKE', desc: '吃到越多，长得越长', icon: Worm, grad: 'linear-gradient(140deg,#5fc4a5,#ffcf6e)' },
  { id: 'tetris', name: '俄罗斯方块', sub: 'TETRIS', desc: '拼合四格，消行不停', icon: Blocks, grad: 'linear-gradient(140deg,#6aaee8,#c79ae0)' },
  { id: 'mine', name: '扫雷', sub: 'MINESWEEPER', desc: '凭数字推理，避开每一颗雷', icon: Bomb, grad: 'linear-gradient(140deg,#9b8ce8,#c79ae0)' },
  { id: 'puzzle', name: '数字华容道', sub: '15 PUZZLE', desc: '滑回 1–15 的秩序', icon: Puzzle, grad: 'linear-gradient(140deg,#6aaee8,#9b8ce8)' },
  { id: 'mem', name: '记忆翻牌', sub: 'MEMORY FLIP', desc: '翻出所有成对的卡牌', icon: Layers, grad: 'linear-gradient(140deg,#5fc4a5,#6aaee8)' },
  { id: 'mole', name: '打地鼠', sub: 'WHACK-A-MOLE', desc: '三十秒，敲中每一只', icon: Gavel, grad: 'linear-gradient(140deg,#ffa45c,#e0699b)' },
  { id: 'simon', name: '记忆节拍', sub: 'MEMORY BEAT', desc: '跟着音阶，一步步复述', icon: AudioWaveform, grad: 'linear-gradient(140deg,#c79ae0,#ffcf6e)' },
  { id: 'breakout', name: '打砖块', sub: 'BREAKOUT', desc: '弹球清砖，别丢三颗心', icon: Joystick, grad: 'linear-gradient(140deg,#f490ad,#ffa45c)' },
  { id: 'flappy', name: '像素飞行', sub: 'FLAPPY', desc: '点按振翅，穿过管道', icon: Bird, grad: 'linear-gradient(140deg,#ffcf6e,#6aaee8)' },
  { id: 'catch', name: '接水果', sub: 'FRUIT CATCH', desc: '接住每一颗掉落的水果', icon: Cherry, grad: 'linear-gradient(140deg,#5fc4a5,#f490ad)' },
  { id: 'tictac', name: '井字棋', sub: 'TIC-TAC-TOE', desc: '跟 AI 斗智，三连制胜', icon: Grid3X3, grad: 'linear-gradient(140deg,#9b8ce8,#6aaee8)' },
  { id: 'stack', name: '叠塔方块', sub: 'STACK TOWER', desc: '看准时机，一层层叠高', icon: SquareStack, grad: 'linear-gradient(140deg,#ffcf6e,#5fc4a5)' },
  { id: 'gomoku', name: '五子棋', sub: 'GOMOKU', desc: '棋逢对手，五连制胜', icon: CircleDot, grad: 'linear-gradient(140deg,#4c5570,#9b8ce8)' },
  { id: 'link', name: '连连看', sub: 'LINK-UP', desc: '两折以内，配对消除', icon: Link, grad: 'linear-gradient(140deg,#5fc4a5,#c79ae0)' },
  { id: 'connect', name: '四子棋', sub: 'CONNECT FOUR', desc: '重力落子，四连成线', icon: Coins, grad: 'linear-gradient(140deg,#ffcf6e,#6aaee8)' },
  { id: 'reversi', name: '黑白棋', sub: 'REVERSI', desc: '夹住翻转，占满棋盘', icon: Contrast, grad: 'linear-gradient(140deg,#4c5570,#5fc4a5)' },
  { id: 'battleship', name: '海战棋', sub: 'SEA BATTLE', desc: '布阵开炮，击沉全部舰队', icon: Ship, grad: 'linear-gradient(140deg,#6aaee8,#4c5570)' },
  { id: 'jungle', name: '斗兽棋', sub: 'JUNGLE CHESS', desc: '鼠可胜象，直捣兽穴者王', icon: PawPrint, grad: 'linear-gradient(140deg,#ffa45c,#6aaee8)' },
  { id: 'aeroplane', name: '飞行棋', sub: 'AEROPLANE CHESS', desc: '掷六起飞，跳格飞行抢先抵终', icon: Plane, grad: 'linear-gradient(140deg,#7ed8a0,#5fc4a5)' },
  { id: 'monopoly', name: '大富翁', sub: 'STATION POLY', desc: '掷骰买地，经营你的小站版图', icon: Dices, grad: 'linear-gradient(140deg,#f490ad,#9b8ce8)' },
]

export function gameMeta(id: GameId): ArcadeGameMeta {
  return ARCADE_GAMES.find((g) => g.id === id) ?? ARCADE_GAMES[0]!
}

/** 一条对局记录：2048/贪吃蛇/打砖块记分数，扫雷记胜负/用时/难度，华容道/翻牌记步数，俄罗斯方块记消行数 */
export interface ArcadeRecord {
  g: GameId
  t: number
  dur: number
  score?: number
  win?: boolean
  diff?: MineDiff
  moves?: number
  cols?: number
  lines?: number
}

export interface ArcadeBest {
  label: string
  value: string
  raw: number
}

export interface ArcadeAggregate {
  total: number
  week: number
  durMin: number
  winRate: number | null
}

const RECORDS_KEY = 'ai-arcade-records-v1'

/** 首访示例数据：覆盖近 7 天三台机台，让战绩舱开箱不空 */
function seedDemoRecords(): ArcadeRecord[] {
  const now = Date.now()
  const H = 3600e3
  const D = 86400e3
  const demo: Array<Omit<ArcadeRecord, 't'> & { t: number }> = [
    { g: 'g2048', score: 736, dur: 210, win: false, t: now - 6.1 * D },
    { g: 'mem', moves: 34, dur: 96, win: true, cols: 4, t: now - 5.6 * D },
    { g: 'mine', diff: 'easy', win: true, dur: 88, t: now - 4.9 * D },
    { g: 'g2048', score: 1132, dur: 305, win: false, t: now - 4.2 * D },
    { g: 'mine', diff: 'easy', win: false, dur: 64, t: now - 3.6 * D },
    { g: 'mem', moves: 27, dur: 78, win: true, cols: 4, t: now - 3.1 * D },
    { g: 'g2048', score: 988, dur: 266, win: false, t: now - 2.5 * D },
    { g: 'mine', diff: 'hard', win: false, dur: 152, t: now - 2.2 * D },
    { g: 'mem', moves: 31, dur: 88, win: true, cols: 4, t: now - 1.7 * D },
    { g: 'g2048', score: 1560, dur: 388, win: false, t: now - 1.3 * D },
    { g: 'mine', diff: 'easy', win: true, dur: 71, t: now - 22 * H },
    { g: 'mem', moves: 24, dur: 70, win: true, cols: 4, t: now - 9 * H },
    { g: 'g2048', score: 1236, dur: 322, win: false, t: now - 5 * H },
    { g: 'mine', diff: 'easy', win: true, dur: 66, t: now - 2 * H },
    { g: 'snake', score: 18, dur: 142, t: now - 3.4 * D },
    { g: 'puzzle', moves: 96, dur: 218, win: true, t: now - 2.8 * D },
    { g: 'breakout', score: 340, dur: 186, win: false, t: now - 1.9 * D },
    { g: 'snake', score: 26, dur: 171, t: now - 11 * H },
    { g: 'breakout', score: 520, dur: 244, win: true, t: now - 7 * H },
    { g: 'tetris', score: 1240, lines: 5, dur: 402, t: now - 4.4 * D },
    { g: 'mole', score: 140, dur: 30, t: now - 3.3 * D },
    { g: 'simon', score: 7, dur: 154, t: now - 2.4 * D },
    { g: 'tetris', score: 620, lines: 2, dur: 233, t: now - 20 * H },
    { g: 'mole', score: 190, dur: 30, t: now - 6 * H },
    { g: 'flappy', score: 12, dur: 96, t: now - 4.1 * D },
    { g: 'catch', score: 18, dur: 128, t: now - 3.2 * D },
    { g: 'tictac', score: 2, win: true, dur: 44, t: now - 2.6 * D },
    { g: 'flappy', score: 21, dur: 132, t: now - 15 * H },
    { g: 'catch', score: 25, dur: 151, t: now - 4 * H },
    { g: 'stack', score: 14, dur: 96, t: now - 3.8 * D },
    { g: 'gomoku', score: 1, win: true, dur: 168, t: now - 3 * D },
    { g: 'link', score: 30, win: true, dur: 212, t: now - 2.2 * D },
    { g: 'stack', score: 22, dur: 128, t: now - 13 * H },
  ]
  return demo.map((r) => ({ ...r, t: Math.round(r.t) }))
}

function loadRecords(): ArcadeRecord[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? 'null')
    if (Array.isArray(raw)) return raw as ArcadeRecord[]
  } catch {
    /* 数据损坏时落入示例数据 */
  }
  const demo = seedDemoRecords()
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(demo))
  } catch {
    /* 隐私模式等写入失败场景忽略 */
  }
  return demo
}

/** 模块级单例：机台侧栏、游戏组件、战绩舱共享同一份响应式战绩 */
const records = ref<ArcadeRecord[]>(loadRecords())

function persistRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records.value.slice(-400)))
  } catch {
    /* 忽略写入失败 */
  }
}

export function useArcadeRecords() {
  const addRecord = (rec: Omit<ArcadeRecord, 't'>) => {
    records.value.push({ ...rec, t: Date.now() })
    if (records.value.length > 400) records.value = records.value.slice(-400)
    persistRecords()
  }
  const clearRecords = () => {
    records.value = []
    persistRecords()
  }
  /** 机台纪录：扫雷/连连看取最快通关，华容道/翻牌取最少步数，其余取最高分（井字棋/五子棋/斗兽棋等为最长连胜） */
  const bestOf = (gid: GameId): ArcadeBest | null => {
    const rs = records.value.filter((r) => r.g === gid)
    if (!rs.length) return null
    if (gid === 'mine' || gid === 'link') {
      const wins = rs.filter((r) => r.win)
      if (!wins.length) return null
      const raw = Math.min(...wins.map((r) => r.dur))
      return { label: '最快通关', value: fmtDur(raw), raw }
    }
    if (gid === 'puzzle' || gid === 'mem') {
      const raw = Math.min(...rs.map((r) => r.moves ?? 0))
      return { label: '最少步数', value: raw + ' 步', raw }
    }
    const raw = Math.max(...rs.map((r) => r.score ?? 0))
    return {
      label: ['tictac', 'gomoku', 'connect', 'reversi', 'battleship', 'jungle', 'aeroplane'].includes(gid) ? '最长连胜' : '最高分',
      value: fmtInt(raw),
      raw,
    }
  }
  const aggregate = computed<ArcadeAggregate>(() => {
    const now = Date.now()
    const withWin = records.value.filter((r) => typeof r.win === 'boolean')
    return {
      total: records.value.length,
      week: records.value.filter((r) => now - r.t < 7 * 86400e3).length,
      durMin: Math.round(records.value.reduce((s, r) => s + (r.dur || 0), 0) / 60),
      winRate: withWin.length
        ? Math.round((withWin.filter((r) => r.win).length / withWin.length) * 100)
        : null,
    }
  })
  return { records, addRecord, clearRecords, bestOf, aggregate }
}

/** 秒 → 不足一分钟显示 Ns，否则 m:ss */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/** 千分位整数 */
export function fmtInt(n: number): string {
  return Number(n).toLocaleString('zh-CN')
}

/** 时间戳 → 相对时间文案（战绩列表用） */
export function relTime(t: number): string {
  const d = Date.now() - t
  if (d < 60e3) return '刚刚'
  if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前'
  if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前'
  const days = Math.floor(d / 86400e3)
  if (days < 7) return days + ' 天前'
  return new Date(t).toLocaleDateString('zh-CN')
}

/** 数字滚动动画（战绩舱总览卡片用） */
export function countUp(el: HTMLElement, target: number, dur = 700) {
  const start = performance.now()
  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    el.textContent = fmtInt(Math.round(target * eased))
    if (p < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/* ================= 偏好设置（正式版对应用户偏好存储） ================= */

export interface ArcadeSettings {
  sound: boolean
  dust: boolean
  density: 'cozy' | 'compact'
  undo2048: boolean
  memCols: 4 | 6
  playerName: string
  /** 人机对战难度（各棋类独立记忆） */
  tictacDiff: VsDiff
  gomokuDiff: VsDiff
  connectDiff: VsDiff
  reversiDiff: VsDiff
  battleshipDiff: VsDiff
  jungleDiff: VsDiff
  aeroplaneDiff: VsDiff
}

const SETTINGS_KEY = 'ai-arcade-settings-v1'
const DEFAULT_SETTINGS: ArcadeSettings = {
  sound: true,
  dust: true,
  density: 'cozy',
  undo2048: false,
  memCols: 4,
  playerName: '',
  tictacDiff: 'normal',
  gomokuDiff: 'normal',
  connectDiff: 'normal',
  reversiDiff: 'normal',
  battleshipDiff: 'normal',
  jungleDiff: 'normal',
  aeroplaneDiff: 'normal',
}

function loadSettings(): ArcadeSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (raw && typeof raw === 'object') return { ...DEFAULT_SETTINGS, ...(raw as Partial<ArcadeSettings>) }
  } catch {
    /* 忽略损坏数据 */
  }
  return { ...DEFAULT_SETTINGS }
}

const settings = ref<ArcadeSettings>(loadSettings())

export function useArcadeSettings() {
  const update = (patch: Partial<ArcadeSettings>) => {
    settings.value = { ...settings.value, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
    } catch {
      /* 忽略写入失败 */
    }
  }
  const reset = () => {
    settings.value = { ...DEFAULT_SETTINGS }
    try {
      localStorage.removeItem(SETTINGS_KEY)
    } catch {
      /* 忽略 */
    }
  }
  return { settings, update, reset }
}

/* ================= 芯片音效（WebAudio 合成，零素材） ================= */

class ArcadeSound {
  enabled = true
  private ctx: AudioContext | null = null

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  chord(freqs: number[], dur = 0.16, vol = 0.055) {
    freqs.forEach((f, i) => window.setTimeout(() => this.blip(f, dur, 'triangle', vol), i * 75))
  }
  /** 单音（记忆节拍的音阶用） */
  note(freq: number, dur = 0.28, vol = 0.07) {
    this.blip(freq, dur, 'triangle', vol)
  }
  click() {
    this.blip(720, 0.045, 'square', 0.035)
  }
  move() {
    this.blip(230, 0.045, 'triangle', 0.05)
  }
  merge(v: number) {
    this.blip(320 + (Math.min(v, 2048) / 2048) * 480, 0.09, 'triangle', 0.06)
  }
  flip() {
    this.blip(540, 0.05, 'triangle', 0.05)
  }
  match() {
    this.chord([523, 659], 0.12)
  }
  win() {
    this.chord([523, 659, 784, 1046], 0.18)
  }
  lose() {
    this.blip(300, 0.42, 'sawtooth', 0.045, 130)
  }
}

export const arcadeSound = new ArcadeSound()
