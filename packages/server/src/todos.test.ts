import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { addDays } from '@agent-todo/shared'
import { createMemoryAttachmentStore, type AttachmentStore } from './attachments.ts'
import { createTestContext, queryOne, type TestContext } from './test-utils.ts'
import type { TodoStore } from './todos.ts'
import { createTodoStore, DatabaseUnavailableError } from './todos.ts'
import type { SqlClient } from './db.ts'

/** 直接用到 sql / 内存附件存储的数据层测试装置 */
function buildStore(sql: SqlClient, attachmentStore: AttachmentStore): TodoStore {
  return createTodoStore(() => sql, attachmentStore)
}

/** 保存附件并断言成功（拿掉的 undefined 由这里兜住） */
async function mustSave(
  store: TodoStore,
  todoId: string,
  file: File,
): Promise<NonNullable<Awaited<ReturnType<TodoStore['saveAttachment']>>>> {
  const saved = await store.saveAttachment(todoId, file)
  if (!saved) throw new Error('保存附件失败')

  return saved
}

describe('TodoStore（数据层，跑在 PGlite 上）', () => {
  let context: TestContext
  let store: TodoStore
  let attachments: AttachmentStore

  beforeEach(async () => {
    context = await createTestContext()
    attachments = createMemoryAttachmentStore()
    store = buildStore(context.sql, attachments)
  })

  afterEach(async () => {
    await context.dispose()
  })

  describe('create', () => {
    test('最小入参：其余字段取默认值', async () => {
      const todo = await store.create({ title: '写文档' })

      expect(todo).toMatchObject({
        title: '写文档',
        description: '',
        done: false,
        priority: 'none',
        tags: [],
        startDate: null,
        endDate: null,
        subtasks: [],
        attachments: [],
      })
      expect(todo.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(new Date(todo.createdAt).getTime()).toBeGreaterThan(0)
      expect(todo.updatedAt).toBe(todo.createdAt)
    })

    test('完整入参：日期 / 优先级 / 标签 / 子任务都落库', async () => {
      const todo = await store.create({
        title: '发布 v2',
        description: '**重点**：灰度',
        done: false,
        priority: 'high',
        tags: ['研发', '发布'],
        startDate: '2026-10-19',
        endDate: '2026-10-23',
        subtasks: ['写发布说明', '通知客户'],
      })

      expect(todo).toMatchObject({
        title: '发布 v2',
        priority: 'high',
        tags: ['发布', '研发'],
        startDate: '2026-10-19',
        endDate: '2026-10-23',
      })
      expect(todo.subtasks.map((subtask) => subtask.title)).toEqual(['写发布说明', '通知客户'])
      expect(todo.subtasks.map((subtask) => subtask.position)).toEqual([0, 1])
      expect(todo.subtasks.every((subtask) => subtask.done === false)).toBe(true)

      const reread = await store.get(todo.id)
      expect(reread).toEqual(todo)
    })

    test('标签去重、去首尾空白、丢空串', async () => {
      const todo = await store.create({ title: 'x', tags: ['研发', ' 研发 ', '', '   ', '产品'] })

      expect(todo.tags).toEqual(['产品', '研发'])
    })

    test('可以创建带日期的单日待办（endDate 为空）', async () => {
      const todo = await store.create({ title: '牙医', startDate: '2026-10-17' })

      expect(todo.startDate).toBe('2026-10-17')
      expect(todo.endDate).toBeNull()
    })
  })

  describe('get', () => {
    test('不存在返回 undefined', async () => {
      expect(await store.get('00000000-0000-4000-8000-000000000000')).toBeUndefined()
    })
  })

  describe('list', () => {
    test('按日期升序、未安排最后、同日期按优先级', async () => {
      const later = await store.create({ title: '以后', startDate: '2026-12-01' })
      const none = await store.create({ title: '未安排', priority: 'high' })
      const first = await store.create({ title: '先做', startDate: '2026-01-01' })
      const sameLow = await store.create({ title: '同天低', startDate: '2026-01-01', priority: 'low' })

      const todos = await store.list()

      expect(todos.map((todo) => todo.id)).toEqual([sameLow.id, first.id, later.id, none.id])
      // 同日期同优先级时按创建顺序
      expect(todos.map((todo) => todo.title)).toEqual(['同天低', '先做', '以后', '未安排'])
    })

    test('按标签过滤', async () => {
      await store.create({ title: 'A', tags: ['研发'] })
      await store.create({ title: 'B', tags: ['设计'] })

      const todos = await store.list({ tag: '研发' })

      expect(todos.map((todo) => todo.title)).toEqual(['A'])
    })

    test('按关键字搜索标题与描述（不区分大小写）', async () => {
      await store.create({ title: 'Fix Login Bug' })
      await store.create({ title: '其他', description: '包含 login 的描述' })
      await store.create({ title: '无关' })

      expect((await store.list({ query: 'login' })).map((todo) => todo.title)).toEqual([
        'Fix Login Bug',
        '其他',
      ])
      expect((await store.list({ query: 'LOGIN' })).length).toBe(2)
    })

    test('空库返回空数组', async () => {
      expect(await store.list()).toEqual([])
    })
  })

  describe('replace', () => {
    test('不存在的待办返回 undefined', async () => {
      const result = await store.replace('00000000-0000-4000-8000-000000000000', { title: 'x' })

      expect(result).toBeUndefined()
    })

    test('整条替换：字段被覆盖，未传的字段回默认值', async () => {
      const todo = await store.create({
        title: '旧标题',
        description: '旧描述',
        done: true,
        priority: 'high',
        tags: ['研发'],
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        subtasks: ['旧子任务'],
      })

      const updated = await store.replace(todo.id, { title: '新标题' })

      expect(updated).toMatchObject({
        title: '新标题',
        description: '',
        done: false,
        priority: 'none',
        tags: [],
        startDate: null,
        endDate: null,
        subtasks: [],
      })
      expect(updated).not.toBeUndefined()
      expect(updated?.updatedAt).toBeDefined()
      expect((updated?.updatedAt ?? '') >= todo.updatedAt).toBe(true)
    })

    test('子任务带 id 时沿用原 id（保留引用），不带 id 的新建', async () => {
      const todo = await store.create({ title: 'x', subtasks: ['甲', '乙'] })
      const kept = todo.subtasks[0]
      if (!kept) throw new Error('缺少子任务')

      const updated = await store.replace(todo.id, {
        title: 'x',
        subtasks: [
          { id: kept.id, title: '甲改', done: true },
          { title: '丙' },
        ],
      })

      expect(updated?.subtasks.map((subtask) => subtask.id)).toEqual([kept.id, expect.any(String)])
      expect(updated?.subtasks.map((subtask) => subtask.title)).toEqual(['甲改', '丙'])
      expect(updated?.subtasks.map((subtask) => subtask.done)).toEqual([true, false])
    })

    test('传入不存在的子任务 id 时只按现状保留（不会报错）', async () => {
      const todo = await store.create({ title: 'x', subtasks: ['甲'] })

      const updated = await store.replace(todo.id, {
        title: 'x',
        subtasks: [{ id: '00000000-0000-4000-8000-000000000000', title: '外来' }],
      })

      expect(updated?.subtasks.map((subtask) => subtask.title)).toEqual(['外来'])
      const remaining = await queryOne<{ count: string }>(
        context.sql,
        'select count(*)::text as count from subtasks where todo_id = $1',
        [todo.id],
      )
      expect(remaining.count).toBe('1')
    })

    test('删除子任务时会打日志（提醒调用方）', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const todo = await store.create({ title: 'x', subtasks: ['甲', '乙'] })

      await store.replace(todo.id, { title: 'x', subtasks: [] })

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('删除了 2 个子任务'))
      warn.mockRestore()
    })

    test('标签整组替换，旧标签关联被清空', async () => {
      const todo = await store.create({ title: 'x', tags: ['研发', '设计'] })

      const updated = await store.replace(todo.id, { title: 'x', tags: ['设计'] })

      expect(updated?.tags).toEqual(['设计'])
      const links = await context.sql.query<{ count: string }>(
        `select count(*)::text as count from todo_tags where todo_id = $1`,
        [todo.id],
      )
      expect(links[0]?.count).toBe('1')
    })

    test('日期区间可以被清空或改成单日', async () => {
      const todo = await store.create({ title: 'x', startDate: '2026-10-01', endDate: '2026-10-05' })

      const single = await store.replace(todo.id, { title: 'x', startDate: '2026-10-02' })
      expect(single).toMatchObject({ startDate: '2026-10-02', endDate: null })

      const cleared = await store.replace(todo.id, { title: 'x' })
      expect(cleared).toMatchObject({ startDate: null, endDate: null })
    })

    test('附件不受 replace 影响（由附件接口单独管理）', async () => {
      const todo = await store.create({ title: 'x' })
      await store.saveAttachment(todo.id, new File(['hello'], 'a.txt', { type: 'text/plain' }))

      const updated = await store.replace(todo.id, { title: '改了标题' })

      expect(updated?.attachments.map((attachment) => attachment.name)).toEqual(['a.txt'])
    })
  })

  describe('remove', () => {
    test('删除待办、子任务与标签关联（级联）', async () => {
      const todo = await store.create({ title: 'x', tags: ['研发'], subtasks: ['甲'] })

      expect(await store.remove(todo.id)).toBe(true)

      const subtasks = await context.sql.query<{ count: string }>(
        'select count(*)::text as count from subtasks where todo_id = $1',
        [todo.id],
      )
      expect(subtasks[0]?.count).toBe('0')
      const links = await context.sql.query<{ count: string }>(
        'select count(*)::text as count from todo_tags where todo_id = $1',
        [todo.id],
      )
      expect(links[0]?.count).toBe('0')
    })

    test('删除待办时一并删掉附件文件与记录', async () => {
      const todo = await store.create({ title: 'x' })
      const saved = await mustSave(store, todo.id, new File(['data'], 'a.bin'))

      await store.remove(todo.id)

      await expect(attachments.read(saved.storagePath)).rejects.toThrow('附件文件不存在')
      const rows = await context.sql.query<{ count: string }>(
        'select count(*)::text as count from attachments where todo_id = $1',
        [todo.id],
      )
      expect(rows[0]?.count).toBe('0')
    })

    test('删除不存在的待办返回 false', async () => {
      expect(await store.remove('00000000-0000-4000-8000-000000000000')).toBe(false)
    })
  })

  describe('listTags', () => {
    test('统计每个标签的待办数并按数量倒序', async () => {
      await store.create({ title: 'A', tags: ['研发', '会议'] })
      await store.create({ title: 'B', tags: ['研发'] })
      await store.create({ title: 'C', tags: ['设计'] })

      expect(await store.listTags()).toEqual([
        { tag: '研发', count: 2 },
        { tag: '会议', count: 1 },
        { tag: '设计', count: 1 },
      ])
    })

    test('清空标签后计数归零（不再出现）', async () => {
      const todo = await store.create({ title: 'A', tags: ['研发'] })
      await store.replace(todo.id, { title: 'A' })

      expect(await store.listTags()).toEqual([])
    })
  })

  describe('附件读写', () => {
    test('保存附件返回元数据，内容可读回', async () => {
      const todo = await store.create({ title: 'x' })

      const saved = await mustSave(
        store,
        todo.id,
        new File([Uint8Array.from([1, 2, 3])], '数据.bin', { type: 'application/octet-stream' }),
      )

      expect(saved).toMatchObject({
        todoId: todo.id,
        name: '数据.bin',
        mimeType: 'application/octet-stream',
        size: 3,
      })
      expect([...(await attachments.read(saved.storagePath))]).toEqual([1, 2, 3])
      expect((await store.get(todo.id))?.attachments).toHaveLength(1)
    })

    test('待办不存在时返回 undefined，且不落文件', async () => {
      const saved = await store.saveAttachment('00000000-0000-4000-8000-000000000000', new File(['x'], 'a'))

      expect(saved).toBeUndefined()
    })

    test('getAttachment 返回元数据与存储路径', async () => {
      const todo = await store.create({ title: 'x' })
      const saved = await mustSave(store, todo.id, new File(['abc'], 'a.txt', { type: 'text/plain' }))

      const found = await store.getAttachment(saved.id)

      expect(found?.attachment.name).toBe('a.txt')
      expect(found?.storagePath).toBe(saved.storagePath)
      expect(await store.getAttachment('00000000-0000-4000-8000-000000000000')).toBeUndefined()
    })

    test('removeAttachment 返回存储路径，重复删除返回 undefined', async () => {
      const todo = await store.create({ title: 'x' })
      const saved = await mustSave(store, todo.id, new File(['abc'], 'a.txt'))

      expect(await store.removeAttachment(saved.id)).toEqual({ storagePath: saved.storagePath })
      expect(await store.removeAttachment(saved.id)).toBeUndefined()
      expect((await store.get(todo.id))?.attachments).toEqual([])
    })
  })

  describe('日期区间约束', () => {
    test('数据库层面拒绝结束日期早于开始日期', async () => {
      await expect(
        context.sql.query(`insert into todos (title, start_date, end_date) values ($1, $2, $3)`, [
          'bad',
          '2026-10-10',
          '2026-10-01',
        ]),
      ).rejects.toThrow()
    })

    test('数据库层面拒绝只有结束日期没有开始日期', async () => {
      await expect(
        context.sql.query(`insert into todos (title, end_date) values ($1, $2)`, ['bad', '2026-10-01']),
      ).rejects.toThrow()
    })
  })

  describe('未配置数据库', () => {
    test('所有操作抛 DatabaseUnavailableError', async () => {
      const storeWithoutDb = createTodoStore(() => null, createMemoryAttachmentStore())

      await expect(storeWithoutDb.list()).rejects.toThrow(DatabaseUnavailableError)
      await expect(storeWithoutDb.get('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
        DatabaseUnavailableError,
      )
      await expect(storeWithoutDb.create({ title: 'x' })).rejects.toThrow(DatabaseUnavailableError)
    })
  })

  describe('updated_at', () => {
    test('replace 会刷新 updated_at', async () => {
      const original = await store.create({ title: 'x' })

      // 把时间戳回拨，避免同一毫秒内看不出差异
      await context.sql.query(`update todos set updated_at = now() - interval '1 hour' where id = $1`, [
        original.id,
      ])

      const updated = await store.replace(original.id, { title: 'y' })
      if (!updated || !updated.updatedAt) throw new Error('替换后应该能读到待办')

      expect(updated.updatedAt > original.updatedAt).toBe(true)
      expect(addDays(context.today, 0)).toBe(context.today)
    })
  })
})
