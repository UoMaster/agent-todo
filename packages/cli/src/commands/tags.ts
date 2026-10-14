import { defineCommand } from 'citty'
import { commonArgs } from '../args.ts'
import { getClient } from '../client.ts'
import { resolveGlobalArgs } from '../globals.ts'
import { formatTagList, printJson, runSafely } from '../utils.ts'

/** tags：列出标签与引用计数 */
export default defineCommand({
  meta: { name: 'tags', description: '列出标签与计数' },
  args: { ...commonArgs },
  run: ({ args }) =>
    runSafely(async () => {
      const { server, json } = resolveGlobalArgs(args)
      const tags = await getClient({ server }).listTags()

      if (json) {
        printJson(tags)
        return
      }
      console.log(formatTagList(tags))
    }),
})
