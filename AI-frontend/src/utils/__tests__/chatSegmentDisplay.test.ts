/**
 * chatSegmentDisplay 测试：分段对话展示文本的清洗规则
 * 覆盖外层中/英文方括号剥离、括号动作描写保留、内部括号不动、空段落过滤
 */
import { describe, expect, it } from 'vitest'
import { sanitizeSegmentDisplayText, sanitizeSegmentList } from '../chatSegmentDisplay'

describe('sanitizeSegmentDisplayText', () => {
  it('strips outer square brackets from reply', () => {
    expect(sanitizeSegmentDisplayText('[别指望我做饭能有多好吃啊。难吃的话别怪我。]'))
      .toBe('别指望我做饭能有多好吃啊。难吃的话别怪我。')
  })

  it('strips outer Chinese square brackets', () => {
    expect(sanitizeSegmentDisplayText('【你好呀】')).toBe('你好呀')
  })

  it('keeps parentheses for mental/action description', () => {
    expect(sanitizeSegmentDisplayText('（……别指望我做饭能有多好吃啊）'))
      .toBe('（……别指望我做饭能有多好吃啊）')
    expect(sanitizeSegmentDisplayText('(轻轻点头)')).toBe('(轻轻点头)')
  })

  it('does not strip inner brackets', () => {
    expect(sanitizeSegmentDisplayText('见[备注]了')).toBe('见[备注]了')
  })
})

describe('sanitizeSegmentList', () => {
  it('filters empty after sanitize', () => {
    expect(sanitizeSegmentList(['[a]', '   ', '（b）'])).toEqual(['a', '（b）'])
  })
})
