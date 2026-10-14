import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'cli',
    include: ['src/**/*.test.ts'],
    // 集成测试会 spawn bun 子进程，Bun 冷启动偶尔偏慢，放宽超时
    testTimeout: 20_000,
    // 测试里会访问本机 server，绕过系统代理
    env: {
      NO_PROXY: 'localhost,127.0.0.1',
    },
  },
})
