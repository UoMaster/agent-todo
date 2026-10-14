import { defineConfig } from 'vitest/config'

/**
 * 仓库统一的测试入口：
 *   pnpm test              → 跑全部 project（shared / server / cli / web）
 *   pnpm test:web          → 只跑浏览器渲染测试
 *   pnpm coverage          → 带覆盖率报告
 *
 * 各包的独立配置见 packages/*\/vitest.config.ts。
 * 注意：server 的测试需要 Bun 运行时（见 README「测试」一节），
 * 因此根脚本统一用 `bunx --bun vitest` 执行。
 */
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
    coverage: {
      // 不用 v8：Bun 运行时下 v8 收不到数据（server 还会合并崩溃），
      // istanbul 是纯 JS 插桩，Node / Bun / 浏览器三种环境都能正确统计
      provider: 'istanbul',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // 启动入口没有分支逻辑，由 e2e 覆盖，不计入行覆盖率
        'packages/*/src/index.ts',
        'packages/web/src/main.tsx',
      ],
      reportsDirectory: './coverage',
      // 先设一个宽松基线，后续业务代码变多时可以逐步提高
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
})
