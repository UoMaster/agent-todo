import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Priority,
  type SubtaskInput,
  type TagSummary,
  type Todo,
  type TodoInput,
} from '@agent-todo/shared'
import { api } from '../helpers/api.ts'

/** 面板里编辑草稿的形态（与 TodoUpdate 对齐，子任务带上 id 以保留引用） */
export interface TodoDraft {
  title: string
  description: string
  done: boolean
  priority: Priority
  tags: string[]
  startDate: string | null
  endDate: string | null
  subtasks: SubtaskInput[]
}

export function toDraft(todo: Todo): TodoDraft {
  return {
    title: todo.title,
    description: todo.description,
    done: todo.done,
    priority: todo.priority,
    tags: [...todo.tags],
    startDate: todo.startDate,
    endDate: todo.endDate,
    subtasks: todo.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      done: subtask.done,
    })),
  }
}

function toUpdate(draft: TodoDraft) {
  return {
    title: draft.title,
    description: draft.description,
    done: draft.done,
    priority: draft.priority,
    tags: draft.tags,
    startDate: draft.startDate,
    endDate: draft.endDate,
    subtasks: draft.subtasks,
  }
}

export interface TodoStore {
  todos: Todo[]
  tags: TagSummary[]
  /** 首次加载中 */
  loading: boolean
  /** 连接 / 请求失败的可读提示（null 表示正常） */
  error: string | null
  reload: () => Promise<void>
  createTodo: (input: TodoInput) => Promise<Todo | null>
  /** 用完整草稿整体替换（面板保存走它） */
  saveDraft: (id: string, draft: TodoDraft) => Promise<Todo | null>
  /** 局部更新（勾选完成、拖拽改期等快捷操作） */
  updateTodo: (id: string, patch: Partial<TodoDraft>) => Promise<Todo | null>
  deleteTodo: (id: string) => Promise<boolean>
  /** 把服务器返回的最新待办并回本地（附件上传 / 删除后用） */
  upsertTodo: (todo: Todo) => void
  /** 只刷新标签统计（附件操作不影响待办本体时用） */
  refreshTags: () => Promise<void>
}

/**
 * 数据层：待办与标签的唯一来源。
 *
 * 写操作统一「先请服务器 → 用返回值更新本地」，失败时保留本地数据并给出提示；
 * 不做乐观更新，避免服务器失败后界面与真实数据不一致。
 */
export function useTodoStore(): TodoStore {
  const [todos, setTodos] = useState<Todo[]>([])
  const [tags, setTags] = useState<TagSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshTags = useCallback(async () => {
    try {
      setTags(await api.listTags())
    } catch {
      // 标签统计失败不影响主流程，下次写操作或刷新会自愈
    }
  }, [])

  const reload = useCallback(async () => {
    try {
      const [nextTodos, nextTags] = await Promise.all([api.listTodos(), api.listTags()])
      setTodos(nextTodos)
      setTags(nextTags)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  // 首次加载：与外部 HTTP 服务同步，必然要在 effect 里落到 state
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- 同步外部数据源时必须写 state
    void reload()
  }, [reload])

  /** 写操作共用：统一错误提示 */
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      const result = await action()
      setError(null)
      return result
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError))
      return null
    }
  }, [])

  const upsert = useCallback((todo: Todo) => {
    setTodos((current) => {
      const exists = current.some((item) => item.id === todo.id)
      return exists ? current.map((item) => (item.id === todo.id ? todo : item)) : [...current, todo]
    })
  }, [])

  const createTodo = useCallback(
    async (input: TodoInput) => {
      const todo = await run(() => api.createTodo(input))
      if (todo) {
        upsert(todo)
        void refreshTags()
      }
      return todo
    },
    [refreshTags, run, upsert],
  )

  const saveDraft = useCallback(
    async (id: string, draft: TodoDraft) => {
      const todo = await run(() => api.updateTodo(id, toUpdate(draft)))
      if (todo) {
        upsert(todo)
        void refreshTags()
      }
      return todo
    },
    [refreshTags, run, upsert],
  )

  const updateTodo = useCallback(
    async (id: string, patch: Partial<TodoDraft>) => {
      const existing = todos.find((item) => item.id === id)
      if (!existing) return null

      return saveDraft(id, { ...toDraft(existing), ...patch })
    },
    [saveDraft, todos],
  )

  const deleteTodo = useCallback(
    async (id: string) => {
      try {
        await api.deleteTodo(id)
        setTodos((current) => current.filter((item) => item.id !== id))
        setError(null)
        void refreshTags()
        return true
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
        return false
      }
    },
    [refreshTags],
  )

  return {
    todos,
    tags,
    loading,
    error,
    reload,
    createTodo,
    saveDraft,
    updateTodo,
    deleteTodo,
    upsertTodo: upsert,
    refreshTags,
  }
}

/**
 * 防抖保存：返回「排程保存」与「立即保存」。
 * 面板关闭 / 切换待办前调用 flush，保证最后一次输入不丢。
 */
export function useDebouncedSave(delay = 600) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
  }, [])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current?.()
    pending.current = null
  }, [])

  const schedule = useCallback(
    (save: () => void) => {
      pending.current = save
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        pending.current?.()
        pending.current = null
      }, delay)
    },
    [delay],
  )

  useEffect(() => cancel, [cancel])

  return { schedule, flush, cancel }
}
