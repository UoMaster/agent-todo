// client 工厂测试：验证 fetch 注入与 server 地址解析（不打真实网络）。

import { afterEach, expect, test, vi } from 'vitest'
import { getClient, resetFetchImpl, setFetchImpl } from './client.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetFetchImpl()
})

test('getClient 使用注入的 fetch 与解析后的 server 地址', async () => {
  const urls: string[] = []
  setFetchImpl(async (input) => {
    urls.push(String(input))
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
  })

  const todos = await getClient({ server: 'http://example.test:1234/' }).listTodos()

  expect(todos).toEqual([])
  expect(urls).toEqual(['http://example.test:1234/api/todos'])
})

test('resetFetchImpl 后回退到全局 fetch', async () => {
  setFetchImpl(async () => {
    throw new Error('注入的 fetch 不应被调用')
  })
  resetFetchImpl()

  const stub = vi.fn(async () =>
    new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', stub)

  await getClient({ server: 'http://example.test' }).listTodos()

  expect(stub).toHaveBeenCalledTimes(1)
})
