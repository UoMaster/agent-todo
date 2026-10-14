import { defineCommand } from 'citty'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import { printJson, requirePositional, runSafely } from '../utils.ts'

/** attach-rm <attachmentId>：删除附件 */
export default defineCommand({
  meta: { name: 'attach-rm', description: '删除附件' },
  args: {
    ...commonArgs,
    id: { type: 'positional', description: '附件 ID', required: false },
  },
  run: ({ args }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const id = requirePositional(args.id, '附件 ID')
      await getClient({ server }).deleteAttachment(id)

      if (json) {
        printJson({ id, deleted: true })
        return
      }
      console.log(`已删除附件：${id}`)
    }),
})
