import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { todayKey } from '@agent-todo/shared'
import { createApp } from './app.ts'
import { createMemoryAttachmentStore, type AttachmentStore } from './attachments.ts'
import type { SqlClient } from './db.ts'
import { runMigrations } from './migrations.ts'
import { createTodoStore } from './todos.ts'

/**
 * 路由与数据层测试的公共装置：真 Postgres 语义（PGlite，进程内 WASM）+ 仓库里真实的迁移脚本。
 * 建表语句写错、字段类型不匹配这类问题都会在这里暴露，且不依赖 Docker。
 */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

export function pgliteSqlClient(db: PGlite): SqlClient {
  return {
    async query<T>(text: string, values?: unknown[]): Promise<T[]> {
      const result = await db.query<T>(text, values)
      return result.rows
    },
    async exec(text: string): Promise<void> {
      await db.exec(text)
    },
  }
}

export interface TestContext {
  db: PGlite
  sql: SqlClient
  app: ReturnType<typeof createApp>
  /** 与 app 共用的内存附件存储（测试里可以断言文件内容） */
  attachmentStore: AttachmentStore
  today: string
  dispose: () => Promise<void>
}

/** 起一个「真数据库 + 真迁移 + 内存附件存储」的 app */
export async function createTestContext(): Promise<TestContext> {
  const db = new PGlite()
  const sql = pgliteSqlClient(db)
  await runMigrations(sql, { dir: MIGRATIONS_DIR, log: { info: () => {} } })

  // 同一个附件存储实例同时交给数据层与路由，保证「写进去的文件读得出来」
  const attachmentStore = createMemoryAttachmentStore()
  const app = createApp({
    todoStore: createTodoStore(() => sql, attachmentStore),
    attachmentStore,
  })

  return {
    db,
    sql,
    app,
    attachmentStore,
    today: todayKey(),
    dispose: () => db.close(),
  }
}

/** 取一行，拿不到就报错（测试里当断言失败用） */
export async function queryOne<T>(sql: SqlClient, text: string, values?: unknown[]): Promise<T> {
  const rows = await sql.query<T>(text, values)
  const row = rows[0]
  if (!row) throw new Error('期望至少一行数据')

  return row
}
