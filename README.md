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

# 一键开发：自动拉起 Postgres（Docker）+ 本地启动 web + server（带热更新）
pnpm dev:all

# 或者手动分别启动（需要先有 Postgres，见下方 Docker 章节）
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
| `pnpm dev:all` | **一键开发**：Postgres（Docker）+ web + server（本地热更新） |
| `pnpm dev` | 只并行启动 web + server（不含数据库） |
| `pnpm dev:web` / `pnpm dev:server` | 单独启动 |
| `pnpm cli` | 运行 CLI（参数直接跟在后面） |
| `pnpm cli:link` / `pnpm cli:unlink` | 把 CLI 链接到全局（宿主机直接用 `agent-todo`） |
| `pnpm docker:up` | 构建并启动完整容器栈（app + db） |
| `pnpm docker:down` | 停止容器栈 |
| `pnpm docker:logs` | 跟踪 app 容器日志 |
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

## Docker 部署

一个镜像搞定 web + server（前端构建产物由 server 托管），Postgres 用官方镜像单独跑，`docker compose` 一键拉起：

```bash
pnpm docker:up      # = docker compose up -d --build
# 打开 http://localhost:3001 就是完整应用（界面 + API）
pnpm docker:logs    # 跟踪日志
pnpm docker:down    # 停止
```

**端口**

| 端口 | 服务 | 说明 |
| --- | --- | --- |
| 3001 | app（web + API） | `http://localhost:3001`，`/api/*` 是接口，其余是前端 |
| 5432 | Postgres | 方便本机用 psql 直连调试（不需要可在 compose 里删掉端口映射） |

```bash
# 本机 psql 连接容器里的数据库
psql postgres://agent_todo:agent_todo_dev@localhost:5432/agent_todo
```

**数据卷（容器重建数据不丢）**

| 卷 | 位置 | 内容 |
| --- | --- | --- |
| `pgdata`（命名卷） | Docker 管理 | Postgres 数据 |
| `./data/uploads`（bind mount） | 宿主机目录 | 上传文件（为后续图片上传预留） |

默认密码/端口在根目录 `.env`（复制 `.env.example`）里改。

**镜像内容**：web 构建产物 + server（含 `migrations/` 迁移文件，启动时自动执行）。**CLI 不在镜像里**——它是客户端工具，在宿主机上跑（见下）。

## CLI 使用（宿主机）

CLI 是客户端程序，不进容器，也不需要端口转发；链接到全局后，请求指向 Docker 转发出来的端口即可：

```bash
pnpm cli:link        # 生成全局启动器，之后任意目录可用 agent-todo
agent-todo --help

# 指向容器里的 server（默认就是 http://localhost:3001）
agent-todo <命令> --server http://localhost:3001
AGENT_TODO_SERVER=http://localhost:3001 agent-todo <命令>

pnpm cli:unlink      # 移除
```

> 说明：pnpm 12 移除了 `pnpm link --global`，且新版全局 bin 目录（`$PNPM_HOME/bin`）默认不在 PATH 里。`pnpm cli:link` 会改为在 `$PNPM_HOME`（已在 PATH）下生成一个薄启动器，直接运行仓库里的 TS 源码（Node 原生类型擦除），**改代码即时生效**；仓库路径变化后重新执行一次即可。

## 依赖版本管理

公共依赖版本统一维护在 `pnpm-workspace.yaml` 的 `catalog` 中，各包通过 `"catalog:"` 引用，升级时只改一处。

## 说明

- server 与 cli 直接以 TS 源码运行，由 **Node 原生类型擦除**（type stripping）执行，无需构建；`tsconfig.base.json` 里的 `erasableSyntaxOnly` 保证了这一点。想用 Bun 跑也是同样的源码。
- 前端 dev 服务器的 `/api` 请求会代理到 `http://localhost:3001`，可通过 `AGENT_TODO_SERVER` 环境变量覆盖。
- 面向 AI 编码助手的项目约定见根目录与各包的 `AGENTS.md`。

## 常见问题

- **3000 端口被占用**：本机已有其他服务（Nuxt SSR）监听 3000，因此默认端口改为 **3001**。需要修改时复制 `packages/server/.env.example` 为 `packages/server/.env` 并调整 `PORT`（容器里改根目录 `.env` 的 `APP_PORT`）。
- **系统代理影响本机请求**：如果 shell 里设置了 `http_proxy` / `https_proxy`，用 Bun 运行 `fetch` 访问 `localhost` 时会走代理（返回 502）。解决方式是在 `.env` 中设置 `NO_PROXY=localhost,127.0.0.1`（`packages/cli/.env` 已按此配置）；curl 调试时可加 `--noproxy '*'`。Node 的 `fetch` 不受影响。
- **5432 端口被占用**：本机如果已经装了 Postgres，改根目录 `.env` 里的 `POSTGRES_PORT`（如 `15432`）。
- **上传目录不可写（Linux）**：容器内以 uid 1001 运行，Linux 上 bind mount 的目录需要 `sudo chown -R 1001:1001 data/uploads`（macOS 的 Docker Desktop 不受影响）。
