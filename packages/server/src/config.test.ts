import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { defaultMigrationsDir, defaultUploadsDir } from './config.ts'

/**
 * 默认路径的回归测试。
 *
 * 背景：本机开发的上传目录曾经是 `packages/server/.data/uploads`，与 Docker 的
 * bind mount（仓库根 `./data/uploads`）不是同一个目录，导致「本机传的附件容器里看不到」。
 * 这里锁死「默认上传目录 = 仓库根 data/uploads」，并交叉校验 docker-compose 的挂载配置，
 * 避免两边再次漂移。
 */
const repoRoot = resolve(import.meta.dirname, '../../..')

describe('默认上传目录', () => {
  test('指向仓库根的 data/uploads（与 Docker bind mount 一致）', () => {
    expect(defaultUploadsDir()).toBe(join(repoRoot, 'data/uploads'))
    expect(isAbsolute(defaultUploadsDir())).toBe(true)
  })

  test('该目录真实存在（.gitkeep 占位，保证全新 clone 也有）', () => {
    expect(existsSync(defaultUploadsDir())).toBe(true)
    expect(statSync(defaultUploadsDir()).isDirectory()).toBe(true)
    expect(existsSync(join(defaultUploadsDir(), '.gitkeep'))).toBe(true)
  })

  test('docker-compose 把同一目录挂载给容器（两边不会漂移）', async () => {
    const compose = await import('node:fs/promises').then((fs) =>
      fs.readFile(join(repoRoot, 'docker-compose.yml'), 'utf8'),
    )

    expect(compose).toContain('./data/uploads:/data/uploads')
    // 容器里通过 UPLOADS_DIR 指到挂载点
    expect(compose).toContain('UPLOADS_DIR: /data/uploads')
  })
})

describe('默认迁移目录', () => {
  test('指向 packages/server/migrations，且含有 schema / data 两个模块', () => {
    expect(defaultMigrationsDir()).toBe(join(repoRoot, 'packages/server/migrations'))
    expect(existsSync(join(defaultMigrationsDir(), 'schema'))).toBe(true)
    expect(existsSync(join(defaultMigrationsDir(), 'data'))).toBe(true)
  })
})
