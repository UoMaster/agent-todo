# agent-todo

pnpm monorepo 骨架：**React Web 界面** + **Bun/Elysia server** + **命令行客户端**，三者共享同一套类型（`@agent-todo/shared`）。

当前为初始化状态，只包含可运行的最小脚手架，业务功能待实现。

## 目录结构

```
agent-todo/
├── packages/
│   ├── shared/   # web / server / cli 共用的类型与工具（以 TS 源码形式被引用）
│   ├── server/   # HTTP API 服务（Bun + Elysia），默认端口 3001
│   ├── web/      # React 19 + Vite 8 前端（开发时自动代理 /api 到 server）
│   └── cli/      # 命令行客户端（citty），通过 HTTP 调用 server
├── pnpm-workspace.yaml   # workspace 配置 + 依赖版本 catalog
├── tsconfig.base.json    # 各包共用的 TypeScript 配置
└── package.json          # 根脚本入口
```

## 环境要求

- Node.js ≥ 20.19
- [pnpm](https://pnpm.io/) ≥ 10（当前锁定 pnpm@12.10.1）
- [Bun](https://bun.sh/) ≥ 1.2（server 和 cli 的运行时）

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
| `pnpm build` | 构建所有包（目前只有 web 需要构建） |
| `pnpm check` | 全仓库 TypeScript 类型检查 |
| `pnpm lint` | oxlint 静态检查 |
| `pnpm clean` | 清理依赖与构建产物 |

## 依赖版本管理

公共依赖版本统一维护在 `pnpm-workspace.yaml` 的 `catalog` 中，各包通过 `"catalog:"` 引用，升级时只改一处。

## 说明

- server 与 cli 直接以 TS 源码运行（由 Bun 负责编译），无需构建步骤。
- 前端 dev 服务器的 `/api` 请求会代理到 `http://localhost:3001`，可通过 `AGENT_TODO_SERVER` 环境变量覆盖。

## 常见问题

- **3000 端口被占用**：本机已有其他服务（Nuxt SSR）监听 3000，因此默认端口改为 **3001**。需要修改时复制 `packages/server/.env.example` 为 `packages/server/.env` 并调整 `PORT`。
- **本机请求走了系统代理**：Bun 的 `fetch` 会读取 `http_proxy` / `https_proxy`，导致访问 `localhost` 也走代理（返回 502）。解决方案是在 `.env` 中设置 `NO_PROXY=localhost,127.0.0.1`（`packages/cli/.env` 已按此配置）。curl 调试时可加 `--noproxy '*'`。
