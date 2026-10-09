// streamMetrics 单测：流式首字耗时（TTFB）采样只记首个内容事件、多 tracker 独立、环形队列超限淘汰最旧样本
import { describe, expect, it } from 'vitest'

import {
  createStreamTtfbTracker,
  getStreamTtfbSamples,
  recordStreamTtfb,
} from '../streamMetrics'

describe('createStreamTtfbTracker', () => {
  it('同一流多次到达只记首个内容事件', () => {
    const before = getStreamTtfbSamples().length
    const tracker = createStreamTtfbTracker('test-once')
    tracker.markFirstContent()
    tracker.markFirstContent()
    tracker.markFirstContent()
    const after = getStreamTtfbSamples()
    expect(after.length).toBe(before + 1)
    expect(after.at(-1)?.scene).toBe('test-once')
    expect(after.at(-1)?.ttfbMs).toBeGreaterThanOrEqual(0)
  })

  it('不同 tracker 各自独立采样', () => {
    const before = getStreamTtfbSamples().length
    createStreamTtfbTracker('test-a').markFirstContent()
    createStreamTtfbTracker('test-b').markFirstContent()
    expect(getStreamTtfbSamples().length).toBe(before + 2)
  })
})

describe('环形队列', () => {
  it('样本超过上限后丢弃最旧的', () => {
    const before = getStreamTtfbSamples().length
    for (let i = 0; i < 60; i++) {
      recordStreamTtfb('test-ring', i)
    }
    const samples = getStreamTtfbSamples()
    expect(samples.length).toBeLessThanOrEqual(Math.max(before, 50))
    expect(samples.at(-1)?.ttfbMs).toBe(59)
  })

  it('getStreamTtfbSamples 返回副本，外部修改不影响内部状态', () => {
    const snapshot = getStreamTtfbSamples()
    snapshot.push({ scene: 'hacked', ttfbMs: -1, at: 0 })
    expect(getStreamTtfbSamples()).not.toContainEqual(
      expect.objectContaining({ scene: 'hacked' }),
    )
  })
})
