import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { addDays, todayKey } from '@agent-todo/shared'
import App from './App.tsx'
import { findTodo, seed, serverState } from '../test/client.ts'
import './index.css'
import 'virtual:uno.css'

const today = todayKey()

beforeEach(async () => {
  await seed()
})

afterEach(async () => {
  await seed()
})

test('列表视图渲染待办并按分组展示，侧边栏给出状态计数', async () => {
  await seed([
    { title: '逾期任务', startDate: '2026-10-01' },
    { title: '今天的任务', startDate: today },
    { title: '本周的任务', startDate: addDays(today, 3) },
    { title: '以后的任务', startDate: addDays(today, 60) },
    { title: '未安排的任务' },
    { title: '已完成的任务', done: true },
  ])
  const screen = await render(<App />)

  await expect.element(screen.getByText('今天的任务')).toBeVisible()
  await expect.element(screen.getByText('以后的任务')).toBeVisible()
  await expect.element(screen.getByText('未安排的任务')).toBeVisible()
  await expect.element(screen.getByText('已完成的任务')).toBeVisible()

  await expect.element(screen.getByText('本周的任务')).toBeVisible()
  // 侧边栏的筛选按钮：名字里带计数，用「文字 + 数字」精确定位，避免匹配到列表行
  await expect.element(screen.getByRole('button', { name: '全部任务 6' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: '逾期 1' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: '今天 1' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: '即将到期 2' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: '已完成 1' })).toBeVisible()
})

test('空状态提示新建入口', async () => {
  const screen = await render(<App />)

  await expect.element(screen.getByText('这里还没有待办，点击右上角「新建待办」开始')).toBeVisible()
})

test('勾选复选框把待办标记为完成并发回服务器', async () => {
  await seed([{ title: '写文档' }])
  const screen = await render(<App />)

  await expect.element(screen.getByText('写文档')).toBeVisible()
  await screen.getByRole('button', { name: '标记为完成' }).click()

  await expect.poll(async () => (await findTodo('写文档')).done).toBe(true)
  await expect.element(screen.getByRole('button', { name: '标记为未完成' })).toBeVisible()
})

test('按状态筛选：今天 / 已完成', async () => {
  await seed([
    { title: '今天的任务', startDate: today },
    { title: '已完成的任务', done: true },
    { title: '很久以后', startDate: addDays(today, 90) },
  ])
  const screen = await render(<App />)

  await screen.getByRole('button', { name: /今天 \d/ }).click()
  await expect.element(screen.getByRole('heading', { name: '今天' })).toBeVisible()
  await expect.element(screen.getByText('今天的任务')).toBeVisible()
  await expect.element(page.getByText('很久以后')).not.toBeInTheDocument()

  await screen.getByRole('button', { name: /已完成 \d/ }).click()
  await expect.element(screen.getByRole('heading', { name: '已完成' })).toBeVisible()
  await expect.element(screen.getByText('已完成的任务')).toBeVisible()
})

test('按标签筛选（标签统计来自 /api/tags）', async () => {
  await seed([
    { title: '研发任务', tags: ['研发'] },
    { title: '设计任务', tags: ['设计'] },
  ])
  const screen = await render(<App />)

  await screen.getByRole('button', { name: /#研发/ }).click()

  await expect.element(screen.getByRole('heading', { name: '#研发' })).toBeVisible()
  await expect.element(screen.getByText('研发任务')).toBeVisible()
  await expect.element(page.getByText('设计任务')).not.toBeInTheDocument()
})

test('搜索同时匹配标题与描述', async () => {
  await seed([
    { title: 'Fix Login Bug' },
    { title: '其他', description: '这里也提到 login' },
    { title: '无关任务' },
  ])
  const screen = await render(<App />)

  await screen.getByRole('searchbox', { name: '搜索待办' }).fill('login')

  await expect.element(screen.getByText('Fix Login Bug')).toBeVisible()
  await expect.element(screen.getByText('其他')).toBeVisible()
  await expect.element(page.getByText('无关任务')).not.toBeInTheDocument()

  await screen.getByRole('searchbox', { name: '搜索待办' }).fill('找不到的关键字')
  await expect.element(screen.getByText('没有匹配的待办')).toBeVisible()
})

test('点「新建待办」创建空待办并直接打开编辑面板', async () => {
  const screen = await render(<App />)

  await screen.getByRole('button', { name: '新建待办' }).click()

  await expect.poll(async () => (await serverState()).todos.length).toBe(1)
  await expect.element(screen.getByRole('complementary', { name: '待办详情' })).toBeVisible()
  await expect.element(screen.getByRole('textbox', { name: '标题' })).toHaveFocus()
})

test('后端不可用时给出错误提示，页面不崩', async () => {
  await seed([], { failAll: true })
  const screen = await render(<App />)

  await expect.element(screen.getByText(/后端请求失败/)).toBeVisible()
  await expect.element(screen.getByText('这里还没有待办，点击右上角「新建待办」开始')).toBeVisible()
})

test('列表行显示优先级圆点、标签、附件与子任务计数、逾期徽标', async () => {
  await seed([
    {
      title: '综合信息',
      priority: 'high',
      tags: ['研发'],
      startDate: addDays(today, -3),
      attachments: [
        {
          id: 'a1',
          todoId: 't1',
          name: 'a.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      subtasks: [
        { id: 's1', todoId: 't1', title: '甲', done: true, position: 0 },
        { id: 's2', todoId: 't1', title: '乙', done: false, position: 1 },
      ],
    },
  ])
  const screen = await render(<App />)

  await expect.element(screen.getByText('逾期 3 天')).toBeVisible()
  await expect.element(page.getByText('研发')).toBeVisible()
  await expect.element(page.getByText('1/2')).toBeVisible()
})

test('样式真实生效：主按钮用设计令牌里的强调色（含 hover 态）', async () => {
  const screen = await render(<App />)

  const button = screen.getByRole('button', { name: '新建待办' })
  const element = await button.element()
  const rgb = () => {
    const [red = 0, green = 0, blue = 0] = (
      getComputedStyle(element).backgroundColor.match(/[\d.]+/g) ?? []
    ).map(Number)

    // 浏览器把 color-mix() 归一化成 color(srgb r g b)（0-1 浮点）
    return [Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)]
  }

  // 先把鼠标挪开：上一个测试可能把指针留在按钮上，会让按钮处于 hover 态
  await userEvent.hover(document.body)
  await expect.poll(rgb).toEqual([0x00, 0x71, 0xe3]) // --accent
  expect(getComputedStyle(element).borderRadius).toBe('12px')

  // hover 态用 --accent-hover（#0077ed）
  await button.hover()
  await expect.poll(rgb).toEqual([0x00, 0x77, 0xed])
})
