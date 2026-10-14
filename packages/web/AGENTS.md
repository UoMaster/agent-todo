# AGENTS.md — packages/web

前端：React 19 + Vite 8（Rolldown 构建）。

## 结构约定

- `src/main.tsx` 入口（引入全局样式）→ `src/App.tsx`
- 样式：全局在 `src/index.css`；组件专属样式可就近放 `*.css` 并在组件中 import
- 新增 `VITE_*` 环境变量时，同步更新 `src/vite-env.d.ts` 的类型声明
- tsconfig 是 project references（`tsconfig.app.json` / `tsconfig.node.json`），按代码运行环境放对应配置

## 开发与构建

- `pnpm dev:web`（根目录），http://localhost:5173
- 调用后端统一走 `/api` 前缀（dev 时 Vite 代理到 `http://localhost:3001`，可用 `AGENT_TODO_SERVER` 覆盖）；不要写死 host，需要自定义时用 `VITE_API_BASE_URL`
- 构建：`pnpm --filter @agent-todo/web build`（`tsc -b && vite build`）

## 测试要求（硬性）

- **每个用户可见的功能点 / 交互都必须有浏览器测试**：输入、点击、提交、状态切换、条件渲染
- 分支覆盖：空状态、加载状态、错误 / 离线状态等条件渲染都要有对应用例
- 断言真实渲染结果（可见性、文本、`getComputedStyle`、行为结果）；**禁止** mock DOM 或断言实现细节
- 纯逻辑（格式化、计算、数据变换）抽到 shared 或 `src/*.ts`，在 Node 环境测试；浏览器测试只负责渲染与交互
- 测试写法与坑：
  - 写法：`const screen = await render(<App />)` → `screen.getByRole(...)` → `await expect.element(...).toBeVisible()`（`render` 来自 `vitest-browser-react`）
  - **坑**：单独渲染某个组件时，必须手动 import 用到的 CSS（`main.tsx` 里的样式引入不会自动生效）
  - 调试：`pnpm --filter @agent-todo/web test:browser` 会打开真实浏览器窗口
  - 组件交互测试参考 `vitest-browser-react` 的 locators API，避免用原生 querySelector

## 测试盲区台账

每次「测试复盘」的结论追加到这里（格式：现象 → 为什么没测到 → 已加固的用例/规则）。

- **组件单独渲染时样式未加载**（脚手架阶段）：`index.css` 只在 `main.tsx` 里引入，测试单独 `render(<App />)` 时样式不生效，`getComputedStyle` 断言失败 → 没测到的原因：**测试入口与真实入口的加载路径不一致**（测试没有复刻 `main.tsx` 的引入）→ **已加固**：测试中显式 import 用到的 CSS，并断言真实计算样式（已写入上文规则）；新增测试时先确认"真实入口加载了什么"
