import { describe, expect, test } from 'vitest'
import { ApiError } from './error.ts'
import {
  createClient,
  filenameFromHeader,
  isSubtaskInput,
  joinUrl,
  toPriority,
  type AgentTodoClient,
} from './api.ts'
import type { Todo } from './types.ts'

interface Call {
  url: string
  init: RequestInit
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

const sampleTodo: Todo = {
  id: 't1',
  title: '写测试',
  description: '',
  done: false,
  priority: 'high',
  tags: ['研发'],
  startDate: '2026-10-14',
  endDate: null,
  subtasks: [],
  attachments: [],
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
}

/** 记录所有请求，按 URL 关键词返回预设响应 */
function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return handler(call)
  }) as typeof fetch

  return { fetchImpl, calls }
}

function makeClient(handler: (call: Call) => Response | Promise<Response>) {
  const { fetchImpl, calls } = stubFetch(handler)
  const client: AgentTodoClient = createClient({ baseUrl: 'http://localhost:3001', fetch: fetchImpl })

  return { client, calls }
}

/** 取第 index 次请求（记录型 stub；测试里通常只看第一次 / 前几次） */
function callAt(calls: Call[], index = 0): Call {
  const call = calls[index]
  if (!call) throw new Error(`期望至少有 ${index + 1} 次请求，实际 ${calls.length} 次`)

  return call
}

function headersOf(call: Call): Record<string, string> {
  return (call.init.headers ?? {}) as Record<string, string>
}

describe('joinUrl', () => {
  test('拼接路径并规整尾部斜杠', () => {
    expect(joinUrl('http://localhost:3001', '/api/todos')).toBe('http://localhost:3001/api/todos')
    expect(joinUrl('http://localhost:3001/', '/api/todos')).toBe('http://localhost:3001/api/todos')
    expect(joinUrl('http://localhost:3001///', '/api/todos')).toBe('http://localhost:3001/api/todos')
  })
})

describe('filenameFromHeader', () => {
  test('解析 RFC 5987 的 filename*（中文名）', () => {
    expect(
      filenameFromHeader("attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%E6%96%87%E6%A1%A3.pdf"),
    ).toBe('文档.pdf')
  })

  test('解析普通 filename（带引号与不带引号）', () => {
    expect(filenameFromHeader('attachment; filename="report.pdf"')).toBe('report.pdf')
    expect(filenameFromHeader('attachment; filename=report.pdf')).toBe('report.pdf')
  })

  test('缺失或畸形返回 null', () => {
    expect(filenameFromHeader(null)).toBeNull()
    expect(filenameFromHeader('inline')).toBeNull()
    expect(filenameFromHeader("attachment; filename*=UTF-8''%ZZ")).toBeNull()
    expect(filenameFromHeader("attachment; filename*=UTF-8''%E0%A4%A")).toBeNull()
  })
})

describe('createClient：待办 CRUD', () => {
  test('listTodos 拼装查询参数', async () => {
    const { client, calls } = makeClient(() => jsonResponse([sampleTodo]))

    const todos = await client.listTodos({ status: 'today', tag: '研 发', query: 'a&b' })

    expect(todos).toEqual([sampleTodo])
    expect(callAt(calls).url).toBe(
      'http://localhost:3001/api/todos?status=today&tag=%E7%A0%94+%E5%8F%91&q=a%26b',
    )
    expect(headersOf(callAt(calls)).Accept).toBe('application/json')
  })

  test('listTodos 无参数时不带 query string', async () => {
    const { client, calls } = makeClient(() => jsonResponse([]))

    await client.listTodos()

    expect(callAt(calls).url).toBe('http://localhost:3001/api/todos')
  })

  test('createTodo 发送 JSON body', async () => {
    const { client, calls } = makeClient(() => jsonResponse(sampleTodo, 201))

    const todo = await client.createTodo({ title: '写测试', priority: 'high' })

    expect(todo).toEqual(sampleTodo)
    expect(callAt(calls).init.method).toBe('POST')
    expect(headersOf(callAt(calls))['Content-Type']).toBe(
      'application/json',
    )
    expect(callAt(calls).init.body).toBe('{"title":"写测试","priority":"high"}')
  })

  test('updateTodo 对 id 做 URL 编码', async () => {
    const { client, calls } = makeClient(() => jsonResponse(sampleTodo))

    await client.updateTodo('a b/c', { title: '改标题' })

    expect(callAt(calls).init.method).toBe('PUT')
    expect(callAt(calls).url).toBe('http://localhost:3001/api/todos/a%20b%2Fc')
  })

  test('getTodo / deleteTodo 的路径与方法', async () => {
    const { client, calls } = makeClient((call) =>
      call.init.method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse(sampleTodo),
    )

    await client.getTodo('t1')
    await client.deleteTodo('t1')

    expect(callAt(calls).url).toBe('http://localhost:3001/api/todos/t1')
    expect(callAt(calls, 1).init.method).toBe('DELETE')
  })

  test('listTags 请求 /api/tags', async () => {
    const { client, calls } = makeClient(() => jsonResponse([{ tag: '研发', count: 2 }]))

    await expect(client.listTags()).resolves.toEqual([{ tag: '研发', count: 2 }])
    expect(callAt(calls).url).toBe('http://localhost:3001/api/tags')
  })
})

describe('createClient：附件', () => {
  test('uploadAttachment 用 multipart/form-data 上传文件名与内容', async () => {
    const attachment = {
      id: 'a1',
      todoId: 't1',
      name: '说明.txt',
      mimeType: 'text/plain',
      size: 5,
      createdAt: '2026-10-14T00:00:00.000Z',
    }
    const { client, calls } = makeClient(() => jsonResponse(attachment, 201))

    const result = await client.uploadAttachment('t1', {
      name: '说明.txt',
      data: new TextEncoder().encode('hello'),
      mimeType: 'text/plain',
    })

    expect(result).toEqual(attachment)
    const form = callAt(calls).init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    const file = form.get('file') as File
    expect(file.name).toBe('说明.txt')
    expect(await file.text()).toBe('hello')
    // 不要手动设置 Content-Type，交给 fetch 生成 multipart boundary
    expect(headersOf(callAt(calls))['Content-Type']).toBeUndefined()
  })

  test('uploadAttachment 也接受 Blob', async () => {
    const { client, calls } = makeClient(() => jsonResponse({}, 201))

    await client.uploadAttachment('t1', {
      name: 'a.bin',
      data: new Blob(['xy'], { type: 'application/octet-stream' }),
    })

    const form = callAt(calls).init.body as FormData
    expect(((form.get('file') as File).size)).toBe(2)
  })

  test('downloadAttachment 返回文件名、类型与字节', async () => {
    const { client, calls } = makeClient(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': "attachment; filename=\"x.pdf\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf",
          },
        }),
    )

    const content = await client.downloadAttachment('a1')

    expect(callAt(calls).url).toBe('http://localhost:3001/api/attachments/a1/content')
    expect(content.name).toBe('报告.pdf')
    expect(content.mimeType).toBe('application/pdf')
    expect([...content.data]).toEqual([1, 2, 3])
  })

  test('downloadAttachment 缺少 Content-Disposition 时用 id 兜底', async () => {
    const { client } = makeClient(
      () => new Response(new Uint8Array([9]), { headers: { 'Content-Type': 'text/plain' } }),
    )

    const content = await client.downloadAttachment('a9')
    expect(content.name).toBe('a9')
  })

  test('deleteAttachment 走 DELETE', async () => {
    const { client, calls } = makeClient(() => new Response(null, { status: 204 }))

    await client.deleteAttachment('a1')

    expect(callAt(calls).init.method).toBe('DELETE')
    expect(callAt(calls).url).toBe('http://localhost:3001/api/attachments/a1')
  })
})

describe('createClient：错误处理', () => {
  test('服务端错误响应透传 { error, message }', async () => {
    const { client } = makeClient(() =>
      jsonResponse({ error: 'validation_error', message: '标题不能为空' }, 400),
    )

    const error = await client.createTodo({ title: '' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).code).toBe('validation_error')
    expect((error as ApiError).message).toBe('标题不能为空')
    expect((error as ApiError).isNetworkError).toBe(false)
  })

  test('非 JSON 错误响应使用兜底文案', async () => {
    const { client } = makeClient(() => new Response('<html>502</html>', { status: 502 }))

    const error = (await client.listTodos().catch((e: unknown) => e)) as ApiError

    expect(error.statusCode).toBe(502)
    expect(error.code).toBe('unknown_error')
    expect(error.message).toContain('502')
  })

  test('网络层失败抛 statusCode = 0 的 ApiError', async () => {
    const { client } = makeClient(() => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:3001')
    })

    const error = (await client.listTodos().catch((e: unknown) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.statusCode).toBe(0)
    expect(error.code).toBe('network_error')
    expect(error.isNetworkError).toBe(true)
    expect(error.message).toContain('无法连接 server')
  })

  test('非 Error 抛出也能生成可读信息', async () => {
    const { client } = makeClient(() => {
      throw 'boom'
    })

    const error = (await client.listTodos().catch((e: unknown) => e)) as ApiError
    expect(error.message).toContain('boom')
  })

  test('请求带默认超时信号', async () => {
    const { client, calls } = makeClient(() => jsonResponse([]))

    await client.listTodos()

    expect(callAt(calls).init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('toPriority / isSubtaskInput', () => {
  test('toPriority 只接受四个合法值', () => {
    expect(toPriority('high')).toBe('high')
    expect(toPriority('none')).toBe('none')
    expect(toPriority('urgent')).toBeUndefined()
    expect(toPriority(undefined)).toBeUndefined()
  })

  test('isSubtaskInput 校验结构', () => {
    expect(isSubtaskInput({ title: 'a' })).toBe(true)
    expect(isSubtaskInput({ id: 's1', title: 'a', done: true })).toBe(true)
    expect(isSubtaskInput({})).toBe(false)
    expect(isSubtaskInput(null)).toBe(false)
    expect(isSubtaskInput('a')).toBe(false)
  })
})
