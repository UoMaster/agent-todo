import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

const execFileAsync = promisify(execFile)

const CHECK_SCRIPT = fileURLToPath(new URL('../../../scripts/check-migrations.sh', import.meta.url))
const NEW_SCRIPT = fileURLToPath(new URL('../../../scripts/new-migration.sh', import.meta.url))

const MIGRATIONS_DIR = 'packages/server/migrations'

interface ScriptResult {
  code: number
  stdout: string
  stderr: string
}

/** 在指定目录里执行 sh 脚本（MIGRATIONS_ROOT 指过去，便于在临时仓库里验证） */
async function sh(
  script: string,
  args: string[],
  cwd: string,
  options: { minimalEnv?: boolean } = {},
): Promise<ScriptResult> {
  // minimalEnv 模拟 CI / 没有 LANG 的环境，用来暴露 locale 相关的脚本 bug
  const env = options.minimalEnv
    ? { PATH: process.env.PATH ?? '/usr/bin:/bin', MIGRATIONS_ROOT: cwd }
    : { ...process.env, MIGRATIONS_ROOT: cwd }

  try {
    const { stdout, stderr } = await execFileAsync('sh', [script, ...args], { cwd, env })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  })
  return stdout.trim()
}

/** 建一个带基线迁移脚本的临时 git 仓库 */
async function createFixtureRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'agent-todo-guard-'))
  await mkdir(join(repo, MIGRATIONS_DIR, 'schema'), { recursive: true })
  await mkdir(join(repo, MIGRATIONS_DIR, 'data'), { recursive: true })
  await writeFile(
    join(repo, MIGRATIONS_DIR, 'schema/20260101000001_init.sql'),
    'create table t (id int);',
  )
  await writeFile(
    join(repo, MIGRATIONS_DIR, 'schema/20260101000002_second.sql'),
    'create table t2 (id int);',
  )
  await git(['init', '-q'], repo)
  await git(['add', '-A'], repo)
  await git(['commit', '-qm', 'baseline'], repo)
  return repo
}

describe('迁移守护脚本（scripts/check-migrations.sh）', () => {
  let repo: string

  beforeEach(async () => {
    repo = await createFixtureRepo()
  })

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  test('合法新增脚本（暂存区）→ 通过', async () => {
    await writeFile(
      join(repo, MIGRATIONS_DIR, 'schema/20260202000000_add_more.sql'),
      'create table t2 (id int);',
    )
    await git(['add', '-A'], repo)

    const result = await sh(CHECK_SCRIPT, [], repo)

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('检查通过')
  })

  test('修改已有脚本 → 拦截', async () => {
    await writeFile(
      join(repo, MIGRATIONS_DIR, 'schema/20260101000001_init.sql'),
      'create table t (id bigint);',
    )
    await git(['add', '-A'], repo)

    const result = await sh(CHECK_SCRIPT, [], repo)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('只允许新增')
    expect(result.stderr).toContain('20260101000001_init.sql')
  })

  test('删除已有脚本 → 拦截', async () => {
    await git(['rm', '-q', `${MIGRATIONS_DIR}/schema/20260101000001_init.sql`], repo)

    const result = await sh(CHECK_SCRIPT, [], repo)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('只允许新增')
  })

  test('文件名缺少完整时间戳 → 拦截', async () => {
    await writeFile(join(repo, MIGRATIONS_DIR, 'schema/add_todos.sql'), 'create table t3 (id int);')
    await git(['add', '-A'], repo)

    const result = await sh(CHECK_SCRIPT, [], repo)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('14 位完整时间戳')
  })

  test('迁移目录混入非 .sql 文件 → 拦截', async () => {
    await writeFile(join(repo, MIGRATIONS_DIR, 'data/notes.md'), '# 不许放这个')
    await git(['add', '-A'], repo)

    const result = await sh(CHECK_SCRIPT, [], repo)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('只能放 .sql')
  })

  test('最小环境（没有 LANG）下也能工作 —— 回归：变量展开紧跟中文曾被 shell 误解析', async () => {
    await writeFile(
      join(repo, MIGRATIONS_DIR, 'schema/20260202000000_add_more.sql'),
      'create table t2 (id int);',
    )
    await git(['add', '-A'], repo)

    const result = await sh(CHECK_SCRIPT, [], repo, { minimalEnv: true })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('检查通过')
    expect(result.stderr).toBe('')
  })

  test('--base 模式：能检测提交历史里的修改（CI 用）', async () => {
    // 先提交一个脚本，把它作为基准（模拟已经合并过的脚本）
    await writeFile(
      join(repo, MIGRATIONS_DIR, 'data/20260202000000_seed.sql'),
      'insert into t values (1);',
    )
    await git(['add', '-A'], repo)
    await git(['commit', '-qm', 'add seed'], repo)
    const base = await git(['rev-parse', 'HEAD'], repo)

    // 基准之后「新增」脚本 → 通过（PR 内继续编辑自己新加的脚本不该被拦）
    await writeFile(
      join(repo, MIGRATIONS_DIR, 'data/20260203000000_more.sql'),
      'insert into t values (1);',
    )
    await git(['add', '-A'], repo)
    await git(['commit', '-qm', 'add more'], repo)
    expect((await sh(CHECK_SCRIPT, ['--base', base], repo)).code).toBe(0)

    // 基准之后「修改已存在的脚本」→ 拦截
    await writeFile(
      join(repo, MIGRATIONS_DIR, 'data/20260202000000_seed.sql'),
      'insert into t values (2);',
    )
    await git(['add', '-A'], repo)
    await git(['commit', '-qm', 'modify seed'], repo)

    const result = await sh(CHECK_SCRIPT, ['--base', base], repo)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('只允许新增')
    expect(result.stderr).toContain('20260202000000_seed.sql')
  })
})

describe('迁移脚本生成器（scripts/new-migration.sh）', () => {
  let repo: string

  beforeEach(async () => {
    repo = await createFixtureRepo()
  })

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  test('生成的脚本带 14 位时间戳，且立即能通过守护检查', async () => {
    const result = await sh(NEW_SCRIPT, ['schema', 'add_todos_table'], repo)

    expect(result.code).toBe(0)

    const files = await readdir(join(repo, MIGRATIONS_DIR, 'schema'))
    const created = files.filter((name) => name.includes('add_todos_table'))
    expect(created).toHaveLength(1)
    expect(created[0]).toMatch(/^\d{14}_add_todos_table\.sql$/)

    await git(['add', '-A'], repo)
    expect((await sh(CHECK_SCRIPT, [], repo)).code).toBe(0)
  })

  test('非法模块名或描述 → 直接报错', async () => {
    expect((await sh(NEW_SCRIPT, ['wrong', 'x'], repo)).code).toBe(2)
    expect((await sh(NEW_SCRIPT, ['schema', '中文描述'], repo)).code).toBe(2)
    expect((await sh(NEW_SCRIPT, ['schema'], repo)).code).toBe(2)
  })
})
