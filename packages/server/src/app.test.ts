import { describe, expect, test } from 'vitest'
import { app } from './app.ts'

/**
 * 进程内路由测试：直接调用 app.request()，
 * 不占用真实端口，速度最快。
 */
describe('GET /（进程内）', () => {
  test('返回服务标识', async () => {
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('agent-todo server')
  })

  test('未知路由返回 404', async () => {
    const response = await app.request('/api/not-exist')

    expect(response.status).toBe(404)
  })
})
