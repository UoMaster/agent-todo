import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createApp } from './app.ts'

const HTML = '<!doctype html><html><body><div id="root">SPA-INDEX</div></body></html>'
const CSS = '.logo { color: red; }'

describe('纯 API 模式（未设置 STATIC_DIR）', () => {
  const app = createApp()

  test('GET / 返回服务标识', async () => {
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('agent-todo server')
  })

  test('未知路由返回 JSON 404', async () => {
    const response = await app.request('/api/not-exist')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'not_found',
      message: '接口不存在：/api/not-exist',
    })
  })
})

describe('静态托管模式（设置了 STATIC_DIR，生产 / 容器场景）', () => {
  let staticDir: string
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    staticDir = await mkdtemp(join(tmpdir(), 'agent-todo-static-'))
    await writeFile(join(staticDir, 'index.html'), HTML)
    await writeFile(join(staticDir, 'assets.css'), CSS)
    app = createApp({ staticDir })
  })

  afterAll(async () => {
    await rm(staticDir, { recursive: true, force: true })
  })

  test('GET / 返回 index.html', async () => {
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toBe(HTML)
  })

  test('静态文件按路径返回', async () => {
    const response = await app.request('/assets.css')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(CSS)
  })

  test('未知的前端路由走 SPA 兜底，返回 index.html', async () => {
    const response = await app.request('/settings/profile')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(HTML)
  })

  test('未知的 /api 路由仍然返回 JSON 404，不会被 SPA 兜底吞掉', async () => {
    const response = await app.request('/api/not-exist')

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      error: 'not_found',
      message: '接口不存在：/api/not-exist',
    })
  })

  test('非 GET 的未知路由返回 JSON 404（不做 SPA 兜底）', async () => {
    const response = await app.request('/settings/profile', { method: 'POST' })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'not_found',
      message: '接口不存在：/settings/profile',
    })
  })

  test('静态目录里没有 index.html 时，SPA 兜底退化为 JSON 404（不返回 500）', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'agent-todo-static-empty-'))
    try {
      const bareApp = createApp({ staticDir: emptyDir })
      const response = await bareApp.request('/some/route')

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'not_found',
        message: '接口不存在：/some/route',
      })
    } finally {
      await rm(emptyDir, { recursive: true, force: true })
    }
  })
})

describe('GET /api/health', () => {
  interface HealthBody {
    ok: boolean
    name: string
    uptime: number
    time: string
    db: { ok: boolean; error?: string }
  }

  test('数据库正常时返回 200，db.ok = true', async () => {
    const app = createApp({ dbPing: async () => ({ ok: true }) })
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    const body = (await response.json()) as HealthBody
    expect(body).toMatchObject({ ok: true, name: 'agent-todo', db: { ok: true } })
    expect(typeof body.uptime).toBe('number')
    expect(typeof body.time).toBe('string')
  })

  test('数据库异常时仍返回 200（进程存活），但 db.ok = false 并带错误信息', async () => {
    const app = createApp({ dbPing: async () => ({ ok: false, error: '连接被拒绝' }) })
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, db: { ok: false, error: '连接被拒绝' } })
  })

  test('探活实现抛异常时被兜住，不会 500', async () => {
    const app = createApp({
      dbPing: async () => {
        throw new Error('boom')
      },
    })
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, db: { ok: false, error: 'boom' } })
  })
})
