import { defineCommand, showUsage } from 'citty'
import { commonArgs } from './args.ts'
import add from './commands/add.ts'
import attachDownload from './commands/attach-download.ts'
import attachRm from './commands/attach-rm.ts'
import attachUpload from './commands/attach-upload.ts'
import list from './commands/list.ts'
import rm from './commands/rm.ts'
import show from './commands/show.ts'
import tags from './commands/tags.ts'
import update from './commands/update.ts'
import { setParentGlobalArgs } from './globals.ts'

/** 子命令注册表；新增命令时在这里挂上 */
const subCommands = {
  list,
  show,
  add,
  update,
  rm,
  tags,
  'attach-upload': attachUpload,
  'attach-download': attachDownload,
  'attach-rm': attachRm,
}

/** 子命令名 + 别名集合（citty 的别名运行时不外露，这里按定义收集） */
function subCommandNames(): Set<string> {
  const names = new Set<string>()

  for (const [name, command] of Object.entries(subCommands)) {
    names.add(name)

    const meta = command.meta
    if (!meta || typeof meta !== 'object' || !('alias' in meta)) continue
    const alias = meta.alias
    if (!alias) continue
    for (const item of Array.isArray(alias) ? alias : [alias]) names.add(item)
  }

  return names
}

/** 命令定义；执行入口在 index.ts，方便测试直接 import 本文件 */
export const main = defineCommand({
  meta: {
    name: 'agent-todo',
    version: '0.1.0',
    description: 'agent-todo 命令行客户端',
  },
  args: commonArgs,
  subCommands,
  setup({ args }) {
    // 暂存父命令解析到的全局参数，子命令解析不到时回退（见 globals.ts）
    setParentGlobalArgs({ server: args.server, json: args.json })
  },
  async run({ rawArgs, cmd }) {
    // citty 执行完子命令后仍会调用父命令的 run；这里只在没写子命令时打印用法
    const names = subCommandNames()
    if (rawArgs.some((arg) => names.has(arg))) return

    await showUsage(cmd)
  },
})
