import { serve } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { app } from './app.ts'

/**
 * 真实 HTTP 集成测试：监听随机端口，再用 fetch 访问，
 * 覆盖「启动 → 监听 → 响应 → 关闭」的完整链路。
 */
describe('server 集成测试（真实 HTTP）', () => {
  let server: ReturnType<typeof serve>
  let baseUrl: string

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      // port: 0 表示由系统分配空闲端口，避免和本机其他服务冲突
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        baseUrl = `http://127.0.0.1:${info.port}`
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  test('通过 HTTP 访问首页', async () => {
    const response = await fetch(baseUrl)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('agent-todo server')
  })
})
