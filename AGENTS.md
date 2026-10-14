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
| `pnpm dev` | 并行启动 web + server（不含数据库） |
| `pnpm dev:all` | **一键开发**：Postgres（Docker）+ web + server（本地热更新） |
| `pnpm dev:server` / `pnpm dev:web` | 单独启动 |
| `pnpm cli --help` | 运行 CLI 命令（参数直接跟在后面） |
| `pnpm migrations:new` | 生成迁移脚本（`<schema\|data> <描述>`，文件名自动带时间戳） |
| `pnpm migrations:check` | 迁移守护检查（只允许新增，pre-commit / CI 都跑） |
| `pnpm cli:link` / `pnpm cli:unlink` | 生成 / 移除全局 `agent-todo` 启动器（宿主机任意目录可用） |
| `pnpm docker:up` / `docker:down` / `docker:logs` | 完整容器栈（app + db）的启动 / 停止 / 日志 |
| `pnpm verify` | **提交前门禁**：check + lint + test + coverage（pre-commit 钩子与 CI 都跑它） |
| `pnpm test` | 全量测试（shared / server / cli / web 四个 project） |
| `pnpm coverage` | 覆盖率（istanbul，阈值 85%） |
| `pnpm check` | 全仓库 TypeScript 类型检查 |
| `pnpm lint` | oxlint |
| `pnpm build` | 构建（目前只有 web 需要） |

## 测试要求（硬性规则）

**所有功能点必须有对应的测试用例；提交前测试必须全部通过。没有例外。**

- **新增功能**：必须同时提交测试用例；**修改行为**：必须同步更新受影响的测试
- **修复 bug**：先写一个能复现问题的失败测试，再修复——这个测试就是回归防线
- 每个功能点至少覆盖：正常路径 + 边界/异常路径（非法参数、空值、错误分支、边界值）
- **禁止**为了让门禁变绿而删除测试、跳过测试（`.skip` / `.todo`）或放宽断言；确需临时跳过必须写明原因与跟踪项
- 覆盖率基线 **85%**（`pnpm coverage` 会做阈值检查），新增代码不得拉低现有覆盖率
- 不确定某个功能点需要什么测试？先把验收标准写成测试（输入 → 期望输出），再写实现
- 各包的测试类型与最低要求见对应包的 `AGENTS.md`

### 数据库迁移（硬性规则）

- 迁移脚本分 **schema（库表升级）/ data（刷数据）** 两个模块，服务启动时自动按 schema → data 顺序执行
- 文件名必须是 `<14 位完整时间戳>_<描述>.sql`；新增一律用 `pnpm migrations:new <schema|data> <描述>` 生成
- **只允许新增**：修改 / 删除 / 重命名已有脚本会被三层拦截 —— pre-commit（暂存区）、CI（`--base` 范围）、运行时（`migration_runs` 里的 checksum 校验）
- 记录表 `migration_runs(path, module, checksum, applied_at)`；每个脚本一个事务，失败回滚且不记录
- 详见 `packages/server/AGENTS.md`「迁移系统」

### Docker / 数据库相关约定

- **镜像只包含 web + server**：前端构建产物由 server 托管（`STATIC_DIR`），单端口 3001 出全部。**CLI 不进镜像**（它是宿主机上的客户端工具，用 `pnpm cli:link` 使用）
- 容器里 server 必须监听 `HOST=0.0.0.0`，否则端口转发访问不到
- 数据落在卷里：Postgres 用命名卷 `pgdata`（挂在 `/var/lib/postgresql`，**PG 18 起不能挂 `/var/lib/postgresql/data`**）；上传文件 bind mount 到 `./data/uploads`（`data/uploads/*` 已 gitignore，只保留 `.gitkeep`）
- 涉及 SQL 的逻辑用 **PGlite**（WASM 版 Postgres，进程内）测试，不依赖 Docker；迁移必须有「顺序 / 幂等 / 失败回滚」三类测试
- 改动 Dockerfile 或 compose 后，必须真实构建并冒烟验证：`docker compose up -d --build` → `curl localhost:3001/api/health`（db.ok 为 true）→ `docker compose down`；**不允许只改不验**
- 端口冲突：本机若已占用 5432 / 3001，改根目录 `.env` 的 `POSTGRES_PORT` / `APP_PORT`

### 对已提交功能的修改：强制测试复盘

需求是针对**已提交功能**的修改（bug 修复、行为调整、需求变更）时，除了改代码，必须完成一次"为什么测试没拦住"的复盘：

1. **先复现**：先写一个能暴露问题的失败测试，再改代码（没有复现测试不许修）
2. **复盘**：判断这是哪一类盲区——缺用例 / 断言太松 / 只覆盖正常路径 / 测试入口与真实入口不一致 / mock 掩盖真实行为 / 边界与组合场景缺失 / 测试基础设施本身不可信
3. **加固**：不只补本次用例，同类盲区（同类边界、同类错误路径、同类组件状态）要一起补；已有测试断言太弱的同步加强
4. **沉淀**：复盘结论追加到对应包的「测试盲区台账」（见各包 `AGENTS.md`）；若暴露的是通用规则缺失，应同步升级根目录或包的规则

**已提交功能修改的提交信息模板（body 必填前三项）**：

```
fix: <一句话描述修改>

问题：<用户可见的现象 / 需求变更点>
测试复盘：<为什么已有测试没有覆盖到>
测试加固：<新增 / 加强了哪些用例，以及同类盲区是否一并补齐>
```

### 测试基础设施台账（根级）

- **v8 覆盖率在 Bun 运行时下静默失效**：server project 合并崩溃、其余 project 报 0%，"测试通过"但覆盖率数字是假的 → 没发现的原因：只盯着测试是否通过，没有怀疑覆盖率数字本身 → **已加固**：切换到 istanbul，并把 `pnpm coverage`（85% 阈值）纳入 `pnpm verify`，数字异常会直接拦住提交
- **shell 脚本里 `$var` 紧跟中文全角字符，在非 UTF-8 locale 下会被当成变量名**（`$where：` → unbound variable）：本地 UTF-8 的 shell 完全正常，vitest / CI 环境（没有 LANG）才暴露 → 没发现的原因：脚本测试只在"有 LANG"的环境跑过 → **已加固**：脚本内一律用 `${var}`；`migrations-guard.test.ts` 增加「最小环境（无 LANG）」回归用例，这类"环境相关假绿"以后能被自动抓住
- **pnpm 的 no-op 安装不执行生命周期脚本**：`postinstall` 只有在真正发生安装（全新 clone、`--force`）时才运行 → **已加固**：钩子安装放在 `postinstall`（全新 clone 必然执行），README 说明"克隆后跑一次 `pnpm install`"；用 `git config --get core.hooksPath` 可确认钩子是否生效

## 工作流（改完代码必须做）

1. `pnpm verify` —— 一条命令跑完 check + lint + test + coverage，**必须全绿**
2. 若是对**已提交功能**的修改：按「强制测试复盘」完成复盘，并把结论写进提交信息（问题 / 测试复盘 / 测试加固）
3. 提交信息用 Conventional Commits（`feat:` / `fix:` / `refactor:` / `test:` / `chore:` …）

门禁机制（双重保险，不要尝试绕过）：

- **pre-commit 钩子**（`.githooks/pre-commit`，`pnpm install` 时通过 `prepare` 自动配置）：执行 `pnpm verify`，不通过直接阻止提交；**禁止**用 `git commit --no-verify` 提交红灯代码
- **GitHub Actions**（`.github/workflows/ci.yml`）：push / PR 时重跑同一套门禁 + 构建，红了必须修到绿再继续

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
- **Postgres 18 镜像挂载点变了**：必须挂 `/var/lib/postgresql`（数据在 `18/docker` 子目录），挂旧的 `/var/lib/postgresql/data` 会直接拒绝启动
- **`pnpm install --prod` 时没有生产依赖的包不会生成 `node_modules`**（如 shared），Dockerfile 里逐个 `COPY */node_modules` 会报 "not found"，要整体拷贝依赖层
- **pnpm 12 移除了一些老写法**：没有 `pnpm link --global`（用 `pnpm cli:link` 的启动器方案）；新版全局 bin 目录 `$PNPM_HOME/bin` 默认不在 PATH（`$PNPM_HOME` 本身在），所以启动器直接生成在 `$PNPM_HOME` 下
- **shell 脚本里变量展开后面紧跟中文全角字符必须用 `${var}`**：`$where：` 在非 UTF-8 locale（CI、vitest 环境没有 LANG）下会被 shell 当成变量名的一部分，报 unbound variable；本地 UTF-8 shell 却完全正常
- **git 不会保留空目录**：`migrations/{schema,data}` 必须各保留至少一个脚本，否则 git 里目录消失、守护脚本会报「缺少迁移模块目录」

## 文档

- `README.md`：面向使用者的说明（安装、脚本、测试、常见问题）
- `AGENTS.md`（根目录与各包）：面向 AI 编码助手的项目约定
- `packages/*/AGENTS.md`：各包的包内约定

## 维护说明

修改本文件或各包 `AGENTS.md` 后，**运行中的会话不会自动感知**（已加载的嵌套文件不重新读取），需要新开会话生效。
