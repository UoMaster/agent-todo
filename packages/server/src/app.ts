import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createAttachmentStore, type AttachmentStore } from './attachments.ts'
import { config } from './config.ts'
import { getSqlClient, pingDb, type DbStatus } from './db.ts'
import { createTodoRoutes } from './routes/todos.ts'
import { createTodoStore, DatabaseUnavailableError, type TodoStore } from './todos.ts'

export interface AppOptions {
  /** 前端构建产物目录；设置后托管静态文件 + SPA 兜底（生产 / 容器模式） */
  staticDir?: string
  /** 数据库探活实现，测试时可注入 */
  dbPing?: () => Promise<DbStatus>
  /** 上传文件目录（附件落盘位置） */
  uploadsDir?: string
  /** 待办数据访问层；默认基于 DATABASE_URL 创建，测试时可注入 */
  todoStore?: TodoStore
  /** 附件存储；默认按 uploadsDir 创建本地文件系统实现，测试时可注入内存实现 */
  attachmentStore?: AttachmentStore
  /** 单个附件大小上限（字节），默认 200MB */
  maxAttachmentBytes?: number
}

export function createApp(options: AppOptions = {}) {
  const { staticDir, dbPing = pingDb, uploadsDir = config.uploadsDir } = options
  const app = new Hono()
  // 附件存储只创建一次：数据层写文件与路由读文件必须是同一个实例（同一个目录）
  const attachmentStore = options.attachmentStore ?? createAttachmentStore(uploadsDir)

  // 健康检查：进程存活即 200；数据库状态放在 body 里（容器 healthcheck 会同时校验 db.ok）
  app.get('/api/health', async (c) => {
    const db = await dbPing().catch(
      (error: unknown): DbStatus => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    )

    return c.json({
      ok: true,
      name: 'agent-todo',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
      db,
    })
  })

  // 业务接口：/api/todos、/api/tags、/api/attachments
  // 数据访问层懒创建（DATABASE_URL 未配置时请求进来才报错，不阻塞启动）
  app.route(
    '/api',
    createTodoRoutes({
      store: options.todoStore ?? createTodoStore(getSqlClient, attachmentStore),
      attachmentStore,
      maxAttachmentBytes: options.maxAttachmentBytes,
    }),
  )

  if (staticDir) {
    // 静态资源命中直接返回（/、/assets/* 等）
    app.use('*', serveStatic({ root: staticDir }))

    // SPA 兜底：非 /api 的 GET 一律返回 index.html，由前端路由接管
    app.get('*', async (c, next) => {
      if (c.req.path.startsWith('/api')) return next()

      try {
        return c.html(await readFile(join(staticDir, 'index.html'), 'utf8'))
      } catch {
        return next()
      }
    })
  } else {
    // 纯 API 模式（本地开发时前端由 Vite dev server 提供）
    app.get('/', (c) => c.text('agent-todo server'))
  }

  // 统一 404：保持 JSON 结构，方便 web / cli 处理
  app.notFound((c) => c.json({ error: 'not_found', message: `接口不存在：${c.req.path}` }, 404))

  // 兜底错误处理：不让异常变成空 500，保持 { error, message } 结构
  app.onError((error, c) => {
    if (error instanceof DatabaseUnavailableError) {
      return c.json({ error: 'database_unavailable', message: error.message }, 503)
    }

    console.error('[server] 未捕获异常', error)
    return c.json({ error: 'internal_error', message: '服务端内部错误' }, 500)
  })

  return app
}

/** 默认应用：静态目录取 STATIC_DIR 环境变量（未设置则纯 API 模式） */
export const app = createApp({ staticDir: config.staticDir })
