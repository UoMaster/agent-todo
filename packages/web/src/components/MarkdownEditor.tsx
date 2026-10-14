import { useRef, useState } from 'react'
import { renderMarkdown } from '../helpers/markdown.ts'
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon, ListIcon, QuoteIcon } from './icons.tsx'

/** 在光标处包裹标记（加粗、斜体、行内代码、链接） */
function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { value, selectionStart, selectionEnd } = textarea
  const selected = selectionStart === selectionEnd ? placeholder : value.slice(selectionStart, selectionEnd)

  return {
    value: `${value.slice(0, selectionStart)}${before}${selected}${after}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  }
}

/** 给选中行加前缀（标题、列表、引用），已有前缀则去掉 */
function togglePrefix(textarea: HTMLTextAreaElement, prefix: string) {
  const { value, selectionStart, selectionEnd } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const nextBreak = value.indexOf('\n', selectionEnd)
  const lineEnd = nextBreak < 0 ? value.length : nextBreak
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const allPrefixed = lines.every((line) => line.startsWith(prefix))
  const next = lines
    .map((line) => (allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`))
    .join('\n')

  return {
    value: value.slice(0, lineStart) + next + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + next.length,
  }
}

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Markdown 编辑器：工具栏 + 编写 / 预览切换 */
export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const textarea = useRef<HTMLTextAreaElement>(null)

  function apply(transform: (element: HTMLTextAreaElement) => {
    value: string
    selectionStart: number
    selectionEnd: number
  }) {
    const element = textarea.current
    if (!element) return

    const result = transform(element)
    onChange(result.value)
    // 等 React 把新值写进 DOM 后再恢复选区
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  const tools = [
    { key: 'bold', title: '加粗', icon: <BoldIcon />, run: (element: HTMLTextAreaElement) => wrapSelection(element, '**', '**', '加粗文本') },
    { key: 'italic', title: '斜体', icon: <ItalicIcon />, run: (element: HTMLTextAreaElement) => wrapSelection(element, '*', '*', '斜体文本') },
    { key: 'h', title: '标题', icon: <span className="text-sm font-700">H</span>, run: (element: HTMLTextAreaElement) => togglePrefix(element, '## ') },
    { key: 'ul', title: '无序列表', icon: <ListIcon />, run: (element: HTMLTextAreaElement) => togglePrefix(element, '- ') },
    { key: 'quote', title: '引用', icon: <QuoteIcon />, run: (element: HTMLTextAreaElement) => togglePrefix(element, '> ') },
    { key: 'link', title: '插入链接', icon: <LinkIcon />, run: (element: HTMLTextAreaElement) => wrapSelection(element, '[', '](https://)', '链接文字') },
    { key: 'code', title: '行内代码', icon: <CodeIcon />, run: (element: HTMLTextAreaElement) => wrapSelection(element, '`', '`', '代码') },
  ]

  return (
    <div className="border border-border rounded-[var(--radius-md)] bg-bg overflow-hidden focus-within:border-accent">
      <div className="flex items-center justify-between gap-[8px] px-[7px] py-[5px] border-b border-border-soft bg-surface-warm">
        <div className="flex items-center gap-[2px]" role="toolbar" aria-label="Markdown 工具栏">
          {tools.map((tool) => (
            <button
              key={tool.key}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              className="w-[30px] h-[30px] grid place-items-center rounded-[var(--radius-sm)] text-muted hover:bg-[var(--fg-soft)] hover:text-fg transition-colors"
              onClick={() => apply(tool.run)}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        <div className="segmented" role="tablist" aria-label="编写或预览">
          {(['write', 'preview'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={`px-[12px] py-[4px] rounded-[8px] text-xs transition-colors ${
                tab === item ? 'seg-btn-active' : 'text-muted hover:text-fg'
              }`}
              onClick={() => setTab(item)}
            >
              {item === 'write' ? '编写' : '预览'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'write' ? (
        <textarea
          ref={textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? '用 Markdown 记录背景、链接或备注…'}
          aria-label="待办描述"
          className="block w-full min-h-[148px] border-0 px-[14px] py-[12px] font-mono text-[13px] leading-[1.6] bg-bg resize-y focus:outline-none"
        />
      ) : (
        <div
          className="md-body px-[14px] py-[12px] min-h-[148px] text-sm leading-[1.6] text-fg-2 [word-break:break-word]"
          // Markdown 渲染结果已经过 DOMPurify 消毒（见 helpers/markdown.ts）
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        />
      )}
    </div>
  )
}
