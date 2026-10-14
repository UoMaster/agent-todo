# AGENTS.md — packages/server

HTTP API 服务：Hono + `@hono/node-server`，默认端口 **3001**。

## 结构约定

- `src/app.ts` — 应用本体（导出 `app`），所有路由挂在这里；**禁止**在 app.ts 里 listen
- `src/index.ts` — 只负责启动（serve + 信号处理），不写业务逻辑
  - 这样测试可以直接 import `app.ts`，无需真实端口
- 路由变多后按 `src/routes/<name>.ts` 拆分，用 `app.route()` 挂载

## 运行时约束

- 运行在 Node：**不要用 `Bun.*` API**（tsconfig `types: ["node"]` 会兜底报错）；文件读写用 `node:fs/promises`
- 新增依赖前先确认必要性与体积（当前仅 hono / @hono/node-server / shared）

## API 约定（实现业务时遵守）

- 统一前缀 `/api`，请求与响应均为 JSON
- 错误响应结构：`{ error: string, message: string }`，`error` 用 snake_case（如 `not_found`、`validation_error`）
- 请求校验优先引入 `@hono/zod-validator` + `zod`（先把版本加进 catalog 再安装）

## 命令

- 启动：`pnpm dev:server`（根目录）；等价于 `node --watch src/index.ts`
- `pnpm --filter @agent-todo/server check` / `test`
- 环境变量参考 `.env.example`（`PORT` 默认 3001）。每个包独立加载自己的 `.env`：server 的 `dev` / `start` 脚本带 `--env-file-if-exists=.env`；用 Bun 运行时会自动加载。**注意 Node 本身不会自动加载 `.env`**，手工用 `node src/index.ts` 启动的话环境变量需要自行 export。

## 测试

- `src/app.test.ts` — 进程内测试：`app.request('/')`，不占真实端口，优先用这种方式
- `src/http.test.ts` — 真实 HTTP 集成测试：`serve({ fetch: app.fetch, port: 0 })` + `fetch` + `server.close()`
- 坑：`serve()` 返回的是 `ServerType`（`HttpServer | Http2Server | ...`），**不能**标注成 `node:http` 的 `Server`，用 `ReturnType<typeof serve>`
- 新增路由时：app.test.ts 覆盖状态码与响应体，http.test.ts 只在链路变化时才需要动
