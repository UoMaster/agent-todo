import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { addDays, type Todo } from '@agent-todo/shared'
import { createApp } from '../app.ts'
import { createMemoryAttachmentStore } from '../attachments.ts'
import { createTodoStore } from '../todos.ts'
import { createTestContext, type TestContext } from '../test-utils.ts'

/**
 * 待办 / 附件路由测试：进程内 `app.request()` + PGlite（真 SQL 语义）。
 * 覆盖四类：成功响应、参数非法（校验失败）、资源不存在（404）、错误结构 { error, message }。
 */
describe('待办接口', () => {
  let context: TestContext
  const json = (path: string, init?: RequestInit) => context.app.request(path, init)

  async function createTodo(body: Record<string, unknown>): Promise<Todo> {
    const response = await json('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(201)

    return (await response.json()) as Todo
  }

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.dispose()
  })

  describe('POST /api/todos', () => {
    test('最小入参返回 201 与完整待办', async () => {
      const response = await json('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '写文档' }),
      })

      expect(response.status).toBe(201)
      const todo = (await response.json()) as Todo
      expect(todo).toMatchObject({ title: '写文档', done: false, priority: 'none', tags: [] })
      expect(todo.id).toBeTruthy()
    })

    test('完整入参：日期区间 / 优先级 / 标签 / 子任务', async () => {
      const todo = await createTodo({
        title: '发布',
        description: 'md',
        priority: 'high',
        tags: ['研发'],
        startDate: '2026-10-19',
        endDate: '2026-10-23',
        subtasks: ['写说明'],
      })

      expect(todo).toMatchObject({
        priority: 'high',
        tags: ['研发'],
        startDate: '2026-10-19',
        endDate: '2026-10-23',
      })
      expect(todo.subtasks).toHaveLength(1)
    })

    test('缺少 title 返回 400 校验错误', async () => {
      const response = await json('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'validation_error', message: '请求参数不合法' })
    })

    test('非法日期格式返回 400（含不存在的日期 2 月 30 日）', async () => {
      for (const startDate of ['2026/10/14', '2026-13-01', '2026-02-30']) {
        const response = await json('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'x', startDate }),
        })
        expect(response.status, `startDate=${startDate}`).toBe(400)
      }
    })

    test('结束日期早于开始日期返回 400', async () => {
      const response = await json('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x', startDate: '2026-10-10', endDate: '2026-10-01' }),
      })

      expect(response.status).toBe(400)
    })

    test('只有结束日期没有开始日期返回 400', async () => {
      const response = await json('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x', endDate: '2026-10-10' }),
      })

      expect(response.status).toBe(400)
    })

    test('非法优先级返回 400', async () => {
      const response = await json('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x', priority: 'urgent' }),
      })

      expect(response.status).toBe(400)
    })

    test('注册到根应用的接口：未配置数据库时返回 503', async () => {
      const bareApp = createApp({ todoStore: createTodoStore(() => null, createMemoryAttachmentStore()) })
      const response = await bareApp.request('/api/todos')

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: 'database_unavailable',
        message: '服务端未配置 DATABASE_URL，数据库功能不可用',
      })
    })
  })

  describe('GET /api/todos', () => {
    test('默认返回全部，按日期排序', async () => {
      const later = await createTodo({ title: '以后', startDate: addDays(context.today, 30) })
      const sooner = await createTodo({ title: '先做', startDate: context.today })

      const response = await json('/api/todos')
      const todos = (await response.json()) as Todo[]

      expect(response.status).toBe(200)
      expect(todos.map((todo) => todo.id)).toEqual([sooner.id, later.id])
    })

    test('status=overdue / today / upcoming / done 过滤', async () => {
      const overdue = await createTodo({ title: '逾期', startDate: addDays(context.today, -3) })
      const todayTask = await createTodo({ title: '今天', startDate: context.today })
      const upcoming = await createTodo({ title: '以后', startDate: addDays(context.today, 3) })
      const done = await createTodo({ title: '完成', startDate: context.today, done: true })

      const overdueList = (await (await json('/api/todos?status=overdue')).json()) as Todo[]
      expect(overdueList.map((todo) => todo.id)).toEqual([overdue.id])

      const todayList = (await (await json('/api/todos?status=today')).json()) as Todo[]
      expect(todayList.map((todo) => todo.id)).toEqual([todayTask.id])

      const upcomingList = (await (await json('/api/todos?status=upcoming')).json()) as Todo[]
      expect(upcomingList.map((todo) => todo.id)).toEqual([upcoming.id])

      const doneList = (await (await json('/api/todos?status=done')).json()) as Todo[]
      expect(doneList.map((todo) => todo.id)).toEqual([done.id])

      const allList = (await (await json('/api/todos?status=all')).json()) as Todo[]
      expect(allList).toHaveLength(4)
    })

    test('tag 与 q 组合筛选', async () => {
      await createTodo({ title: '修复登录', tags: ['研发'] })
      await createTodo({ title: '修复样式', tags: ['设计'] })
      await createTodo({ title: '写周报', tags: ['研发'] })

      const byTag = (await (await json('/api/todos?tag=%E7%A0%94%E5%8F%91')).json()) as Todo[]
      expect(byTag.map((todo) => todo.title)).toEqual(['修复登录', '写周报'])

      const byQuery = (await (await json('/api/todos?q=%E4%BF%AE%E5%A4%8D')).json()) as Todo[]
      expect(byQuery).toHaveLength(2)

      const both = (await (
        await json('/api/todos?tag=%E7%A0%94%E5%8F%91&q=%E4%BF%AE%E5%A4%8D')
      ).json()) as Todo[]
      expect(both.map((todo) => todo.title)).toEqual(['修复登录'])
    })

    test('非法 status 返回 400', async () => {
      const response = await json('/api/todos?status=whatever')

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'validation_error', message: '请求参数不合法' })
    })

    test('空库返回空数组', async () => {
      expect(await (await json('/api/todos')).json()).toEqual([])
    })
  })

  describe('GET /api/todos/:id', () => {
    test('返回单条待办', async () => {
      const todo = await createTodo({ title: 'x', tags: ['研发'], subtasks: ['甲'] })

      const response = await json(`/api/todos/${todo.id}`)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(todo)
    })

    test('不存在返回 404 与错误结构', async () => {
      const response = await json('/api/todos/00000000-0000-4000-8000-000000000000')

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found', message: '待办不存在' })
    })

    test('非法 id 返回 400', async () => {
      const response = await json('/api/todos/not-a-uuid')

      expect(response.status).toBe(400)
      expect((await response.json()) as { error: string }).toHaveProperty('error', 'validation_error')
    })
  })

  describe('PUT /api/todos/:id', () => {
    test('整条替换成功', async () => {
      const todo = await createTodo({ title: '旧', priority: 'low', tags: ['研发'] })

      const response = await json(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '新',
          priority: 'high',
          tags: ['设计'],
          startDate: '2026-11-01',
          subtasks: [{ title: '子任务' }],
        }),
      })

      expect(response.status).toBe(200)
      const updated = (await response.json()) as Todo
      expect(updated).toMatchObject({ title: '新', priority: 'high', tags: ['设计'], startDate: '2026-11-01' })
      expect(updated.subtasks).toHaveLength(1)
    })

    test('不存在返回 404', async () => {
      const response = await json('/api/todos/00000000-0000-4000-8000-000000000000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x' }),
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found', message: '待办不存在' })
    })

    test('日期区间非法返回 400', async () => {
      const todo = await createTodo({ title: 'x' })

      const response = await json(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x', startDate: '2026-10-10', endDate: '2026-10-01' }),
      })

      expect(response.status).toBe(400)
    })

    test('子任务带 id 保留原 id', async () => {
      const todo = await createTodo({ title: 'x', subtasks: ['甲'] })
      const subtask = todo.subtasks[0]
      if (!subtask) throw new Error('缺少子任务')

      const response = await json(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x', subtasks: [{ id: subtask.id, title: '甲改', done: true }] }),
      })

      const updated = (await response.json()) as Todo
      expect(updated.subtasks[0]).toMatchObject({ id: subtask.id, title: '甲改', done: true })
    })
  })

  describe('DELETE /api/todos/:id', () => {
    test('删除成功返回 204，且列表里不再出现', async () => {
      const todo = await createTodo({ title: 'x' })

      const response = await json(`/api/todos/${todo.id}`, { method: 'DELETE' })

      expect(response.status).toBe(204)
      expect(await (await json('/api/todos')).json()).toEqual([])
    })

    test('不存在返回 404', async () => {
      const response = await json('/api/todos/00000000-0000-4000-8000-000000000000', {
        method: 'DELETE',
      })

      expect(response.status).toBe(404)
    })
  })

  describe('GET /api/tags', () => {
    test('返回标签与计数', async () => {
      await createTodo({ title: 'A', tags: ['研发', '会议'] })
      await createTodo({ title: 'B', tags: ['研发'] })

      const response = await json('/api/tags')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual([
        { tag: '研发', count: 2 },
        { tag: '会议', count: 1 },
      ])
    })

    test('没有标签时返回空数组', async () => {
      expect(await (await json('/api/tags')).json()).toEqual([])
    })
  })

  describe('附件接口', () => {
    async function upload(todoId: string, filename: string, content: string | Uint8Array, type = 'text/plain') {
      const form = new FormData()
      form.append('file', new File([content], filename, { type }))

      return json(`/api/todos/${todoId}/attachments`, { method: 'POST', body: form })
    }

    test('上传返回 201 与附件元数据，待办里能看到附件', async () => {
      const todo = await createTodo({ title: 'x' })

      const response = await upload(todo.id, '说明.txt', 'hello')

      expect(response.status).toBe(201)
      const attachment = (await response.json()) as {
        id: string
        name: string
        size: number
        mimeType: string
      }
      expect(attachment).toMatchObject({ name: '说明.txt', size: 5, mimeType: 'text/plain' })
      expect(attachment).not.toHaveProperty('storagePath')

      const reread = (await (await json(`/api/todos/${todo.id}`)).json()) as Todo
      expect(reread.attachments.map((item) => item.name)).toEqual(['说明.txt'])
    })

    test('中文文件名往返一致（下载头里带 RFC 5987 编码）', async () => {
      const todo = await createTodo({ title: 'x' })
      const attachment = (await (await upload(todo.id, '季度报告.pdf', 'pdf-data', 'application/pdf')).json()) as {
        id: string
      }

      const response = await json(`/api/attachments/${attachment.id}/content`)
      const disposition = response.headers.get('content-disposition') ?? ''

      expect(response.status).toBe(200)
      expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent('季度报告.pdf')}`)
      expect(await response.text()).toBe('pdf-data')
    })

    test('下载返回字节、类型与 inline（图片直接预览）', async () => {
      const todo = await createTodo({ title: 'x' })
      const attachment = (await (
        await upload(todo.id, 'pic.png', new Uint8Array([137, 80, 78, 71]), 'image/png')
      ).json()) as { id: string }

      const response = await json(`/api/attachments/${attachment.id}/content`)

      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('content-disposition')?.startsWith('inline')).toBe(true)
      expect(response.headers.get('content-length')).toBe('4')
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80, 78, 71])
    })

    test('缺少 file 字段返回 400', async () => {
      const todo = await createTodo({ title: 'x' })
      const form = new FormData()
      form.append('other', 'x')

      const response = await json(`/api/todos/${todo.id}/attachments`, { method: 'POST', body: form })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'validation_error', message: '缺少文件字段 file' })
    })

    test('非 multipart 请求返回 400', async () => {
      const todo = await createTodo({ title: 'x' })

      const response = await json(`/api/todos/${todo.id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        error: 'validation_error',
        message: '请求必须是 multipart/form-data',
      })
    })

    test('给不存在的待办上传返回 404', async () => {
      const response = await upload('00000000-0000-4000-8000-000000000000', 'a.txt', 'x')

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found', message: '待办不存在' })
    })

    test('下载不存在的附件返回 404', async () => {
      const response = await json('/api/attachments/00000000-0000-4000-8000-000000000000/content')

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found', message: '附件不存在' })
    })

    test('删除附件返回 204，再下载是 404', async () => {
      const todo = await createTodo({ title: 'x' })
      const attachment = (await (await upload(todo.id, 'a.txt', 'x')).json()) as { id: string }

      const response = await json(`/api/attachments/${attachment.id}`, { method: 'DELETE' })

      expect(response.status).toBe(204)
      expect((await json(`/api/attachments/${attachment.id}/content`)).status).toBe(404)
      const reread = (await (await json(`/api/todos/${todo.id}`)).json()) as Todo
      expect(reread.attachments).toEqual([])
    })

    test('删除不存在的附件返回 404', async () => {
      const response = await json('/api/attachments/00000000-0000-4000-8000-000000000000', {
        method: 'DELETE',
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found', message: '附件不存在' })
    })

    test('超过大小上限返回 413（上限可配置，测试用 4 字节）', async () => {
      // 用超小上限触发真实分支，不需要构造 200MB 的请求
      const smallLimitApp = createApp({
        todoStore: createTodoStore(() => context.sql, createMemoryAttachmentStore()),
        maxAttachmentBytes: 4,
      })
      const todo = (await (
        await json('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'x' }),
        })
      ).json()) as Todo

      const form = new FormData()
      form.append('file', new File(['12345'], 'big.txt', { type: 'text/plain' }))
      const response = await smallLimitApp.request(`/api/todos/${todo.id}/attachments`, {
        method: 'POST',
        body: form,
      })

      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({ error: 'file_too_large' })
    })
  })

  describe('404 与错误结构', () => {
    test('未知的 /api 路由返回 not_found', async () => {
      const response = await json('/api/whatever')

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'not_found',
        message: '接口不存在：/api/whatever',
      })
    })
  })
})
