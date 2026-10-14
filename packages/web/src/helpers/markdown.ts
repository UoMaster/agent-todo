import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Markdown → 安全 HTML。
 *
 * 待办描述支持 Markdown（与原型一致），渲染前必须走 DOMPurify 消毒：
 * 描述内容来自用户输入，直接 innerHTML 会有 XSS 风险。
 * 这里同时禁用原始 HTML，只允许 Markdown 语法生成的标签。
 */
marked.use({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false })
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'hr', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  })
}
