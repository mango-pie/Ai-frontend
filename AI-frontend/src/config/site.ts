/**
 * 站点文案与链接配置 — 个人化时只需修改此文件
 */
import type {
  PetGifAliasMap,
  PetGifAssetMap,
  PetGifOverlayAliasMap,
  PetGifOverlayMap,
  PetGifStateMap,
  PetRendererKind,
} from '@/pet/types'

// 站点头像：借助 Vite 的 import.meta.url 直接引用 assets 下的图片资源
export const siteAvatarSrc = new URL('../assets/head.jpg', import.meta.url).href

// 站点全局配置（文案 / 链接 / 各分区标题 / 背景轮换 / 视觉特效 / 桌宠参数），`as const` 保证类型精确
export const siteConfig = {
  siteName: '某某の小站',
  siteSubtitle: '在代码、笔记与灵感实验间穿梭',
  /** 顶栏罗马字副标 */
  brandRoman: 'MOUMOU NO STATION',
  /** 主标题上方日文假名 */
  brandKana: 'モウモウ ノ ステーション',
  /** 标题旁贴纸文案 */
  heroSticker: '欢迎来到我的小世界 ♪',
  ownerName: '开发者',
  bio: '在代码与日常之间慢慢摸索的普通人。喜欢记录技术笔记，偶尔用 AI 做点有趣的小实验。',
  avatar: siteAvatarSrc,

  // 各“房间”（功能分区）的标题与副标提示，供首页房间导航卡片等使用
  rooms: {
    blog: { title: '随笔', hint: '杂志式阅读与记录' },
    diary: { title: '日记', hint: '写给自己的手账' },
    worklog: { title: '工作日志', hint: '每日事务与进度留痕' },
    knowledge: { title: '知识库', hint: '文档与问答' },
    lab: { title: '实验室', hint: '一句话生成小应用' },
    chat: { title: '对话', hint: '继续未完的交谈' },
    music: { title: '音乐', hint: 'Pulse 舞台播放器' },
  },

  blogTitle: '随笔',
  blogSubtitle: '记录想法与实验笔记',

  diaryTitle: '日记',
  diarySubtitle: '写给自己的每日记录',

  worklogTitle: '工作日志',
  worklogSubtitle: '每日事务与进度留痕（登录可云端同步；与日记完全独立）',

  heroLabTitle: 'AI 实验室',
  heroLabDesc: '用一句话描述想法，生成可运行的小应用',
  heroLabPlaceholder: '例如：做一个简洁的个人待办清单，支持添加和勾选完成……',
  quickPrompts: ['个人主页', '待办清单', '读书笔记卡片', '暗黑风格仪表盘'],

  labPage: {
    subtitle: '描述你的想法，一键生成可运行的小应用',
    entryTitle: '进入 AI 实验室',
    entryDesc: '用一句话生成可运行的小应用，探索 AI 创作的可能',
    entryAction: '进入实验室',
  },

  sections: {
    latestPosts: '最新随笔',
    myExperiments: '我的小实验',
    inspiration: '灵感橱窗',
    emptyMyApps: '还没有实验作品，去实验室创建一个吧',
    emptyFeatured: '暂无推荐作品',
    recommendedAuthor: '站主推荐',
  },

  statsLabels: {
    posts: '文章',
    experiments: '实验',
    uptime: '站点运行',
  },

  about: {
    title: '关于我',
    skills: ['Vue 3', 'TypeScript', 'Spring Boot', 'MySQL', 'AI 应用'],
    interests: ['技术笔记', '分子模拟', '轻音乐'],
    contact: {
      email: { label: '邮箱', href: '#' },
      github: { label: 'GitHub', href: '#' },
    },
    techStack: 'Vue 3 · Vite · Ant Design Vue · Spring Boot',
  },

  footer: {
    tagline: '记录思考，分享实验',
    links: [
      { label: '关于', path: '/about' },
      { label: '随笔', path: '/blog' },
      { label: '实验室', path: '/lab' },
      { label: '友链', href: '#' },
    ],
    icp: '备案号占位',
  },

  music: {
    demoTracks: [
      { title: '背景轻音乐 · 一', artist: '氛围' },
      { title: '背景轻音乐 · 二', artist: '氛围' },
    ],
  },

  /** 全站背景图轮换：图片放在 src/assets/backgrounds/ */
  backgroundSlideshow: {
    enabled: true,
    intervalMs: 5_000,
    fadeMs: 1200,
  },

  // 全站视觉特效开关与参数：鼠标拖尾、气泡菜单、桌宠（GIF 渲染模式的状态映射与贴图别名）
  effects: {
    mouseTrail: {
      enabled: true,
    },
    bubbleMenu: {
      enabled: true,
      defaultOffset: 24,
      defaultBottomGap: 100,
    },
    petDango: {
      enabled: true,
      renderer: 'gif' as PetRendererKind,
      size: 64,
      wanderSpeed: 0.55,
      /** 单次漫游最大步长，相对较短视口边的比例（0.5 = 半屏） */
      wanderMaxStepRatio: 0.5,
      idleMinMs: 2000,
      idleMaxMs: 5000,
      sleepAfterMs: 180_000,
      showOnMobile: false,
      dialogueEnabled: true,
      defaultPosition: { x: 48, y: null as number | null },
      spriteUrl: '',
      gif: {
        fallbackState: 'idle',
        renderScale: 1.4,
        reactDurationMs: 800,
        /** 移动距离低于该比例时用 move，否则用 fly（相对较短视口边） */
        walkSlowDistanceRatio: 0.45,
        overlayEnabled: true,
        overlayChance: 0.18,
        overlayCooldownMs: 2200,
        overlayDurationMs: {
          jump: 700,
          happy: 900,
          sigh: 800,
        },
        assets: {
          click: 'click',
          default: 'default',
          fly: 'fly',
          move: 'move',
          music: 'music',
          jump: 'jump',
          happy: 'happy',
          sigh: 'sigh',
        } as PetGifAssetMap,
        stateMap: {
          idle: 'default',
          walk: 'move',
          react: 'click',
          sleep: 'default',
          drag: 'move',
        } as PetGifStateMap,
        aliases: {
          idle: ['default'],
          walk: ['move', 'fly'],
          react: ['click'],
          sleep: ['default', 'sigh'],
          drag: ['move', 'fly'],
        } as PetGifAliasMap,
        overlayMap: {
          jump: 'jump',
          happy: 'happy',
          sigh: 'sigh',
        } as PetGifOverlayMap,
        overlayAliases: {
          jump: ['jump'],
          happy: ['happy'],
          sigh: ['sigh'],
        } as PetGifOverlayAliasMap,
      },
    },
  },
} as const

export type SiteConfig = typeof siteConfig
