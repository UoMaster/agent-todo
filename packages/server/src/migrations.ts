import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SqlClient } from './db.ts'

const MIGRATIONS_TABLE = 'schema_migrations'

/**
 * 简易迁移器：
 * - 迁移文件是 `migrations/*.sql`，按文件名排序执行
 * - 每个文件包在一个事务里：失败整体回滚，且不记录
 * - 已执行的记录在 `schema_migrations` 表，重复运行是幂等的
 * - 返回本次实际执行的迁移文件名
 */
export async function runMigrations(
  sql: SqlClient,
  dir: string,
  log: Pick<Console, 'info'> = console,
): Promise<string[]> {
  await sql.exec(
    `create table if not exists ${MIGRATIONS_TABLE} (
      name text primary key,
      applied_at timestamptz not null default now()
    )`,
  )

  const rows = await sql.query<{ name: string }>(`select name from ${MIGRATIONS_TABLE}`)
  const applied = new Set(rows.map((row) => row.name))

  const files = (await readdir(dir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  const executed: string[] = []

  for (const file of files) {
    if (applied.has(file)) continue

    const body = await readFile(join(dir, file), 'utf8')

    await sql.exec('begin')
    try {
      await sql.exec(body)
      await sql.query(`insert into ${MIGRATIONS_TABLE} (name) values ($1)`, [file])
      await sql.exec('commit')
    } catch (error) {
      await sql.exec('rollback')
      throw new Error(`迁移失败：${file}`, { cause: error })
    }

    executed.push(file)
    log.info(`[migrate] 已应用 ${file}`)
  }

  if (executed.length === 0) log.info('[migrate] 数据库已是最新')
  return executed
}
