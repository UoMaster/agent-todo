import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

/**
 * 浏览器测试用的「假 server」：真 HTTP 服务，跑在 **Node 全局 setup** 里（globalSetup）。
 *
 * 为什么这么设计：
 * - 测试覆盖真实链路（App → shared 的 HTTP client → fetch → Vite 代理 → 服务器），
 *   拦截请求或 mock 模块都会绕过客户端逻辑（URL 拼装、错误处理、FormData）
 * - 测试跑在浏览器里，不能直接用 node:http，所以真正的 server 放在 globalSetup（Node 进程），
 *   测试通过 `/__test/*` 控制端点在它上面种数据 / 读状态
 * - 端口固定：Vite 的代理目标只能在配置里写死；测试文件串行执行（web 的 vitest.config.ts
 *   设了 fileParallelism: false），不会互相抢端口
 */
export const FAKE_SERVER_PORT = 43117
export const FAKE_SERVER_ORIGIN = `http://127.0.0.1:${FAKE_SERVER_PORT}`

export interface FakeAttachment {
  id: string
  todoId: string
  name: string
  mimeType: string
  size: number
  createdAt: string
}

export interface FakeSubtask {
  id: string
  todoId: string
  title: string
  done: boolean
  position: number
}

export interface FakeTodo {
  id: string
  title: string
  description: string
  done: boolean
  priority: string
  tags: string[]
  startDate: string | null
  endDate: string | null
  subtasks: FakeSubtask[]
  attachments: FakeAttachment[]
  createdAt: string
  updatedAt: string
}

export interface FakeServer {
  origin: string
  close: () => Promise<void>
}

export function makeTodo(overrides: Partial<FakeTodo> = {}): FakeTodo {
  return {
    id: randomUUID(),
    title: '示例待办',
    description: '',
    done: false,
    priority: 'none',
    tags: [],
    startDate: null,
    endDate: null,
    subtasks: [],
    attachments: [],
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
    ...overrides,
  }
}

function tagsOf(todos: FakeTodo[]) {
  const counts = new Map<string, number>()
  for (const todo of todos) {
    for (const tag of todo.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

async function readBytes(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) chunks.push(chunk as Uint8Array)

  return joinChunks(chunks)
}

/** JSON 体：按 UTF-8 解码（中文标题等必须正确还原） */
async function readText(request: IncomingMessage): Promise<string> {
  return new TextDecoder('utf-8').decode(await readBytes(request))
}

/** multipart 体：按 latin1 解码，保证「1 字节 = 1 字符」，便于按下标算文件大小 */
async function readBinaryText(request: IncomingMessage): Promise<string> {
  return new TextDecoder('latin1').decode(await readBytes(request))
}

function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return merged
}

/**
 * 把「按 latin1 解码得到的字符串」还原成原始字节，再按 UTF-8 解码。
 * 用于 multipart 里的文件名字段（UTF-8 编码，但整体 body 是按 latin1 读的）。
 */
const LATIN1_TO_BYTE = (() => {
  const map = new Map<string, number>()
  for (let byte = 0; byte < 256; byte += 1) {
    const char = new TextDecoder('latin1').decode(new Uint8Array([byte]))
    if (!map.has(char)) map.set(char, byte)
  }

  return map
})()

function decodeUtf8FromLatin1(value: string): string {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = LATIN1_TO_BYTE.get(value[index] as string) ?? 0
  }

  return new TextDecoder('utf-8').decode(bytes)
}

/** 从 multipart 请求体里取出文件名、MIME 与大小（够测试用，不追求完整 RFC 解析） */
function parseMultipart(body: string, index: number): Omit<FakeAttachment, 'todoId'> {
  // body 是按 latin1 读出来的（1 字节 = 1 字符，便于按字节算大小）。
  // 文件名字段本身是 UTF-8 字节序列，需还原字节后再解码
  const rawName = /filename="([^"]*)"/.exec(body)?.[1]
  const name = rawName ? decodeUtf8FromLatin1(rawName) : `file-${index}`
  const mimeType = /filename="[^"]*"\r\nContent-Type:\s*([^\r\n]+)/.exec(body)?.[1]?.trim() ?? ''
  const bodyStart = body.indexOf('\r\n\r\n') + 4
  const boundary = /^--([^\r\n]+)/.exec(body)?.[1]
  const bodyEnd = boundary ? body.indexOf(`\r\n--${boundary}`, bodyStart) : body.length

  return {
    id: randomUUID(),
    name,
    mimeType,
    size: Math.max(0, bodyEnd - bodyStart),
    createdAt: new Date().toISOString(),
  }
}

function send(response: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    response.writeHead(status, { 'Access-Control-Allow-Origin': '*' })
    response.end()
    return
  }

  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': String(new TextEncoder().encode(payload).byteLength),
  })
  response.end(payload)
}

/** 启动假 server（在 globalSetup 里调用）。
 *
 * 注意：Vitest 在「跑整个仓库」和「单跑 web 项目」时可能执行两次 globalSetup（配置被加载两次），
 * 这里做成幂等：已经起过就直接复用，只有最后一个 setup 的 teardown 才真正关掉。
 * 同时关掉 keep-alive，避免代理留下的空闲连接把端口占住。
 */
let shared: { server: Server; refs: number } | null = null

export async function startFakeServer(): Promise<FakeServer> {
  if (shared) {
    shared.refs += 1
    return {
      origin: FAKE_SERVER_ORIGIN,
      close: async () => {
        shared!.refs -= 1
        if (shared!.refs > 0) return

        const current = shared!.server
        shared = null
        current.closeAllConnections()
        await new Promise<void>((resolve, reject) => {
          current.close((error) => (error ? reject(error) : resolve()))
        })
      },
    }
  }

  const created = createServer((request, response) => {
    void handle(request, response)
  })
  created.keepAliveTimeout = 0
  const state = { server: created, refs: 1 }
  shared = state

  // 服务器自己的状态：测试通过 /__test/* 控制端点读写
  let todos: FakeTodo[] = []
  let failAll = false
  let downloads: string[] = []

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', FAKE_SERVER_ORIGIN)
    const path = url.pathname
    const method = request.method ?? 'GET'

    // 跨域预检：控制端点带 application/json 头，浏览器会先发 OPTIONS
    if (method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      })
      response.end()
      return
    }

    // ── 控制端点（测试用，不经过 /api 代理） ──
    if (path === '/__test/seed' && method === 'POST') {
      const body = JSON.parse(await readText(request)) as {
        todos?: Array<Partial<FakeTodo>>
        failAll?: boolean
      }
      todos = (body.todos ?? []).map((todo) => makeTodo(todo))
      failAll = body.failAll ?? false
      downloads = []
      send(response, 200, { ok: true })
      return
    }

    if (path === '/__test/state' && method === 'GET') {
      send(response, 200, { todos, tags: tagsOf(todos), downloads })
      return
    }

    if (path === '/__test/config' && method === 'POST') {
      const body = JSON.parse(await readText(request)) as { failAll?: boolean }
      failAll = body.failAll ?? false
      send(response, 200, { ok: true })
      return
    }

    // ── 业务接口 ──
    if (failAll) {
      send(response, 500, { error: 'internal_error', message: '测试注入的故障' })
      return
    }

    if (path === '/api/todos' && method === 'GET') {
      const tag = url.searchParams.get('tag')
      const query = url.searchParams.get('q')
      let list = todos
      if (tag) list = list.filter((todo) => todo.tags.includes(tag))
      if (query) {
        const keyword = query.toLowerCase()
        list = list.filter(
          (todo) =>
            todo.title.toLowerCase().includes(keyword) ||
            todo.description.toLowerCase().includes(keyword),
        )
      }

      send(response, 200, list)
      return
    }

    if (path === '/api/todos' && method === 'POST') {
      const body = JSON.parse(await readText(request)) as Partial<FakeTodo> & {
        subtasks?: string[]
      }
      const todo = makeTodo({
        ...body,
        tags: body.tags ?? [],
        subtasks: ((body.subtasks ?? []) as string[]).map((title, position) => ({
          id: randomUUID(),
          todoId: '',
          title,
          done: false,
          position,
        })),
      })
      todos = [...todos, todo]
      send(response, 201, todo)
      return
    }

    if (path === '/api/tags' && method === 'GET') {
      send(response, 200, tagsOf(todos))
      return
    }

    const todoById = /^\/api\/todos\/([^/]+)$/.exec(path)
    if (todoById) {
      const id = decodeURIComponent(todoById[1] as string)
      const exists = todos.find((todo) => todo.id === id)
      if (!exists) {
        send(response, 404, { error: 'not_found', message: '待办不存在' })
        return
      }

      if (method === 'GET') {
        send(response, 200, exists)
        return
      }

      if (method === 'PUT') {
        const body = JSON.parse(await readText(request)) as Partial<FakeTodo> & {
          subtasks?: Array<{ id?: string; title: string; done?: boolean }>
        }
        const updated: FakeTodo = {
          ...exists,
          ...body,
          id,
          tags: body.tags ?? exists.tags,
          subtasks: (body.subtasks ?? []).map((subtask, position) => ({
            id: subtask.id ?? randomUUID(),
            todoId: id,
            title: subtask.title,
            done: subtask.done ?? false,
            position,
          })),
          updatedAt: new Date(Date.now() + 1).toISOString(),
        }
        todos = todos.map((todo) => (todo.id === id ? updated : todo))
        send(response, 200, updated)
        return
      }

      todos = todos.filter((todo) => todo.id !== id)
      send(response, 204)
      return
    }

    const upload = /^\/api\/todos\/([^/]+)\/attachments$/.exec(path)
    if (upload && method === 'POST') {
      const id = decodeURIComponent(upload[1] as string)
      const todo = todos.find((item) => item.id === id)
      if (!todo) {
        send(response, 404, { error: 'not_found', message: '待办不存在' })
        return
      }

      const attachment = {
        ...parseMultipart(await readBinaryText(request), todo.attachments.length),
        todoId: id,
      }
      todo.attachments = [...todo.attachments, attachment]
      send(response, 201, attachment)
      return
    }

    const content = /^\/api\/attachments\/([^/]+)\/content$/.exec(path)
    if (content) {
      const id = decodeURIComponent(content[1] as string)
      downloads.push(id)
      const attachment = todos.flatMap((todo) => todo.attachments).find((item) => item.id === id)
      if (!attachment) {
        send(response, 404, { error: 'not_found', message: '附件不存在' })
        return
      }

      const payload = new TextEncoder().encode('file-bytes')
      response.writeHead(200, {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        'Content-Length': String(payload.byteLength),
        'Access-Control-Allow-Origin': '*',
      })
      response.end(payload)
      return
    }

    const attachment = /^\/api\/attachments\/([^/]+)$/.exec(path)
    if (attachment && method === 'DELETE') {
      const id = decodeURIComponent(attachment[1] as string)
      let removed = false
      todos = todos.map((todo) => ({
        ...todo,
        attachments: todo.attachments.filter((item) => {
          if (item.id !== id) return true
          removed = true
          return false
        }),
      }))

      if (!removed) {
        send(response, 404, { error: 'not_found', message: '附件不存在' })
        return
      }

      send(response, 204)
      return
    }

    send(response, 404, { error: 'not_found', message: `未拦截的请求：${method} ${path}` })
  }

  await new Promise<void>((resolve) => created.listen(FAKE_SERVER_PORT, '127.0.0.1', resolve))

  return {
    origin: FAKE_SERVER_ORIGIN,
    close: async () => {
      state.refs -= 1
      if (state.refs > 0) return

      shared = null
      created.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        created.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
