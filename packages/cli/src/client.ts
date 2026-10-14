// HTTP 客户端入口：集中解析 server 地址，并支持测试注入 fetch。

import { createClient, type AgentTodoClient } from '@agent-todo/shared'
import { resolveServerUrl } from './utils.ts'

/** 测试注入的 fetch 实现；未设置时用全局 fetch */
let fetchImpl: typeof fetch | undefined

/** 测试用：替换底层 fetch（让命令单测不依赖真实 server） */
export function setFetchImpl(impl: typeof fetch | undefined): void {
  fetchImpl = impl
}

/** 测试用：恢复为全局 fetch */
export function resetFetchImpl(): void {
  fetchImpl = undefined
}

/** 按全局参数创建客户端；每个命令只调一次，复用同一份地址解析 */
export function getClient(args: { server?: string }): AgentTodoClient {
  return createClient({ baseUrl: resolveServerUrl(args.server), fetch: fetchImpl })
}
