import { CheckIcon, SearchIcon } from './icons.tsx'

export interface AppBarProps {
  view: 'list' | 'calendar'
  onChangeView: (view: 'list' | 'calendar') => void
  query: string
  onChangeQuery: (query: string) => void
  onCreate: () => void
}

/** 顶栏：品牌、视图切换、搜索、新建 */
export function AppBar({ view, onChangeView, query, onChangeQuery, onCreate }: AppBarProps) {
  return (
    <header className="h-[56px] flex items-center gap-[14px] px-[16px] bg-bg border-b border-border relative z-[5]">
      <div className="flex items-center gap-[10px] font-heading font-600 text-[17px] tracking-[-0.01em]">
        <span className="w-[26px] h-[26px] rounded-[8px] bg-fg text-bg grid place-items-center flex-none" aria-hidden="true">
          <CheckIcon width={15} height={15} />
        </span>
        <span>待办清单</span>
      </div>

      <div className="segmented max-md:ml-auto" role="tablist" aria-label="切换视图">
        {(['list', 'calendar'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            className={`seg-btn ${view === item ? 'seg-btn-active' : ''}`}
            onClick={() => onChangeView(item)}
          >
            {item === 'list' ? '列表' : '日历'}
          </button>
        ))}
      </div>

      <label className="ml-auto flex-[0_1_300px] flex items-center gap-[8px] px-[12px] py-[7px] border border-border rounded-[var(--radius-md)] text-muted bg-bg max-md:hidden">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(event) => onChangeQuery(event.target.value)}
          placeholder="搜索待办"
          aria-label="搜索待办"
          className="border-0 outline-0 bg-transparent flex-1 text-sm text-fg min-w-0"
        />
      </label>

      <button type="button" className="btn btn-primary whitespace-nowrap" onClick={onCreate}>
        新建待办
      </button>
    </header>
  )
}
