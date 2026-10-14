# AGENTS.md — packages/cli

命令行客户端（citty），通过 HTTP 调用 server。

## 结构约定

- `src/main.ts` — 命令定义（导出 `main`），可直接被测试 import
- `src/index.ts` — 仅 `runMain(main)`；带 `#!/usr/bin/env node` shebang，**保持可执行权限**（chmod +x）
- 子命令放 `src/commands/<name>.ts`，默认导出 `defineCommand({...})`，并在 `main.ts` 的 `subCommands` 注册
- bin 名 `agent-todo`，指向 `./src/index.ts`（Node 原生跑 TS，不要改成构建产物或 js 文件）

## 行为约定（实现业务时遵守）

- 通用参数：`--server <url>`（默认 `AGENT_TODO_SERVER`，兜底 `http://localhost:3001`）、`--json`（机器可读输出，方便 agent / 脚本消费）
- 错误处理：捕获 shared 的 `ApiError`，输出人类可读信息，退出码非 0；不要把堆栈直接扔给用户
- 需要访问本机 server 时依赖 `packages/cli/.env` 的 `NO_PROXY`（**仅用 Bun 运行时需要**；Node 的 `fetch` 不受系统代理影响，且 Node 不读取 `.env`，运行 `pnpm cli` 时无需任何额外配置）

## 命令与测试

- 运行：`pnpm cli --help`（根目录，参数直接跟）或直接执行 `./packages/cli/src/index.ts --help`
- `pnpm --filter @agent-todo/cli check` / `test`
- 测试两件套，**新增子命令必须同时补两类**：
  - `src/main.test.ts` — 进程内 `runCommand` / `runMain` + `console` spy（快，验证解析与输出）
  - `src/cli.e2e.test.ts` — `spawn(process.execPath, [entry, ...args])` 真子进程（验证 shebang、参数、退出码、stdout）
