import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const entry = fileURLToPath(new URL('./index.ts', import.meta.url))

interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

/** 以子进程方式真实执行 CLI（spawn 当前 Node），验证用户实际运行的那条路径 */
function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('CLI 子进程集成测试', () => {
  test('--help 输出用法说明并正常退出', async () => {
    const { code, stdout } = await runCli(['--help'])

    expect(code).toBe(0)
    expect(stdout).toContain('agent-todo')
    expect(stdout).toContain('USAGE')
  })

  test('--version 输出版本号并正常退出', async () => {
    const { code, stdout } = await runCli(['--version'])

    expect(code).toBe(0)
    expect(stdout.trim()).toBe('0.1.0')
  })
})
