# AGENTS.md — packages/server

HTTP API 服务：Hono + `@hono/node-server`，默认端口 **3001**。

## 结构约定

- `src/app.ts` — 应用本体：`createApp(options)` 工厂 + `export const app`（用环境变量实例化）。所有路由挂在工厂里；**禁止**在 app.ts 里 listen
  - `options.staticDir`：设置后托管前端构建产物 + SPA 兜底（生产 / 容器模式）
  - `options.dbPing`：数据库探活实现，测试时注入 stub
- `src/index.ts` — 只负责启动：建上传目录 → 跑迁移 → serve → 信号处理；不写业务逻辑
- `src/config.ts` — 环境变量集中在这里读，其他模块不直接碰 `process.env`
- `src/db.ts` — `SqlClient` 接口 + `createSqlClient(pool)` 适配器 + `pingDb()` 探活
- `src/migrations.ts` + `migrations/*.sql` — 迁移器与迁移文件（见下）
- 路由变多后按 `src/routes/<name>.ts` 拆分，用 `app.route()` 挂载

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 监听端口 |
| `HOST` | `localhost` | 监听地址；**容器里必须是 0.0.0.0** |
| `STATIC_DIR` | 无 | 设置后托管前端产物 + SPA 兜底 |
| `UPLOADS_DIR` | `.data/uploads` | 上传目录（容器里指向挂载卷） |
| `DATABASE_URL` | 无 | Postgres 连接串；未配置时 `/api/health` 会显示 `db.ok=false` |
| `MIGRATIONS_DIR` | `../migrations` | 迁移文件目录 |

## 数据库与迁移约定

- 只用 `SqlClient` 接口访问数据库（生产 pg / 测试 PGlite 都满足），不要在业务代码里直接 new Pool
- 迁移文件命名 `NNNN_描述.sql`（4 位数字前缀，按文件名排序执行）；**只新增、不修改**已执行的迁移
- 每个迁移在事务里执行，失败整体回滚且不记录；重复运行幂等；服务启动时自动执行
- 涉及 SQL 的测试用 PGlite（`@electric-sql/pglite`，进程内真 Postgres），不要依赖 Docker

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
- **静态托管要有独立用例**：`/` 返回 index.html、静态文件按路径返回、未知前端路由走 SPA 兜底、`/api/*` 不被兜底吞掉、`STATIC_DIR` 缺 index.html 时退化为 JSON 404
- **健康检查要有三类用例**：db 正常 / db 失败（仍 200 但 `db.ok=false`）/ 探活实现抛异常被兜住
- **迁移必须有**：顺序执行 + 记录、重复运行幂等、失败回滚且不记录；SQL 逻辑用 PGlite 测试
- 业务逻辑（校验、过滤、排序等）优先抽成纯函数（放 shared 或本包 `*.ts`）并单独单测；路由测试只验证接线与响应
- 测试分层（新增路由必须补第一类，第二类按需）：
  - `src/app.test.ts` — 进程内 `app.request()`，不占真实端口，默认用这种方式
  - `src/http.test.ts` — 真实 HTTP：`serve({ fetch: app.fetch, port: 0 })` + `fetch` + `server.close()`；涉及启动 / 监听 / 中间件变化时更新
- 坑：`serve()` 返回的是 `ServerType`（`HttpServer | Http2Server | ...`），**不能**标注成 `node:http` 的 `Server`，用 `ReturnType<typeof serve>`

## 测试盲区台账

每次「测试复盘」的结论追加到这里（格式：现象 → 为什么没测到 → 已加固的用例/规则）。

- **`.env` 配置不生效**（脚手架阶段）：文档声称会自动加载 `.env`，但 Node 运行时并不会 → 没测到的原因：这是"机制/文档层面的承诺"，当时没有任何测试覆盖它 → **已加固**：`dev` / `start` 脚本加 `--env-file-if-exists=.env`，并用真实启动 + curl 验证过 PORT 覆盖生效；今后凡对外承诺的行为（env、端口、默认值）必须有对应测试或实测记录
