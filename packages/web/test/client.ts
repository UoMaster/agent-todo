import { inject } from 'vitest'
import type { FakeAttachment, FakeSubtask, FakeTodo } from './fake-server.ts'

/**
 * 浏览器测试操作假 server 的入口。
 *
 * 假 server 跑在 Node（vitest globalSetup），浏览器里的测试通过 `/__test/*` 控制端点
 * 种数据 / 读状态——断言的是「服务器真的收到了什么」，而不是只看 UI。
 * 地址来自 vitest 的 provide/inject（见 vitest.config.ts / test/global-setup.ts）。
 */
// vitest 5.0.4 的 inject 泛型要求 keyof ProvidedContext，这里的键在运行时由
// globalSetup 的 provide 注入；用断言把类型收紧成 string，避免依赖脆弱的接口增强
export const fakeServerUrl = inject('fakeServerUrl' as never) as unknown as string

export type { FakeAttachment, FakeSubtask, FakeTodo }

export interface FakeState {
  todos: FakeTodo[]
  tags: Array<{ tag: string; count: number }>
  downloads: string[]
}

/** 重置假 server 的数据（每个测试开始前调用） */
export async function seed(
  todos: Array<Partial<FakeTodo>> = [],
  options: { failAll?: boolean } = {},
): Promise<void> {
  const response = await fetch(`${fakeServerUrl}/__test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos, failAll: options.failAll ?? false }),
  })
  if (!response.ok) throw new Error(`seed 失败：${response.status}`)
}

/** 读取假 server 当前状态（用于断言写操作真的落到了服务器） */
export async function serverState(): Promise<FakeState> {
  const response = await fetch(`${fakeServerUrl}/__test/state`)
  if (!response.ok) throw new Error(`读取状态失败：${response.status}`)

  return (await response.json()) as FakeState
}

/** 只切换故障开关（测「后端突然不可用」的分支） */
export async function setFailAll(failAll: boolean): Promise<void> {
  await fetch(`${fakeServerUrl}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failAll }),
  })
}

/** 找一个待办（按标题），拿不到就抛错（当断言失败用） */
export async function findTodo(title: string): Promise<FakeTodo> {
  const state = await serverState()
  const todo = state.todos.find((item) => item.title === title)
  if (!todo) throw new Error(`服务器上没有标题为「${title}」的待办`)

  return todo
}
