# AGENTS.md — packages/server

HTTP API 服务：Hono + `@hono/node-server`，默认端口 **3001**。

## 结构约定

- `src/app.ts` — 应用本体：`createApp(options)` 工厂 + `export const app`（用环境变量实例化）。所有路由挂在工厂里；**禁止**在 app.ts 里 listen
  - `options.staticDir`：设置后托管前端构建产物 + SPA 兜底（生产 / 容器模式）
  - `options.dbPing`：数据库探活实现，测试时注入 stub
  - `options.todoStore` / `options.attachmentStore` / `options.uploadsDir` / `options.maxAttachmentBytes`：数据层与附件存储的注入点（测试用内存实现，不碰磁盘）
- `src/index.ts` — 只负责启动：建上传目录 → 跑迁移 → serve → 信号处理；不写业务逻辑
- `src/config.ts` — 环境变量集中在这里读，其他模块不直接碰 `process.env`；`data/uploads` 的默认路径由 `defaultUploadsDir()` 给出（与 Docker 的 bind mount 同一个目录）
- `src/db.ts` — `SqlClient` 接口 + `createSqlClient(pool)` 适配器 + `pingDb()` 探活
- `src/schema.ts` — zod 请求体校验（日期区间、优先级、子任务等约束都写在这里）
- `src/todos.ts` — 待办数据访问层：`createTodoStore(getSql, attachmentStore)`，SQL 与事务全部收在这里
- `src/attachments.ts` — 附件存储接口 + 本地文件系统实现 + 内存实现（测试用）；防目录穿越、扩展名白名单
- `src/migrations.ts` + `migrations/{schema,data}/*.sql` — 迁移器与迁移脚本（见下）
- `src/routes/<name>.ts` — 路由，用 `app.route('/api', …)` 挂载；依赖（store / 存储）通过工厂注入
- `src/test-utils.ts` — 测试装置：PGlite + 真实迁移 + 内存附件存储，起一个可用的 app（不计入覆盖率的测试基建）

## 业务接口一览

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/todos` | `status=all\|today\|upcoming\|overdue\|done`、`tag`、`q`（状态过滤复用 shared 的 `matchesStatusFilter`，与前端同一套规则） |
| `POST /api/todos` | 新建；`title` 必填 |
| `GET` / `PUT` / `DELETE /api/todos/:id` | 详情 / 整条替换（未传字段回默认值）/ 删除 |
| `GET /api/tags` | 标签与计数 |
| `POST /api/todos/:id/attachments` | `multipart/form-data`，字段名 `file`；超过上限返回 413 `file_too_large` |
| `GET /api/attachments/:id/content` | 图片 `inline`（可预览），其余 `attachment`；文件名同时给 ASCII 兜底与 RFC 5987 的 `filename*` |
| `DELETE /api/attachments/:id` | 删除记录与磁盘文件 |

- 附件文件按 `UPLOADS_DIR/<todoId>/<attachmentId>.<ext>` 存放，数据库只存相对路径；路径读写都要过 `assertSafeStoragePath`（只允许我们生成的 uuid/uuid.ext 结构）
- 未配置 `DATABASE_URL` 时数据库相关接口返回 **503 `database_unavailable`**（不是 500），由 `app.onError` 统一映射

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 监听端口 |
| `HOST` | `localhost` | 监听地址；**容器里必须是 0.0.0.0** |
| `STATIC_DIR` | 无 | 设置后托管前端产物 + SPA 兜底 |
| `UPLOADS_DIR` | 仓库根 `data/uploads` | 附件落盘目录；**本机与容器共用同一份**（容器里通过 bind mount 指向 `/data/uploads`） |
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
- **规则生效基线：commit `3c41895`（2026-10-14）**。此前的提交包含一次性结构重构（删除扁平 `0001_init.sql`、拆成 schema/data），属豁免范围；**不需要也不建议重写历史**（已推送的提交重写会破坏所有人的 clone 与 CI 记录）
- 审计历史（可选，检查基线之后有没有违规提交；基线之前属豁免）：

  ```sh
  git log --diff-filter=DMR --name-status 3c41895..HEAD -- packages/server/migrations/schema packages/server/migrations/data
  ```

- 想"撤销"一个迁移时：**新写一个反向迁移**（如 `drop table`），而不是删除文件；数据写错了就新增一个 `data` 脚本修正

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
- **业务接口的测试用 `src/test-utils.ts` 的 `createTestContext()`**：PGlite（真 Postgres 语义）+ **仓库里真实的迁移脚本** + 内存附件存储；路由测试与数据层测试都走它，不依赖 Docker
  - 附件相关用例要覆盖：multipart 缺 `file` 字段、非 multipart 请求、超过大小上限（用可配置的 `maxAttachmentBytes` 触发真实分支，不要构造 200MB 请求）、下载头（中文文件名的 RFC 5987 编码、图片 `inline`）、删除后 404
  - 数据层用例要覆盖：标签去重与清理、子任务带 id 保留 / 不带 id 新建、日期区间在数据库层的约束、级联删除、`updated_at` 刷新
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

- **上传目录本机与容器不是同一个**（本次）：文档承诺「容器重建数据不丢」，但本机开发默认落在 `packages/server/.data/uploads`，Docker 却 bind mount 仓库根的 `./data/uploads` —— 两个目录互不可见，本机传的附件容器里看不到（数据库同理：本机 5432 vs 容器 pgdata 是两套）→ 没测到的原因：**只验证了各自的路径能写，没有验证「两套配置指向同一份数据」**，且这条约定没有测试兜底 → **已加固**：默认上传目录统一到仓库根 `data/uploads`，`src/config.test.ts` 锁定默认路径与目录存在，并交叉校验 `docker-compose.yml` 里的挂载配置，两边再次漂移会直接红灯；今后凡是「文档承诺的多环境一致性」都要有对应的交叉校验用例
