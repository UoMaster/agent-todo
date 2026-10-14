#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'

const main = defineCommand({
  meta: {
    name: 'agent-todo',
    version: '0.1.0',
    description: 'agent-todo 命令行客户端',
  },
  run() {
    console.log('agent-todo CLI 已就绪，业务命令待实现')
  },
})

runMain(main)
