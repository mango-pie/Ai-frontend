// sseChatStream 解析器单测：跨块缓冲截断 JSON、CRLF/心跳注释行、[DONE] 哨兵、非 JSON 降级及各事件载荷解析
import { describe, expect, it } from 'vitest'

import { SseChatStreamParser, readSseChatEvents, type ChatSsePayload } from '../sseChatStream'

const line = (payload: string) => `data: ${payload}\n`

describe('SseChatStreamParser', () => {
  it('解析完整的单行事件', () => {
    const parser = new SseChatStreamParser()
    expect(parser.feed(line('{"event":"done"}'))).toEqual([{ event: 'done' }])
  })

  it('跨块缓冲截断的 JSON，拼齐后一次性吐出', () => {
    const parser = new SseChatStreamParser()
    expect(parser.feed('data: {"event":"chunk","d":"he')).toEqual([])
    expect(parser.feed('llo"}\n')).toEqual([{ event: 'chunk', d: 'hello', type: undefined }])
  })

  it('容忍 CRLF 行尾与注释心跳行', () => {
    const parser = new SseChatStreamParser()
    expect(parser.feed(': ping\r\n')).toEqual([])
    expect(parser.feed('data: {"event":"done"}\r\n')).toEqual([{ event: 'done' }])
  })

  it('跳过 [DONE] 哨兵与空 data 行', () => {
    const parser = new SseChatStreamParser()
    expect(parser.feed('data: [DONE]\n')).toEqual([])
    expect(parser.feed('data: \n')).toEqual([])
    expect(parser.feed('data: {"event":"chunk"}\n')).toEqual([])
  })

  it('非 JSON 负载降级为纯文本 chunk', () => {
    const parser = new SseChatStreamParser()
    expect(parser.feed('data: 纯文本片段\n')).toEqual([
      { event: 'chunk', d: '纯文本片段' },
    ])
  })

  it('解析 segment_plan 与 tool_call 载荷', () => {
    const parser = new SseChatStreamParser()
    const [plan] = parser.feed(
      line('{"event":"segment_plan","segments":["你好","再见"],"delays":[300]}'),
    )
    expect(plan).toEqual({
      event: 'segment_plan',
      segments: ['你好', '再见'],
      delays: [300],
      type: undefined,
    })

    const [tool] = parser.feed(
      line(
        '{"event":"tool_call","tool":"create_study_task","step":2,"args":{"title":"数学"},"data":{"id":1},"uiAction":{"type":"toast","message":"ok"}}',
      ),
    )
    expect(tool?.event).toBe('tool_call')
    expect(tool?.tool).toBe('create_study_task')
    expect(tool?.step).toBe(2)
    expect(tool?.success).toBeUndefined()
    expect(tool?.uiAction?.type).toBe('toast')
  })

  it('finish() 刷出末尾未换行的一行', () => {
    const parser = new SseChatStreamParser()
    expect(parser.feed('data: {"event":"chunk","d":"tail"}')).toEqual([])
    expect(parser.finish()).toEqual([{ event: 'chunk', d: 'tail', type: undefined }])
    expect(parser.finish()).toEqual([])
  })
})

describe('readSseChatEvents', () => {
  const utf8 = (s: string) => new TextEncoder().encode(s)

  const streamOf = (chunks: Uint8Array[]): ReadableStream<Uint8Array> => {
    let i = 0
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < chunks.length) {
          controller.enqueue(chunks[i++]!)
        } else {
          controller.close()
        }
      },
    })
  }

  it('按事件顺序回调整条流', async () => {
    const events: ChatSsePayload[] = []
    await readSseChatEvents(
      streamOf([
        utf8('data: {"event":"chunk","d":"a"}\n'),
        utf8('data: {"event":"chunk","d":"b"}\ndata: {"event":"done"}\n'),
      ]),
      async (payload) => {
        events.push(payload)
      },
    )
    expect(events.map((e) => e.event)).toEqual(['chunk', 'chunk', 'done'])
    expect(events[0]?.d).toBe('a')
  })
})
