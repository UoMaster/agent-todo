# AGENTS.md — packages/server

HTTP API 服务：Hono + `@hono/node-server`，默认端口 **3001**。

## 结构约定

- `src/app.ts` — 应用本体：`createApp(options)` 工厂 + `export const app`（用环境变量实例化）。所有路由挂在工厂里；**禁止**在 app.ts 里 listen
  - `options.staticDir`：设置后托管前端构建产物 + SPA 兜底（生产 / 容器模式）
  - `options.dbPing`：数据库探活实现，测试时注入 stub
- `src/index.ts` — 只负责启动：建上传目录 → 跑迁移 → serve → 信号处理；不写业务逻辑
- `src/config.ts` — 环境变量集中在这里读，其他模块不直接碰 `process.env`
- `src/db.ts` — `SqlClient` 接口 + `createSqlClient(pool)` 适配器 + `pingDb()` 探活
- `src/migrations.ts` + `migrations/{schema,data}/*.sql` — 迁移器与迁移脚本（见下）
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

### 迁移系统（schema / data 两模块）

- 目录：`migrations/schema/`（库表升级 DDL）、`migrations/data/`（刷数据 DML）
- 执行顺序：**schema 模块整体先于 data 模块**，模块内按文件名（时间戳）排序；服务启动时自动依次执行
- 文件名：`<14 位完整时间戳>_<描述>.sql`，一律用 `pnpm migrations:new <schema|data> <描述>` 生成
- **只允许新增**，三层强制（不靠自觉）：
  1. pre-commit：`pnpm migrations:check` 对比暂存区，改 / 删 / 重命名即拦截
  2. CI：同一脚本 `--base <sha>` 对比 PR / push 范围
  3. 运行时：`migration_runs.checksum` 校验已执行脚本，被改 / 消失都会在启动时报错
- 记录表 `migration_runs(path, module, checksum, applied_at)`；每个脚本一个事务，失败回滚且不记录；重复运行幂等
- `data` 脚本尽量幂等（`on conflict do nothing`），便于数据库恢复后重放
- 历史说明：脚手架阶段的扁平 `migrations/0001_init.sql` 已并入新结构；守护脚本只保护 `migrations/{schema,data}` 两个目录，所以那次重构本身不受影响，之后所有脚本都在保护范围内

### 迁移的测试要求

- 必须覆盖：模块顺序（schema 先于 data，即使 data 时间戳更早）、幂等、失败回滚、**修改检测（checksum）**、**删除检测**、文件名非法、记录表字段
- 守护脚本与生成器在「临时 git 仓库」里做真实测试（`src/migrations-guard.test.ts`），包含**最小环境（无 LANG）回归用例**

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
- **迁移测试**：见下方「迁移的测试要求」（顺序 / 幂等 / 回滚 / 修改检测 / 删除检测 / 命名）
- 业务逻辑（校验、过滤、排序等）优先抽成纯函数（放 shared 或本包 `*.ts`）并单独单测；路由测试只验证接线与响应
- 测试分层（新增路由必须补第一类，第二类按需）：
  - `src/app.test.ts` — 进程内 `app.request()`，不占真实端口，默认用这种方式
  - `src/http.test.ts` — 真实 HTTP：`serve({ fetch: app.fetch, port: 0 })` + `fetch` + `server.close()`；涉及启动 / 监听 / 中间件变化时更新
- 坑：`serve()` 返回的是 `ServerType`（`HttpServer | Http2Server | ...`），**不能**标注成 `node:http` 的 `Server`，用 `ReturnType<typeof serve>`

## 测试盲区台账

每次「测试复盘」的结论追加到这里（格式：现象 → 为什么没测到 → 已加固的用例/规则）。

- **`.env` 配置不生效**（脚手架阶段）：文档声称会自动加载 `.env`，但 Node 运行时并不会 → 没测到的原因：这是"机制/文档层面的承诺"，当时没有任何测试覆盖它 → **已加固**：`dev` / `start` 脚本加 `--env-file-if-exists=.env`，并用真实启动 + curl 验证过 PORT 覆盖生效；今后凡对外承诺的行为（env、端口、默认值）必须有对应测试或实测记录
