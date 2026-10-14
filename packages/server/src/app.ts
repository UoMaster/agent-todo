import { Hono } from 'hono'

/** 应用本体；启动逻辑在 index.ts，方便测试直接 import 本文件 */
export const app = new Hono().get('/', (c) => c.text('agent-todo server'))
