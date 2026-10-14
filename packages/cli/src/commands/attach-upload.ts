import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { defineCommand } from 'citty'
import { formatFileSize } from '@agent-todo/shared'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import {
  CliError,
  guessMimeType,
  printJson,
  requirePositional,
  runSafely,
} from '../utils.ts'

/** attach-upload <todoId> <filePath>：读取本地文件并上传为待办附件 */
export default defineCommand({
  meta: { name: 'attach-upload', description: '上传附件（读取本地文件）' },
  args: {
    ...commonArgs,
    todoId: { type: 'positional', description: '待办 ID', required: false },
    filePath: { type: 'positional', description: '本地文件路径', required: false },
  },
  run: ({ args }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const todoId = requirePositional(args.todoId, '待办 ID')
      const filePath = requirePositional(args.filePath, '本地文件路径')

      let data: Uint8Array
      try {
        data = await readFile(filePath)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new CliError(`无法读取文件：${filePath}（${detail}）`)
      }

      const name = basename(filePath)
      const attachment = await getClient({ server }).uploadAttachment(todoId, {
        name,
        data,
        mimeType: guessMimeType(name),
      })

      if (json) {
        printJson(attachment)
        return
      }
      console.log(
        `已上传附件：${attachment.name}（${formatFileSize(attachment.size)}），附件 ID：${attachment.id}`,
      )
    }),
})
