import { defineCommand } from 'citty'
import { todayKey } from '@agent-todo/shared'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import {
  collectRepeatedArg,
  formatTodoDetail,
  parsePriorityArg,
  printJson,
  requireDateKey,
  requireTitle,
  runSafely,
  usageError,
} from '../utils.ts'

/** add：新建待办；--tag / --subtask 可重复 */
export default defineCommand({
  meta: { name: 'add', description: '新建待办' },
  args: {
    ...commonArgs,
    title: { type: 'string', description: '标题（必填）', valueHint: '标题' },
    description: { type: 'string', description: '描述（Markdown）' },
    priority: { type: 'string', description: '优先级', valueHint: 'none|low|medium|high' },
    tag: { type: 'string', description: '标签，可重复', valueHint: '标签' },
    start: { type: 'string', description: '开始日期', valueHint: 'yyyy-mm-dd' },
    end: { type: 'string', description: '结束日期（需同时提供 --start）', valueHint: 'yyyy-mm-dd' },
    subtask: { type: 'string', description: '子任务标题，可重复', valueHint: '标题' },
  },
  run: ({ args, rawArgs }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const title = requireTitle(args.title)
      const priority = parsePriorityArg(args.priority)
      const startDate = args.start === undefined ? undefined : requireDateKey(args.start, '--start')
      const endDate = args.end === undefined ? undefined : requireDateKey(args.end, '--end')

      if (endDate !== undefined && startDate === undefined) {
        throw usageError('--end 需要同时提供 --start')
      }
      if (startDate !== undefined && endDate !== undefined && endDate < startDate) {
        throw usageError('--end 不能早于 --start')
      }

      const tags = collectRepeatedArg(rawArgs, 'tag')
      const subtasks = collectRepeatedArg(rawArgs, 'subtask')

      const todo = await getClient({ server }).createTodo({
        title,
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(priority ? { priority } : {}),
        ...(tags.length > 0 ? { tags } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
        ...(subtasks.length > 0 ? { subtasks } : {}),
      })

      if (json) {
        printJson(todo)
        return
      }
      console.log(`已创建待办：\n${formatTodoDetail(todo, todayKey())}`)
    }),
})
