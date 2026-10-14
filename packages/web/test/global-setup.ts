import { startFakeServer, type FakeServer } from './fake-server.ts'

/**
 * Vitest globalSetup（跑在 Node 里，整个 web 测试会话只执行一次）。
 *
 * 浏览器测试需要真 HTTP 后端（覆盖 fetch / FormData / 错误处理），但测试本身跑在浏览器里，
 * 起不了 node:http 服务。所以把假 server 放在这里启动，测试通过 `/__test/*` 控制端点操作它。
 * 这里导出的 url 通过 vitest 的 provide/inject 传给测试（见 vitest.config.ts）。
 */
export default async function setup({ provide }: { provide: (key: string, value: string) => void }) {
  const server: FakeServer = await startFakeServer()
  provide('fakeServerUrl', server.origin)

  return async () => {
    await server.close()
  }
}
