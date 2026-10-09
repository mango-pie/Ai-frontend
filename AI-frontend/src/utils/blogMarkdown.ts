/**
 * 随笔（博客）正文 Markdown 渲染管线：
 * marked 解析 + highlight.js 高亮（按需注册语言，避免全量打包），
 * 代码块带「语言标签 + 复制按钮」顶栏，并为 h1–h4 注入锚点 id 以支持目录跳转。
 */
import { marked } from 'marked'
import { Renderer } from 'marked'
import hljs from 'highlight.js/lib/core'
import langHtml from 'highlight.js/lib/languages/xml'
import langCss from 'highlight.js/lib/languages/css'
import langJs from 'highlight.js/lib/languages/javascript'
import langTs from 'highlight.js/lib/languages/typescript'
import langJson from 'highlight.js/lib/languages/json'
import langBash from 'highlight.js/lib/languages/bash'
import langJava from 'highlight.js/lib/languages/java'
import langPython from 'highlight.js/lib/languages/python'
import langMarkdown from 'highlight.js/lib/languages/markdown'
import langSql from 'highlight.js/lib/languages/sql'
import langYaml from 'highlight.js/lib/languages/yaml'

/* 只注册博客代码块常用的十来种语言，其余交给 highlightAuto 自动探测 */
hljs.registerLanguage('html', langHtml)
hljs.registerLanguage('xml', langHtml)
hljs.registerLanguage('css', langCss)
hljs.registerLanguage('javascript', langJs)
hljs.registerLanguage('js', langJs)
hljs.registerLanguage('typescript', langTs)
hljs.registerLanguage('ts', langTs)
hljs.registerLanguage('json', langJson)
hljs.registerLanguage('bash', langBash)
hljs.registerLanguage('sh', langBash)
hljs.registerLanguage('shell', langBash)
hljs.registerLanguage('java', langJava)
hljs.registerLanguage('python', langPython)
hljs.registerLanguage('py', langPython)
hljs.registerLanguage('markdown', langMarkdown)
hljs.registerLanguage('md', langMarkdown)
hljs.registerLanguage('sql', langSql)
hljs.registerLanguage('yaml', langYaml)
hljs.registerLanguage('yml', langYaml)

const renderer = new Renderer()

/* 自定义代码块输出：顶栏展示语言名 + 复制按钮（内联 onclick 免去全局事件绑定） */
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : ''
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value
  const langLabel = language || 'code'
  const escaped = langLabel.replace(/"/g, '&quot;')
  return `<div class="code-block"><div class="code-block__header"><span class="code-block__lang">${escaped}</span><button type="button" class="code-block__copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').innerText)">复制</button></div><pre><code class="hljs language-${escaped}">${highlighted}</code></pre></div>`
}

/* breaks 让单换行也生效，贴合随笔的书写习惯；gfm 启用表格/删除线等扩展语法 */
marked.use({ renderer, breaks: true, gfm: true })

/** 目录条目：锚点 id、纯文本标题、标题层级（1–4） */
export type BlogTocItem = { id: string; text: string; level: number }

/* 匹配 h1–h4（可选属性），既用于注入锚点 id 也用于抽取目录 */
const HEADING_RE = /<h([1-4])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi

/** 剥掉行内标签、还原常见 HTML 实体并压平空白，得到标题纯文本 */
function stripHeadingText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** 由标题文本生成锚点 id：小写连字符、保留中文、截断 48 字符；重复标题由 used 计数加 -2 后缀；数字开头补 h- 前缀保证选择器合法 */
function slugifyHeadingId(text: string, used: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fff-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'section'
  const n = (used.get(base) ?? 0) + 1
  used.set(base, n)
  const id = n === 1 ? base : `${base}-${n}`
  return /^\d/.test(id) ? `h-${id}` : id
}

/** 从标签属性串中提取已有 id（兼容双引号/单引号写法） */
function existingHeadingId(attrs: string): string {
  const m = attrs.match(/\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/i)
  return (m?.[1] || m?.[2] || '').trim()
}

/** 为 h1–h4 补上可用于锚点跳转的 id（已有 id 则保留） */
export function injectHeadingIds(html: string): string {
  if (!html) return html
  const used = new Map<string, number>()
  return html.replace(HEADING_RE, (_full, level: string, attrs = '', inner: string) => {
    const current = existingHeadingId(attrs)
    if (current) {
      used.set(current, (used.get(current) ?? 0) + 1)
      return `<h${level}${attrs}>${inner}</h${level}>`
    }
    const id = slugifyHeadingId(stripHeadingText(inner), used)
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`
  })
}

/** 从已注入 id 的正文 HTML 抽出目录树 */
export function extractBlogToc(html: string): BlogTocItem[] {
  if (!html) return []
  const items: BlogTocItem[] = []
  const re = new RegExp(HEADING_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const text = stripHeadingText(m[3] || '')
    const id = existingHeadingId(m[2] || '')
    if (!text || !id) continue
    items.push({ id, text, level: Number(m[1]) })
  }
  return items
}

/**
 * 渲染随笔 Markdown 为 HTML（含代码块顶栏、高亮、标题锚点）
 */
export function renderBlogMarkdown(content: string): string {
  if (!content?.trim()) return ''
  return injectHeadingIds(marked.parse(content) as string)
}
