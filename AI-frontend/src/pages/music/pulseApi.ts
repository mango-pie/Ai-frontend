/**
 * Pulse 音乐模块的"接口适配"类型定义：
 * 各子视图（发现 / 乐库 / 歌单 / 搜索等）通过 props 接收播放器/发现/登录能力，
 * 这里用 ReturnType 反查各 composable 的返回类型，避免直接导入实现造成循环依赖。
 */
import type { usePulseDiscover } from '@/composables/usePulseDiscover'
import type { usePulsePlayer } from '@/composables/usePulsePlayer'
import type { useNeteaseLogin } from '@/design/useNeteaseLogin'

export type PulsePlayerApi = ReturnType<typeof usePulsePlayer>
export type PulseDiscoverApi = ReturnType<typeof usePulseDiscover>
export type NeteaseLoginApi = ReturnType<typeof useNeteaseLogin>
