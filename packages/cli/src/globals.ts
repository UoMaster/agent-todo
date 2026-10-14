// 全局参数（--server / --json）的兜底传递。
// citty 的子命令只会收到「子命令名之后」的参数，父命令解析到的全局参数不会自动下发；
// 因此父命令在 setup 里暂存一份，子命令解析不到时回退到它，
// 这样 `agent-todo --json list` 与 `agent-todo list --json` 都可用。

export interface GlobalArgs {
  server?: string
  json?: boolean
}

let parentArgs: GlobalArgs = {}

/** 父命令（main）setup 时调用：暂存父命令解析到的全局参数 */
export function setParentGlobalArgs(args: GlobalArgs): void {
  parentArgs = { ...args }
}

/** 测试用：清空暂存，避免用例之间互相影响 */
export function resetParentGlobalArgs(): void {
  parentArgs = {}
}

/** 合并父命令与子命令的全局参数（子命令显式传入的优先） */
export function resolveGlobalArgs(args: {
  server?: unknown
  json?: unknown
}): { server?: string; json: boolean } {
  const server =
    typeof args.server === 'string' && args.server.trim() ? args.server : parentArgs.server

  return {
    server,
    json: args.json === true || parentArgs.json === true,
  }
}
