// 调用 agent-todo server 的 HTTP 客户端：web 与 cli 共用。
// 运行时无关：只依赖标准 fetch / FormData / Blob（Node ≥ 22 与浏览器都有），不碰 node:*。

import { ApiError } from './error.ts'
import type {
  Attachment,
  Priority,
  SubtaskInput,
  TagSummary,
  Todo,
  TodoInput,
  TodoStatusFilter,
  TodoUpdate,
} from './types.ts'

export interface ListTodosQuery {
  status?: TodoStatusFilter
  /** 按标签过滤（与 status 同时存在时取交集） */
  tag?: string
  /** 标题 / 描述关键字搜索 */
  query?: string
}

export interface UploadAttachmentInput {
  name: string
  /** 任意二进制内容（Node 里直接传 Buffer / Uint8Array 也可以） */
  data: Blob | Uint8Array | ArrayBuffer
  /** MIME 类型；不传时按文件名猜 */
  mimeType?: string
}
/** 下载结果：文件本体 + 服务端记录的文件名与类型 */
export interface AttachmentContent {
  name: string
  mimeType: string
  /** 原始字节；写盘交给调用方（CLI 用 node:fs） */
  data: Uint8Array
}

export interface AgentTodoClient {
  listTodos(query?: ListTodosQuery): Promise<Todo[]>
  getTodo(id: string): Promise<Todo>
  createTodo(input: TodoInput): Promise<Todo>
  /** 整条替换（未传的字段重置为默认值），子任务/附件按传参决定保留 */
  updateTodo(id: string, update: TodoUpdate): Promise<Todo>
  deleteTodo(id: string): Promise<void>
  listTags(): Promise<TagSummary[]>
  uploadAttachment(todoId: string, file: UploadAttachmentInput): Promise<Attachment>
  downloadAttachment(id: string): Promise<AttachmentContent>
  deleteAttachment(id: string): Promise<void>
}

export interface CreateClientOptions {
  baseUrl: string
  /** 注入 fetch（测试用），默认全局 fetch */
  fetch?: typeof fetch
  /** 单请求超时（毫秒），默认 30s */
  timeoutMs?: number
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

/** 把响应体里的错误信息读出来（服务端错误结构为 { error, message }） */
async function readError(response: Response): Promise<ApiError> {
  let code = 'unknown_error'
  let message = `请求失败（HTTP ${response.status}）`

  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string') code = body.error
    if (typeof body.message === 'string') message = body.message
  } catch {
    // 非 JSON 响应（如代理返回的 HTML），保留默认文案
  }

  return new ApiError(response.status, code, message)
}

/**
 * 创建 HTTP 客户端。错误统一抛 ApiError：
 * - 网络层失败（连不上 server）→ statusCode = 0，code = network_error
 * - 服务端返回非 2xx → 透传 server 的 { error, message }
 */
export function createClient(options: CreateClientOptions): AgentTodoClient {
  const { baseUrl, fetch: fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = options

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response
    try {
      response = await fetchImpl(joinUrl(baseUrl, path), {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new ApiError(0, 'network_error', `无法连接 server（${baseUrl}）：${detail}`)
    }

    if (!response.ok) throw await readError(response)

    return response
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(path, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    })

    return (await response.json()) as T
  }

  function jsonBody(method: string, body: unknown): RequestInit {
    return {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  }

  return {
    async listTodos(query = {}) {
      const params = new URLSearchParams()
      if (query.status) params.set('status', query.status)
      if (query.tag) params.set('tag', query.tag)
      if (query.query) params.set('q', query.query)

      const suffix = params.size > 0 ? `?${params.toString()}` : ''
      return requestJson<Todo[]>(`/api/todos${suffix}`)
    },

    async getTodo(id) {
      return requestJson<Todo>(`/api/todos/${encodeURIComponent(id)}`)
    },

    async createTodo(input: TodoInput) {
      return requestJson<Todo>('/api/todos', jsonBody('POST', input))
    },

    async updateTodo(id, update: TodoUpdate) {
      return requestJson<Todo>(`/api/todos/${encodeURIComponent(id)}`, jsonBody('PUT', update))
    },

    async deleteTodo(id) {
      await request(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async listTags() {
      return requestJson<TagSummary[]>('/api/tags')
    },

    async uploadAttachment(todoId, file) {
      // 用 instanceof 收窄（node 的 Blob 与浏览器的类同名同源）；
      // 这里刻意不引用 BlobPart 类型，server 的 tsconfig 只有 node 类型
      const buffer =
        file.data instanceof Blob
          ? await file.data.arrayBuffer()
          : file.data instanceof Uint8Array
            ? (file.data.buffer as ArrayBuffer)
            : file.data

      const form = new FormData()
      form.append('file', new Blob([buffer], { type: file.mimeType ?? '' }), file.name)

      return requestJson<Attachment>(`/api/todos/${encodeURIComponent(todoId)}/attachments`, {
        method: 'POST',
        body: form,
      })
    },

    async downloadAttachment(id) {
      const response = await request(`/api/attachments/${encodeURIComponent(id)}/content`)
      const buffer = await response.arrayBuffer()

      return {
        name: filenameFromHeader(response.headers.get('content-disposition')) ?? id,
        mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
        data: new Uint8Array(buffer),
      }
    },

    async deleteAttachment(id) {
      await request(`/api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }
}

/** 从 Content-Disposition 里解析文件名（服务端用 RFC 5987 的 filename* 编码中文名） */
export function filenameFromHeader(header: string | null): string | null {
  if (!header) return null

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim())
    } catch {
      return null
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() ?? null
}

/** 优先级取值守卫，CLI 解析参数时用 */
export function toPriority(value: string | undefined): Priority | undefined {
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') return value

  return undefined
}

/** 子任务入参守卫（server 校验用不到，CLI / web 组装请求时复用） */
export function isSubtaskInput(value: unknown): value is SubtaskInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SubtaskInput).title === 'string'
  )
}
