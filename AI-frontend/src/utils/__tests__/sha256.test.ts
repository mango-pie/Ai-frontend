// sha256 工具单测：纯 JS 回退实现对照标准测试向量（空串/abc），Web Crypto 实现与回退结果一致
import { describe, expect, it } from 'vitest'

import { sha256Hex, sha256HexFallback } from '../sha256'

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

describe('sha256HexFallback', () => {
  it('匹配空串与 abc 的标准向量', () => {
    expect(sha256HexFallback(new Uint8Array())).toBe(EMPTY)
    expect(sha256HexFallback(new TextEncoder().encode('abc'))).toBe(ABC)
  })
})

describe('sha256Hex', () => {
  it('与 Web Crypto 结果一致', async () => {
    const bytes = new TextEncoder().encode('library-upload-probe')
    const hex = await sha256Hex(bytes)
    expect(hex).toBe(sha256HexFallback(bytes))
    expect(hex).toHaveLength(64)
  })
})
