import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts'],
    // 集成测试会真连本机端口；同时兼容 shell 里配置了系统代理的情况
    env: {
      NO_PROXY: 'localhost,127.0.0.1',
    },
  },
})
