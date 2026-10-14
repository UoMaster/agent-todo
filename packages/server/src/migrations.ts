import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SqlClient } from './db.ts'

/**
 * 迁移系统分两个模块，**按此顺序执行**：
 * - `schema`：库表升级（DDL）
 * - `data`  ：刷数据（DML）
 *
 * 规则（由 `scripts/check-migrations.sh` 用 git 强制，不只是口头约定）：
 * - 只允许新增脚本；禁止修改、删除、重命名已有脚本
 * - 文件名必须是 `<14 位完整时间戳>_<描述>.sql`（如 20261014142746_init.sql）
 * - 同一模块内按文件名（即时间戳）排序执行
 *
 * 已执行的脚本记录在 `migration_runs` 表（含内容 sha256）：
 * - 修改已执行脚本 → 运行时 checksum 校验失败（第二道防线）
 * - 删除已执行脚本 → 运行时直接报错
 */
export const MIGRATION_MODULES = ['schema', 'data'] as const
export type MigrationModule = (typeof MIGRATION_MODULES)[number]

/** 文件名规则：14 位时间戳（YYYYMMDDHHmmss）+ 描述 */
export const MIGRATION_FILE_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/

export const MIGRATIONS_TABLE = 'migration_runs'

export interface MigrationScript {
  module: MigrationModule
  name: string
  /** 相对迁移根目录的路径，如 schema/20261014142746_init.sql */
  path: string
  /** 文件内容 */
  body: string
  /** 内容 sha256 */
  checksum: string
}

export function checksumOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** 扫描模块目录、校验文件名，返回按执行顺序排列的脚本 */
export async function discoverMigrations(
  rootDir: string,
  modules: readonly MigrationModule[] = MIGRATION_MODULES,
): Promise<MigrationScript[]> {
  const scripts: MigrationScript[] = []

  for (const module of modules) {
    const dir = join(rootDir, module)
    const names = (await readdir(dir))
      .filter((name) => name.endsWith('.sql'))
      .sort()

    for (const name of names) {
      if (!MIGRATION_FILE_PATTERN.test(name)) {
        throw new Error(
          `迁移文件名不合法：${module}/${name}（必须形如 20261014142746_description.sql，14 位完整时间戳）`,
        )
      }

      const body = await readFile(join(dir, name), 'utf8')
      scripts.push({ module, name, path: `${module}/${name}`, body, checksum: checksumOf(body) })
    }
  }

  return scripts
}

export interface RunMigrationsOptions {
  /** 迁移根目录（下有 schema/ 与 data/ 两个子目录） */
  dir: string
  log?: Pick<Console, 'info'>
}

/** 依次执行未运行的迁移（失败回滚），返回本次执行的脚本路径 */
export async function runMigrations(sql: SqlClient, options: RunMigrationsOptions): Promise<string[]> {
  const { dir, log = console } = options

  await sql.exec(
    `create table if not exists ${MIGRATIONS_TABLE} (
      path text primary key,
      module text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`,
  )

  const scripts = await discoverMigrations(dir)
  const appliedRows = await sql.query<{ path: string; checksum: string }>(
    `select path, checksum from ${MIGRATIONS_TABLE}`,
  )
  const applied = new Map(appliedRows.map((row) => [row.path, row.checksum]))

  // 防线一：已执行的脚本不允许被修改（内容变了 checksum 就对不上）
  for (const script of scripts) {
    const previous = applied.get(script.path)
    if (previous && previous !== script.checksum) {
      throw new Error(`迁移脚本被修改：${script.path}（已执行过的脚本不允许改动，请新增脚本）`)
    }
  }

  // 防线二：已执行的脚本不允许消失（删除 / 重命名）
  const onDisk = new Set(scripts.map((script) => script.path))
  const missing = [...applied.keys()].filter((path) => !onDisk.has(path))
  if (missing.length > 0) {
    throw new Error(`已执行的迁移脚本在磁盘上找不到了：${missing.join('、')}（不允许删除迁移脚本）`)
  }

  const executed: string[] = []

  for (const script of scripts) {
    if (applied.has(script.path)) continue

    await sql.exec('begin')
    try {
      await sql.exec(script.body)
      await sql.query(`insert into ${MIGRATIONS_TABLE} (path, module, checksum) values ($1, $2, $3)`, [
        script.path,
        script.module,
        script.checksum,
      ])
      await sql.exec('commit')
    } catch (error) {
      await sql.exec('rollback')
      throw new Error(`迁移失败：${script.path}`, { cause: error })
    }

    executed.push(script.path)
    log.info(`[migrate] 已应用 ${script.path}`)
  }

  if (executed.length === 0) log.info('[migrate] 数据库已是最新')
  return executed
}
