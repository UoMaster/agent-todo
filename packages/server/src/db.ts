import { Pool } from 'pg'
import { config } from './config.ts'

/**
 * 最小 SQL 客户端接口。
 * 生产实现基于 pg（见 createSqlClient），测试用 PGlite——两者都满足这个接口。
 */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>
  /** 执行可能包含多条语句的 SQL（迁移文件用） */
  exec(text: string): Promise<void>
}

/** 底层连接池需要满足的最小接口（抽出来是为了能用假对象测试适配器） */
export interface QueryablePool {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

/** 把 pg 连接池适配成 SqlClient（抽成纯函数，便于单元测试） */
export function createSqlClient(pool: QueryablePool): SqlClient {
  return {
    async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]> {
      const result = await pool.query(text, values)
      return result.rows as T[]
    },
    async exec(text: string): Promise<void> {
      // 不加参数时 node-postgres 走 simple query 协议，可以执行多条语句
      await pool.query(text)
    },
  }
}

let pool: Pool | null = null

/** 懒创建连接池并适配；未配置 DATABASE_URL 时返回 null */
export function getSqlClient(): SqlClient | null {
  if (!config.databaseUrl) return null

  pool ??= new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 3_000,
  })

  return createSqlClient(pool)
}

export interface DbStatus {
  ok: boolean
  error?: string
}

/** 数据库探活：连不上时返回可读错误（/api/health 使用） */
export async function pingDb(): Promise<DbStatus> {
  const sql = getSqlClient()
  if (!sql) return { ok: false, error: 'DATABASE_URL 未配置' }

  try {
    await sql.query('select 1')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end()
  pool = null
}
