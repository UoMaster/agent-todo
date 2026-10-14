// 待办 / 附件路由。
// 依赖通过 createTodoRoutes 注入（store + 附件存储），便于测试替换。

import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { matchesStatusFilter, todayKey } from '@agent-todo/shared'
import type { AttachmentStore } from '../attachments.ts'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentIdParamSchema,
  createTodoSchema,
  listQuerySchema,
  todoIdParamSchema,
  updateTodoSchema,
} from '../schema.ts'
import type { TodoStore } from '../todos.ts'

/** 校验失败统一返回 { error, message }（与全局 404 结构一致） */
const validationHook = (
  result: { success: boolean; error?: unknown },
  c: Context,
): Response | undefined => {
  if (result.success) return undefined

  return c.json({ error: 'validation_error', message: '请求参数不合法' }, 400)
}

/** 只保留安全的 ASCII 字符，中文等交给 filename*（RFC 5987） */
function asciiFilename(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return ascii.trim() || 'download'
}

function contentDisposition(name: string, inline: boolean): string {
  const encoded = encodeURIComponent(name)
  return `${inline ? 'inline' : 'attachment'}; filename="${asciiFilename(name)}"; filename*=UTF-8''${encoded}`
}

export interface TodoRoutesOptions {
  store: TodoStore
  attachmentStore: AttachmentStore
  /** 单个附件大小上限（字节），默认 200MB */
  maxAttachmentBytes?: number
}

export function createTodoRoutes(options: TodoRoutesOptions) {
  const { store, attachmentStore, maxAttachmentBytes = MAX_ATTACHMENT_BYTES } = options
  const routes = new Hono()

  routes.get('/todos', zValidator('query', listQuerySchema, validationHook), async (c) => {
    const { status, tag, q } = c.req.valid('query')
    const todos = await store.list({ tag, query: q })

    // 状态过滤复用 shared 的规则（与 web 前端的筛选行为完全一致，只有一处定义）
    const filtered =
      status && status !== 'all'
        ? todos.filter((todo) => matchesStatusFilter(todo, { type: status }, todayKey()))
        : todos

    return c.json(filtered)
  })

  routes.get('/tags', async (c) => c.json(await store.listTags()))

  routes.post('/todos', zValidator('json', createTodoSchema, validationHook), async (c) => {
    const todo = await store.create(c.req.valid('json'))
    return c.json(todo, 201)
  })

  routes.get('/todos/:id', zValidator('param', todoIdParamSchema, validationHook), async (c) => {
    const todo = await store.get(c.req.valid('param').id)
    if (!todo) return c.json({ error: 'not_found', message: '待办不存在' }, 404)

    return c.json(todo)
  })

  routes.put(
    '/todos/:id',
    zValidator('param', todoIdParamSchema, validationHook),
    zValidator('json', updateTodoSchema, validationHook),
    async (c) => {
      const todo = await store.replace(c.req.valid('param').id, c.req.valid('json'))
      if (!todo) return c.json({ error: 'not_found', message: '待办不存在' }, 404)

      return c.json(todo)
    },
  )

  routes.delete('/todos/:id', zValidator('param', todoIdParamSchema, validationHook), async (c) => {
    const removed = await store.remove(c.req.valid('param').id)
    if (!removed) return c.json({ error: 'not_found', message: '待办不存在' }, 404)

    return c.body(null, 204)
  })

  routes.post(
    '/todos/:id/attachments',
    zValidator('param', todoIdParamSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')

      let form: FormData
      try {
        form = await c.req.formData()
      } catch {
        return c.json({ error: 'validation_error', message: '请求必须是 multipart/form-data' }, 400)
      }

      const file = form.get('file')
      if (!(file instanceof File)) {
        return c.json({ error: 'validation_error', message: '缺少文件字段 file' }, 400)
      }
      if (file.size > maxAttachmentBytes) {
        return c.json(
          {
            error: 'file_too_large',
            message: `附件不能超过 ${Math.floor(maxAttachmentBytes / 1024 / 1024)} MB`,
          },
          413,
        )
      }

      const attachment = await store.saveAttachment(id, file)
      if (!attachment) return c.json({ error: 'not_found', message: '待办不存在' }, 404)

      const { storagePath: _storagePath, ...payload } = attachment
      return c.json(payload, 201)
    },
  )

  routes.get(
    '/attachments/:id/content',
    zValidator('param', attachmentIdParamSchema, validationHook),
    async (c) => {
      const found = await store.getAttachment(c.req.valid('param').id)
      if (!found) return c.json({ error: 'not_found', message: '附件不存在' }, 404)

      let data: Uint8Array
      try {
        data = await attachmentStore.read(found.storagePath)
      } catch {
        // 元数据还在但文件不见了（磁盘清理、迁移等），提示为文件缺失而不是 500
        return c.json({ error: 'file_missing', message: '附件文件已丢失' }, 404)
      }

      const { name, mimeType } = found.attachment
      const inline = mimeType.startsWith('image/')

      return c.body(data.buffer as ArrayBuffer, 200, {
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': String(data.byteLength),
        'Content-Disposition': contentDisposition(name, inline),
        'X-Content-Type-Options': 'nosniff',
      })
    },
  )

  routes.delete(
    '/attachments/:id',
    zValidator('param', attachmentIdParamSchema, validationHook),
    async (c) => {
      const removed = await store.removeAttachment(c.req.valid('param').id)
      if (!removed) return c.json({ error: 'not_found', message: '附件不存在' }, 404)

      await attachmentStore.remove(removed.storagePath).catch(() => undefined)
      return c.body(null, 204)
    },
  )

  return routes
}
