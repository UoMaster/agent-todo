import { fileURLToPath } from 'node:url'
import UnoCSS from '@unocss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineProject } from 'vitest/config'
import { FAKE_SERVER_ORIGIN } from './test/fake-server.ts'

// 显式指定 UnoCSS 配置：默认按 process.cwd() 查找，从仓库根跑（pnpm test / verify）会找不到
const unoConfigFile = fileURLToPath(new URL('./uno.config.ts', import.meta.url))

/**
 * 页面渲染测试跑在真实浏览器里（Vitest Browser Mode + Playwright）。
 * 默认 headless；想看真实浏览器窗口可以加 `--browser.headless=false`。
 *
 * 三个关键点：
 * 1. 同样要挂 UnoCSS 插件，否则测试里的工具类不会生成（与真实入口同一份配置）
 * 2. `/api` 代理到测试用的假 server（test/fake-server.ts）：它由 globalSetup 在 Node 里启动，
 *    端口固定（代理目标只能在配置里写死），所以测试文件串行执行（fileParallelism: false）
 * 3. fakeServerUrl 通过 provide 注入，测试里用 `inject('fakeServerUrl')` 拿控制端点地址
 */
export default defineProject({
  plugins: [UnoCSS({ configFile: unoConfigFile }), react()],
  server: {
    proxy: {
      '/api': { target: FAKE_SERVER_ORIGIN, changeOrigin: true },
    },
  },
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}'],
    globalSetup: ['./test/global-setup.ts'],
    provide: { fakeServerUrl: FAKE_SERVER_ORIGIN },
    // 多个测试文件同时跑会抢同一个假 server 端口
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
      // 默认视口太小会命中 max-md 断点（搜索框、侧边栏都会变成移动端布局）
      viewport: { width: 1440, height: 900 },
    },
  },
})
