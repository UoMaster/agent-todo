import { afterEach, beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
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

/** 打开某条待办详情（点列表行） */
async function openTodo(screen: Awaited<ReturnType<typeof render>>, title: string) {
  await screen.getByText(title).click()
  await expect.element(screen.getByRole('complementary', { name: '待办详情' })).toBeVisible()
}

test('点列表行打开详情抽屉，查看模式展示描述 / 日期 / 优先级 / 标签', async () => {
  await seed([
    {
      title: '完成 Q4 路线图',
      description: '**评审要点**\n\n- 核对人力',
      priority: 'high',
      tags: ['产品', '会议'],
      startDate: today,
      endDate: addDays(today, 2),
    },
  ])
  const screen = await render(<App />)

  await openTodo(screen, '完成 Q4 路线图')

  await expect.element(screen.getByText('评审要点')).toBeVisible()
  await expect.element(screen.getByText('核对人力')).toBeVisible()
  await expect.element(screen.getByText(/3 天/)).toBeVisible()
  await expect.element(screen.getByText('高')).toBeVisible()
  await expect.element(screen.getByLabelText('待办详情').getByText('#产品')).toBeVisible()
  await expect.element(screen.getByLabelText('待办详情').getByText('#会议')).toBeVisible()
})

test('编辑模式改标题，防抖保存到服务器', async () => {
  await seed([{ title: '旧标题' }])
  const screen = await render(<App />)

  await openTodo(screen, '旧标题')
  await screen.getByRole('tab', { name: '编辑' }).click()

  const titleInput = screen.getByRole('textbox', { name: '标题' })
  await titleInput.fill('新标题')

  await expect.poll(async () => (await serverState()).todos[0]?.title).toBe('新标题')
  await expect.element(screen.getByText('新标题')).toBeVisible()
})

test('勾选「标记为完成」切换状态并落库', async () => {
  await seed([{ title: '写文档' }])
  const screen = await render(<App />)

  await openTodo(screen, '写文档')
  await screen.getByText('标记为完成').click()

  await expect.poll(async () => (await findTodo('写文档')).done).toBe(true)
  await expect.element(screen.getByLabelText('待办详情').getByText('已完成')).toBeVisible()
})

test('切换优先级与标签（含自定义标签）都会保存', async () => {
  await seed([{ title: '任务', tags: ['研发'] }])
  const screen = await render(<App />)

  await openTodo(screen, '任务')
  await screen.getByRole('tab', { name: '编辑' }).click()

  // 优先级：点「高」
  await screen.getByRole('button', { name: '高' }).click()
  await expect.poll(async () => (await serverState()).todos[0]?.priority).toBe('high')

  // 内置标签：加「会议」
  await screen.getByRole('button', { name: '会议' }).click()
  await expect.poll(async () => (await serverState()).todos[0]?.tags).toContain('会议')

  // 自定义标签：输入后回车
  await screen.getByRole('textbox', { name: '添加标签' }).fill('季度重点')
  await userEvent.keyboard('{Enter}')
  await expect.poll(async () => (await serverState()).todos[0]?.tags).toContain('季度重点')

  // 再点一次「研发」→ 取消该标签
  await screen.getByRole('button', { name: '研发' }).click()
  await expect.poll(async () => (await serverState()).todos[0]?.tags).toEqual(['会议', '季度重点'])
})

test('子任务：回车新增、勾选完成、删除', async () => {
  await seed([{ title: '任务' }])
  const screen = await render(<App />)

  await openTodo(screen, '任务')
  await screen.getByRole('tab', { name: '编辑' }).click()

  const input = screen.getByRole('textbox', { name: '添加子任务' })
  await input.fill('整理数据')
  await userEvent.keyboard('{Enter}')
  await expect.poll(async () => (await serverState()).todos[0]?.subtasks[0]?.title).toBe('整理数据')

  const todo = await findTodo('任务')
  const subtask = todo.subtasks[0]
  if (!subtask) throw new Error('子任务没有落库')

  await screen.getByRole('button', { name: '切换子任务' }).click()
  await expect.poll(async () => (await findTodo('任务')).subtasks[0]?.done).toBe(true)

  await screen.getByRole('button', { name: '删除子任务 整理数据' }).click()
  await expect.poll(async () => (await findTodo('任务')).subtasks.length).toBe(0)
})

test('日期：打开时间范围自动补结束日期，改开始日期会落库', async () => {
  await seed([{ title: '任务' }])
  const screen = await render(<App />)

  await openTodo(screen, '任务')
  await screen.getByRole('tab', { name: '编辑' }).click()

  await screen.getByText('时间范围').click()
  await expect.poll(async () => (await serverState()).todos[0]?.endDate).toBe(addDays(today, 1))

  await screen.getByLabelText('开始').fill(addDays(today, 2))
  await expect.poll(async () => (await serverState()).todos[0]?.startDate).toBe(addDays(today, 2))

  // 结束日期不能早于开始：输入更早的日期会被夹到开始日期（等于开始 → 变回单日）
  await screen.getByLabelText('结束').fill(addDays(today, 1))
  await expect.poll(async () => (await serverState()).todos[0]?.endDate).toBe(addDays(today, 2))
})

test('Markdown 编辑：工具栏插入加粗，预览渲染成 strong', async () => {
  await seed([{ title: '任务' }])
  const screen = await render(<App />)

  await openTodo(screen, '任务')
  await screen.getByRole('tab', { name: '编辑' }).click()

  const textarea = screen.getByRole('textbox', { name: '待办描述' })
  await textarea.fill('重点：')
  await textarea.click()
  await userEvent.keyboard('{End}')
  await screen.getByRole('button', { name: '加粗' }).click()
  await userEvent.keyboard('必须修复')

  await expect.poll(async () => (await serverState()).todos[0]?.description).toBe('重点：**必须修复**')

  await screen.getByRole('tab', { name: '预览' }).click()
  await expect.element(screen.getByText('必须修复')).toBeVisible()
  const strong = document.querySelector('.md-body strong')
  expect(strong?.textContent).toBe('必须修复')
})

test('描述里的原始 HTML 会被消毒（XSS 防护）', async () => {
  await seed([
    {
      title: '任务',
      description: '正常文本\n\n<script>window.__xss = 1</script>\n\n<img src=x onerror="window.__xss=2">',
    },
  ])
  const screen = await render(<App />)

  await openTodo(screen, '任务')

  await expect.element(screen.getByText(/正常文本/)).toBeVisible()
  expect(document.querySelector('.md-body script')).toBeNull()
  expect(document.querySelector('.md-body img')).toBeNull()
  expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
})

test('上传附件：发送 multipart，列表出现附件与大小', async () => {
  await seed([{ title: '任务' }])
  const screen = await render(<App />)

  await openTodo(screen, '任务')
  await screen.getByRole('tab', { name: '编辑' }).click()

  const file = new File(['hello 附件'], '说明.txt', { type: 'text/plain' })
  await userEvent.upload(screen.getByLabelText('选择文件上传'), file)

  await expect.poll(async () => (await findTodo('任务')).attachments[0]?.name).toBe('说明.txt')
  // 文本被拆成多个节点，用 link（<a>）与匹配器分别断言
  await expect.element(screen.getByRole('link', { name: '说明.txt' })).toBeVisible()
  await expect.element(screen.getByText('12 B')).toBeVisible()
})

test('删除附件：从服务器与界面同时移除', async () => {
  await seed([
    {
      title: '任务',
      attachments: [
        {
          id: 'a1',
          todoId: 't1',
          name: '旧报告.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    },
  ])
  const screen = await render(<App />)

  await openTodo(screen, '任务')
  await screen.getByRole('tab', { name: '编辑' }).click()

  await screen.getByRole('button', { name: '移除附件 旧报告.pdf' }).click()

  await expect.poll(async () => (await findTodo('任务')).attachments.length).toBe(0)
  await expect.element(screen.getByText('还没有附件')).toBeVisible()
})

test('删除待办：从服务器删除并关闭面板', async () => {
  await seed([{ title: '要删的待办' }])
  const screen = await render(<App />)

  await openTodo(screen, '要删的待办')
  await screen.getByRole('tab', { name: '编辑' }).click()
  await screen.getByRole('button', { name: '删除待办' }).click()

  await expect.poll(async () => (await serverState()).todos.length).toBe(0)
  await expect.element(screen.getByText('这里还没有待办，点击右上角「新建待办」开始')).toBeVisible()
})

test('Esc 关闭抽屉，改动先落库', async () => {
  await seed([{ title: '任务' }])
  const screen = await render(<App />)

  await openTodo(screen, '任务')
  await screen.getByRole('tab', { name: '编辑' }).click()
  await screen.getByRole('textbox', { name: '标题' }).fill('改完就关')

  await userEvent.keyboard('{Escape}')

  await expect.poll(async () => (await serverState()).todos[0]?.title).toBe('改完就关')
  await expect.element(screen.getByRole('complementary', { name: '待办详情' })).not.toBeInTheDocument()
})
