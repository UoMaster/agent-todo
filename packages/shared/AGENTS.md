# AGENTS.md — packages/shared

三端共用的类型与工具。**同时被浏览器（web）和 Node（server / cli）引用**，因此约束最严。

## 硬性约束

- 运行时无关：**禁止** import `node:*`、使用 `Bun.*`、访问 DOM（`window` / `document`）
- 纯 TS、无构建：`exports` 直接指向 `src/index.ts`，由消费方（Vite / Node type stripping）就地编译
- 新增内容必须从 `src/index.ts` 重新导出（`export * from './xxx.ts'`）
- 遵守 `erasableSyntaxOnly`（禁止 enum / namespace / 参数属性），相对导入带 `.ts` 扩展名

## 结构与职责

- `src/error.ts` — `ApiError`（web / cli 调用 HTTP 失败时共用）
- 后续按主题拆文件，例如 `types.ts`（Todo 等业务类型）、`utils.ts`（纯函数工具）
- **判断标准**：两端及以上都要用的类型 / 常量 / 守卫函数才放这里；只有一端用到的代码留在该包内

## 命令

- `pnpm --filter @agent-todo/shared check`
- `pnpm --filter @agent-todo/shared test`

## 测试

- `src/*.test.ts` 与源码同级，Node 环境，纯逻辑断言（不碰网络 / 文件系统）
- 新增导出的工具函数时同步补测试；导出的类型不需要测试
