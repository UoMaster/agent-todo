import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import App from './App.tsx'
// 真实应用里样式由 main.tsx 引入，测试里单独渲染 App 时要自己加载
import './index.css'

/**
 * 页面渲染测试跑在真实浏览器（Chromium）里：
 * 真实 DOM、真实样式、真实事件，接近用户体验。
 */
test('渲染占位页的基本内容', async () => {
  const screen = await render(<App />)

  await expect.element(screen.getByRole('heading', { name: 'agent-todo' })).toBeVisible()
  await expect.element(screen.getByText('前端脚手架已就绪，业务功能待实现。')).toBeVisible()
  await expect.element(screen.getByText('http://localhost:3001')).toBeVisible()
})

test('样式表在浏览器中真实生效', async () => {
  const screen = await render(<App />)

  const logo = screen.getByText('✓')
  const element = await logo.element()

  // index.css 里 .placeholder-logo 的背景色是 #6366f1
  expect(getComputedStyle(element).backgroundColor).toBe('rgb(99, 102, 241)')
})
