import { afterEach, describe, expect, test, vi } from 'vitest'
import { createSqlClient, pingDb, type QueryablePool } from './db.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('createSqlClient（pg 连接池适配器）', () => {
  function fakePool(rows: unknown[] = [{ ok: 1 }]) {
    const calls: Array<{ text: string; values?: unknown[] }> = []
    const pool: QueryablePool = {
      async query(text, values) {
        calls.push({ text, values })
        return { rows }
      },
    }
    return { pool, calls }
  }

  test('query 返回 rows，并透传参数', async () => {
    const { pool, calls } = fakePool([{ id: 7 }])
    const sql = createSqlClient(pool)

    const rows = await sql.query<{ id: number }>('select * from t where id = $1', [7])

    expect(rows).toEqual([{ id: 7 }])
    expect(calls).toEqual([{ text: 'select * from t where id = $1', values: [7] }])
  })

  test('exec 用不带参数的简单查询协议执行（支持多条语句）', async () => {
    const { pool, calls } = fakePool([])
    const sql = createSqlClient(pool)

    await sql.exec('create table a (id int); create table b (id int);')

    expect(calls).toEqual([{ text: 'create table a (id int); create table b (id int);', values: undefined }])
  })
})

describe('pingDb', () => {
  test('未配置 DATABASE_URL 时返回明确提示', async () => {
    const status = await pingDb()

    expect(status).toEqual({ ok: false, error: 'DATABASE_URL 未配置' })
  })

  test('数据库不可达时返回错误信息，而不是抛异常', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@127.0.0.1:1/nope')
    vi.resetModules()
    const { pingDb: pingUnreachable, closeDb } = await import('./db.ts')

    const status = await pingUnreachable()

    expect(status.ok).toBe(false)
    expect(typeof status.error).toBe('string')
    expect(status.error?.length).toBeGreaterThan(0)
    await closeDb()
  })
})
