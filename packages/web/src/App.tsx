import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  matchesStatusFilter,
  todayKey,
  type Attachment,
  type Todo,
  type TodoFilter,
  type TodoStatusFilter,
} from '@agent-todo/shared'
import { AppBar } from './components/AppBar.tsx'
import { CalendarView } from './components/CalendarView.tsx'
import { DetailPanel } from './components/DetailPanel.tsx'
import { ListView } from './components/ListView.tsx'
import { Sidebar } from './components/Sidebar.tsx'
import { api } from './helpers/api.ts'
import { useDebouncedSave, useTodoStore, type TodoDraft } from './data/todos.ts'

type View = 'list' | 'calendar'

/** 保存防抖：连续输入 / 拖拽期间只落一次库 */
const SAVE_DELAY = 600

export default function App() {
  const store = useTodoStore()
  const [view, setView] = useState<View>('list')
  const [filter, setFilter] = useState<TodoFilter>({ type: 'all' })
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [previewDates, setPreviewDates] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  const save = useDebouncedSave(SAVE_DELAY)
  /** 待落库的草稿与对应待办：用于关闭面板 / 切换待办前补一次保存 */
  const pending = useRef<{ id: string; draft: TodoDraft } | null>(null)

  const today = todayKey()

  useEffect(() => {
    // 面板打开时锁住 body 滚动，避免背景跟着滚
    document.body.style.overflow = selectedId ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [selectedId])

  const scheduleSave = useCallback(
    (id: string, draft: TodoDraft) => {
      pending.current = { id, draft }
      save.schedule(() => {
        pending.current = null
        void store.saveDraft(id, draft)
      })
    },
    [save, store],
  )

  const flushSave = useCallback(() => {
    save.flush()
    // flush 之后再兜一层：防抖窗口里还没排上的改动
    const inFlight = pending.current
    pending.current = null
    if (inFlight) void store.saveDraft(inFlight.id, inFlight.draft)
  }, [save, store])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !selectedId) return

      flushSave()
      setSelectedId(null)
      setMode('view')
    }

    document.addEventListener('keydown', onKeyDown)

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [flushSave, selectedId])

  const counts = useMemo(() => {
    const statuses: TodoStatusFilter[] = ['all', 'overdue', 'today', 'upcoming', 'done']
    return Object.fromEntries(
      statuses.map((status) => [
        status,
        store.todos.filter((todo) => matchesStatusFilter(todo, { type: status }, today)).length,
      ]),
    ) as Record<TodoStatusFilter, number>
  }, [store.todos, today])

  const visibleTodos = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return store.todos.filter((todo) => {
      if (!matchesStatusFilter(todo, filter, today)) return false
      if (!keyword) return true

      return (
        todo.title.toLowerCase().includes(keyword) ||
        todo.description.toLowerCase().includes(keyword)
      )
    })
  }, [filter, query, store.todos, today])

  const selected = store.todos.find((todo) => todo.id === selectedId) ?? null
  const progress = store.todos.length
    ? Math.round((store.todos.filter((todo) => todo.done).length / store.todos.length) * 100)
    : 0

  async function handleCreateAt(date: string | null) {
    const todo = await store.createTodo({ title: '', startDate: date })
    if (todo) {
      setSelectedId(todo.id)
      setMode('edit')
    }
  }

  async function handleToggleDone(todo: Todo) {
    await store.updateTodo(todo.id, { done: !todo.done })
  }

  async function handleReschedule(
    id: string,
    changes: { startDate?: string | null; endDate?: string | null },
  ) {
    await store.updateTodo(id, changes)
  }

  async function handleUpload(files: File[]) {
    if (!selected) return

    flushSave()
    for (const file of files) {
      try {
        const attachment = await api.uploadAttachment(selected.id, {
          name: file.name,
          data: file,
          mimeType: file.type,
        })
        void attachment
      } catch (error) {
        console.error('[upload] 上传失败', error)
      }
    }

    // 用服务器返回的最新待办并回本地，附件列表即时可见
    try {
      store.upsertTodo(await api.getTodo(selected.id))
    } catch (error) {
      console.error('[upload] 刷新待办失败', error)
      await store.reload()
    }
  }

  async function handleDeleteAttachment(attachment: Attachment) {
    if (!selected) return

    flushSave()
    try {
      await api.deleteAttachment(attachment.id)
      store.upsertTodo(await api.getTodo(selected.id))
    } catch (error) {
      console.error('[attachment] 删除失败', error)
      await store.reload()
    }
  }

  async function handleDelete() {
    if (!selected) return
    save.cancel()
    pending.current = null
    const removed = await store.deleteTodo(selected.id)
    if (removed) {
      setSelectedId(null)
      setMode('view')
    }
  }

  function handleClose() {
    flushSave()
    setSelectedId(null)
    setMode('view')
  }

  function handleSelect(id: string) {
    if (id === selectedId) return
    flushSave()
    setSelectedId(id)
    setMode('view')
  }

  function handleChangeMode(next: 'view' | 'edit') {
    if (next === mode) return
    if (next === 'view') flushSave()
    setMode(next)
  }

  return (
    <div className="h-full flex flex-col">
      <AppBar
        view={view}
        onChangeView={(next) => {
          flushSave()
          setView(next)
        }}
        query={query}
        onChangeQuery={setQuery}
        onCreate={() => void handleCreateAt(null)}
      />

      {store.error && (
        <div className="px-[16px] py-[8px] text-xs text-danger-text bg-danger-soft border-b border-[color-mix(in_oklab,var(--danger),transparent_75%)]">
          后端请求失败：{store.error}
        </div>
      )}

      <div className="flex-1 flex min-h-0 max-md:flex-col">
        {view === 'list' && (
          <Sidebar
            filter={filter}
            onChangeFilter={(next) => {
              setFilter(next)
              setSelectedId(null)
            }}
            counts={counts}
            tags={store.tags}
            progress={progress}
          />
        )}

        <main
          className={`flex-1 overflow-y-auto px-[30px] pt-[26px] pb-[72px] max-md:px-[14px] max-md:pt-[16px] max-md:pb-[88px] ${
            dragging ? 'select-none' : ''
          }`}
        >
          {store.loading ? (
            <div className="py-[72px] text-center text-sm text-muted">正在加载待办…</div>
          ) : view === 'list' ? (
            <ListView
              todos={visibleTodos}
              filter={filter}
              query={query}
              today={today}
              selectedId={selectedId}
              onSelect={handleSelect}
              onToggleDone={(todo) => void handleToggleDone(todo)}
            />
          ) : (
            <CalendarView
              todos={visibleTodos}
              cursor={cursor}
              onChangeCursor={setCursor}
              onSelect={handleSelect}
              onCreateAt={(date) => void handleCreateAt(date)}
              onReschedule={(id, changes) => void handleReschedule(id, changes)}
              previewDates={previewDates}
              onPreviewChange={setPreviewDates}
              onDragStateChange={setDragging}
            />
          )}
          {dragging && (
            <div className="fixed bottom-[16px] left-1/2 -translate-x-1/2 z-30 px-[12px] py-[6px] rounded-full bg-fg text-bg text-xs shadow-[var(--elev-raised)]">
              松开鼠标完成改期
            </div>
          )}
        </main>
      </div>

      {selected && (
        <DetailPanel
          todo={selected}
          mode={mode}
          onChangeMode={handleChangeMode}
          onClose={handleClose}
          onSave={(draft) => scheduleSave(selected.id, draft)}
          onDelete={() => void handleDelete()}
          onUpload={handleUpload}
          onDeleteAttachment={handleDeleteAttachment}
        />
      )}
    </div>
  )
}
