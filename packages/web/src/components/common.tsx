import { formatFileSize, type Attachment } from '@agent-todo/shared'
import { CheckIcon, ClockIcon, FileIcon } from './icons.tsx'
import { attachmentUrl } from '../helpers/api.ts'

/** 逾期徽标：`逾期 3 天`（单条待办） */
export function OverdueBadge({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-[4px] px-[8px] pt-[1px] pb-[2px] rounded-full text-xs font-600 border border-[color-mix(in_oklab,var(--danger),transparent_55%)] text-danger-text whitespace-nowrap">
      <ClockIcon width={12} height={12} className="flex-none" />
      逾期 {days} 天
    </span>
  )
}

/** 逾期徽标：`逾期 4 项`（日历顶部，按条数统计） */
export function OverdueCountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-[4px] px-[8px] pt-[1px] pb-[2px] rounded-full text-xs font-600 border border-[color-mix(in_oklab,var(--danger),transparent_55%)] text-danger-text whitespace-nowrap">
      <ClockIcon width={12} height={12} className="flex-none" />
      逾期 {count} 项
    </span>
  )
}

/** 完成勾选框（列表行 / 子任务共用） */
export function Checkbox({
  checked,
  onChange,
  label,
  small = false,
}: {
  checked: boolean
  onChange: () => void
  label: string
  small?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={(event) => {
        event.stopPropagation()
        onChange()
      }}
      className={[
        'rounded-[6px] grid place-items-center border-[1.5px] transition-colors flex-none',
        small ? 'w-[17px] h-[17px] rounded-[5px]' : 'w-[20px] h-[20px] mt-[2px]',
        checked
          ? 'bg-accent border-accent text-accent-on'
          : 'border-[var(--meta)] text-transparent hover:border-accent',
      ].join(' ')}
    >
      <CheckIcon className={small ? 'w-[10px] h-[10px]' : 'w-[12px] h-[12px]'} />
    </button>
  )
}

/** 附件图标：图片显示缩略图，其余显示扩展名 */
export function AttachmentIcon({ attachment }: { attachment: Attachment }) {
  const extension = (attachment.name.split('.').pop() ?? 'file').slice(0, 4).toUpperCase()

  if (attachment.mimeType.startsWith('image/')) {
    return (
      <span className="w-[34px] h-[34px] flex-none rounded-[7px] bg-surface overflow-hidden grid place-items-center">
        <img
          src={attachmentUrl(attachment.id)}
          alt={attachment.name}
          className="w-full h-full object-cover"
        />
      </span>
    )
  }

  return (
    <span className="w-[34px] h-[34px] flex-none rounded-[7px] bg-surface grid place-items-center text-muted">
      {extension ? <span className="num text-[10px] font-600">{extension}</span> : <FileIcon width={18} height={18} />}
    </span>
  )
}

/** 附件行：图标 + 名字 + 大小（+ 可选的下载 / 删除按钮） */
export function AttachmentRow({
  attachment,
  actions,
}: {
  attachment: Attachment
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-[10px] px-[10px] py-[8px] border border-border rounded-[var(--radius-sm)]">
      <AttachmentIcon attachment={attachment} />
      <div className="flex-1 min-w-0">
        <a
          href={attachmentUrl(attachment.id)}
          target="_blank"
          rel="noreferrer"
          className="block text-sm truncate hover:text-accent"
          title={attachment.name}
        >
          {attachment.name}
        </a>
        <div className="text-xs text-meta num">{formatFileSize(attachment.size)}</div>
      </div>
      {actions}
    </div>
  )
}

/** 列表行里的优先级圆点 */
export function PriorityDot({ color, small = false }: { color: string | null; small?: boolean }) {
  const size = small ? 'w-[7px] h-[7px]' : 'w-[8px] h-[8px]'

  return color ? (
    <span className={`${size} rounded-full flex-none`} style={{ background: color }} />
  ) : (
    <span className={`${size} rounded-full flex-none border-[1.5px] border-border`} />
  )
}
