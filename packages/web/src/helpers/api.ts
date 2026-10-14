import { createClient, type AgentTodoClient } from '@agent-todo/shared'

/**
 * 后端地址：
 * - 默认同源（dev 时 Vite 把 /api 代理到 server，生产由 server 自己托管前端）
 * - 需要直连时用 VITE_API_BASE_URL 覆盖（同步更新 src/vite-env.d.ts 的类型）
 */
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export const api: AgentTodoClient = createClient({ baseUrl })

/** 附件的直接下载地址（图片预览 / 新窗口打开都走它） */
export function attachmentUrl(id: string): string {
  return `${baseUrl}/api/attachments/${encodeURIComponent(id)}/content`
}
