/**
 * 桌宠（PetDango）模块的统一出口。
 *
 * 对外只暴露挂载组件、公共类型、路由反应注册，
 * 以及躲避区与 AI 对话两个 composable；
 * 其余内部实现（行为引擎、渲染器、GIF 素材解析）不对外导出。
 */
export { default as PetDango } from './components/PetDango.vue'
export type {
  PetState,
  PetOverlayState,
  PetWalkPace,
  PetFacing,
  PetViewModel,
  PetRendererKind,
  PetEnableMode,
  PetGifStateMap,
  PetGifAliasMap,
  PetGifOverlayMap,
  PetGifOverlayAliasMap,
  PetGifAssetKey,
  PetGifAssetMap,
} from './types'
export { registerRouteReaction } from './routeReactions'
export { registerAvoidanceZone, unregisterAvoidanceZone } from './composables/usePetAvoidance'
export { usePetAiChat } from './composables/usePetAiChat'
