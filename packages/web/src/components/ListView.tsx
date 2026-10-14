import {
  FILTER_LABEL,
  isOverdue,
  overdueDays,
  todoTitle,
  type Todo,
  type TodoBucket,
  type TodoFilter,
} from '@agent-todo/shared'
import { compactDateText, groupTodos, priorityColor } from '../helpers/display.ts'
import { Checkbox, OverdueBadge, PriorityDot } from './common.tsx'
import { PaperclipIcon, SubtaskIcon } from './icons.tsx'

export interface ListViewProps {
  todos: Todo[]
  filter: TodoFilter
  query: string
  today: string
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleDone: (todo: Todo) => void
}

function filterTitle(filter: TodoFilter): string {
  return filter.type === 'tag' ? `#${filter.tag}` : FILTER_LABEL[filter.type]
}

function TodoRow({
  todo,
  today,
  selected,
  onSelect,
  onToggleDone,
}: {
  todo: Todo
  today: string
  selected: boolean
  onSelect: () => void
  onToggleDone: () => void
}) {
  const overdue = isOverdue(todo, today)
  const doneSubtasks = todo.subtasks.filter((subtask) => subtask.done).length
  const hasMeta =
    overdue || todo.tags.length > 0 || todo.attachments.length > 0 || todo.subtasks.length > 0

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={[
        'flex items-start gap-[12px] px-[12px] py-[11px] rounded-[var(--radius-md)] border cursor-pointer transition-colors',
        selected
          ? 'bg-accent-soft border-[color-mix(in_oklab,var(--accent),transparent_76%)]'
          : 'border-transparent hover:bg-surface',
      ].join(' ')}
    >
      <Checkbox
        checked={todo.done}
        onChange={onToggleDone}
        label={todo.done ? '标记为未完成' : '标记为完成'}
      />

      <div className="flex-1 min-w-0 flex flex-col gap-[5px]">
        <div
          className={`flex items-center gap-[8px] text-[17px] leading-[1.35] ${
            todo.done
              ? 'text-muted line-through decoration-[color-mix(in_oklab,var(--muted),transparent_55%)]'
              : 'text-fg'
          }`}
        >
          <PriorityDot color={priorityColor(todo.priority)} />
          <span className="truncate">{todoTitle(todo)}</span>
        </div>

        {hasMeta && (
          <div className="flex flex-wrap items-center gap-[6px] text-xs">
            {overdue && <OverdueBadge days={overdueDays(todo, today)} />}
            {todo.tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
              </span>
            ))}
            {todo.attachments.length > 0 && (
              <span className="inline-flex items-center gap-[3px] text-meta">
                <PaperclipIcon width={13} height={13} />
                <span className="num">{todo.attachments.length}</span>
              </span>
            )}
            {todo.subtasks.length > 0 && (
              <span className="inline-flex items-center gap-[3px] text-meta">
                <SubtaskIcon width={13} height={13} />
                <span className="num">
                  {doneSubtasks}/{todo.subtasks.length}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <span
        className={`flex-none num text-xs whitespace-nowrap mt-[3px] ${
          overdue ? 'text-danger-text font-600' : 'text-muted'
        }`}
      >
        {compactDateText(todo)}
      </span>
    </div>
  )
}

/** 列表视图：按「逾期 / 今天 / 本周 / 以后 / 未安排 / 已完成」分组 */
export function ListView({
  todos,
  filter,
  query,
  today,
  selectedId,
  onSelect,
  onToggleDone,
}: ListViewProps) {
  const groups = groupTodos(todos, today)

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-[12px] mb-[22px]">
        <h1 className="font-heading text-[28px] font-600 leading-tight m-0">{filterTitle(filter)}</h1>
        <span className="num text-sm text-muted">{todos.length} 项</span>
      </div>

      {groups.length === 0 && (
        <div className="py-[72px] px-[20px] text-center text-sm text-muted">
          {query ? '没有匹配的待办' : '这里还没有待办，点击右上角「新建待办」开始'}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.bucket} className="mb-[26px]">
          <div
            className={`flex items-center gap-[8px] pb-[8px] mb-[6px] border-b ${
              group.bucket === 'overdue'
                ? 'border-[color-mix(in_oklab,var(--danger),transparent_64%)]'
                : 'border-border'
            }`}
          >
            <span className={`panel-label ${group.bucket === 'overdue' ? 'text-danger-text' : ''}`}>
              {group.title}
            </span>
            <span className={`num text-xs ${group.bucket === 'overdue' ? 'text-danger-text' : 'text-meta'}`}>
              {group.todos.length}
            </span>
          </div>

          {group.todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              today={today}
              selected={selectedId === todo.id}
              onSelect={() => onSelect(todo.id)}
              onToggleDone={() => onToggleDone(todo)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

export type { TodoBucket }
