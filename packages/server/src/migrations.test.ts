import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { SqlClient } from './db.ts'
import { runMigrations } from './migrations.ts'

/**
 * 迁移器测试跑在 PGlite 上（真 Postgres 编译成的 WASM，进程内运行），
 * 既能验证真实 SQL 语义，又不需要 Docker / 外部数据库，CI 友好。
 */
function pgliteClient(db: PGlite): SqlClient {
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

const silentLog = { info: () => {} }

describe('runMigrations', () => {
  let db: PGlite
  let sql: SqlClient
  let dir: string

  beforeEach(async () => {
    db = new PGlite()
    sql = pgliteClient(db)
    dir = await mkdtemp(join(tmpdir(), 'agent-todo-migrations-'))
  })

  afterEach(async () => {
    await db.close()
    await rm(dir, { recursive: true, force: true })
  })

  test('按文件名顺序应用迁移，并记录到 schema_migrations', async () => {
    // 故意乱序写入，验证按文件名排序
    await writeFile(join(dir, '0002_second.sql'), 'create table second_table (id int primary key);')
    await writeFile(join(dir, '0001_first.sql'), 'create table first_table (id int primary key);')

    const executed = await runMigrations(sql, dir, silentLog)

    expect(executed).toEqual(['0001_first.sql', '0002_second.sql'])

    const recorded = await sql.query<{ name: string }>('select name from schema_migrations order by name')
    expect(recorded.map((row) => row.name)).toEqual(['0001_first.sql', '0002_second.sql'])

    const tables = await sql.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    )
    expect(tables.map((row) => row.table_name)).toEqual([
      'first_table',
      'schema_migrations',
      'second_table',
    ])
  })

  test('重复运行是幂等的，第二次不再执行任何迁移', async () => {
    await writeFile(join(dir, '0001_first.sql'), 'create table first_table (id int primary key);')

    expect(await runMigrations(sql, dir, silentLog)).toEqual(['0001_first.sql'])
    expect(await runMigrations(sql, dir, silentLog)).toEqual([])
  })

  test('迁移失败时整体回滚，并且不记录', async () => {
    await writeFile(
      join(dir, '0001_broken.sql'),
      'create table will_rollback (id int primary key);\nselect * from not_exist_table;',
    )

    await expect(runMigrations(sql, dir, silentLog)).rejects.toThrow('迁移失败：0001_broken.sql')

    const recorded = await sql.query('select name from schema_migrations')
    expect(recorded).toHaveLength(0)

    const tables = await sql.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'will_rollback'",
    )
    expect(tables).toHaveLength(0)
  })

  test('仓库自带的 migrations 目录能成功应用（验证随包发布的迁移）', async () => {
    const migrationsDir = new URL('../migrations', import.meta.url).pathname

    const executed = await runMigrations(sql, migrationsDir, silentLog)

    expect(executed).toContain('0001_init.sql')
    // app_meta 表真实存在（否则这条查询会报错）
    const rows = await sql.query('select 1 from app_meta limit 1')
    expect(rows).toHaveLength(0)
  })
})
