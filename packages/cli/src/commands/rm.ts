import { defineCommand } from 'citty'
import { todoTitle } from '@agent-todo/shared'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import { printJson, requirePositional, runSafely } from '../utils.ts'

/** rm <id>：删除待办 */
export default defineCommand({
  meta: { name: 'rm', description: '删除待办' },
  args: {
    ...commonArgs,
    id: { type: 'positional', description: '待办 ID', required: false },
  },
  run: ({ args }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const id = requirePositional(args.id, '待办 ID')
      const client = getClient({ server })

      // 先取一次，保证「不存在」报错可读，输出里也能带上标题
      const todo = await client.getTodo(id)
      await client.deleteTodo(id)

      if (json) {
        printJson({ id, deleted: true })
        return
      }
      console.log(`已删除待办：${todoTitle(todo)}（${id}）`)
    }),
})
