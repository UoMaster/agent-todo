# AGENTS.md — agent-todo

本文件面向在此仓库工作的 AI 编码助手。进入具体包时，请一并阅读该包目录下的 `AGENTS.md`（更具体的规则优先）。

## 项目概览

pnpm monorepo，四个包：

| 包 | 说明 | 端口 |
| --- | --- | --- |
| `packages/shared` | 三端共用的类型与工具（以 TS 源码形式被引用，无构建） | — |
| `packages/server` | HTTP API 服务（Hono + `@hono/node-server`） | 3001 |
| `packages/web` | 前端（React 19 + Vite 8） | 5173 |
| `packages/cli` | 命令行客户端（citty），通过 HTTP 调用 server | — |

数据流：web / cli → HTTP → server；三端共享 `@agent-todo/shared` 的类型。
当前为脚手架阶段，业务功能逐步添加。

## 环境与运行时（重要）

- Node ≥ 22.18（本地为 24）、pnpm ≥ 10
- **server / cli 直接运行 TS 源码**：Node 原生 type stripping，无 tsx、无构建步骤
  - 必须保持 `tsconfig.base.json` 里的 `erasableSyntaxOnly`：**禁止** enum、namespace、参数属性、装饰器等不可擦除语法
  - 相对导入必须带扩展名（`./app.ts`），由 `allowImportingTsExtensions` 约束
- **Bun 是可选运行时**（`bun packages/server/src/index.ts` 可跑同一份源码）。不要在 server / cli 代码里使用 `Bun.*` / `node:http` 之外的运行时专有 API

## 常用命令（均在仓库根执行）

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动 web + server |
| `pnpm dev:server` / `pnpm dev:web` | 单独启动 |
| `pnpm cli --help` | 运行 CLI 命令（参数直接跟在后面） |
| `pnpm test` | 全量测试（shared / server / cli / web 四个 project） |
| `pnpm coverage` | 覆盖率（istanbul，含 70% 阈值检查） |
| `pnpm check` | 全仓库 TypeScript 类型检查 |
| `pnpm lint` | oxlint |
| `pnpm build` | 构建（目前只有 web 需要） |

## 工作流（改完代码必须做）

1. `pnpm check` —— 类型必须全绿
2. `pnpm lint` —— 无告警
3. `pnpm test` —— 改了逻辑就补/改对应测试；**禁止**提交红灯
4. 提交信息用 Conventional Commits（`feat:` / `fix:` / `refactor:` / `test:` / `chore:` …），按需推送

新增依赖的标准姿势：

1. 版本加到 `pnpm-workspace.yaml` 的 `catalog`（先确认最新版本）
2. 包内 `package.json` 用 `"catalog:"` 引用，**不要写死版本号**
3. 跑 `pnpm install`

## 仓库约定

- ESM only；TS strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`（类型导入一律 `import type`）
- 风格跟随现有代码：2 空格缩进、单引号、无分号、尾随逗号
- 注释、UI 文案、文档用中文；标识符用英文
- 依赖方向只能是 `web | server | cli → shared`；shared 不得反向依赖、不得使用运行时/浏览器专有 API
- 测试文件与源码同级存放（`x.test.ts` 紧挨 `x.ts`）
- 不提交 `packages/*/.data/`、`coverage/`、`.vitest/`（已 gitignore）

## 已知坑（踩过，别再踩）

- **端口 3000 被本机其他项目占用**，本项目 server 默认 **3001**
- shell 里有 `http_proxy`：用 Bun 跑 `fetch` 访问 localhost 会走代理（502），需 `NO_PROXY=localhost,127.0.0.1`；Node 的 `fetch` 不受影响（`packages/cli/.env` 已配置）
- 覆盖率 provider 是 **istanbul**，不要改回 v8：v8 在 Bun 运行时下不可用，且 Node + 浏览器混合环境用 istanbul 最稳
- Playwright Chromium 已缓存；新机器需 `pnpm --filter @agent-todo/web exec playwright install chromium`
- pnpm 12 的供应链策略会自动维护 `pnpm-workspace.yaml` 里的 `minimumReleaseAgeExclude`，不要手工删改，跟随提交即可

## 文档

- `README.md`：面向使用者的说明（安装、脚本、测试、常见问题）
- `AGENTS.md`（根目录与各包）：面向 AI 编码助手的项目约定
- `packages/*/AGENTS.md`：各包的包内约定

## 维护说明

修改本文件或各包 `AGENTS.md` 后，**运行中的会话不会自动感知**（已加载的嵌套文件不重新读取），需要新开会话生效。
