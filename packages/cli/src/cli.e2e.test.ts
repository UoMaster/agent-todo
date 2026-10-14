// 子进程集成测试：spawn 当前 Node 跑真实 CLI，对着「PGlite + 真迁移 + 内存附件存储」起的真 server。
// 覆盖入口（shebang）、参数、stdout / stderr、退出码与完整业务流。

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createTestContext, type TestContext } from '@agent-todo/server/src/test-utils.ts'
import {
  addDays,
  todayKey,
  type Attachment,
  type TagSummary,
  type Todo,
} from '@agent-todo/shared'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const entry = fileURLToPath(new URL('./index.ts', import.meta.url))

interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

interface CliOptions {
  cwd?: string
  env?: Record<string, string>
}

function runCli(args: string[], options: CliOptions = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        AGENT_TODO_SERVER: baseUrl,
        NO_PROXY: 'localhost,127.0.0.1',
        NO_COLOR: '1',
        ...options.env,
      },
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

function parseJson<T>(result: CliResult): T {
  return JSON.parse(result.stdout) as T
}

/** 找一个当前没人监听的端口（先 listen(0) 拿端口再关掉），用于「连不上 server」用例 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => {
        if (!address || typeof address === 'string') reject(new Error('无法分配端口'))
        else resolve(address.port)
      })
    })
  })
}

let baseUrl = ''

describe('CLI 子进程集成测试（真 server + PGlite）', () => {
  let ctx: TestContext
  let server: ReturnType<typeof serve>
  let workDir = ''

  beforeAll(async () => {
    ctx = await createTestContext()
    server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const instance = serve({ fetch: ctx.app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        baseUrl = `http://127.0.0.1:${info.port}`
        resolve(instance)
      })
    })
    workDir = await mkdtemp(join(tmpdir(), 'agent-todo-cli-e2e-'))
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    await ctx.dispose()
    await rm(workDir, { recursive: true, force: true })
  })

  test('--help 列出全部子命令并正常退出', async () => {
    const { code, stdout } = await runCli(['--help'])

    expect(code).toBe(0)
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
      expect(stdout).toContain(name)
    }
  })

  test('--version 输出版本号并正常退出', async () => {
    const { code, stdout } = await runCli(['--version'])

    expect(code).toBe(0)
    expect(stdout.trim()).toBe('0.1.0')
  })

  test('list --json 空库返回空数组，人类可读输出提示暂无待办', async () => {
    const json = await runCli(['list', '--json'])
    expect(json.code).toBe(0)
    expect(parseJson<Todo[]>(json)).toEqual([])

    const human = await runCli(['list'])
    expect(human.code).toBe(0)
    expect(human.stdout).toContain('暂无待办')
  })

  test('add / show / list / update / tags / rm 全流程', async () => {
    const start = todayKey()
    const end = addDays(start, 2)

    const added = await runCli([
      'add',
      '--json',
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
      start,
      '--end',
      end,
      '--subtask',
      '写代码',
      '--subtask',
      '测试',
    ])
    expect(added.code).toBe(0)
    const todo = parseJson<Todo>(added)
    expect(todo.title).toBe('完成需求')
    expect(todo.priority).toBe('high')
    expect(todo.tags).toEqual(expect.arrayContaining(['产品', '研发']))
    expect(todo.startDate).toBe(start)
    expect(todo.endDate).toBe(end)
    expect(todo.subtasks.map((subtask) => subtask.title)).toEqual(['写代码', '测试'])

    // show（--json 与人类可读）
    expect(parseJson<Todo>(await runCli(['show', todo.id, '--json'])).id).toBe(todo.id)
    const shown = await runCli(['show', todo.id])
    expect(shown.code).toBe(0)
    expect(shown.stdout).toContain('标题：完成需求')
    expect(shown.stdout).toContain('详细描述')
    expect(shown.stdout).toContain('[ ] 写代码')

    // list 能看到新建的待办；按状态筛选
    const listed = await runCli(['list', '--json'])
    expect(parseJson<Todo[]>(listed).map((item) => item.id)).toContain(todo.id)
    expect(parseJson<Todo[]>(await runCli(['list', '--json', '--status', 'done']))).toEqual([])

    // update：改标题 + 完成；标签与子任务必须保留
    const updated = await runCli(['update', todo.id, '--json', '--title', '完成需求 v2', '--done', 'true'])
    expect(updated.code).toBe(0)
    const updatedTodo = parseJson<Todo>(updated)
    expect(updatedTodo.title).toBe('完成需求 v2')
    expect(updatedTodo.done).toBe(true)
    expect(updatedTodo.subtasks.map((subtask) => subtask.title)).toEqual(['写代码', '测试'])
    expect(updatedTodo.tags).toEqual(expect.arrayContaining(['产品', '研发']))

    // update：追加标签 + 清空结束日期
    const updated2 = await runCli(['update', todo.id, '--json', '--add-tag', '发布', '--no-range'])
    expect(updated2.code).toBe(0)
    const updatedTodo2 = parseJson<Todo>(updated2)
    expect(updatedTodo2.tags).toEqual(expect.arrayContaining(['产品', '研发', '发布']))
    expect(updatedTodo2.endDate).toBeNull()

    // tags：按引用计数返回
    const tags = await runCli(['tags', '--json'])
    expect(tags.code).toBe(0)
    expect(parseJson<TagSummary[]>(tags)).toEqual(
      expect.arrayContaining([
        { tag: '产品', count: 1 },
        { tag: '研发', count: 1 },
        { tag: '发布', count: 1 },
      ]),
    )
    const humanTags = await runCli(['tags'])
    expect(humanTags.stdout).toContain('#产品')

    // 人类可读 list 显示完成标记
    const humanList = await runCli(['list'])
    expect(humanList.stdout).toContain('[x] [高] 完成需求 v2')

    // rm：删除后 show 报错、退出码非 0
    const removed = await runCli(['rm', todo.id])
    expect(removed.code).toBe(0)
    expect(removed.stdout).toContain('已删除待办')

    const missing = await runCli(['show', todo.id, '--json'])
    expect(missing.code).not.toBe(0)
    expect(missing.stderr).toContain('待办不存在')
  })

  test('attach-upload / attach-download / attach-rm 全流程', async () => {
    const created = await runCli(['add', '--json', '--title', '带附件的待办'])
    expect(created.code).toBe(0)
    const todo = parseJson<Todo>(created)

    const content = '# 报告内容'
    const filePath = join(workDir, '报告.md')
    await writeFile(filePath, content)

    const uploaded = await runCli(['attach-upload', todo.id, filePath, '--json'])
    expect(uploaded.code).toBe(0)
    const attachment = parseJson<Attachment>(uploaded)
    expect(attachment.name).toBe('报告.md')
    expect(attachment.mimeType).toBe('text/markdown')
    expect(attachment.size).toBe(Buffer.byteLength(content))

    // 人类可读上传输出
    const humanUpload = await runCli(['attach-upload', todo.id, filePath])
    expect(humanUpload.stdout).toContain('已上传附件：报告.md')

    // 下载到指定目录
    const downloadDir = await mkdtemp(join(workDir, 'download-'))
    const downloaded = await runCli(['attach-download', attachment.id, '--output', downloadDir, '--json'])
    expect(downloaded.code).toBe(0)
    const info = parseJson<{ path: string; name: string; size: number }>(downloaded)
    expect(info.path).toBe(join(downloadDir, '报告.md'))
    expect(await readFile(info.path, 'utf8')).toBe(content)

    // 不指定 --output：落到当前工作目录
    const cwdDir = await mkdtemp(join(workDir, 'cwd-'))
    const cwdDownload = await runCli(['attach-download', attachment.id], { cwd: cwdDir })
    expect(cwdDownload.code).toBe(0)
    expect(cwdDownload.stdout).toContain(join(cwdDir, '报告.md'))
    expect(await readFile(join(cwdDir, '报告.md'), 'utf8')).toBe(content)

    // show 里能看到附件
    expect((await runCli(['show', todo.id])).stdout).toContain('报告.md')

    // 删除附件后下载报错
    const removed = await runCli(['attach-rm', attachment.id])
    expect(removed.code).toBe(0)
    expect(removed.stdout).toContain('已删除附件')

    const missing = await runCli(['attach-download', attachment.id, '--json'])
    expect(missing.code).not.toBe(0)
    expect(missing.stderr).toContain('附件不存在')
  })

  test('show 不存在的待办时退出码非 0 且错误可读', async () => {
    const { code, stderr } = await runCli(['show', '00000000-0000-4000-8000-000000000000'])

    expect(code).not.toBe(0)
    expect(stderr).toContain('待办不存在')
  })

  test('add 缺少标题时报参数错误', async () => {
    const { code, stderr } = await runCli(['add', '--json'])

    expect(code).not.toBe(0)
    expect(stderr).toContain('缺少必填参数 --title')
  })

  test('attach-upload 文件不存在时报可读错误', async () => {
    const created = await runCli(['add', '--json', '--title', '文件不存在用例'])
    const todo = parseJson<Todo>(created)

    const { code, stderr } = await runCli([
      'attach-upload',
      todo.id,
      join(workDir, '不存在.txt'),
    ])

    expect(code).not.toBe(0)
    expect(stderr).toContain('无法读取文件')
  })

  test('连不上 server 时输出可读错误且退出码非 0', async () => {
    const port = await freePort()
    const { code, stderr } = await runCli([
      'list',
      '--server',
      `http://127.0.0.1:${port}`,
    ])

    expect(code).not.toBe(0)
    expect(stderr).toContain('无法连接 server')
  })

  test('--server 写在子命令之前也生效（且优先于环境变量）', async () => {
    const result = await runCli(['--server', baseUrl, 'list', '--json'], {
      env: { AGENT_TODO_SERVER: 'http://127.0.0.1:1' },
    })

    expect(result.code).toBe(0)
    expect(parseJson<Todo[]>(result)).toEqual(expect.any(Array))
  })
})
