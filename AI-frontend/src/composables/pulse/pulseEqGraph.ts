/**
 * 音频实验室的均衡器与频谱纯函数集。
 * 负责：十段 peaking 滤波器的创建/接线/增益应用，以及把 analyser 的频谱数据
 * 采样成舞台柱状高度（含静止衰减与静音兜底动画）。无副作用，便于单独测试。
 */

/** 十个频段的中心频率标签（Hz/kHz） */
export const EQ_BAND_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const
/** 与 EQ_BAND_LABELS 一一对应的中心频率（Hz） */
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
/** 默认增益曲线（dB） */
export const DEFAULT_EQ_GAINS = [0, 2, 1, 3, 2, 0, -1, 1, 2, 1]
export const EQ_GAIN_MIN = -12
export const EQ_GAIN_MAX = 12
/** 舞台频谱柱数量 */
export const SPECTRUM_BAR_COUNT = 36

export interface EqPreset {
  id: string
  label: string
  gains: number[]
}

/** 十段均衡器预设（对应 [32,64,125,250,500,1k,2k,4k,8k,16k]） */
export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', label: '平直', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'pop', label: '流行', gains: [4, 3, 0, -2, -1, 2, 3, 4, 3, 2] },
  { id: 'rock', label: '摇滚', gains: [5, 4, 2, 0, 1, 2, 3, 4, 5, 5] },
  { id: 'jazz', label: '爵士', gains: [3, 2, 0, 2, 3, 2, 1, 2, 3, 2] },
  { id: 'classical', label: '古典', gains: [0, -1, -1, 0, 1, 2, 2, 1, 0, -1] },
  { id: 'bass', label: '重低音', gains: [7, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'vocal', label: '人声', gains: [-2, -1, 0, 2, 3, 4, 3, 2, 0, -1] },
]

/** 把增益限制在 [-12, +12] dB 并取整，防止越界值传入滤波器 */
export function clampEqGain(db: number) {
  return Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, Math.round(Number(db) || 0)))
}

/** 按十个频段各建一个 peaking 滤波器（Q=1），增益初始为 0 */
export function createEqFilters(ctx: AudioContext): BiquadFilterNode[] {
  return EQ_FREQUENCIES.map((freq) => {
    const filter = ctx.createBiquadFilter()
    filter.type = 'peaking'
    filter.frequency.value = freq
    filter.Q.value = 1
    filter.gain.value = 0
    return filter
  })
}

/** 应用增益到滤波器链；EQ 关闭时全部归零（直通），越界值自动夹紧 */
export function applyEqGains(filters: BiquadFilterNode[], gains: number[], enabled: boolean) {
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i]
    if (!filter) continue
    filter.gain.value = enabled ? clampEqGain(gains[i] ?? 0) : 0
  }
}

/** 串联音频图：媒体源 → 逐个 EQ 滤波器 → 分析器 → 输出 */
export function connectEqGraph(
  mediaSource: MediaElementAudioSourceNode,
  filters: BiquadFilterNode[],
  analyser: AnalyserNode,
  destination: AudioDestinationNode,
) {
  let node: AudioNode = mediaSource
  for (const filter of filters) {
    node.connect(filter)
    node = filter
  }
  node.connect(analyser)
  analyser.connect(destination)
}

/** 频谱采样跨帧状态：连续静音帧计数与兜底动画的种子 */
export interface SpectrumSampleState {
  silentFrames: number
  fallbackSeed: number
}

/** 停止采样后柱体逐帧衰减到底噪（0.04），产生「落下」动画 */
export function decaySpectrumLevels(levels: number[]) {
  return levels.map((v) => Math.max(0.04, v * 0.82))
}

/**
 * 采样一帧频谱：把 analyser 的字节频谱按对数分桶到 36 根柱，
 * 做峰值归一化与高频补偿；静音超阈值或无 analyser 时退化为正弦兜底动画。
 */
export function sampleSpectrumLevels(
  analyser: AnalyserNode | null,
  freqData: Uint8Array<ArrayBuffer> | null,
  state: SpectrumSampleState,
  opts: { motionOn: boolean; isPlaying: boolean },
): { levels: number[]; state: SpectrumSampleState } {
  const bars = SPECTRUM_BAR_COUNT
  const next = new Array<number>(bars)
  let silentFrames = state.silentFrames
  let fallbackSeed = state.fallbackSeed

  if (!opts.motionOn || !opts.isPlaying) {
    return { levels: decaySpectrumLevels(next.fill(0.08)), state: { silentFrames, fallbackSeed } }
  }

  if (analyser && freqData) {
    analyser.getByteFrequencyData(freqData)
    const bins = freqData.length
    const lo = 3
    const hi = Math.max(lo + bars * 2, Math.floor(bins * 0.7))
    const logLo = Math.log(lo)
    const logHi = Math.log(hi)
    let energy = 0
    let peak = 0.001

    for (let i = 0; i < bars; i++) {
      const t0 = i / bars
      const t1 = (i + 1) / bars
      const start = Math.min(bins - 2, Math.floor(Math.exp(logLo + (logHi - logLo) * t0)))
      const end = Math.min(bins, Math.max(start + 1, Math.floor(Math.exp(logLo + (logHi - logLo) * t1))))
      let sum = 0
      for (let j = start; j < end; j++) sum += freqData[j] ?? 0
      const avg = sum / (end - start)
      energy += avg
      const shelf = 0.78 + (i / Math.max(1, bars - 1)) * 0.72
      const v = Math.pow(Math.max(0, avg) / 255, 0.7) * shelf
      next[i] = v
      if (v > peak) peak = v
    }

    const invPeak = 1 / peak
    // 按峰值归一化并抬底，让整体律动更明显
    for (let i = 0; i < bars; i++) {
      const n = (next[i] ?? 0) * invPeak
      next[i] = Math.min(1, 0.1 + Math.pow(n, 0.85) * 0.9)
    }

    // 连续静音帧计数：超阈值说明曲目接近无声或链路未就绪
    if (energy < 12) silentFrames += 1
    else silentFrames = 0

    // 静音兜底：用缓进的正弦波形伪造轻微律动，避免柱子完全躺平
    if (silentFrames > 12) {
      fallbackSeed = (fallbackSeed + 1) % 1000
      for (let i = 0; i < bars; i++) {
        const n =
          0.22 +
          0.38 * Math.abs(Math.sin((fallbackSeed + i * 1.7) * 0.31)) +
          0.28 * Math.abs(Math.sin((fallbackSeed * 0.55 + i * 0.9) * 0.19))
        next[i] = Math.min(0.88, Math.max(0.12, n))
      }
    }
  } else {
    // 无 analyser（Web Audio 不可用）：同样用正弦兜底保持视觉不僵死
    fallbackSeed = (fallbackSeed + 1) % 1000
    for (let i = 0; i < bars; i++) {
      next[i] = 0.2 + 0.5 * Math.abs(Math.sin((fallbackSeed + i * 1.9) * 0.23))
    }
  }

  return { levels: next, state: { silentFrames, fallbackSeed } }
}
