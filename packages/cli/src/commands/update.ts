import { defineCommand } from 'citty'
import type { SubtaskInput, TodoUpdate } from '@agent-todo/shared'
import { todayKey } from '@agent-todo/shared'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import {
  collectRepeatedArg,
  dedupe,
  formatTodoDetail,
  parseDoneArg,
  parsePriorityArg,
  printJson,
  requireDateKey,
  requirePositional,
  requireTitle,
  runSafely,
  usageError,
} from '../utils.ts'

/**
 * update <id>：更新待办。
 * PUT /api/todos/:id 是整条替换语义，所以先 GET 再合并：未指定的字段保持原值，
 * 子任务列表必须带上现有子任务（含 id），否则会被整体删掉。
 */
export default defineCommand({
  meta: { name: 'update', description: '更新待办（未指定的字段保持原值）' },
  args: {
    ...commonArgs,
    id: { type: 'positional', description: '待办 ID', required: false },
    title: { type: 'string', description: '新标题' },
    description: { type: 'string', description: '新描述' },
    done: { type: 'string', description: '完成状态', valueHint: 'true|false' },
    priority: { type: 'string', description: '优先级', valueHint: 'none|low|medium|high' },
    tag: { type: 'string', description: '替换整个标签集合，可重复', valueHint: '标签' },
    'add-tag': { type: 'string', description: '追加标签，可重复', valueHint: '标签' },
    start: { type: 'string', description: '开始日期', valueHint: 'yyyy-mm-dd' },
    end: { type: 'string', description: '结束日期', valueHint: 'yyyy-mm-dd' },
    range: {
      type: 'boolean',
      description: '保留结束日期（默认行为）',
      negativeDescription: '清空结束日期（变回单日待办）',
    },
    date: {
      type: 'boolean',
      description: '保留日期（默认行为）',
      negativeDescription: '清空开始与结束日期（变回未安排）',
    },
    subtask: { type: 'string', description: '替换子任务列表，可重复', valueHint: '标题' },
  },
  run: ({ args, rawArgs }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const id = requirePositional(args.id, '待办 ID')
      const client = getClient({ server })
      const existing = await client.getTodo(id)

      const title = args.title === undefined ? existing.title : requireTitle(args.title)
      const description = args.description ?? existing.description
      const done = parseDoneArg(args.done) ?? existing.done
      const priority = parsePriorityArg(args.priority) ?? existing.priority

      const replaceTags = collectRepeatedArg(rawArgs, 'tag')
      const addTags = collectRepeatedArg(rawArgs, 'add-tag')
      if (replaceTags.length > 0 && addTags.length > 0) {
        throw usageError('--tag 与 --add-tag 不能同时使用')
      }
      const tags =
        replaceTags.length > 0 ? replaceTags : dedupe([...existing.tags, ...addTags])

      const noDate = args.date === false
      const noRange = args.range === false
      if (noDate && noRange) throw usageError('--no-date 与 --no-range 不能同时使用')

      const startArg = args.start === undefined ? undefined : requireDateKey(args.start, '--start')
      const endArg = args.end === undefined ? undefined : requireDateKey(args.end, '--end')
      if (noDate && (startArg !== undefined || endArg !== undefined)) {
        throw usageError('--no-date 不能与 --start / --end 同时使用')
      }
      if (noRange && endArg !== undefined) throw usageError('--no-range 不能与 --end 同时使用')

      let startDate = existing.startDate
      let endDate = existing.endDate
      if (noDate) {
        startDate = null
        endDate = null
      } else {
        if (startArg !== undefined) startDate = startArg
        if (noRange) endDate = null
        else if (endArg !== undefined) endDate = endArg

        if (startDate === null && endDate !== null) {
          if (endArg !== undefined) {
            throw usageError('--end 需要先有开始日期（可用 --start 指定）')
          }
          // 理论不会出现（服务端校验保证）；保守清空，避免发出非法请求
          endDate = null
        }
        if (startDate !== null && endDate !== null && endDate < startDate) {
          throw usageError('结束日期不能早于开始日期')
        }
      }

      const subtaskTitles = collectRepeatedArg(rawArgs, 'subtask')
      const subtasks: SubtaskInput[] =
        subtaskTitles.length > 0
          ? subtaskTitles.map((subtaskTitle) => ({ title: subtaskTitle }))
          : existing.subtasks.map((subtask) => ({
              id: subtask.id,
              title: subtask.title,
              done: subtask.done,
            }))

      const update: TodoUpdate = {
        title,
        description,
        done,
        priority,
        tags,
        startDate,
        endDate,
        subtasks,
      }
      const todo = await client.updateTodo(id, update)

      if (json) {
        printJson(todo)
        return
      }
      console.log(`已更新待办：\n${formatTodoDetail(todo, todayKey())}`)
    }),
})
