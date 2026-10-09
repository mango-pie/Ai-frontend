/**
 * GIF 素材解析（atlas）：把 src/assets/ams 目录下的 GIF/WebP 文件
 * 按文件名“猜”到桌宠的 8 个素材槽位与各核心/覆盖状态上。
 *
 * 匹配优先级：站点配置的精确提示（assets / stateMap / overlayMap）
 * -> 配置别名模糊匹配（aliases / overlayAliases）-> 回退状态 / default。
 * 目的是让素材只需按相近命名丢进目录即可生效，同时保留配置覆盖能力。
 */
import { siteConfig } from '@/config/site'
import type {
  PetGifAliasMap,
  PetGifAssetKey,
  PetGifAssetMap,
  PetGifOverlayAliasMap,
  PetGifOverlayMap,
  PetOverlayState,
  PetGifStateMap,
  PetState,
  PetViewModel,
} from './types'

/** 全部核心状态，遍历用 */
const PET_STATES: PetState[] = ['idle', 'walk', 'react', 'sleep', 'drag']
/** 全部覆盖（微行为）状态，遍历用 */
const PET_OVERLAY_STATES: PetOverlayState[] = ['jump', 'happy', 'sigh']
/** 8 个素材槽位的固定顺序，解析时按此顺序占位避免同一文件被重复占用 */
const PET_ASSET_KEYS: PetGifAssetKey[] = [
  'click',
  'default',
  'fly',
  'move',
  'music',
  'jump',
  'happy',
  'sigh',
]

/** 用 Vite glob 静态收集 ams 目录下全部 GIF/WebP（扩展名大小写各扫一遍），得到 源路径 -> 构建后 URL */
const gifModules = {
  ...import.meta.glob('../assets/ams/**/*.gif', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob('../assets/ams/**/*.GIF', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob('../assets/ams/**/*.webp', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob('../assets/ams/**/*.WEBP', {
    eager: true,
    import: 'default',
  }),
} as Record<string, string>

/** 单个 GIF 素材条目：源路径、构建后 URL 与归一化文件名（匹配依据） */
interface GifAssetEntry {
  filePath: string
  url: string
  fileName: string
  normalizedName: string
}

/**
 * 解析结果：8 个素材槽位的 URL、核心/覆盖状态映射，
 * 以及命中统计与未匹配文件清单（供渲染与开发期诊断使用）。
 */
export interface ResolvedPetGifAtlas {
  assets: Record<PetGifAssetKey, string>
  coreMap: Record<PetState, string>
  overlayMap: Record<PetOverlayState, string>
  loadedFiles: string[]
  unmatchedFiles: string[]
  hasAllCoreStates: boolean
  hasAllOverlayStates: boolean
  hasAllStates: boolean
  matchedStateCount: number
  fallbackState: PetState
}

/** 归一化文件名/提示词：去扩展名、去分隔符、转小写，仅保留字母数字与中文，便于宽松匹配 */
function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[_\-\s]+/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

/** 把 glob 收集到的模块整理为素材条目，并预先计算归一化名 */
function normalizeAssets(): GifAssetEntry[] {
  return Object.entries(gifModules).map(([filePath, url]) => {
    const fileName = filePath.split('/').pop() ?? filePath
    return {
      filePath,
      url,
      fileName,
      normalizedName: normalizeToken(fileName),
    }
  })
}

/**
 * 按提示词（文件名或别名）挑选素材：
 * 先做归一化后的精确相等匹配，再做互相包含的模糊匹配；
 * 已被其它槽位占用的文件跳过，避免一图多用。
 */
function pickByHint(
  assets: GifAssetEntry[],
  used: Set<string>,
  hint: string | undefined,
): GifAssetEntry | null {
  if (!hint) return null
  const normalizedHint = normalizeToken(hint)
  if (!normalizedHint) return null

  const exact = assets.find(
    (asset) =>
      !used.has(asset.filePath) &&
      (asset.normalizedName === normalizedHint || asset.fileName === hint),
  )
  if (exact) return exact

  const fuzzy = assets.find(
    (asset) =>
      !used.has(asset.filePath) &&
      (asset.normalizedName.includes(normalizedHint) || normalizedHint.includes(asset.normalizedName)),
  )
  return fuzzy ?? null
}

/** 逐个素材槽位按配置提示（缺省用键名本身）匹配文件，未命中记为空串 */
function resolveAssets(
  entries: GifAssetEntry[],
  assetMap: PetGifAssetMap,
): Record<PetGifAssetKey, string> {
  const used = new Set<string>()
  const assets = {} as Record<PetGifAssetKey, string>

  for (const key of PET_ASSET_KEYS) {
    const matched = pickByHint(entries, used, assetMap[key] ?? key)
    if (matched) {
      assets[key] = matched.url
      used.add(matched.filePath)
    } else {
      assets[key] = ''
    }
  }

  return assets
}

/** 按配置 stateMap 的精确提示解析核心状态 -> 素材 */
function resolveFromConfig(
  assets: GifAssetEntry[],
  used: Set<string>,
  stateMap: PetGifStateMap,
): Partial<Record<PetState, GifAssetEntry>> {
  const resolved: Partial<Record<PetState, GifAssetEntry>> = {}
  for (const state of PET_STATES) {
    const matched = pickByHint(assets, used, stateMap[state])
    if (!matched) continue
    resolved[state] = matched
    used.add(matched.filePath)
  }
  return resolved
}

/** 按配置 aliases 的别名列表逐个尝试模糊匹配核心状态 */
function resolveByAliases(
  assets: GifAssetEntry[],
  used: Set<string>,
  aliases: PetGifAliasMap,
): Partial<Record<PetState, GifAssetEntry>> {
  const resolved: Partial<Record<PetState, GifAssetEntry>> = {}
  for (const state of PET_STATES) {
    const words = aliases[state] ?? []
    for (const word of words) {
      const matched = pickByHint(assets, used, word)
      if (!matched) continue
      resolved[state] = matched
      used.add(matched.filePath)
      break
    }
  }
  return resolved
}

/** 按配置 overlayMap 的精确提示解析覆盖状态 -> 素材 */
function resolveOverlayFromConfig(
  assets: GifAssetEntry[],
  used: Set<string>,
  overlayMap: PetGifOverlayMap,
): Partial<Record<PetOverlayState, GifAssetEntry>> {
  const resolved: Partial<Record<PetOverlayState, GifAssetEntry>> = {}
  for (const state of PET_OVERLAY_STATES) {
    const matched = pickByHint(assets, used, overlayMap[state])
    if (!matched) continue
    resolved[state] = matched
    used.add(matched.filePath)
  }
  return resolved
}

/** 按配置 overlayAliases 的别名列表逐个尝试模糊匹配覆盖状态 */
function resolveOverlayByAliases(
  assets: GifAssetEntry[],
  used: Set<string>,
  aliases: PetGifOverlayAliasMap,
): Partial<Record<PetOverlayState, GifAssetEntry>> {
  const resolved: Partial<Record<PetOverlayState, GifAssetEntry>> = {}
  for (const state of PET_OVERLAY_STATES) {
    const words = aliases[state] ?? []
    for (const word of words) {
      const matched = pickByHint(assets, used, word)
      if (!matched) continue
      resolved[state] = matched
      used.add(matched.filePath)
      break
    }
  }
  return resolved
}

/**
 * 运行时选图：根据当前模型（覆盖动画 / 状态 / 步速 / 音乐）
 * 从 atlas 里选出应显示的 GIF URL，逐级兜底到 default。
 */
export function resolvePetGifUrl(
  model: Pick<PetViewModel, 'state' | 'overlay' | 'walkPace' | 'musicPlaying'>,
  atlas: ResolvedPetGifAtlas,
): string {
  // 覆盖动画优先级最高：jump/happy/sigh 播完自然回到状态图
  if (model.overlay) {
    return atlas.overlayMap[model.overlay] || atlas.assets[model.overlay] || atlas.assets.default
  }

  switch (model.state) {
    case 'idle':
      // 听歌时待机图切换为 music 素材
      return model.musicPlaying
        ? atlas.assets.music || atlas.assets.default
        : atlas.assets.default
    case 'walk':
      // 快走（长距离）用 fly，慢走用 move
      return model.walkPace === 'fast'
        ? atlas.assets.fly || atlas.assets.move
        : atlas.assets.move
    case 'react':
      return atlas.assets.click
    case 'sleep':
      return atlas.assets.default
    case 'drag':
      return atlas.assets.fly || atlas.assets.move
    default:
      return atlas.assets.default
  }
}

/**
 * 解析整本 atlas：
 * 1. 先按素材槽位占位 8 个 key；2. 再补核心/覆盖状态映射（别名结果会被精确配置覆盖）；
 * 3. 未命中的核心状态统一落到回退素材；4. 最后统计未匹配文件，供开发期诊断。
 */
export function resolvePetGifAtlas(): ResolvedPetGifAtlas {
  const entries = normalizeAssets()
  const cfg = siteConfig.effects.petDango.gif
  const fallbackState = cfg.fallbackState
  const assets = resolveAssets(entries, cfg.assets)
  const used = new Set<string>()

  // 槽位解析已占用的文件同步进 used，后续状态解析不得复用
  for (const entry of entries) {
    if (Object.values(assets).includes(entry.url)) {
      used.add(entry.filePath)
    }
  }

  const explicitResolved = resolveFromConfig(entries, used, cfg.stateMap)
  const aliasResolved = resolveByAliases(entries, used, cfg.aliases)
  // 精确配置优先于别名：显式结果展开在后面覆盖同名键
  const merged: Partial<Record<PetState, GifAssetEntry>> = {
    ...aliasResolved,
    ...explicitResolved,
  }

  // 回退素材：优先配置的 fallbackState 已匹配的图，其次按提示找 default，实在没有取第一个文件
  const fallbackAsset =
    merged[fallbackState] ??
    pickByHint(entries, used, cfg.stateMap[fallbackState]) ??
    entries.find((entry) => entry.normalizedName === 'default') ??
    entries[0] ??
    null
  if (fallbackAsset) {
    used.add(fallbackAsset.filePath)
  }

  const coreMap = {} as Record<PetState, string>
  let hasAllCoreStates = true
  for (const state of PET_STATES) {
    // 未匹配的状态用回退素材顶上，保证任何状态都有图可显示
    const target = merged[state] ?? fallbackAsset
    if (!target) {
      hasAllCoreStates = false
      coreMap[state] = assets.default
      continue
    }
    coreMap[state] = target.url
    if (!merged[state]) hasAllCoreStates = false
  }

  const overlayExplicitResolved = resolveOverlayFromConfig(entries, used, cfg.overlayMap)
  const overlayAliasResolved = resolveOverlayByAliases(entries, used, cfg.overlayAliases)
  // 同样让显式配置覆盖别名结果
  const overlayMerged: Partial<Record<PetOverlayState, GifAssetEntry>> = {
    ...overlayAliasResolved,
    ...overlayExplicitResolved,
  }

  const overlayMap = {} as Record<PetOverlayState, string>
  let hasAllOverlayStates = true
  for (const state of PET_OVERLAY_STATES) {
    const target = overlayMerged[state]
    if (!target) {
      // 覆盖状态缺失时先借用同名素材槽位，再兜底 default
      overlayMap[state] = assets[state] || assets.default
      hasAllOverlayStates = false
      continue
    }
    overlayMap[state] = target.url
  }

  const unmatchedFiles = entries
    .filter((entry) => !used.has(entry.filePath))
    .map((entry) => entry.fileName)

  const matchedAssetCount = PET_ASSET_KEYS.filter((key) => Boolean(assets[key])).length

  return {
    assets,
    coreMap,
    overlayMap,
    loadedFiles: entries.map((entry) => entry.fileName),
    unmatchedFiles,
    hasAllCoreStates,
    hasAllOverlayStates,
    hasAllStates: matchedAssetCount >= 8,
    matchedStateCount: matchedAssetCount,
    fallbackState,
  }
}
