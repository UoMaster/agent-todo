import { defineCommand } from 'citty'
import { todayKey } from '@agent-todo/shared'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import { formatTodoDetail, printJson, requirePositional, runSafely } from '../utils.ts'

/** show <id>：查看单条待办详情 */
export default defineCommand({
  meta: { name: 'show', description: '查看待办详情' },
  args: {
    ...commonArgs,
    id: { type: 'positional', description: '待办 ID', required: false },
  },
  run: ({ args }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const id = requirePositional(args.id, '待办 ID')
      const todo = await getClient({ server }).getTodo(id)

      if (json) {
        printJson(todo)
        return
      }
      console.log(formatTodoDetail(todo, todayKey()))
    }),
})
