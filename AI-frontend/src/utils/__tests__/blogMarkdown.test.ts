// blogMarkdown 渲染管线单测：标题锚点 id 注入（中文/重复/已有 id）、目录抽取与 Markdown 全链路渲染
import { describe, expect, it } from 'vitest'

import { extractBlogToc, injectHeadingIds, renderBlogMarkdown } from '../blogMarkdown'

describe('injectHeadingIds / extractBlogToc', () => {
  it('为中文标题生成可跳转 id，并保留层级', () => {
    const html = injectHeadingIds(
      '<h2>一、提交与发布</h2><h3>1.1 标签</h3><h4>要点</h4><h3>1.2 部署</h3>',
    )
    const toc = extractBlogToc(html)
    expect(toc.map((item) => item.level)).toEqual([2, 3, 4, 3])
    expect(toc[0].id).toBe('一提交与发布')
    expect(toc[1].text).toBe('1.1 标签')
    expect(html).toContain(`id="${toc[0].id}"`)
  })

  it('重复标题自动加后缀，已有 id 不覆盖', () => {
    const html = injectHeadingIds('<h2>相同</h2><h2>相同</h2><h2 id="keep-me">保留</h2>')
    const toc = extractBlogToc(html)
    expect(toc.map((item) => item.id)).toEqual(['相同', '相同-2', 'keep-me'])
  })

  it('Markdown 渲染后目录可从正文抽出', () => {
    const html = renderBlogMarkdown('## 引言\n\n正文\n\n### 小节\n\n内容')
    const toc = extractBlogToc(html)
    expect(toc.length).toBe(2)
    expect(toc[0].text).toBe('引言')
    expect(toc[1].level).toBe(3)
  })
})
