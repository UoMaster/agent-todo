import { FILTER_LABEL, type TagSummary, type TodoFilter, type TodoStatusFilter } from '@agent-todo/shared'

export interface SidebarProps {
  filter: TodoFilter
  onChangeFilter: (filter: TodoFilter) => void
  counts: Record<TodoStatusFilter, number>
  tags: TagSummary[]
  progress: number
}

const STATUS_ORDER: TodoStatusFilter[] = ['all', 'overdue', 'today', 'upcoming', 'done']

/** 侧边栏：状态筛选、标签筛选、完成进度 */
export function Sidebar({ filter, onChangeFilter, counts, tags, progress }: SidebarProps) {
  return (
    <aside
      aria-label="筛选"
      className="flex-[0_0_250px] bg-surface border-r border-border px-[12px] py-[16px] flex flex-col gap-[20px] overflow-y-auto max-md:w-full max-md:h-auto max-md:flex-none max-md:flex-row max-md:items-center max-md:gap-[14px] max-md:overflow-x-auto max-md:overflow-y-hidden max-md:px-[12px] max-md:py-[9px] max-md:border-r-0 max-md:border-b"
    >
      <div className="flex flex-col gap-[2px] max-md:flex-row max-md:gap-[6px] max-md:flex-none">
        <div className="panel-label px-[10px] pt-[4px] pb-[6px] max-md:hidden">视图</div>
        {STATUS_ORDER.map((status) => {
          const active = filter.type === status
          const count = counts[status]

          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => onChangeFilter({ type: status })}
              className={`side-item whitespace-nowrap ${active ? 'side-item-active' : ''}`}
            >
              <span>{FILTER_LABEL[status]}</span>
              <span
                className={`num text-xs font-400 ${
                  status === 'overdue' && count > 0 ? 'text-danger-text font-600' : 'text-meta'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-[2px] max-md:flex-row max-md:gap-[6px] max-md:flex-none">
        <div className="panel-label px-[10px] pt-[4px] pb-[6px] max-md:hidden">标签</div>
        {tags.length === 0 && <div className="px-[10px] text-xs text-meta max-md:hidden">暂无标签</div>}
        {tags.map((item) => {
          const active = filter.type === 'tag' && filter.tag === item.tag

          return (
            <button
              key={item.tag}
              type="button"
              aria-pressed={active}
              onClick={() => onChangeFilter({ type: 'tag', tag: item.tag })}
              className={`side-item whitespace-nowrap ${active ? 'side-item-active' : ''}`}
            >
              <span>#{item.tag}</span>
              <span className="num text-xs font-400 text-meta">{item.count}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-auto pt-[14px] pb-[4px] px-[10px] border-t border-border max-md:hidden">
        <div className="flex justify-between text-xs text-muted mb-[8px]">
          <span>完成进度</span>
          <span className="num">{progress}%</span>
        </div>
        <div className="h-[6px] rounded-full bg-[var(--fg-soft-2)] overflow-hidden">
          <span
            className="block h-full bg-accent rounded-full transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </aside>
  )
}
