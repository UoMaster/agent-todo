import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  bucketOf,
  compareTodos,
  isOverdue,
  overdueDays,
  shortDateText,
  type Priority,
  type Todo,
  type TodoBucket,
} from '@agent-todo/shared'

/** 优先级圆点颜色：`none` 返回 null（界面画空心圆） */
export function priorityColor(priority: Priority): string | null {
  return PRIORITY_COLOR[priority]
}

export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABEL[priority]
}

export interface TodoGroup {
  bucket: TodoBucket
  title: string
  todos: Todo[]
}

const GROUP_TITLES: Array<{ bucket: TodoBucket; title: string }> = [
  { bucket: 'overdue', title: '逾期' },
  { bucket: 'today', title: '今天' },
  { bucket: 'week', title: '本周' },
  { bucket: 'later', title: '以后' },
  { bucket: 'none', title: '未安排' },
  { bucket: 'done', title: '已完成' },
]

/** 分组排序：逾期组内「最早截止的」排前面，其他组按日期 / 优先级 */
function sortWithinBucket(todos: Todo[], bucket: TodoBucket): Todo[] {
  const sorted = [...todos].sort(compareTodos)
  if (bucket !== 'overdue') return sorted

  return sorted.sort((a, b) => {
    const aDeadline = a.endDate ?? a.startDate ?? ''
    const bDeadline = b.endDate ?? b.startDate ?? ''
    return aDeadline < bDeadline ? -1 : aDeadline > bDeadline ? 1 : 0
  })
}

/** 把待办按「逾期 / 今天 / 本周 / 以后 / 未安排 / 已完成」分组，空组不返回 */
export function groupTodos(todos: Todo[], today: string): TodoGroup[] {
  return GROUP_TITLES.flatMap(({ bucket, title }) => {
    const items = todos.filter((todo) => bucketOf(todo, today) === bucket)
    return items.length > 0 ? [{ bucket, title, todos: sortWithinBucket(items, bucket) }] : []
  })
}

/** 列表右侧的日期：区间显示「10/12 – 10/16」，单日显示「10月14日」 */
export function compactDateText(todo: Todo): string {
  if (!todo.startDate) return ''
  if (!todo.endDate || todo.endDate === todo.startDate) {
    const [, month, day] = todo.startDate.split('-')
    return `${Number(month)}月${Number(day)}日`
  }

  return `${shortDateText(todo.startDate)} – ${shortDateText(todo.endDate)}`
}

export function overdueLabel(todo: Todo, today: string): string | null {
  if (!isOverdue(todo, today)) return null

  return `逾期 ${overdueDays(todo, today)} 天`
}

export function isTodoOverdue(todo: Todo, today: string): boolean {
  return isOverdue(todo, today)
}

export { shortDateText }
