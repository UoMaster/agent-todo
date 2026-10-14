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

## 测试要求（硬性）

- **每一个导出项都必须有测试**（纯类型声明除外）：函数、类、常量表逐项覆盖
- 每个函数至少覆盖：正常路径 + 边界（非法输入、空值、极值）；类型守卫要同时测合法与非法输入
- `src/*.test.ts` 与源码同级，Node 环境，纯逻辑断言（不碰网络 / 文件系统）
- 新增或修改导出函数但未补测试 = 不算完成；导出类型不需要测试

## 测试盲区台账

每次「测试复盘」的结论追加到这里（格式：现象 → 为什么没测到 → 已加固的用例/规则）。目前无历史记录；写新导出函数时按上文逐项对照：边界输入、非法输入、空值、大小写/空白归一化。
