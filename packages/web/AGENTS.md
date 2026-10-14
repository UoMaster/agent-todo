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

## 测试（浏览器渲染测试）

- Vitest Browser Mode + Playwright（Chromium），测试文件 `src/**/*.test.tsx`
- 写法：`const screen = await render(<App />)` → `screen.getByRole(...)` → `await expect.element(...).toBeVisible()`（`render` 来自 `vitest-browser-react`）
- **坑**：单独渲染某个组件时，必须手动 import 用到的 CSS（`main.tsx` 里的样式引入不会自动生效）
- 断言真实渲染结果（文本、可见性、`getComputedStyle`、用户交互），不要 mock DOM
- 调试：`pnpm --filter @agent-todo/web test:browser` 会打开真实浏览器窗口
- 组件交互测试参考 `vitest-browser-react` 的 locators API，避免用原生 querySelector
