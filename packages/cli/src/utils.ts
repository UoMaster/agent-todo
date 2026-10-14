// CLI 公共工具：参数解析辅助、人类可读渲染、统一错误出口。
// 保持纯函数 / 简单副作用（console、process.exitCode），方便单测。

import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import {
  ApiError,
  PRIORITY_LABEL,
  formatDateRangeText,
  formatFileSize,
  isDateKey,
  isOverdue,
  isPriority,
  overdueDays,
  todoTitle,
  type Attachment,
  type Priority,
  type TagSummary,
  type Todo,
  type TodoStatusFilter,
} from '@agent-todo/shared'

/** 默认 server 地址：--server > AGENT_TODO_SERVER > 此值 */
export const DEFAULT_SERVER_URL = 'http://localhost:3001'

/** list --status 的合法取值 */
export const TODO_STATUS_FILTERS = ['all', 'today', 'upcoming', 'overdue', 'done'] as const

/** 命令执行失败的可读错误；message 是完整的中文提示，直接展示给用户 */
export class CliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliError'
  }
}

/** 参数用法错误（前缀「参数错误：」，与执行失败区分） */
export function usageError(message: string): CliError {
  return new CliError(`参数错误：${message}`)
}

/** 解析 server 地址：--server > AGENT_TODO_SERVER > 默认值 */
export function resolveServerUrl(server?: string): string {
  const fromArg = server?.trim()
  if (fromArg) return fromArg

  const fromEnv = process.env.AGENT_TODO_SERVER?.trim()
  if (fromEnv) return fromEnv

  return DEFAULT_SERVER_URL
}

/** --json 输出：固定缩进，写到 stdout */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

/** 收集可重复参数：--tag a --tag b 与 --tag=a 都支持；值缺失 / 为空时报参数错误 */
export function collectRepeatedArg(rawArgs: readonly string[], name: string): string[] {
  const flag = `--${name}`
  const values: string[] = []

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index]
    if (token === undefined || token === '--') break

    if (token === flag) {
      const value = rawArgs[index + 1]
      if (value === undefined || value.startsWith('-') || !value.trim()) {
        throw usageError(`${flag} 缺少参数值`)
      }
      values.push(value)
      index += 1
    } else if (token.startsWith(`${flag}=`)) {
      const value = token.slice(flag.length + 1)
      if (!value.trim()) throw usageError(`${flag} 缺少参数值`)
      values.push(value)
    }
  }

  return values
}

/** 去重且保持原顺序（追加标签时用） */
export function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)]
}

/** 校验必填标题：缺失 / 空白时报参数错误，返回去掉首尾空白的标题 */
export function requireTitle(value: string | undefined): string {
  const title = value?.trim()
  if (!title) throw usageError('缺少必填参数 --title')

  return title
}

/** 校验位置参数（id / 文件路径等）：缺失 / 空白时报参数错误 */
export function requirePositional(value: string | undefined, label: string): string {
  const result = value?.trim()
  if (!result) throw usageError(`缺少参数：${label}`)

  return result
}

/** 校验 --status 取值 */
export function parseStatusFilter(value: string | undefined): TodoStatusFilter | undefined {
  if (value === undefined) return undefined

  const matched = (TODO_STATUS_FILTERS as readonly string[]).includes(value)
  if (!matched) throw usageError(`--status 只能是 ${TODO_STATUS_FILTERS.join(' / ')}`)

  return value as TodoStatusFilter
}

/** 校验 --priority 取值 */
export function parsePriorityArg(value: string | undefined): Priority | undefined {
  if (value === undefined) return undefined
  if (!isPriority(value)) throw usageError('--priority 只能是 none / low / medium / high')

  return value
}

/** 校验 --done 取值（只接受 true / false） */
export function parseDoneArg(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false

  throw usageError('--done 只能是 true 或 false')
}

/** 校验 yyyy-mm-dd 日期参数 */
export function requireDateKey(value: string, label: string): string {
  if (!isDateKey(value)) throw usageError(`${label} 不是合法日期：${value}（应为 yyyy-mm-dd）`)

  return value
}

const MIME_BY_EXTENSION: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
}

/** 按扩展名简单猜 MIME 类型；未知扩展名回退通用二进制流 */
export function guessMimeType(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName)
  const extension = match?.[1]?.toLowerCase()

  return (extension ? MIME_BY_EXTENSION[extension] : undefined) ?? 'application/octet-stream'
}

/** 列表单行：完成标记 + 优先级 + 标题 + 日期范围 + 标签 + 逾期信息 */
export function formatTodoLine(todo: Todo, today: string): string {
  const parts = [todo.done ? '[x]' : '[ ]']
  if (todo.priority !== 'none') parts.push(`[${PRIORITY_LABEL[todo.priority]}]`)
  parts.push(todoTitle(todo))

  const range = formatDateRangeText(todo.startDate, todo.endDate)
  if (range) parts.push(range)
  if (todo.tags.length > 0) parts.push(todo.tags.map((tag) => `#${tag}`).join(' '))
  if (isOverdue(todo, today)) parts.push(`已逾期 ${overdueDays(todo, today)} 天`)

  return parts.join(' ')
}

/** 详情（show / add / update 的人类可读输出）：逐字段展示，含子任务与附件列表 */
export function formatTodoDetail(todo: Todo, today: string): string {
  const lines: string[] = []
  lines.push(`标题：${todoTitle(todo)}`)
  lines.push(`ID：${todo.id}`)
  lines.push(`状态：${todo.done ? '已完成' : '未完成'}`)
  lines.push(`优先级：${PRIORITY_LABEL[todo.priority]}`)
  lines.push(`日期：${formatDateRangeText(todo.startDate, todo.endDate) || '未安排'}`)
  if (isOverdue(todo, today)) lines.push(`逾期：已逾期 ${overdueDays(todo, today)} 天`)
  lines.push(`标签：${todo.tags.length > 0 ? todo.tags.map((tag) => `#${tag}`).join(' ') : '无'}`)

  if (todo.subtasks.length === 0) {
    lines.push('子任务：无')
  } else {
    lines.push('子任务：')
    for (const subtask of todo.subtasks) {
      lines.push(`  ${subtask.done ? '[x]' : '[ ]'} ${subtask.title}`)
    }
  }

  if (todo.attachments.length === 0) {
    lines.push('附件：无')
  } else {
    lines.push('附件：')
    for (const attachment of todo.attachments) {
      lines.push(`  ${formatAttachmentLine(attachment)}`)
    }
  }

  const description = todo.description.trim()
  lines.push(description ? `描述：\n${todo.description}` : '描述：（无）')

  return lines.join('\n')
}

/** 附件单行：id + 名称 + 大小（附件接口都要 id，所以 id 必须展示） */
export function formatAttachmentLine(attachment: Attachment): string {
  return `${attachment.id}  ${attachment.name}（${formatFileSize(attachment.size)}）`
}

/** tags 命令输出：每行一个标签 + 计数 */
export function formatTagList(tags: TagSummary[]): string {
  if (tags.length === 0) return '暂无标签'

  return tags.map((item) => `#${item.tag}  ${item.count}`).join('\n')
}

/**
 * 解析附件下载的落盘路径：
 * - 未指定 --output：落到当前目录，文件名取附件名；
 * - --output 是已存在的目录：拼上附件名；
 * - 否则把 --output 当文件路径。
 * 文件名只取 basename（防目录穿越），非法名字回退 attachment-<id>。
 */
export async function resolveDownloadPath(
  output: string | undefined,
  attachmentName: string,
  attachmentId: string,
): Promise<string> {
  const base = basename(attachmentName.trim())
  const fileName = base && base !== '.' && base !== '..' ? base : `attachment-${attachmentId}`

  if (!output) return resolve(process.cwd(), fileName)

  const info = await stat(output).catch(() => null)
  if (info?.isDirectory()) return resolve(output, fileName)

  return resolve(output)
}

/** 统一错误出口：输出可读信息并设置退出码 1（不在库代码里 process.exit） */
export function reportError(error: unknown): void {
  if (error instanceof ApiError) {
    if (error.isNetworkError) console.error(error.message)
    else console.error(`请求失败（HTTP ${error.statusCode}）：${error.message}`)
  } else if (error instanceof CliError) {
    console.error(error.message)
  } else {
    console.error(`执行失败：${error instanceof Error ? error.message : String(error)}`)
  }

  process.exitCode = 1
}

/** 命令 run 的统一包装：捕获所有异常，绝不把堆栈抛给用户 */
export async function runSafely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    reportError(error)
  }
}
