// 待办数据访问层：纯 SQL 逻辑，跑在 SqlClient 上（生产 pg / 测试 PGlite 都满足）。
// 路由只做校验与响应拼装，所有查询与事务都收在这里。

import type { Attachment, Priority, Subtask, TagSummary, Todo, TodoInput, TodoUpdate } from '@agent-todo/shared'
import { compareTodos, PRIORITY_VALUE } from '@agent-todo/shared'
import type { SqlClient } from './db.ts'
import type { AttachmentStore, UploadFileLike } from './attachments.ts'

export interface ListTodosOptions {
  status?: string
  tag?: string
  query?: string
}

export interface SaveAttachmentResult extends Attachment {
  storagePath: string
}

/** 未配置 DATABASE_URL 时抛出；由 app 映射成 503 */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super('服务端未配置 DATABASE_URL，数据库功能不可用')
    this.name = 'DatabaseUnavailableError'
  }
}

export interface TodoStore {
  list(options?: ListTodosOptions): Promise<Todo[]>
  get(id: string): Promise<Todo | undefined>
  create(input: TodoInput): Promise<Todo>
  replace(id: string, update: TodoUpdate): Promise<Todo | undefined>
  remove(id: string): Promise<boolean>
  listTags(): Promise<TagSummary[]>
  saveAttachment(todoId: string, file: UploadFileLike): Promise<SaveAttachmentResult | undefined>
  /** 删除附件记录，返回存储路径（路由负责删文件）；附件不存在返回 undefined */
  removeAttachment(id: string): Promise<{ storagePath: string } | undefined>
  getAttachment(id: string): Promise<{ attachment: Attachment; storagePath: string } | undefined>
}

interface TodoRow {
  id: string
  title: string
  description: string
  done: boolean
  priority: number
  start_date: string | null
  end_date: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface SubtaskRow {
  id: string
  todo_id: string
  title: string
  done: boolean
  position: number
}

interface AttachmentRow {
  id: string
  todo_id: string
  name: string
  mime_type: string
  size: string | number
  storage_path: string
  created_at: Date | string
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/** date 列可能返回 string（PGlite / pg 配置）或 Date，统一成 yyyy-mm-dd */
function dateOnly(value: string | Date | null): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value.slice(0, 10)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    done: row.done,
    priority: (['none', 'low', 'medium', 'high'][row.priority] ?? 'none') as Priority,
    tags: [],
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    subtasks: [],
    attachments: [],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function mapSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    todoId: row.todo_id,
    title: row.title,
    done: row.done,
    position: row.position,
  }
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    todoId: row.todo_id,
    name: row.name,
    mimeType: row.mime_type,
    size: Number(row.size),
    createdAt: iso(row.created_at),
  }
}

/** 归一化标签：去首尾空白、丢弃空串、去重（保持顺序） */
function normalizeTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of tags ?? []) {
    const tag = raw.trim()
    if (!tag || seen.has(tag)) continue

    seen.add(tag)
    result.push(tag)
  }

  return result
}

export function createTodoStore(
  getSql: () => SqlClient | null,
  attachmentStore: AttachmentStore,
): TodoStore {
  const sql = (): SqlClient => {
    const client = getSql()
    if (!client) throw new DatabaseUnavailableError()

    return client
  }

  async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    await sql().exec('begin')
    try {
      const result = await fn()
      await sql().exec('commit')
      return result
    } catch (error) {
      await sql().exec('rollback')
      throw error
    }
  }

  /** 批量补齐标签 / 子任务 / 附件，避免 N+1 查询 */
  async function hydrate(todos: Todo[]): Promise<Todo[]> {
    if (todos.length === 0) return todos

    const ids = todos.map((todo) => todo.id)
    const byId = new Map(todos.map((todo) => [todo.id, todo]))

    const tagRows = await sql().query<{ todo_id: string; name: string }>(
      `select tt.todo_id, t.name
         from todo_tags tt
         join tags t on t.id = tt.tag_id
        where tt.todo_id = any($1::uuid[])
        order by t.name`,
      [ids],
    )
    for (const row of tagRows) byId.get(row.todo_id)?.tags.push(row.name)

    const subtaskRows = await sql().query<SubtaskRow>(
      `select id, todo_id, title, done, position
         from subtasks
        where todo_id = any($1::uuid[])
        order by position, id`,
      [ids],
    )
    for (const row of subtaskRows) byId.get(row.todo_id)?.subtasks.push(mapSubtask(row))

    const attachmentRows = await sql().query<AttachmentRow>(
      `select id, todo_id, name, mime_type, size, storage_path, created_at
         from attachments
        where todo_id = any($1::uuid[])
        order by created_at, id`,
      [ids],
    )
    for (const row of attachmentRows) byId.get(row.todo_id)?.attachments.push(mapAttachment(row))

    return todos
  }

  async function get(id: string): Promise<Todo | undefined> {
    const rows = await sql().query<TodoRow>(
      `select id, title, description, done, priority, start_date, end_date, created_at, updated_at
         from todos where id = $1`,
      [id],
    )
    const row = rows[0]
    if (!row) return undefined

    const [todo] = await hydrate([mapTodo(row)])
    return todo
  }

  /** 写入标签关联（标签表用 on conflict 复用） */
  async function setTags(todoId: string, tags: readonly string[]): Promise<void> {
    await sql().query(`delete from todo_tags where todo_id = $1`, [todoId])

    for (const name of tags) {
      await sql().query(`insert into tags (name) values ($1) on conflict (name) do nothing`, [name])
      await sql().query(
        `insert into todo_tags (todo_id, tag_id)
         select $1, id from tags where name = $2
         on conflict do nothing`,
        [todoId, name],
      )
    }
  }

  /** 写入子任务：带 id 的沿用原 id（保留附件等引用），其余按数组顺序新建 */
  async function setSubtasks(
    todoId: string,
    subtasks: readonly { id?: string; title: string; done?: boolean }[],
  ): Promise<void> {
    await sql().query(`delete from subtasks where todo_id = $1`, [todoId])

    let position = 0
    for (const subtask of subtasks) {
      await sql().query(
        `insert into subtasks (id, todo_id, title, done, position)
         values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5)
         on conflict (id) do update set title = excluded.title, done = excluded.done, position = excluded.position`,
        [subtask.id ?? null, todoId, subtask.title, subtask.done ?? false, position],
      )
      position += 1
    }
  }

  return {
    async list(options = {}) {
      const filters: string[] = []
      const values: unknown[] = []

      if (options.tag) {
        values.push(options.tag)
        filters.push(
          `exists (
             select 1 from todo_tags tt
              join tags tg on tg.id = tt.tag_id
             where tt.todo_id = todos.id and tg.name = $${values.length}
           )`,
        )
      }

      if (options.query) {
        values.push(`%${options.query}%`)
        filters.push(
          `(todos.title ilike $${values.length} or todos.description ilike $${values.length})`,
        )
      }

      const where = filters.length > 0 ? `where ${filters.join(' and ')}` : ''
      const rows = await sql().query<TodoRow>(
        `select id, title, description, done, priority, start_date, end_date, created_at, updated_at
           from todos ${where}`,
        values,
      )

      const todos = await hydrate(rows.map(mapTodo))
      return todos.sort(compareTodos)
    },

    get,

    async create(input) {
      const todoId = await transaction(async () => {
        const rows = await sql().query<{ id: string }>(
          `insert into todos (title, description, done, priority, start_date, end_date)
           values ($1, $2, $3, $4, $5::date, $6::date)
           returning id`,
          [
            input.title,
            input.description ?? '',
            input.done ?? false,
            PRIORITY_VALUE[input.priority ?? 'none'],
            input.startDate ?? null,
            input.endDate ?? null,
          ],
        )
        const id = rows[0]?.id
        if (!id) throw new Error('创建待办失败：数据库没有返回 id')

        await setTags(id, normalizeTags(input.tags))
        await setSubtasks(
          id,
          (input.subtasks ?? []).map((title) => ({ title })),
        )

        return id
      })

      const todo = await get(todoId)
      if (!todo) throw new Error('创建待办后读取失败')
      return todo
    },

    async replace(id, update) {
      const existing = await sql().query<{ id: string }>(`select id from todos where id = $1`, [id])
      if (existing.length === 0) return undefined

      // 附件不在 replace 的管辖范围（由附件接口增删），传入的子任务决定保留 / 删除
      const droppedSubtasks = await sql().query<{ id: string }>(
        `select id from subtasks where todo_id = $1 and not (id = any($2::uuid[]))`,
        [id, (update.subtasks ?? []).flatMap((subtask) => (subtask.id ? [subtask.id] : []))],
      )
      if (droppedSubtasks.length > 0) {
        console.warn(`[todos] 更新 ${id} 时删除了 ${droppedSubtasks.length} 个子任务`)
      }

      await transaction(async () => {
        await sql().query(
          `update todos
              set title = $2,
                  description = $3,
                  done = $4,
                  priority = $5,
                  start_date = $6::date,
                  end_date = $7::date,
                  updated_at = now()
            where id = $1`,
          [
            id,
            update.title,
            update.description ?? '',
            update.done ?? false,
            PRIORITY_VALUE[update.priority ?? 'none'],
            update.startDate ?? null,
            update.endDate ?? null,
          ],
        )
        await setTags(id, normalizeTags(update.tags))
        await setSubtasks(id, update.subtasks ?? [])
      })

      return get(id)
    },

    async remove(id) {
      const files = await sql().query<{ storage_path: string }>(
        `delete from attachments where todo_id = $1 returning storage_path`,
        [id],
      )
      const deleted = await sql().query<{ id: string }>(
        `delete from todos where id = $1 returning id`,
        [id],
      )
      if (deleted.length === 0) return false

      // 文件删除失败不影响接口结果（记录已经删掉，残留文件由运维清理）
      for (const file of files) {
        await attachmentStore.remove(file.storage_path).catch(() => undefined)
      }

      return true
    },

    async listTags() {
      const rows = await sql().query<{ name: string; count: string | number }>(
        `select t.name, count(tt.todo_id) as count
           from tags t
           join todo_tags tt on tt.tag_id = t.id
          group by t.name
          order by count(tt.todo_id) desc, t.name asc`,
      )

      return rows.map((row) => ({ tag: row.name, count: Number(row.count) }))
    },

    async saveAttachment(todoId, file) {
      const existing = await sql().query<{ id: string }>(`select id from todos where id = $1`, [todoId])
      if (existing.length === 0) return undefined

      const saved = await attachmentStore.save(todoId, file)
      const rows = await sql().query<AttachmentRow>(
        `insert into attachments (id, todo_id, name, mime_type, size, storage_path)
         values ($1, $2, $3, $4, $5, $6)
         returning id, todo_id, name, mime_type, size, storage_path, created_at`,
        [saved.id, todoId, saved.name, saved.mimeType, saved.size, saved.storagePath],
      )
      const row = rows[0]
      if (!row) throw new Error('附件记录写入失败')

      return { ...mapAttachment(row), storagePath: row.storage_path }
    },

    async removeAttachment(id) {
      const rows = await sql().query<{ storage_path: string }>(
        `delete from attachments where id = $1 returning storage_path`,
        [id],
      )
      const row = rows[0]
      return row ? { storagePath: row.storage_path } : undefined
    },

    async getAttachment(id) {
      const rows = await sql().query<AttachmentRow>(
        `select id, todo_id, name, mime_type, size, storage_path, created_at
           from attachments where id = $1`,
        [id],
      )
      const row = rows[0]
      if (!row) return undefined

      return { attachment: mapAttachment(row), storagePath: row.storage_path }
    },
  }
}
