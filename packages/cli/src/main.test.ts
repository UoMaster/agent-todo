import { renderUsage, runCommand, runMain } from 'citty'
import { afterEach, expect, test, vi } from 'vitest'
import { main } from './main.ts'

/** 进程内测试：直接跑命令定义，验证解析与输出 */
afterEach(() => {
  vi.restoreAllMocks()
})

test('不带子命令时输出占位提示', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})

  await runCommand(main, { rawArgs: [] })

  expect(log).toHaveBeenCalledWith(expect.stringContaining('agent-todo CLI 已就绪'))
})

test('--version 输出版本号', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})

  await runMain(main, { rawArgs: ['--version'] })

  expect(log).toHaveBeenCalledWith(expect.stringContaining('0.1.0'))
})

test('帮助信息里包含命令名（renderUsage 是纯函数）', async () => {
  const usage = await renderUsage(main)

  expect(usage).toContain('agent-todo')
  expect(usage).toContain('USAGE')
})
