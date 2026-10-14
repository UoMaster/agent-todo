// utils 纯函数单测：参数校验、人类可读渲染、下载路径解析、错误出口。

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiError, addDays, todayKey, type Todo } from '@agent-todo/shared'
import {
  CliError,
  DEFAULT_SERVER_URL,
  collectRepeatedArg,
  dedupe,
  formatAttachmentLine,
  formatTagList,
  formatTodoDetail,
  formatTodoLine,
  guessMimeType,
  parseDoneArg,
  parsePriorityArg,
  parseStatusFilter,
  printJson,
  reportError,
  requireDateKey,
  requirePositional,
  requireTitle,
  resolveDownloadPath,
  resolveServerUrl,
  runSafely,
  usageError,
} from './utils.ts'

const TODO_ID = '11111111-1111-4111-8111-111111111111'

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

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-todo-cli-utils-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = 0
})

// ---------------------------------------------------------------- server 地址

test('resolveServerUrl：--server 优先，其次环境变量，最后默认值', () => {
  vi.stubEnv('AGENT_TODO_SERVER', 'http://env.test:1234')
  expect(resolveServerUrl(' http://arg.test:9999 ')).toBe('http://arg.test:9999')
  expect(resolveServerUrl()).toBe('http://env.test:1234')
})

test('resolveServerUrl：没有参数与环境变量时用默认值', () => {
  vi.stubEnv('AGENT_TODO_SERVER', '')
  expect(resolveServerUrl()).toBe(DEFAULT_SERVER_URL)
  expect(resolveServerUrl('   ')).toBe(DEFAULT_SERVER_URL)
})

// ---------------------------------------------------------------- 参数解析

test('collectRepeatedArg：收集重复参数（空格与 = 两种写法）', () => {
  expect(collectRepeatedArg(['--tag', 'a', '--tag', 'b'], 'tag')).toEqual(['a', 'b'])
  expect(collectRepeatedArg(['--tag=a', '--tag=b'], 'tag')).toEqual(['a', 'b'])
})

test('collectRepeatedArg：忽略其它参数，遇到 -- 停止', () => {
  expect(collectRepeatedArg(['--json', '--tag', 'a', '--other', 'x'], 'tag')).toEqual(['a'])
  expect(collectRepeatedArg(['--tag', 'a', '--', '--tag', 'b'], 'tag')).toEqual(['a'])
  expect(collectRepeatedArg([], 'tag')).toEqual([])
})

test('collectRepeatedArg：值缺失或为空时报参数错误', () => {
  expect(() => collectRepeatedArg(['--tag'], 'tag')).toThrow('参数错误')
  expect(() => collectRepeatedArg(['--tag', '--json'], 'tag')).toThrow('缺少参数值')
  expect(() => collectRepeatedArg(['--tag='], 'tag')).toThrow('缺少参数值')
  expect(() => collectRepeatedArg(['--tag', '  '], 'tag')).toThrow('缺少参数值')
})

test('dedupe：去重且保持原顺序', () => {
  expect(dedupe(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
})

test('requireTitle：去空白；缺失或空白时报参数错误', () => {
  expect(requireTitle('  完成需求  ')).toBe('完成需求')
  expect(() => requireTitle(undefined)).toThrow('缺少必填参数 --title')
  expect(() => requireTitle('   ')).toThrow('缺少必填参数 --title')
})

test('requirePositional：去空白；缺失时报参数错误并带上名称', () => {
  expect(requirePositional(' abc ', '待办 ID')).toBe('abc')
  expect(() => requirePositional(undefined, '待办 ID')).toThrow('缺少参数：待办 ID')
  expect(() => requirePositional('  ', '待办 ID')).toThrow('缺少参数：待办 ID')
})

test('parseStatusFilter：合法值透传，非法值报参数错误', () => {
  expect(parseStatusFilter(undefined)).toBeUndefined()
  expect(parseStatusFilter('done')).toBe('done')
  expect(parseStatusFilter('upcoming')).toBe('upcoming')
  expect(() => parseStatusFilter('nope')).toThrow('参数错误')
})

test('parsePriorityArg：合法值透传，非法值报参数错误', () => {
  expect(parsePriorityArg(undefined)).toBeUndefined()
  expect(parsePriorityArg('high')).toBe('high')
  expect(() => parsePriorityArg('urgent')).toThrow('参数错误')
})

test('parseDoneArg：只接受 true / false', () => {
  expect(parseDoneArg(undefined)).toBeUndefined()
  expect(parseDoneArg('true')).toBe(true)
  expect(parseDoneArg('false')).toBe(false)
  expect(() => parseDoneArg('yes')).toThrow('参数错误')
})

test('requireDateKey：合法日期透传，非法日期报参数错误', () => {
  expect(requireDateKey('2026-10-14', '--start')).toBe('2026-10-14')
  expect(() => requireDateKey('2026-02-30', '--start')).toThrow('不是合法日期')
  expect(() => requireDateKey('2026/10/14', '--end')).toThrow('不是合法日期')
})

test('usageError：带「参数错误：」前缀且是 CliError', () => {
  const error = usageError('缺少参数')
  expect(error).toBeInstanceOf(CliError)
  expect(error.message).toBe('参数错误：缺少参数')
})

// ---------------------------------------------------------------- MIME 猜测

test('guessMimeType：按扩展名猜测，大小写不敏感', () => {
  expect(guessMimeType('a.png')).toBe('image/png')
  expect(guessMimeType('A.PNG')).toBe('image/png')
  expect(guessMimeType('报告.md')).toBe('text/markdown')
  expect(guessMimeType('data.json')).toBe('application/json')
})

test('guessMimeType：未知扩展名 / 无扩展名回退二进制流', () => {
  expect(guessMimeType('a.unknownext')).toBe('application/octet-stream')
  expect(guessMimeType('README')).toBe('application/octet-stream')
})

// ---------------------------------------------------------------- 人类可读渲染

test('formatTodoLine：完成标记 / 优先级 / 日期范围 / 标签', () => {
  const todo = makeTodo({
    title: '完成需求',
    done: true,
    priority: 'high',
    tags: ['产品', '研发'],
    startDate: '2026-10-14',
    endDate: '2026-10-16',
  })

  expect(formatTodoLine(todo, todayKey())).toBe(
    '[x] [高] 完成需求 2026年10月14日 → 2026年10月16日（3 天） #产品 #研发',
  )
})

test('formatTodoLine：逾期信息（未完成且截止日期早于今天）', () => {
  const today = todayKey()
  const todo = makeTodo({ title: '补测试', startDate: addDays(today, -3) })

  const line = formatTodoLine(todo, today)
  expect(line).toContain('[ ] 补测试')
  expect(line).toContain('已逾期 3 天')
})

test('formatTodoLine：无优先级 / 无日期 / 无标签时保持简洁', () => {
  expect(formatTodoLine(makeTodo(), todayKey())).toBe('[ ] 完成需求')
})

test('formatTodoDetail：完整字段（含子任务 / 附件 / 描述）', () => {
  const todo = makeTodo({
    title: '完成需求',
    description: '详细描述',
    priority: 'high',
    tags: ['产品'],
    startDate: '2026-10-14',
    endDate: '2026-10-16',
    subtasks: [
      { id: 's1', todoId: TODO_ID, title: '写代码', done: true, position: 0 },
      { id: 's2', todoId: TODO_ID, title: '测试', done: false, position: 1 },
    ],
    attachments: [
      {
        id: 'a1',
        todoId: TODO_ID,
        name: '报告.md',
        mimeType: 'text/markdown',
        size: 12,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  })

  const text = formatTodoDetail(todo, todayKey())
  expect(text).toContain(`标题：完成需求`)
  expect(text).toContain(`ID：${TODO_ID}`)
  expect(text).toContain('状态：未完成')
  expect(text).toContain('优先级：高')
  expect(text).toContain('日期：2026年10月14日 → 2026年10月16日（3 天）')
  expect(text).toContain('标签：#产品')
  expect(text).toContain('  [x] 写代码')
  expect(text).toContain('  [ ] 测试')
  expect(text).toContain('a1  报告.md（12 B）')
  expect(text).toContain('描述：\n详细描述')
})

test('formatTodoDetail：空字段展示兜底文案', () => {
  const todo = makeTodo({ title: '   ', done: true })

  const text = formatTodoDetail(todo, todayKey())
  expect(text).toContain('标题：未命名待办')
  expect(text).toContain('状态：已完成')
  expect(text).toContain('优先级：无')
  expect(text).toContain('日期：未安排')
  expect(text).toContain('标签：无')
  expect(text).toContain('子任务：无')
  expect(text).toContain('附件：无')
  expect(text).toContain('描述：（无）')
})

test('formatTodoDetail：逾期时展示逾期天数', () => {
  const today = todayKey()
  const todo = makeTodo({ startDate: addDays(today, -2) })

  expect(formatTodoDetail(todo, today)).toContain('逾期：已逾期 2 天')
})

test('formatAttachmentLine：id + 名称 + 大小', () => {
  const line = formatAttachmentLine({
    id: 'a1',
    todoId: TODO_ID,
    name: '报告.md',
    mimeType: 'text/markdown',
    size: 2048,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  expect(line).toBe('a1  报告.md（2 KB）')
})

test('formatTagList：空列表提示；有数据时逐行展示', () => {
  expect(formatTagList([])).toBe('暂无标签')
  expect(formatTagList([
    { tag: '产品', count: 3 },
    { tag: '研发', count: 1 },
  ])).toBe('#产品  3\n#研发  1')
})

// ---------------------------------------------------------------- 下载路径

test('resolveDownloadPath：未指定 --output 时落到当前目录', async () => {
  const target = await resolveDownloadPath(undefined, '报告.md', 'a1')

  expect(target).toBe(resolve(process.cwd(), '报告.md'))
})

test('resolveDownloadPath：--output 是已存在目录时拼上附件名', async () => {
  await withTempDir(async (dir) => {
    const target = await resolveDownloadPath(dir, '报告.md', 'a1')

    expect(target).toBe(join(dir, '报告.md'))
  })
})

test('resolveDownloadPath：--output 是文件路径时原样使用', async () => {
  await withTempDir(async (dir) => {
    const target = await resolveDownloadPath(join(dir, 'out.bin'), '报告.md', 'a1')

    expect(target).toBe(join(dir, 'out.bin'))
  })
})

test('resolveDownloadPath：附件名只取 basename，防目录穿越', async () => {
  await withTempDir(async (dir) => {
    const target = await resolveDownloadPath(dir, '../../etc/passwd', 'a1')

    expect(target).toBe(join(dir, 'passwd'))
  })
})

test('resolveDownloadPath：附件名非法（. / .. / 空）时回退 attachment-<id>', async () => {
  await withTempDir(async (dir) => {
    expect(await resolveDownloadPath(dir, '..', 'a1')).toBe(join(dir, 'attachment-a1'))
    expect(await resolveDownloadPath(dir, '', 'a1')).toBe(join(dir, 'attachment-a1'))
  })
})

// ---------------------------------------------------------------- 输出与错误

test('printJson：以 2 空格缩进写到 stdout', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})

  printJson({ a: 1, b: [2] })

  expect(log).toHaveBeenCalledWith(JSON.stringify({ a: 1, b: [2] }, null, 2))
})

test('reportError：网络层错误直接输出 shared 的可读信息', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  reportError(new ApiError(0, 'network_error', '无法连接 server（http://localhost:3001）：boom'))

  expect(error).toHaveBeenCalledWith('无法连接 server（http://localhost:3001）：boom')
  expect(process.exitCode).toBe(1)
})

test('reportError：HTTP 错误带上状态码', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  reportError(new ApiError(404, 'not_found', '待办不存在'))

  expect(error).toHaveBeenCalledWith('请求失败（HTTP 404）：待办不存在')
  expect(process.exitCode).toBe(1)
})

test('reportError：CliError 直接输出；未知错误兜底「执行失败」', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  reportError(new CliError('参数错误：缺少参数'))
  expect(error).toHaveBeenCalledWith('参数错误：缺少参数')

  reportError(new Error('boom'))
  expect(error).toHaveBeenCalledWith('执行失败：boom')

  reportError('字符串错误')
  expect(error).toHaveBeenCalledWith('执行失败：字符串错误')
  expect(process.exitCode).toBe(1)
})

test('runSafely：异常被捕获不抛出，成功路径正常执行', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let called = false

  await runSafely(async () => {
    called = true
  })
  expect(called).toBe(true)

  await expect(
    runSafely(async () => {
      throw new Error('boom')
    }),
  ).resolves.toBeUndefined()
  expect(outputText(error)).toContain('执行失败：boom')
})

/** 把 console spy 的调用拼成文本 */
function outputText(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((args) => args.join(' ')).join('\n')
}
