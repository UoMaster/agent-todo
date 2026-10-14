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

/** 切到日历视图 */
async function openCalendar(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole('tab', { name: '日历' }).click()
  await expect.element(screen.getByText(/年\d+月/).first()).toBeVisible()
}

/** 取某一天的格子 */
function cell(date: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-date="${date}"]`)
  if (!element) throw new Error(`日历里找不到 ${date} 的格子`)

  return element
}

/** 取某天格子里的待办小卡片（单日待办） */
function chip(date: string): HTMLElement {
  const element = cell(date).querySelector<HTMLElement>('.cal-chip')
  if (!element) throw new Error(`${date} 里找不到待办卡片`)

  return element
}

/** 取区间待办的范围条（按标题文字找最近的拖拽条） */
function rangeBar(title: string): HTMLElement {
  const label = [...document.querySelectorAll('span')].find((node) => node.textContent === title)
  const bar = label?.closest<HTMLElement>('[class~="cursor-grab"]')
  if (!bar) throw new Error(`找不到范围条：${title}`)

  return bar
}

/**
 * 在某个格子中心按下鼠标并拖到另一个格子。
 *
 * 应用用的是 window 上的 pointermove / pointerup + `document.elementFromPoint` 判断落点，
 * jsdom 那套合成事件在这里不管用，必须派发真实 PointerEvent（React 19 会从 window 上捕获
 * pointermove，但 React 挂的是原生监听，所以这里直接 dispatch 到目标元素即可）。
 */
async function dragBetween(source: HTMLElement, target: HTMLElement, steps = 8) {
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  // 抓缩放手柄时用中点；抓条本身时避开两端各 10px 的手柄区（否则会变成调整区间）
  const isHandle = source.getAttribute('aria-label')?.startsWith('调整') ?? false
  const fromX = isHandle ? from.left + from.width / 2 : from.left + Math.max(14, from.width / 2)
  const fromY = from.top + from.height / 2

  const fire = (type: string, x: number, y: number) => {
    const point = document.elementFromPoint(x, y) ?? document.body
    point.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
      }),
    )
  }

  fire('pointerdown', fromX, fromY)
  await new Promise((resolve) => requestAnimationFrame(resolve))

  for (let step = 1; step <= steps; step += 1) {
    fire(
      'pointermove',
      fromX + ((to.left + to.width / 2 - fromX) * step) / steps,
      fromY + ((to.top + 12 - fromY) * step) / steps,
    )
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }

  fire('pointerup', to.left + to.width / 2, to.top + 12)
  await new Promise((resolve) => requestAnimationFrame(resolve))
}

test('日历按周日历网格渲染，单日待办落格、区间待办显示为范围条', async () => {
  await seed([
    { title: '单日待办', startDate: '2026-10-21' },
    { title: '区间待办', startDate: '2026-10-05', endDate: '2026-10-09' },
  ])
  const screen = await render(<App />)
  await openCalendar(screen)

  await expect.element(screen.getByText('2026年10月')).toBeVisible()
  expect(cell('2026-10-21')).toBeTruthy()
  expect(cell('2026-10-05')).toBeTruthy()
  await expect.element(screen.getByText('单日待办')).toBeVisible()
  await expect.element(screen.getByText('区间待办')).toBeVisible()

  // 星期表头（周一开始）
  for (const weekday of ['一', '二', '三', '四', '五', '六', '日']) {
    await expect.element(screen.getByText(weekday, { exact: true })).toBeVisible()
  }
})

test('点击空白日期快速新建待办，并以编辑模式打开', async () => {
  const screen = await render(<App />)
  await openCalendar(screen)

  await userEvent.click(cell('2026-10-20'))

  await expect.poll(async () => (await serverState()).todos[0]?.startDate).toBe('2026-10-20')
  await expect.element(screen.getByRole('complementary', { name: '待办详情' })).toBeVisible()
  await expect.element(screen.getByRole('textbox', { name: '标题' })).toBeVisible()
})

test('拖拽单日待办到另一天：日期随之改变', async () => {
  await seed([{ title: '拖我', startDate: '2026-10-06' }])
  const screen = await render(<App />)
  await openCalendar(screen)

  await dragBetween(chip('2026-10-06'), cell('2026-10-20'))

  await expect.poll(async () => (await findTodo('拖我')).startDate).toBe('2026-10-20')
  await expect.poll(async () => (await findTodo('拖我')).endDate).toBeNull()
})

test('拖拽范围条整体平移：开始与结束同时后移，保持天数', async () => {
  await seed([{ title: '区间', startDate: '2026-10-05', endDate: '2026-10-08' }])
  const screen = await render(<App />)
  await openCalendar(screen)

  await dragBetween(rangeBar('区间'), cell('2026-10-19'))

  await expect.poll(async () => (await findTodo('区间')).startDate).toBe('2026-10-19')
  await expect.poll(async () => (await findTodo('区间')).endDate).toBe('2026-10-22')
})

test('拖拽范围条右端手柄：只改结束日期', async () => {
  await seed([{ title: '区间', startDate: '2026-10-05', endDate: '2026-10-08' }])
  const screen = await render(<App />)
  await openCalendar(screen)

  const handle = document.querySelector<HTMLElement>('[aria-label="调整结束日期"]')
  if (!handle) throw new Error('找不到右端手柄')

  await dragBetween(handle, cell('2026-10-15'))

  await expect.poll(async () => (await findTodo('区间')).endDate).toBe('2026-10-15')
  await expect.poll(async () => (await findTodo('区间')).startDate).toBe('2026-10-05')
})

test('拖拽范围条左端手柄：只改开始日期，越过结束日期则变回单日', async () => {
  await seed([{ title: '区间', startDate: '2026-10-12', endDate: '2026-10-18' }])
  const screen = await render(<App />)
  await openCalendar(screen)

  const handle = document.querySelector<HTMLElement>('[aria-label="调整开始日期"]')
  if (!handle) throw new Error('找不到左端手柄')

  // 往回缩：开始 12 → 14，结束保持不变
  await dragBetween(handle, cell('2026-10-14'))
  await expect.poll(async () => (await findTodo('区间')).startDate).toBe('2026-10-14')
  expect((await findTodo('区间')).endDate).toBe('2026-10-18')

  // 越过结束日期：开始拖到 20，区间失效，退回单日
  await dragBetween(cell('2026-10-14').querySelector<HTMLElement>('[aria-label="调整开始日期"]') ?? handle, cell('2026-10-20'))
  await expect.poll(async () => (await findTodo('区间')).startDate).toBe('2026-10-20')
  await expect.poll(async () => (await findTodo('区间')).endDate).toBeNull()
})

test('点击范围条打开详情（没有拖动时不改日期）', async () => {
  await seed([{ title: '区间', startDate: '2026-10-05', endDate: '2026-10-08' }])
  const screen = await render(<App />)
  await openCalendar(screen)

  // 点击范围条本身（不是两端的手柄）
  await userEvent.click(rangeBar('区间'))

  await expect.element(screen.getByRole('complementary', { name: '待办详情' })).toBeVisible()
  expect((await findTodo('区间')).startDate).toBe('2026-10-05')
})

test('月份导航：上个月 / 下个月 / 回到今天', async () => {
  const screen = await render(<App />)
  await openCalendar(screen)

  const [year = 0, month = 1] = today.split('-').map(Number)
  const previous = month === 1 ? `${year - 1}年12月` : `${year}年${month - 1}月`
  const next = month === 12 ? `${year + 1}年1月` : `${year}年${month + 1}月`

  await screen.getByRole('button', { name: '上个月' }).click()
  await expect.element(screen.getByText(previous)).toBeVisible()

  await screen.getByRole('button', { name: '下个月' }).click()
  await expect.element(screen.getByText(`${year}年${month}月`)).toBeVisible()

  await screen.getByRole('button', { name: '下个月' }).click()
  await expect.element(screen.getByText(next)).toBeVisible()

  await screen.getByRole('button', { name: '今天' }).click()
  await expect.element(screen.getByText(`${year}年${month}月`)).toBeVisible()
})

test('同一天待办过多时显示折叠提示', async () => {
  const day = addDays(today, 1)
  await seed([
    { title: '任务一', startDate: day },
    { title: '任务二', startDate: day },
    { title: '任务三', startDate: day },
    { title: '任务四', startDate: day },
    { title: '任务五', startDate: day },
  ])
  const screen = await render(<App />)
  await openCalendar(screen)

  await expect.element(screen.getByText(/\+\d+ 项/)).toBeVisible()
})

test('日历顶部显示逾期条数', async () => {
  await seed([{ title: '逾期了', startDate: addDays(today, -2) }])
  const screen = await render(<App />)
  await openCalendar(screen)

  await expect.element(screen.getByText('逾期 1 项')).toBeVisible()
})
