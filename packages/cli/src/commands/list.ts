import { defineCommand } from 'citty'
import { compareTodos, todayKey } from '@agent-todo/shared'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import { formatTodoLine, parseStatusFilter, printJson, runSafely } from '../utils.ts'

/** list / ls：列出待办，可按状态、标签、关键字筛选 */
export default defineCommand({
  meta: {
    name: 'list',
    alias: 'ls',
    description: '列出待办（可按状态 / 标签 / 关键字筛选）',
  },
  args: {
    ...commonArgs,
    status: {
      type: 'string',
      description: '状态筛选',
      valueHint: 'all|today|upcoming|overdue|done',
    },
    tag: { type: 'string', description: '按标签筛选', valueHint: 'tag' },
    query: { type: 'string', description: '按标题 / 描述搜索', valueHint: '关键字' },
  },
  run: ({ args }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const status = parseStatusFilter(args.status)
      const todos = await getClient({ server }).listTodos({
        ...(status ? { status } : {}),
        ...(args.tag ? { tag: args.tag } : {}),
        ...(args.query ? { query: args.query } : {}),
      })

      if (json) {
        printJson(todos)
        return
      }
      if (todos.length === 0) {
        console.log('暂无待办')
        return
      }

      const today = todayKey()
      console.log(`共 ${todos.length} 条待办`)
      for (const todo of [...todos].sort(compareTodos)) {
        console.log(formatTodoLine(todo, today))
      }
    }),
})
