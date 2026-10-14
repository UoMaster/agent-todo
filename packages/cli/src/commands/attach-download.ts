import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { defineCommand } from 'citty'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import {
  printJson,
  requirePositional,
  resolveDownloadPath,
  runSafely,
} from '../utils.ts'

/** attach-download <attachmentId>：把附件下载到本地 */
export default defineCommand({
  meta: { name: 'attach-download', description: '下载附件到本地' },
  args: {
    ...commonArgs,
    id: { type: 'positional', description: '附件 ID', required: false },
    output: { type: 'string', description: '输出文件或目录（默认当前目录）', valueHint: '路径' },
  },
  run: ({ args }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const id = requirePositional(args.id, '附件 ID')
      const attachment = await getClient({ server }).downloadAttachment(id)

      const target = await resolveDownloadPath(args.output, attachment.name, id)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, attachment.data)

      if (json) {
        printJson({
          path: target,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.data.byteLength,
        })
        return
      }
      console.log(`已下载附件：${attachment.name} → ${target}`)
    }),
})
