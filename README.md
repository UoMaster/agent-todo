# agent-todo

pnpm monorepo 骨架：**React Web 界面** + **Hono server** + **命令行客户端**，三者共享同一套类型（`@agent-todo/shared`）。

当前为初始化状态，只包含可运行的最小脚手架，业务功能待实现。

## 目录结构

```
agent-todo/
├── packages/
│   ├── shared/   # web / server / cli 共用的类型与工具（以 TS 源码形式被引用）
│   ├── server/   # HTTP API 服务（Hono，Node 原生运行 TS），默认端口 3001
│   ├── web/      # React 19 + Vite 8 前端（开发时自动代理 /api 到 server）
│   └── cli/      # 命令行客户端（citty，Node 原生运行 TS），通过 HTTP 调用 server
├── pnpm-workspace.yaml   # workspace 配置 + 依赖版本 catalog
├── tsconfig.base.json    # 各包共用的 TypeScript 配置
├── vitest.config.ts      # 统一测试入口（projects + 覆盖率）
└── package.json          # 根脚本入口
```

## 环境要求

- Node.js ≥ 22.18（本仓库在 Node 24 上验证；server / cli 依赖 Node 原生 TS 类型擦除）
- [pnpm](https://pnpm.io/) ≥ 10（当前锁定 pnpm@12.10.1）
- [Bun](https://bun.sh/)（**可选**）：仅作为更快的运行时替代，例如 `bun packages/server/src/index.ts`；不装也能跑通全部开发和测试

## 快速开始

```bash
pnpm install

# 一条命令同时启动 web + server
pnpm dev

# 或者分别启动
pnpm dev:server   # http://localhost:3001
pnpm dev:web      # http://localhost:5173
```

CLI（参数直接跟在 `pnpm cli` 后面）：

```bash
pnpm cli --help
```

## 常用脚本（根目录）

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动 web + server |
| `pnpm dev:web` / `pnpm dev:server` | 单独启动 |
| `pnpm cli` | 运行 CLI（参数直接跟在后面） |
| `pnpm verify` | 提交前门禁：check + lint + test + coverage（pre-commit 钩子与 CI 都跑它） |
| `pnpm test` | 全量测试（四个 project：shared / server / cli / web） |
| `pnpm coverage` | 带覆盖率报告（阈值 85%） |
| `pnpm build` | 构建所有包（目前只有 web 需要构建） |
| `pnpm check` | 全仓库 TypeScript 类型检查 |
| `pnpm lint` | oxlint 静态检查 |
| `pnpm clean` | 清理依赖、构建与测试产物 |

## 测试

测试分两层，统一跑在 Vitest 5 上，全部在 Node 运行时执行：

| 层级 | 文件 | 运行环境 | 覆盖内容 |
| --- | --- | --- | --- |
| 逻辑测试 | `packages/*/src/**/*.test.ts` | Node | 工具函数、server 进程内路由与真实 HTTP、CLI 命令解析与子进程执行 |
| 页面渲染测试 | `packages/web/src/**/*.test.tsx` | 真实浏览器（Chromium） | Vitest Browser Mode + Playwright，真实 DOM / 样式 / 事件 |

```bash
pnpm verify                  # 提交前门禁：check + lint + test + coverage（一条命令全绿）
pnpm test                    # 全量（四个 project）
pnpm test:watch              # 监听模式
pnpm test:web                # 只跑浏览器渲染测试
pnpm coverage                # 覆盖率报告（输出到 coverage/，阈值 85%）
pnpm test --project server   # 按 project 过滤
```

**测试规则（对人和 AI 同样生效，详见 `AGENTS.md`）**

- 所有功能点必须有对应测试：新增功能同时提交测试，修改行为同步更新测试，修 bug 先写复现测试
- **修改已提交功能必须做测试复盘**：为什么已有测试没拦住？同类盲区一起补，结论写进提交信息并沉淀到各包 `AGENTS.md` 的「测试盲区台账」
- 提交前测试必须全部通过：`pnpm install` 时会自动配置 **pre-commit 钩子**（`.githooks/pre-commit`），不通过无法提交
- **CI 门禁**：`.github/workflows/ci.yml` 在 push / PR 时跑同一套 `pnpm verify` + 构建
- 覆盖率基线 **85%**，新增代码不得拉低

单包运行：

```bash
pnpm --filter @agent-todo/shared test
pnpm --filter @agent-todo/server test
pnpm --filter @agent-todo/cli test
pnpm --filter @agent-todo/web test
pnpm --filter @agent-todo/web test:browser   # 打开真实浏览器窗口跑（调试用）
```

几点说明：

- **运行环境一致**：server 的代码与测试都跑在 Node 上（Hono 的 `app.request()` 与 `@hono/node-server` 均与运行时无关），不需要为了测试切换运行时。
- **浏览器测试**依赖 Playwright 的 Chromium，首次使用需要 `pnpm --filter @agent-todo/web exec playwright install chromium`（本机已缓存）。它使用 `vitest-browser-react` 的 locators API（`getByRole`、`getByText`、`expect.element(...).toBeVisible()`）。
- **覆盖率**统一在根 `vitest.config.ts` 配置，provider 用 **istanbul**（纯 JS 插桩，Node 与浏览器两种执行环境都能正确统计）。启动入口（`src/index.ts`、`main.tsx`）不计入行覆盖率，由子进程 e2e 测试覆盖。
- 测试文件与源码同级存放（`xxx.test.ts` 紧挨 `xxx.ts`），便于就近维护。

## 依赖版本管理

公共依赖版本统一维护在 `pnpm-workspace.yaml` 的 `catalog` 中，各包通过 `"catalog:"` 引用，升级时只改一处。

## 说明

- server 与 cli 直接以 TS 源码运行，由 **Node 原生类型擦除**（type stripping）执行，无需构建；`tsconfig.base.json` 里的 `erasableSyntaxOnly` 保证了这一点。想用 Bun 跑也是同样的源码。
- 前端 dev 服务器的 `/api` 请求会代理到 `http://localhost:3001`，可通过 `AGENT_TODO_SERVER` 环境变量覆盖。
- 面向 AI 编码助手的项目约定见根目录与各包的 `AGENTS.md`。

## 常见问题

- **3000 端口被占用**：本机已有其他服务（Nuxt SSR）监听 3000，因此默认端口改为 **3001**。需要修改时复制 `packages/server/.env.example` 为 `packages/server/.env` 并调整 `PORT`。
- **系统代理影响本机请求**：如果 shell 里设置了 `http_proxy` / `https_proxy`，用 Bun 运行 `fetch` 访问 `localhost` 时会走代理（返回 502）。解决方式是在 `.env` 中设置 `NO_PROXY=localhost,127.0.0.1`（`packages/cli/.env` 已按此配置）；curl 调试时可加 `--noproxy '*'`。Node 的 `fetch` 不受影响。
