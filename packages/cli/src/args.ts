// citty 参数定义：全局参数（--server / --json）在所有子命令上各声明一份。
// citty 不把父命令的解析结果直接交给子命令，所以「写在子命令名之前」的全局参数
// 由 globals.ts 兜底（见 main.ts 的 setup），两种写法都能生效。

import type { ArgsDef } from 'citty'

/**
 * 所有子命令共用的全局参数。
 * 注意：--tag / --subtask 这类「可重复」参数由 utils.collectRepeatedArg 从 rawArgs 收集
 * （citty 0.2 的 args 解析不支持数组），这里声明只为帮助信息展示。
 */
export const commonArgs = {
  server: {
    type: 'string',
    description: 'server 地址（默认读 AGENT_TODO_SERVER，兜底 http://localhost:3001）',
    valueHint: 'url',
  },
  json: {
    type: 'boolean',
    description: '以 JSON 输出（机器可读）',
  },
} as const satisfies ArgsDef
