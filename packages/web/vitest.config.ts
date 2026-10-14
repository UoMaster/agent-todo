import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineProject } from 'vitest/config'

/**
 * 页面渲染测试跑在真实浏览器里（Vitest Browser Mode + Playwright）。
 * 默认 headless；想看真实浏览器窗口可以加 `--browser.headless=false`。
 */
export default defineProject({
  plugins: [react()],
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
