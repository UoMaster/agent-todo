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

## 测试要求（硬性）

- **每个路由都必须有测试**，至少覆盖四类：成功响应（状态码 + body 结构）、请求参数/body 非法（校验失败）、资源不存在（404）、错误响应结构 `{ error, message }`
- 业务逻辑（校验、过滤、排序等）优先抽成纯函数（放 shared 或本包 `*.ts`）并单独单测；路由测试只验证接线与响应
- 测试分层（新增路由必须补第一类，第二类按需）：
  - `src/app.test.ts` — 进程内 `app.request()`，不占真实端口，默认用这种方式
  - `src/http.test.ts` — 真实 HTTP：`serve({ fetch: app.fetch, port: 0 })` + `fetch` + `server.close()`；涉及启动 / 监听 / 中间件变化时更新
- 坑：`serve()` 返回的是 `ServerType`（`HttpServer | Http2Server | ...`），**不能**标注成 `node:http` 的 `Server`，用 `ReturnType<typeof serve>`

## 测试盲区台账

每次「测试复盘」的结论追加到这里（格式：现象 → 为什么没测到 → 已加固的用例/规则）。

- **`.env` 配置不生效**（脚手架阶段）：文档声称会自动加载 `.env`，但 Node 运行时并不会 → 没测到的原因：这是"机制/文档层面的承诺"，当时没有任何测试覆盖它 → **已加固**：`dev` / `start` 脚本加 `--env-file-if-exists=.env`，并用真实启动 + curl 验证过 PORT 覆盖生效；今后凡对外承诺的行为（env、端口、默认值）必须有对应测试或实测记录
