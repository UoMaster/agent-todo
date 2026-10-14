// 日期与格式化工具：三端共用，纯函数、运行时无关。
// 约定：日期一律用 `yyyy-mm-dd` 文本（DateKey）在前后端之间传递，避免时区偏移。

import {
  PRIORITY_VALUE,
  type Priority,
  type Todo,
  type TodoBucket,
  type TodoFilter,
} from './types.ts'

/** 英文星期缩写，索引与 Date.getUTCDay() 对应（0 = 周日） */
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const MONTH_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `yyyy-mm-dd` 的严格格式 */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  // 借 Date 校验真实存在的日期（如 2 月 30 日会被归一化，比对即可发现）
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** 把 Date 按**本地**时区转成 yyyy-mm-dd（不要用 toISOString，会按 UTC 偏移） */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function todayKey(now: Date = new Date()): string {
  return dateKey(now)
}

/** 解析 yyyy-mm-dd；非法输入返回 undefined */
export function parseDateKey(value: string): Date | undefined {
  if (!isDateKey(value)) return undefined

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return new Date(Date.UTC(year, month - 1, day))
}

/** 日期加减天数；非法输入原样返回 */
export function addDays(value: string, days: number): string {
  const date = parseDateKey(value)
  if (!date) return value

  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** b - a 的天数差；非法输入返回 0 */
export function daysBetween(a: string, b: string): number {
  const from = parseDateKey(a)
  const to = parseDateKey(b)
  if (!from || !to) return 0

  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** 周一起算的星期序号：周一 0 … 周日 6 */
export function weekdayIndex(value: string): number {
  const date = parseDateKey(value)
  if (!date) return 0

  return (date.getUTCDay() + 6) % 7
}

/** 该月天数；非法输入返回 0 */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0

  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 单个日期转成「2026-10-14」这种 yyyy年m月d日 */
export function formatDateText(value: string | null): string {
  if (!value) return ''
  const date = parseDateKey(value)
  if (!date) return value

  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}

/**
 * 区间展示：`2026年10月14日 → 2026年10月16日（3 天）`。
 * start 为空返回空串；end 为空或等于 start 时按单日展示。
 */
export function formatDateRangeText(start: string | null, end: string | null): string {
  if (!start) return ''

  const startText = formatDateText(start)
  if (!end || end === start) return startText

  const days = daysBetween(start, end) + 1
  return `${startText} → ${formatDateText(end)}（${days} 天）`
}

/** 「周三」；非法输入返回空串 */
export function weekdayText(value: string | null): string {
  if (!value) return ''
  const date = parseDateKey(value)
  if (!date) return ''

  return `周${'日一二三四五六'.charAt(date.getUTCDay())}`
}

/** 「10/14」这种紧凑日期（列表用） */
export function shortDateText(value: string | null): string {
  if (!value) return ''
  const date = parseDateKey(value)
  if (!date) return value

  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

/** 「Oct 14」英文日期（CLI 用） */
export function englishDateText(value: string | null): string {
  if (!value) return ''
  const date = parseDateKey(value)
  if (!date) return value

  return `${MONTH_EN[date.getUTCMonth()] ?? ''} ${date.getUTCDate()}`
}

export function englishWeekdayText(value: string | null): string {
  if (!value) return ''
  const date = parseDateKey(value)
  if (!date) return ''

  return WEEKDAY_EN[date.getUTCDay()] ?? ''
}

/** 附件大小：12 B / 3.4 KB / 1.2 MB / 0.8 GB */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`

  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/** 待办的截止日期：有结束日期取结束日期，否则取开始日期，未安排返回 null */
export function deadlineOf(todo: Pick<Todo, 'startDate' | 'endDate'>): string | null {
  return todo.endDate ?? todo.startDate
}

/** 是否逾期（已完成不算逾期） */
export function isOverdue(
  todo: Pick<Todo, 'done' | 'startDate' | 'endDate'>,
  today: string,
): boolean {
  if (todo.done) return false

  const deadline = deadlineOf(todo)
  return deadline !== null && deadline < today
}

/** 逾期天数（未逾期返回 0） */
export function overdueDays(todo: Pick<Todo, 'done' | 'startDate' | 'endDate'>, today: string): number {
  if (!isOverdue(todo, today)) return 0

  return daysBetween(deadlineOf(todo) as string, today)
}

/** 列表分组桶：逾期 / 今天 / 本周（7 天内）/ 以后 / 未安排 / 已完成 */
export function bucketOf(todo: Todo, today: string): TodoBucket {
  if (todo.done) return 'done'
  if (!todo.startDate) return 'none'
  if (isOverdue(todo, today)) return 'overdue'
  if (todo.startDate <= today) return 'today'
  if (daysBetween(today, todo.startDate) <= 6) return 'week'

  return 'later'
}

/** 状态筛选（侧边栏）。tag 过滤不在这个函数里处理 */
export function matchesStatusFilter(
  todo: Todo,
  filter: TodoFilter,
  today: string,
): boolean {
  if (filter.type === 'tag') return todo.tags.includes(filter.tag)
  if (filter.type === 'all') return true
  if (filter.type === 'overdue') return isOverdue(todo, today)
  if (filter.type === 'done') return todo.done

  // today：未完成、已开始（开始日期 <= 今天）且没逾期
  if (filter.type === 'today') {
    return !todo.done && todo.startDate !== null && todo.startDate <= today && !isOverdue(todo, today)
  }

  // upcoming：未完成、开始日期在今天之后
  return !todo.done && todo.startDate !== null && todo.startDate > today
}

/** 标题兜底：空白标题显示为「未命名待办」 */
export function todoTitle(todo: Pick<Todo, 'title'>): string {
  return todo.title.trim() || '未命名待办'
}

/** 排序：有日期的在前（按日期升序），然后优先级高的在前，最后按创建时间 */
export function compareTodos(a: Todo, b: Todo): number {
  const aStart = a.startDate ?? '9999-12-31'
  const bStart = b.startDate ?? '9999-12-31'
  if (aStart !== bStart) return aStart < bStart ? -1 : 1

  if (a.priority !== b.priority) return PRIORITY_VALUE[b.priority] - PRIORITY_VALUE[a.priority]

  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

/** 判断一个字符串是不是合法优先级（供 CLI / web 解析用户输入） */
export function isPriority(value: string): value is Priority {
  return value === 'none' || value === 'low' || value === 'medium' || value === 'high'
}

/** 判断一个日期 + 可选区间是否合法：结束不能早于开始、开始未填时不能只填结束 */
export function isValidDateRange(start: string | null, end: string | null): boolean {
  if (start === null) return end === null
  if (!isDateKey(start)) return false
  if (end === null) return true

  return isDateKey(end) && end >= start
}
