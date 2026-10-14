# AGENTS.md — packages/cli

命令行客户端（citty），通过 HTTP 调用 server。

## 结构约定

- `src/main.ts` — 命令定义（导出 `main`），可直接被测试 import；子命令统一在 `subCommands` 注册
- `src/index.ts` — 仅 `runMain(main)`；带 `#!/usr/bin/env node` shebang，**保持可执行权限**（chmod +x）
- `src/commands/<name>.ts` — 每个子命令一个文件，默认导出 `defineCommand({...})`
- `src/args.ts` — 全局参数定义（`--server` / `--json`），所有子命令各声明一份
- `src/client.ts` — `getClient(args)` 创建 HTTP 客户端；测试用 `setFetchImpl` / `resetFetchImpl` 注入 fetch
- `src/globals.ts` — 「写在子命令名之前」的全局参数兜底（citty 不把父命令参数传给子命令）
- `src/utils.ts` — 参数校验、人类可读渲染、错误出口等公共纯函数
- bin 名 `agent-todo`，指向 `./src/index.ts`（Node 原生跑 TS，不要改成构建产物或 js 文件）

### citty 0.2 已知行为（实现时注意）

- 不支持数组类型参数：`--tag a --tag b` 只会解析到最后一个，可重复参数必须从 `rawArgs` 收集（见 `utils.collectRepeatedArg`）
- 子命令只会收到「子命令名之后」的参数；父命令的 `setup` 先于子命令执行（`globals.ts` 借此兜底全局参数）
- 父命令的 `run` 会在子命令执行完之后再执行一次；`main.run` 用「rawArgs 是否含子命令名」判断，只在没写子命令时打印用法
- `--no-xxx` 会解析成 `args.xxx === false`（所以 `--no-range` / `--no-date` 对应的参数名是 `range` / `date`）

## 行为约定（实现业务时遵守）

- 通用参数：`--server <url>`（默认读 `AGENT_TODO_SERVER`，兜底 `http://localhost:3001`）、`--json`（机器可读输出，方便 agent / 脚本消费）；写在子命令名前后都可以
- `update` 必须「先 GET 再合并」：`PUT /api/todos/:id` 是整条替换语义；未指定 `--subtask` 时要把现有子任务（含 id）带上，否则会被整体删除；附件不受 PUT 影响
- 错误处理：捕获 shared 的 `ApiError`，输出人类可读信息，退出码非 0；不要把堆栈直接扔给用户；命令 `run` 统一包在 `utils.runSafely` 里（库代码不直接 `process.exit`）
- 需要访问本机 server 时依赖 `packages/cli/.env` 的 `NO_PROXY`（**仅用 Bun 运行时需要**；Node 的 `fetch` 不受系统代理影响，且 Node 不读取 `.env`，运行 `pnpm cli` 时无需任何额外配置）

## 在宿主机使用（不进镜像）

CLI 是客户端工具，组件不打包进镜像；正确姿势是生成全局启动器，指向容器转发出来的端口：

```bash
pnpm cli:link        # 在 $PNPM_HOME 生成 agent-todo 启动器（pnpm 12 已移除 link --global）
agent-todo --help    # 任意目录可用
agent-todo <命令> --server http://localhost:3001        # 默认就是 3001，可省略
```

- 启动器直接执行仓库里的 TS 源码，改代码即时生效；**仓库路径变化后重新 `pnpm cli:link`**
- 指向 Docker 中的 server 时无需额外配置（compose 已把 3001 映射到宿主机）；自定义端口用 `--server` 或 `AGENT_TODO_SERVER`
- 取消：`pnpm cli:unlink`（只删除本仓库生成的启动器）

## 命令

- 运行：`pnpm cli --help`（根目录，参数直接跟）或直接执行 `./packages/cli/src/index.ts --help`
- `pnpm --filter @agent-todo/cli check` / `test`

## 测试要求（硬性）

- **每个子命令都必须有两类测试，缺一不可**：
  - `src/main.test.ts` — 进程内 `runCommand` / `runMain` + `console` spy（验证参数解析、输出内容、`--json` 输出形态）；用 `client.setFetchImpl(stub)` 注入 fetch（`Response` 造响应），**不依赖真实 server**；afterEach 记得 `resetFetchImpl` / `resetParentGlobalArgs` 并重置 `process.exitCode`
  - `src/cli.e2e.test.ts` — `spawn(process.execPath, [entry, ...args])` 真子进程，对着真 server：测试内用 PGlite + `@agent-todo/server` 的 `createTestContext`（devDependency）起随机端口，通过 `AGENT_TODO_SERVER` / `--server` 指向它；验证 shebang、参数、退出码、stdout / stderr 与完整业务流
- `src/utils.test.ts` / `src/client.test.ts` — 公共函数与客户端工厂的单测
- 每个命令至少覆盖：正常执行 + 错误路径（参数非法、连不上 server、服务端业务错误码）
- 新增子命令时，两类测试与命令实现放在同一个提交里

## 测试盲区台账

每次「测试复盘」的结论追加到这里（格式：现象 → 为什么没测到 → 已加固的用例/规则）。

- **`--version` 在进程内测试无输出**（脚手架阶段）：citty 的 `--version` 由 `runMain` 处理，用 `runCommand` 测试时走到了占位 run 分支 → 没测到的原因：**进程内测试选错了入口**，与用户真实执行路径不一致 → **已加固**：进程内版本测试改用 `runMain`，同时用 `spawn(process.execPath)` 的 e2e 走真实入口；今后凡是"入口/框架行为"相关断言，以子进程 e2e 为准
