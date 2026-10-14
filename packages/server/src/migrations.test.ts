import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { SqlClient } from './db.ts'
import { MIGRATIONS_TABLE, runMigrations } from './migrations.ts'

/**
 * 迁移系统跑在 PGlite 上（真 Postgres 编译成的 WASM，进程内运行），
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

describe('迁移系统（schema / data 两模块）', () => {
  let db: PGlite
  let sql: SqlClient
  let dir: string

  beforeEach(async () => {
    db = new PGlite()
    sql = pgliteClient(db)
    dir = await mkdtemp(join(tmpdir(), 'agent-todo-migrations-'))
    await mkdir(join(dir, 'schema'), { recursive: true })
    await mkdir(join(dir, 'data'), { recursive: true })
  })

  afterEach(async () => {
    await db.close()
    await rm(dir, { recursive: true, force: true })
  })

  async function writeMigration(module: 'schema' | 'data', name: string, body: string) {
    await writeFile(join(dir, module, name), body)
  }

  test('先执行 schema，再执行 data；模块内按时间戳排序', async () => {
    // data 的时间戳比 schema 更早，但因为模块顺序，仍然最后执行；
    // 而且它依赖 schema 建的表，能执行成功本身就证明了顺序正确
    await writeMigration(
      'data',
      '20250101000000_early_data.sql',
      "insert into order_log (note) values ('from-data-module');",
    )
    await writeMigration('schema', '20260101000002_create_log.sql', 'create table order_log (id serial primary key, note text);')
    await writeMigration('schema', '20260101000001_create_meta.sql', 'create table meta_a (id int);')

    const executed = await runMigrations(sql, { dir, log: silentLog })

    expect(executed).toEqual([
      'schema/20260101000001_create_meta.sql',
      'schema/20260101000002_create_log.sql',
      'data/20250101000000_early_data.sql',
    ])

    const rows = await sql.query<{ note: string }>('select note from order_log')
    expect(rows.map((row) => row.note)).toEqual(['from-data-module'])
  })

  test('重复运行是幂等的，第二次不再执行任何迁移', async () => {
    await writeMigration('schema', '20260101000001_create_meta.sql', 'create table meta_a (id int);')

    expect(await runMigrations(sql, { dir, log: silentLog })).toEqual([
      'schema/20260101000001_create_meta.sql',
    ])
    expect(await runMigrations(sql, { dir, log: silentLog })).toEqual([])
  })

  test('迁移失败时整体回滚，并且不记录', async () => {
    await writeMigration(
      'schema',
      '20260101000001_broken.sql',
      'create table will_rollback (id int primary key);\nselect * from not_exist_table;',
    )

    await expect(runMigrations(sql, { dir, log: silentLog })).rejects.toThrow(
      '迁移失败：schema/20260101000001_broken.sql',
    )

    const recorded = await sql.query(`select path from ${MIGRATIONS_TABLE}`)
    expect(recorded).toHaveLength(0)

    const tables = await sql.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'will_rollback'",
    )
    expect(tables).toHaveLength(0)
  })

  test('修改已执行过的脚本会报错（内容 checksum 校验）', async () => {
    await writeMigration('schema', '20260101000001_create_meta.sql', 'create table meta_a (id int);')
    await runMigrations(sql, { dir, log: silentLog })

    // 违规操作：改老脚本
    await writeMigration(
      'schema',
      '20260101000001_create_meta.sql',
      'create table meta_a (id int, extra text);',
    )

    await expect(runMigrations(sql, { dir, log: silentLog })).rejects.toThrow('迁移脚本被修改')
  })

  test('删除已执行过的脚本会报错', async () => {
    await writeMigration('schema', '20260101000001_create_meta.sql', 'create table meta_a (id int);')
    await writeMigration('schema', '20260101000002_create_more.sql', 'create table meta_b (id int);')
    await runMigrations(sql, { dir, log: silentLog })

    await rm(join(dir, 'schema/20260101000002_create_more.sql'))

    await expect(runMigrations(sql, { dir, log: silentLog })).rejects.toThrow('在磁盘上找不到了')
  })

  test('文件名不符合「14 位时间戳_描述.sql」时报错', async () => {
    await writeMigration('schema', 'create_meta.sql', 'create table meta_a (id int);')

    await expect(runMigrations(sql, { dir, log: silentLog })).rejects.toThrow('文件名不合法')
  })

  test('记录表里带上模块与 checksum', async () => {
    await writeMigration('schema', '20260101000001_create_meta.sql', 'create table meta_a (id int);')
    await writeMigration('data', '20260101000002_seed.sql', "insert into meta_a (id) values (1);")

    await runMigrations(sql, { dir, log: silentLog })

    const rows = await sql.query<{ path: string; module: string; checksum: string }>(
      `select path, module, checksum from ${MIGRATIONS_TABLE} order by path`,
    )
    expect(rows.map((row) => [row.path, row.module])).toEqual([
      ['data/20260101000002_seed.sql', 'data'],
      ['schema/20260101000001_create_meta.sql', 'schema'],
    ])
    for (const row of rows) {
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  test('仓库自带的 migrations 目录能成功应用（随包发布的迁移）', async () => {
    const migrationsDir = new URL('../migrations', import.meta.url).pathname

    const executed = await runMigrations(sql, { dir: migrationsDir, log: silentLog })

    expect(executed.some((path) => path.startsWith('schema/'))).toBe(true)
    expect(executed.some((path) => path.startsWith('data/'))).toBe(true)

    // 基线建表 + 种子数据都真实生效
    const rows = await sql.query<{ value: { name: string } }>(
      "select value from app_meta where key = 'project'",
    )
    expect(rows[0]?.value.name).toBe('agent-todo')
  })
})
