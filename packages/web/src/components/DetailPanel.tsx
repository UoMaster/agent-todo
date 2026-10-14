import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_TAGS,
  PRIORITIES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  addDays,
  formatDateRangeText,
  isOverdue,
  overdueDays,
  todayKey,
  todoTitle,
  type Attachment,
  type Todo,
} from '@agent-todo/shared'
import { toDraft, type TodoDraft } from '../data/todos.ts'
import { AttachmentRow, Checkbox, OverdueBadge, PriorityDot } from './common.tsx'
import { MarkdownEditor } from './MarkdownEditor.tsx'
import { CloseIcon, PaperclipIcon, UploadIcon } from './icons.tsx'
import { renderMarkdown } from '../helpers/markdown.ts'

export interface DetailPanelProps {
  todo: Todo
  mode: 'view' | 'edit'
  onChangeMode: (mode: 'view' | 'edit') => void
  onClose: () => void
  /** 草稿变化时调用；落库的防抖在容器里统一处理 */
  onSave: (draft: TodoDraft) => void
  onDelete: () => void
  onUpload: (files: File[]) => Promise<void>
  onDeleteAttachment: (attachment: Attachment) => Promise<void>
}

/** 详情抽屉：查看 / 编辑待办的完整属性 */
export function DetailPanel({
  todo,
  mode,
  onChangeMode,
  onClose,
  onSave,
  onDelete,
  onUpload,
  onDeleteAttachment,
}: DetailPanelProps) {
  const [draft, setDraft] = useState<TodoDraft>(() => toDraft(todo))
  const [tagInput, setTagInput] = useState('')
  const [subtaskInput, setSubtaskInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  /** 最新草稿的镜像：事件回调里合并用，避免闭包拿到旧值 */
  const draftRef = useRef(draft)
  /** 用户最近一次输入的时间：附件上传带回新版本时，不能盖掉刚输入的内容 */
  const lastEditAt = useRef(0)
  /**
   * 已经同步过的「服务器版本号」= `todoId:updatedAt`。
   * 只在版本号变新时重置草稿 —— store 每次保存都会换 todo 的对象引用，
   * 直接依赖整个 todo 会把用户正在输入的内容冲掉。
   */
  const todoVersion = `${todo.id}:${todo.updatedAt}`
  const [syncedVersion, setSyncedVersion] = useState(todoVersion)

  useEffect(() => {
    if (todoVersion === syncedVersion) return

    // 本地上一次输入比服务器版本还新 → 保留用户输入（稍后会被防抖保存覆盖服务器）
    const keepLocal = lastEditAt.current > Date.parse(todo.updatedAt)
    // oxlint-disable-next-line react/set-state-in-effect -- 跟随 prop 版本号重置状态，见上方注释
    setSyncedVersion(todoVersion)
    if (keepLocal) return

    const next = toDraft(todo)
    draftRef.current = next
    setDraft(next)
    setTagInput('')
    setSubtaskInput('')
    // 只依赖「版本号」：依赖整个 todo 会让本地保存（store 换对象引用）也触发重置
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 见上方注释
  }, [todoVersion, syncedVersion])

  // 进入编辑模式后自动聚焦标题（新建待办时最顺手）
  useEffect(() => {
    if (mode === 'edit') titleInput.current?.focus()
  }, [mode])

  // 渲染期把最新草稿同步进镜像：事件回调读它，避免闭包拿到旧值
  // oxlint-disable-next-line react/refs -- 见上方注释
  draftRef.current = draft

  function patch(changes: Partial<TodoDraft>) {
    const next = { ...draftRef.current, ...changes }
    draftRef.current = next
    lastEditAt.current = Date.now()
    setDraft(next)
    onSave(next)
  }

  const rangeOn = draft.endDate !== null
  const today = todayKey()
  const merged = { ...todo, ...draft }
  const overdue = !draft.done && isOverdue(merged, today)
  const allTags = [
    ...DEFAULT_TAGS,
    ...draft.tags.filter((tag) => !DEFAULT_TAGS.some((preset) => preset === tag)),
  ]
  const panel = useResizablePanel()

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      await onUpload(Array.from(files))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-20 bg-[var(--scrim)]"
        aria-hidden="true"
      />
      <aside
        aria-label="待办详情"
        className="fixed top-0 right-0 h-full z-[21] bg-bg border-l border-border flex flex-col shadow-[-12px_0_40px_color-mix(in_oklab,var(--fg),transparent_92%)] w-full md:w-[var(--panel-width)]"
        style={{ '--panel-width': `${panel.percent}%` } as React.CSSProperties}
      >
        <div
          role="separator"
          aria-label="拖拽调整详情宽度"
          aria-orientation="vertical"
          onPointerDown={panel.startResize}
          className="absolute inset-y-0 left-0 w-[12px] cursor-ew-resize z-[3] touch-none max-md:hidden after:content-[''] after:absolute after:top-1/2 after:left-[3px] after:w-[3px] after:h-[44px] after:-mt-[22px] after:rounded-full after:bg-border hover:after:bg-[var(--meta)]"
        />

        <div className="flex items-center justify-between px-[18px] py-[13px] border-b border-border flex-none">
          <div className="flex items-center gap-[10px] min-w-0">
            <span className="panel-label flex-none">待办详情</span>
            {overdue && <OverdueBadge days={overdueDays(merged, today)} />}
          </div>

          <div className="flex items-center gap-[10px]">
            <div className="segmented" role="tablist" aria-label="详情模式">
              {(['view', 'edit'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={mode === item}
                  className={`px-[12px] py-[4px] rounded-[8px] text-xs transition-colors ${
                    mode === item ? 'seg-btn-active' : 'text-muted hover:text-fg'
                  }`}
                  onClick={() => onChangeMode(item)}
                >
                  {item === 'view' ? '查看' : '编辑'}
                </button>
              ))}
            </div>
            <button type="button" className="btn-icon" aria-label="关闭" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] py-[18px] flex flex-col gap-[18px]">
          <label className="inline-flex items-center gap-[9px] cursor-pointer self-start">
            <input
              type="checkbox"
              checked={draft.done}
              onChange={(event) => patch({ done: event.target.checked })}
              className="sr-only"
              aria-label={draft.done ? '已完成' : '标记为完成'}
            />
            <Switch checked={draft.done} />
            <span className="text-sm">{draft.done ? '已完成' : '标记为完成'}</span>
          </label>

          {mode === 'edit' ? (
            <input
              ref={titleInput}
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="添加标题"
              aria-label="标题"
              className="w-full border-0 border-b border-transparent bg-transparent font-heading text-[22px] font-600 tracking-[-0.01em] px-0 py-[4px] focus:outline-none focus:border-accent placeholder:text-meta"
            />
          ) : (
            <h2
              className={`font-heading text-[28px] font-600 leading-[1.2] m-0 [word-break:break-word] ${
                draft.done
                  ? 'text-muted line-through decoration-[color-mix(in_oklab,var(--muted),transparent_55%)]'
                  : 'text-fg'
              }`}
            >
              {todoTitle(draft)}
            </h2>
          )}

          {mode === 'edit' ? (
            <>
              <MarkdownEditor
                value={draft.description}
                onChange={(value) => patch({ description: value })}
              />

              <div className="field-block">
                <div className="panel-label">附件</div>
                <div className="flex flex-col gap-[8px]">
                  {todo.attachments.length === 0 && <div className="text-sm text-meta">还没有附件</div>}
                  {todo.attachments.map((attachment) => (
                    <AttachmentRow
                      key={attachment.id}
                      attachment={attachment}
                      actions={
                        <button
                          type="button"
                          className="btn-x"
                          aria-label={`移除附件 ${attachment.name}`}
                          onClick={() => void onDeleteAttachment(attachment)}
                        >
                          ×
                        </button>
                      }
                    />
                  ))}
                </div>

                <label
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    void handleFiles(event.dataTransfer.files)
                  }}
                  className={`flex flex-col items-center gap-[4px] p-[18px] border-[1.5px] border-dashed rounded-[var(--radius-md)] cursor-pointer text-center transition-colors ${
                    dragging
                      ? 'border-accent bg-accent-soft text-fg'
                      : 'border-border text-muted hover:border-accent hover:bg-accent-soft hover:text-fg'
                  }`}
                >
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="sr-only"
                    aria-label="选择文件上传"
                    onChange={(event) => void handleFiles(event.target.files)}
                  />
                  <UploadIcon />
                  <span className="text-sm">{uploading ? '上传中…' : '点击或拖拽文件到此处上传'}</span>
                  <span className="text-xs text-meta">支持任意类型文件</span>
                </label>
              </div>

              <div className="field-block">
                <div className="panel-label">日期</div>
                <label className="inline-flex items-center gap-[9px] cursor-pointer self-start">
                  <input
                    type="checkbox"
                    checked={rangeOn}
                    onChange={(event) => {
                      if (event.target.checked) {
                        const start = draft.startDate ?? today
                        patch({ startDate: start, endDate: draft.endDate ?? addDays(start, 1) })
                      } else {
                        patch({ endDate: null })
                      }
                    }}
                    className="sr-only"
                    aria-label="时间范围"
                  />
                  <Switch checked={rangeOn} small />
                  <span className="text-sm">时间范围</span>
                </label>

                <div className="grid grid-cols-2 gap-[10px]">
                  <label className="mini-field">
                    <span>开始</span>
                    <input
                      type="date"
                      value={draft.startDate ?? ''}
                      onChange={(event) => {
                        const value = event.target.value || null
                        const end =
                          draft.endDate && value && draft.endDate < value ? value : draft.endDate
                        patch({ startDate: value, endDate: end })
                      }}
                      className="mini-input"
                    />
                  </label>
                  {rangeOn && (
                    <label className="mini-field">
                      <span>结束</span>
                      <input
                        type="date"
                        value={draft.endDate ?? ''}
                        min={draft.startDate ?? undefined}
                        onChange={(event) => {
                          const value = event.target.value || draft.startDate
                          patch({ endDate: value === draft.startDate ? null : value })
                        }}
                        className="mini-input"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="field-block">
                <div className="panel-label">优先级</div>
                <div className="flex flex-wrap gap-[6px]">
                  {PRIORITIES.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      aria-pressed={draft.priority === priority}
                      onClick={() => patch({ priority })}
                      className={`inline-flex items-center gap-[6px] px-[12px] py-[6px] border rounded-full text-sm transition-colors ${
                        draft.priority === priority
                          ? 'border-accent bg-accent-soft text-fg font-500'
                          : 'border-border text-muted hover:bg-surface'
                      }`}
                    >
                      <PriorityDot color={PRIORITY_COLOR[priority]} small />
                      {PRIORITY_LABEL[priority]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-block">
                <div className="panel-label">标签</div>
                <div className="flex flex-wrap gap-[6px]">
                  {allTags.map((tag) => {
                    const active = draft.tags.includes(tag)

                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          patch({
                            tags: active
                              ? draft.tags.filter((item) => item !== tag)
                              : [...draft.tags, tag],
                          })
                        }
                        className={`px-[11px] py-[4px] border rounded-full text-xs transition-colors ${
                          active ? 'bg-fg text-bg border-fg' : 'border-border text-muted hover:bg-surface'
                        }`}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    const value = tagInput.trim()
                    if (value && !draft.tags.includes(value)) patch({ tags: [...draft.tags, value] })
                    setTagInput('')
                  }}
                  placeholder="输入标签后回车添加"
                  aria-label="添加标签"
                  className="mini-input"
                />
              </div>

              <div className="field-block">
                <div className="panel-label">
                  子任务
                  {draft.subtasks.length > 0 && (
                    <span className="num ml-[6px]">
                      {draft.subtasks.filter((subtask) => subtask.done).length}/{draft.subtasks.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-[7px]">
                  {draft.subtasks.map((subtask, index) => (
                    <div key={subtask.id ?? `new-${index}`} className="flex items-center gap-[9px] text-sm">
                      <Checkbox
                        small
                        checked={subtask.done ?? false}
                        label="切换子任务"
                        onChange={() =>
                          patch({
                            subtasks: draft.subtasks.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, done: !item.done } : item,
                            ),
                          })
                        }
                      />
                      <span className={`flex-1 min-w-0 ${subtask.done ? 'text-muted line-through' : ''}`}>
                        {subtask.title}
                      </span>
                      <button
                        type="button"
                        className="btn-x"
                        aria-label={`删除子任务 ${subtask.title}`}
                        onClick={() =>
                          patch({ subtasks: draft.subtasks.filter((_, itemIndex) => itemIndex !== index) })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  value={subtaskInput}
                  onChange={(event) => setSubtaskInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    const value = subtaskInput.trim()
                    if (value) patch({ subtasks: [...draft.subtasks, { title: value, done: false }] })
                    setSubtaskInput('')
                  }}
                  placeholder="输入子任务后回车添加"
                  aria-label="添加子任务"
                  className="mini-input"
                />
              </div>
            </>
          ) : (
            <>
              {draft.description ? (
                <div
                  className="md-body text-sm leading-[1.6] text-fg-2 [word-break:break-word]"
                  // 渲染结果已过 DOMPurify（helpers/markdown.ts）
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.description) }}
                />
              ) : (
                <p className="text-sm text-meta m-0">暂无描述</p>
              )}

              {todo.attachments.length > 0 && (
                <div className="field-block">
                  <div className="panel-label">
                    附件 · <span className="num">{todo.attachments.length}</span>
                  </div>
                  <div className="flex flex-col gap-[8px]">
                    {todo.attachments.map((attachment) => (
                      <AttachmentRow key={attachment.id} attachment={attachment} />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col border-t border-border-soft">
                <MetaRow label="日期">
                  {draft.startDate ? (
                    <span className={overdue ? 'text-danger-text font-600' : ''}>
                      {formatDateRangeText(draft.startDate, draft.endDate)}
                    </span>
                  ) : (
                    <span className="text-meta">未安排</span>
                  )}
                </MetaRow>
                <MetaRow label="优先级">
                  <span className="inline-flex items-center gap-[6px]">
                    <PriorityDot color={PRIORITY_COLOR[draft.priority]} small />
                    {draft.priority === 'none' ? (
                      <span className="text-meta">无</span>
                    ) : (
                      PRIORITY_LABEL[draft.priority]
                    )}
                  </span>
                </MetaRow>
                <MetaRow label="标签">
                  {draft.tags.length > 0 ? (
                    <span className="inline-flex flex-wrap gap-[6px]">
                      {draft.tags.map((tag) => (
                        <span key={tag} className="tag-chip">
                          #{tag}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-meta">暂无标签</span>
                  )}
                </MetaRow>
              </div>

              {draft.subtasks.length > 0 && (
                <div className="field-block">
                  <div className="panel-label">
                    子任务 ·{' '}
                    <span className="num">
                      {draft.subtasks.filter((subtask) => subtask.done).length}/{draft.subtasks.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    {draft.subtasks.map((subtask, index) => (
                      <div key={subtask.id ?? `new-${index}`} className="flex items-center gap-[9px] text-sm">
                        <Checkbox
                          small
                          checked={subtask.done ?? false}
                          label="切换子任务"
                          onChange={() =>
                            patch({
                              subtasks: draft.subtasks.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, done: !item.done } : item,
                              ),
                            })
                          }
                        />
                        <span className={`flex-1 min-w-0 ${subtask.done ? 'text-muted line-through' : ''}`}>
                          {subtask.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {mode === 'edit' && (
          <div className="px-[18px] py-[14px] border-t border-border flex items-center gap-[10px]">
            <button
              type="button"
              className="btn text-danger border-danger-soft hover:bg-danger-soft"
              onClick={onDelete}
            >
              删除待办
            </button>
            <span className="text-xs text-meta flex items-center gap-[4px]">
              <PaperclipIcon width={12} height={12} />
              改动会自动保存
            </span>
          </div>
        )}
      </aside>
    </>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-[14px] py-[11px] border-b border-border-soft">
      <div className="flex-none w-[62px] panel-label pt-[2px]">{label}</div>
      <div className="flex-1 min-w-0 text-sm">{children}</div>
    </div>
  )
}

/** 开关外观（隐藏的原生 checkbox + 自己画的滑块，与原型一致） */
function Switch({ checked, small = false }: { checked: boolean; small?: boolean }) {
  return (
    <span
      className={[
        'relative flex-none rounded-full transition-colors',
        small ? 'w-[32px] h-[18px]' : 'w-[38px] h-[22px]',
        checked ? 'bg-accent' : 'bg-[var(--fg-soft-2)]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2px] left-[2px] rounded-full bg-bg transition-transform',
          small ? 'w-[14px] h-[14px]' : 'w-[18px] h-[18px]',
          checked ? (small ? 'translate-x-[14px]' : 'translate-x-[16px]') : '',
        ].join(' ')}
      />
    </span>
  )
}

/** 抽屉宽度可拖拽（百分比）；窗口小于 920px 时前端忽略（走全宽） */
function useResizablePanel() {
  const [percent, setPercent] = useState(45)
  const resizing = useRef(false)

  function startResize(event: React.PointerEvent) {
    event.preventDefault()
    resizing.current = true

    const onMove = (moveEvent: PointerEvent) => {
      if (!resizing.current) return
      const next = ((window.innerWidth - moveEvent.clientX) / window.innerWidth) * 100
      setPercent(Math.min(96, Math.max(30, Math.round(next * 10) / 10)))
    }
    const onUp = () => {
      resizing.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing')
    }

    document.body.classList.add('resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { percent, startResize }
}
