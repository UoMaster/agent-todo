// 进程内命令测试：runCommand / runMain + console spy + 注入 fetch（不依赖真实 server）。
// 子进程真实入口的验证在 cli.e2e.test.ts。

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderUsage, runCommand, runMain } from 'citty'
import { afterEach, expect, test, vi } from 'vitest'
import {
  addDays,
  todayKey,
  type Attachment,
  type SubtaskInput,
  type TagSummary,
  type Todo,
  type TodoUpdate,
} from '@agent-todo/shared'
import { resetFetchImpl, setFetchImpl } from './client.ts'
import { resetParentGlobalArgs } from './globals.ts'
import { main } from './main.ts'

const TODO_ID = '11111111-1111-4111-8111-111111111111'
const SUBTASK_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '22222222-2222-4222-8222-222222222222'

interface StubCall {
  url: string
  method: string
  body: RequestInit['body']
}

/** 造一个 JSON Response（符合 server 的响应结构） */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: TODO_ID,
    title: '完成需求',
    description: '',
    done: false,
    priority: 'none',
    tags: [],
    startDate: null,
    endDate: null,
    subtasks: [],
    attachments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: ATTACHMENT_ID,
    todoId: TODO_ID,
    name: '报告.md',
    mimeType: 'text/markdown',
    size: 12,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** 注入 fetch stub；handler 按请求返回响应，返回的数组记录每次调用 */
function stubFetch(handler: (call: StubCall) => Response | Promise<Response>): StubCall[] {
  const calls: StubCall[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: StubCall = { url: String(input), method: init?.method ?? 'GET', body: init?.body }
    calls.push(call)

    return handler(call)
  }) as typeof fetch

  setFetchImpl(impl)
  return calls
}

function firstCall(calls: StubCall[]): StubCall {
  const call = calls[0]
  if (!call) throw new Error('没有发起任何请求')

  return call
}

function putBody(calls: StubCall[]): TodoUpdate {
  const call = calls.find((item) => item.method === 'PUT')
  if (!call) throw new Error('没有发起 PUT 请求')

  return JSON.parse(String(call.body)) as TodoUpdate
}

function captureConsole() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  }
}

/** 把 console spy 的所有调用拼成完整输出文本 */
function outputOf(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((args) => args.join(' ')).join('\n')
}

function invoke(rawArgs: string[]) {
  return runCommand(main, { rawArgs })
}

/** 建临时目录跑用例，结束后清理 */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-todo-cli-test-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  resetFetchImpl()
  resetParentGlobalArgs()
  process.exitCode = 0
})

// ---------------------------------------------------------------- 基础

test('不带子命令时输出用法说明', async () => {
  const { log } = captureConsole()

  await invoke([])

  expect(outputOf(log)).toContain('USAGE')
})

test('--version 输出版本号（runMain 入口）', async () => {
  const { log } = captureConsole()

  await runMain(main, { rawArgs: ['--version'] })

  expect(outputOf(log)).toContain('0.1.0')
})

test('帮助信息包含全部子命令', async () => {
  const usage = await renderUsage(main)

  for (const name of [
    'list',
    'show',
    'add',
    'update',
    'rm',
    'tags',
    'attach-upload',
    'attach-download',
    'attach-rm',
  ]) {
    expect(usage).toContain(name)
  }
})

test('未知子命令报错', async () => {
  await expect(runCommand(main, { rawArgs: ['nope'] })).rejects.toThrow('Unknown command')
})

test('全局参数写在子命令之前也生效', async () => {
  const calls = stubFetch(() => jsonResponse([]))
  const { log } = captureConsole()

  await invoke(['--server', 'http://example.test:9999', '--json', 'list'])

  expect(firstCall(calls).url).toBe('http://example.test:9999/api/todos')
  expect(JSON.parse(outputOf(log))).toEqual([])
})

// ---------------------------------------------------------------- list

test('list --json 输出待办数组', async () => {
  stubFetch(() => jsonResponse([makeTodo({ title: '完成需求' })]))
  const { log } = captureConsole()

  await invoke(['list', '--json'])

  const parsed = JSON.parse(outputOf(log)) as Todo[]
  expect(parsed).toHaveLength(1)
  expect(parsed[0]?.title).toBe('完成需求')
})

test('list 人类可读输出包含标记 / 优先级 / 日期 / 标签 / 逾期信息', async () => {
  const today = todayKey()
  stubFetch(() =>
    jsonResponse([
      makeTodo({
        title: '完成需求',
        priority: 'high',
        tags: ['产品'],
        startDate: addDays(today, -3),
      }),
    ]),
  )
  const { log } = captureConsole()

  await invoke(['list'])

  const text = outputOf(log)
  expect(text).toContain('共 1 条待办')
  expect(text).toContain('[ ] [高] 完成需求')
  expect(text).toContain('已逾期 3 天')
  expect(text).toContain('#产品')
})

test('list 空结果提示暂无待办', async () => {
  stubFetch(() => jsonResponse([]))
  const { log } = captureConsole()

  await invoke(['list'])

  expect(outputOf(log)).toContain('暂无待办')
})

test('list 把筛选条件传给 server（状态 / 标签 / 关键字）', async () => {
  const calls = stubFetch(() => jsonResponse([]))

  await invoke(['list', '--status', 'done', '--tag', '产品', '--query', '报告'])

  const url = new URL(firstCall(calls).url)
  expect(url.pathname).toBe('/api/todos')
  expect(url.searchParams.get('status')).toBe('done')
  expect(url.searchParams.get('tag')).toBe('产品')
  expect(url.searchParams.get('q')).toBe('报告')
})

test('list --status 非法时报参数错误', async () => {
  stubFetch(() => jsonResponse([]))
  const { error } = captureConsole()

  await invoke(['list', '--status', 'nope'])

  expect(outputOf(error)).toContain('参数错误')
  expect(process.exitCode).toBe(1)
})

test('list 连不上 server 时输出可读错误并设置退出码', async () => {
  stubFetch(() => {
    throw new Error('connect ECONNREFUSED')
  })
  const { log, error } = captureConsole()

  await invoke(['list'])

  expect(log).not.toHaveBeenCalled()
  expect(outputOf(error)).toContain('无法连接 server')
  expect(process.exitCode).toBe(1)
})

// ---------------------------------------------------------------- show

test('show --json 输出完整待办', async () => {
  const todo = makeTodo({
    description: '详细描述',
    subtasks: [{ id: SUBTASK_ID, todoId: TODO_ID, title: '写代码', done: true, position: 0 }],
    attachments: [makeAttachment()],
  })
  stubFetch(() => jsonResponse(todo))
  const { log } = captureConsole()

  await invoke(['show', TODO_ID, '--json'])

  expect(JSON.parse(outputOf(log))).toEqual(todo)
})

test('show 人类可读输出包含详情字段', async () => {
  const todo = makeTodo({
    title: '完成需求',
    description: '详细描述',
    priority: 'high',
    tags: ['产品'],
    startDate: '2026-10-14',
    endDate: '2026-10-16',
    subtasks: [{ id: SUBTASK_ID, todoId: TODO_ID, title: '写代码', done: true, position: 0 }],
    attachments: [makeAttachment()],
  })
  stubFetch(() => jsonResponse(todo))
  const { log } = captureConsole()

  await invoke(['show', TODO_ID])

  const text = outputOf(log)
  expect(text).toContain('标题：完成需求')
  expect(text).toContain(`ID：${TODO_ID}`)
  expect(text).toContain('状态：未完成')
  expect(text).toContain('优先级：高')
  expect(text).toContain('日期：2026年10月14日 → 2026年10月16日（3 天）')
  expect(text).toContain('标签：#产品')
  expect(text).toContain('[x] 写代码')
  expect(text).toContain('报告.md')
  expect(text).toContain('详细描述')
})

test('show 缺少 id 时报参数错误', async () => {
  const { error } = captureConsole()

  await invoke(['show'])

  expect(outputOf(error)).toContain('参数错误')
  expect(process.exitCode).toBe(1)
})

test('show 待办不存在时报服务端错误', async () => {
  stubFetch(() => jsonResponse({ error: 'not_found', message: '待办不存在' }, 404))
  const { error } = captureConsole()

  await invoke(['show', TODO_ID])

  expect(outputOf(error)).toContain('请求失败（HTTP 404）：待办不存在')
  expect(process.exitCode).toBe(1)
})

// ---------------------------------------------------------------- add

test('add 组装请求体并输出新建待办', async () => {
  const calls = stubFetch(() => jsonResponse(makeTodo({ title: '完成需求' }), 201))
  const { log } = captureConsole()
  const today = todayKey()

  await invoke([
    'add',
    '--title',
    '完成需求',
    '--description',
    '详细描述',
    '--priority',
    'high',
    '--tag',
    '产品',
    '--tag',
    '研发',
    '--start',
    today,
    '--end',
    addDays(today, 2),
    '--subtask',
    '写代码',
    '--subtask',
    '测试',
  ])

  const call = firstCall(calls)
  expect(call.method).toBe('POST')
  expect(call.url).toBe('http://localhost:3001/api/todos')
  expect(JSON.parse(String(call.body))).toEqual({
    title: '完成需求',
    description: '详细描述',
    priority: 'high',
    tags: ['产品', '研发'],
    startDate: today,
    endDate: addDays(today, 2),
    subtasks: ['写代码', '测试'],
  })
  expect(outputOf(log)).toContain('已创建待办')
})

test('add --json 输出新建待办 JSON', async () => {
  const todo = makeTodo({ title: '完成需求' })
  stubFetch(() => jsonResponse(todo, 201))
  const { log } = captureConsole()

  await invoke(['add', '--title', '完成需求', '--json'])

  expect(JSON.parse(outputOf(log))).toEqual(todo)
})

test('add 缺少标题时报参数错误', async () => {
  const { error } = captureConsole()

  await invoke(['add', '--json'])

  expect(outputOf(error)).toContain('缺少必填参数 --title')
  expect(process.exitCode).toBe(1)
})

const invalidAddCases: Array<[string, string[]]> = [
  ['优先级非法', ['add', '--title', 'x', '--priority', 'urgent']],
  ['日期不存在', ['add', '--title', 'x', '--start', '2026-02-30']],
  ['日期格式非法', ['add', '--title', 'x', '--start', '2026/10/14']],
  ['结束日期早于开始', ['add', '--title', 'x', '--start', '2026-10-10', '--end', '2026-10-09']],
  ['只有结束日期', ['add', '--title', 'x', '--end', '2026-10-10']],
]

for (const [name, args] of invalidAddCases) {
  test(`add 参数错误：${name}`, async () => {
    stubFetch(() => jsonResponse(makeTodo()))
    const { error } = captureConsole()

    await invoke(args)

    expect(outputOf(error)).toContain('参数错误')
    expect(process.exitCode).toBe(1)
  })
}

// ---------------------------------------------------------------- update

const existingTodo = makeTodo({
  id: TODO_ID,
  title: '旧标题',
  description: '旧描述',
  priority: 'low',
  tags: ['旧标签'],
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  subtasks: [{ id: SUBTASK_ID, todoId: TODO_ID, title: '旧子任务', done: true, position: 0 }],
})

/** update 的两步请求：GET 返回现有待办，PUT 返回更新结果 */
function stubUpdate(existing: Todo = existingTodo) {
  return stubFetch((call) => (call.method === 'PUT' ? jsonResponse(existing) : jsonResponse(existing)))
}

test('update 先 GET 再合并：未指定字段保持原值，子任务保留 id', async () => {
  const calls = stubUpdate()
  const { log } = captureConsole()

  await invoke(['update', TODO_ID, '--title', '新标题', '--done', 'true'])

  expect(firstCall(calls).method).toBe('GET')
  expect(putBody(calls)).toEqual({
    title: '新标题',
    description: '旧描述',
    done: true,
    priority: 'low',
    tags: ['旧标签'],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    subtasks: [{ id: SUBTASK_ID, title: '旧子任务', done: true }],
  })
  expect(outputOf(log)).toContain('已更新待办')
})

test('update --tag 替换整个标签集合', async () => {
  const calls = stubUpdate()

  await invoke(['update', TODO_ID, '--tag', '新标签', '--tag', '另一个'])

  expect(putBody(calls).tags).toEqual(['新标签', '另一个'])
})

test('update --add-tag 追加标签（去重、保持顺序）', async () => {
  const calls = stubUpdate()

  await invoke(['update', TODO_ID, '--add-tag', '旧标签', '--add-tag', '新标签'])

  expect(putBody(calls).tags).toEqual(['旧标签', '新标签'])
})

test('update --start 单独修改开始日期，结束日期保持', async () => {
  const calls = stubUpdate()

  await invoke(['update', TODO_ID, '--start', '2026-10-02'])

  const body = putBody(calls)
  expect(body.startDate).toBe('2026-10-02')
  expect(body.endDate).toBe('2026-10-03')
})

test('update --no-range 清空结束日期（变回单日）', async () => {
  const calls = stubUpdate()

  await invoke(['update', TODO_ID, '--no-range'])

  const body = putBody(calls)
  expect(body.startDate).toBe('2026-10-01')
  expect(body.endDate).toBeNull()
})

test('update --no-date 清空开始与结束日期', async () => {
  const calls = stubUpdate()

  await invoke(['update', TODO_ID, '--no-date'])

  const body = putBody(calls)
  expect(body.startDate).toBeNull()
  expect(body.endDate).toBeNull()
})

test('update --subtask 替换子任务列表（新建、不带 id）', async () => {
  const calls = stubUpdate()

  await invoke(['update', TODO_ID, '--subtask', '新子任务 A', '--subtask', '新子任务 B'])

  const expected: SubtaskInput[] = [{ title: '新子任务 A' }, { title: '新子任务 B' }]
  expect(putBody(calls).subtasks).toEqual(expected)
})

test('update --json 输出更新后的待办', async () => {
  const updated = makeTodo({ title: '新标题', done: true })
  stubUpdate(updated)
  const { log } = captureConsole()

  await invoke(['update', TODO_ID, '--title', '新标题', '--json'])

  expect(JSON.parse(outputOf(log))).toEqual(updated)
})

test('update 待办不存在时报服务端错误', async () => {
  stubFetch(() => jsonResponse({ error: 'not_found', message: '待办不存在' }, 404))
  const { error } = captureConsole()

  await invoke(['update', TODO_ID, '--title', '新标题'])

  expect(outputOf(error)).toContain('待办不存在')
  expect(process.exitCode).toBe(1)
})

test('update --end 在原本没有开始日期时报参数错误', async () => {
  stubUpdate(makeTodo({ startDate: null, endDate: null }))
  const { error } = captureConsole()

  await invoke(['update', TODO_ID, '--end', '2026-10-10'])

  expect(outputOf(error)).toContain('参数错误')
  expect(process.exitCode).toBe(1)
})

const invalidUpdateCases: Array<[string, string[]]> = [
  ['--tag 与 --add-tag 同时使用', ['update', TODO_ID, '--tag', 'a', '--add-tag', 'b']],
  ['--no-date 与 --start 同时使用', ['update', TODO_ID, '--no-date', '--start', '2026-10-01']],
  ['--no-range 与 --end 同时使用', ['update', TODO_ID, '--no-range', '--end', '2026-10-01']],
  ['--no-date 与 --no-range 同时使用', ['update', TODO_ID, '--no-date', '--no-range']],
  ['--done 取值非法', ['update', TODO_ID, '--done', 'maybe']],
  ['--priority 非法', ['update', TODO_ID, '--priority', 'urgent']],
  ['--start 非法', ['update', TODO_ID, '--start', '2026-13-01']],
  ['--end 早于 --start', ['update', TODO_ID, '--start', '2026-10-10', '--end', '2026-10-09']],
]

for (const [name, args] of invalidUpdateCases) {
  test(`update 参数错误：${name}`, async () => {
    stubUpdate()
    const { error } = captureConsole()

    await invoke(args)

    expect(outputOf(error)).toContain('参数错误')
    expect(process.exitCode).toBe(1)
  })
}

// ---------------------------------------------------------------- rm

test('rm 删除待办并提示（先取标题再删除）', async () => {
  const calls = stubFetch((call) =>
    call.method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse(existingTodo),
  )
  const { log } = captureConsole()

  await invoke(['rm', TODO_ID])

  expect(calls.map((call) => call.method)).toEqual(['GET', 'DELETE'])
  expect(outputOf(log)).toContain(`已删除待办：旧标题（${TODO_ID}）`)
})

test('rm --json 输出删除结果', async () => {
  stubFetch((call) =>
    call.method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse(existingTodo),
  )
  const { log } = captureConsole()

  await invoke(['rm', TODO_ID, '--json'])

  expect(JSON.parse(outputOf(log))).toEqual({ id: TODO_ID, deleted: true })
})

test('rm 缺少 id 时报参数错误', async () => {
  const { error } = captureConsole()

  await invoke(['rm'])

  expect(outputOf(error)).toContain('参数错误')
  expect(process.exitCode).toBe(1)
})

test('rm 待办不存在时报服务端错误', async () => {
  stubFetch(() => jsonResponse({ error: 'not_found', message: '待办不存在' }, 404))
  const { error } = captureConsole()

  await invoke(['rm', TODO_ID])

  expect(outputOf(error)).toContain('待办不存在')
  expect(process.exitCode).toBe(1)
})

// ---------------------------------------------------------------- tags

test('tags 输出标签与计数', async () => {
  const summaries: TagSummary[] = [
    { tag: '产品', count: 3 },
    { tag: '研发', count: 1 },
  ]
  stubFetch(() => jsonResponse(summaries))
  const { log } = captureConsole()

  await invoke(['tags'])

  expect(outputOf(log)).toContain('#产品  3')
  expect(outputOf(log)).toContain('#研发  1')
})

test('tags --json 输出标签数组', async () => {
  const summaries: TagSummary[] = [{ tag: '产品', count: 3 }]
  stubFetch(() => jsonResponse(summaries))
  const { log } = captureConsole()

  await invoke(['tags', '--json'])

  expect(JSON.parse(outputOf(log))).toEqual(summaries)
})

test('tags 空结果提示暂无标签', async () => {
  stubFetch(() => jsonResponse([]))
  const { log } = captureConsole()

  await invoke(['tags'])

  expect(outputOf(log)).toContain('暂无标签')
})

// ---------------------------------------------------------------- attach-upload

test('attach-upload 读取本地文件并按 multipart 上传', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, '报告.md')
    await writeFile(filePath, '# 报告内容')

    const calls = stubFetch(() => jsonResponse(makeAttachment(), 201))
    const { log } = captureConsole()

    await invoke(['attach-upload', TODO_ID, filePath])

    const call = firstCall(calls)
    expect(call.method).toBe('POST')
    expect(call.url).toBe(`http://localhost:3001/api/todos/${TODO_ID}/attachments`)
    expect(call.body).toBeInstanceOf(FormData)

    const file = (call.body as FormData).get('file')
    expect(file).toBeInstanceOf(File)
    expect((file as File).name).toBe('报告.md')
    expect((file as File).type).toBe('text/markdown')
    expect(await (file as File).text()).toBe('# 报告内容')

    expect(outputOf(log)).toContain(`已上传附件：报告.md（12 B），附件 ID：${ATTACHMENT_ID}`)
  })
})

test('attach-upload --json 输出附件 JSON', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, '报告.md')
    await writeFile(filePath, '# 报告内容')
    const attachment = makeAttachment()
    stubFetch(() => jsonResponse(attachment, 201))
    const { log } = captureConsole()

    await invoke(['attach-upload', TODO_ID, filePath, '--json'])

    expect(JSON.parse(outputOf(log))).toEqual(attachment)
  })
})

test('attach-upload 文件不存在时报可读错误', async () => {
  await withTempDir(async (dir) => {
    const { error } = captureConsole()

    await invoke(['attach-upload', TODO_ID, join(dir, '不存在.md')])

    expect(outputOf(error)).toContain('无法读取文件')
    expect(process.exitCode).toBe(1)
  })
})

test('attach-upload 缺少参数时报参数错误', async () => {
  const { error } = captureConsole()

  await invoke(['attach-upload'])

  expect(outputOf(error)).toContain('参数错误')
  expect(process.exitCode).toBe(1)
})

test('attach-upload 待办不存在时报服务端错误', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, '报告.md')
    await writeFile(filePath, '# 报告内容')
    stubFetch(() => jsonResponse({ error: 'not_found', message: '待办不存在' }, 404))
    const { error } = captureConsole()

    await invoke(['attach-upload', TODO_ID, filePath])

    expect(outputOf(error)).toContain('待办不存在')
    expect(process.exitCode).toBe(1)
  })
})

// ---------------------------------------------------------------- attach-download

function binaryResponse(data: string, name: string): Response {
  return new Response(new TextEncoder().encode(data), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown',
      // 与服务端一致：filename 用 ASCII 兜底，中文名走 RFC 5987 的 filename*
      'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  })
}

test('attach-download 下载到指定目录并打印落盘路径', async () => {
  await withTempDir(async (dir) => {
    stubFetch(() => binaryResponse('# 附件内容', '报告.md'))
    const { log } = captureConsole()

    await invoke(['attach-download', ATTACHMENT_ID, '--output', dir])

    const target = join(dir, '报告.md')
    expect(outputOf(log)).toContain(`已下载附件：报告.md → ${target}`)
    expect(await readFile(target, 'utf8')).toBe('# 附件内容')
  })
})

test('attach-download --output 是文件路径时按路径写入', async () => {
  await withTempDir(async (dir) => {
    stubFetch(() => binaryResponse('内容', '报告.md'))
    const { log } = captureConsole()
    const target = join(dir, '自定义.bin')

    await invoke(['attach-download', ATTACHMENT_ID, '--output', target])

    expect(outputOf(log)).toContain(target)
    expect(await readFile(target, 'utf8')).toBe('内容')
  })
})

test('attach-download --json 输出落盘信息', async () => {
  await withTempDir(async (dir) => {
    stubFetch(() => binaryResponse('# 附件内容', '报告.md'))
    const { log } = captureConsole()

    await invoke(['attach-download', ATTACHMENT_ID, '--output', dir, '--json'])

    expect(JSON.parse(outputOf(log))).toEqual({
      path: join(dir, '报告.md'),
      name: '报告.md',
      mimeType: 'text/markdown',
      size: 14,
    })
  })
})

test('attach-download 附件不存在时报服务端错误', async () => {
  stubFetch(() => jsonResponse({ error: 'not_found', message: '附件不存在' }, 404))
  const { error } = captureConsole()

  await invoke(['attach-download', ATTACHMENT_ID])

  expect(outputOf(error)).toContain('附件不存在')
  expect(process.exitCode).toBe(1)
})

test('attach-download 缺少 id 时报参数错误', async () => {
  const { error } = captureConsole()

  await invoke(['attach-download'])

  expect(outputOf(error)).toContain('参数错误')
  expect(process.exitCode).toBe(1)
})

// ---------------------------------------------------------------- attach-rm

test('attach-rm 删除附件并提示', async () => {
  const calls = stubFetch(() => new Response(null, { status: 204 }))
  const { log } = captureConsole()

  await invoke(['attach-rm', ATTACHMENT_ID])

  expect(firstCall(calls).method).toBe('DELETE')
  expect(outputOf(log)).toContain(`已删除附件：${ATTACHMENT_ID}`)
})

test('attach-rm --json 输出删除结果', async () => {
  stubFetch(() => new Response(null, { status: 204 }))
  const { log } = captureConsole()

  await invoke(['attach-rm', ATTACHMENT_ID, '--json'])

  expect(JSON.parse(outputOf(log))).toEqual({ id: ATTACHMENT_ID, deleted: true })
})

test('attach-rm 附件不存在时报服务端错误', async () => {
  stubFetch(() => jsonResponse({ error: 'not_found', message: '附件不存在' }, 404))
  const { error } = captureConsole()

  await invoke(['attach-rm', ATTACHMENT_ID])

  expect(outputOf(error)).toContain('附件不存在')
  expect(process.exitCode).toBe(1)
})
