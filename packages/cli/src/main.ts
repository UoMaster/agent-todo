import { defineCommand } from 'citty'

/** 命令定义；执行入口在 index.ts，方便测试直接 import 本文件 */
export const main = defineCommand({
  meta: {
    name: 'agent-todo',
    version: '0.1.0',
    description: 'agent-todo 命令行客户端',
  },
  run() {
    console.log('agent-todo CLI 已就绪，业务命令待实现')
  },
})
