// 三端（web / server / cli）共用的业务类型与常量。
// 这里只放纯数据与纯函数，运行时无关（不碰 DOM、不碰 node:*）。

export const PRIORITIES = ['none', 'low', 'medium', 'high'] as const

/** 优先级；数值与数据库 smallint 一一对应（none=0 … high=3） */
export type Priority = (typeof PRIORITIES)[number]

/** 数据库里存的数值：none=0 / low=1 / medium=2 / high=3 */
export const PRIORITY_VALUE: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
}

/** 单条附件的元信息（文件本体存在服务端磁盘上） */
export interface Attachment {
  id: string
  todoId: string
  /** 用户上传时的原始文件名 */
  name: string
  /** MIME 类型，未知时为空串 */
  mimeType: string
  /** 字节数 */
  size: number
  createdAt: string
}

export interface Subtask {
  id: string
  todoId: string
  title: string
  done: boolean
  /** 展示顺序（升序） */
  position: number
}

export interface Todo {
  id: string
  title: string
  /** Markdown 文本 */
  description: string
  done: boolean
  priority: Priority
  tags: string[]
  /** 开始日期；null 表示未安排 */
  startDate: string | null
  /** 结束日期；null 表示单日待办；有值时表示时间范围（startDate 为开始） */
  endDate: string | null
  subtasks: Subtask[]
  attachments: Attachment[]
  createdAt: string
  updatedAt: string
}

/** 新建待办的最小入参（只有标题必填） */
export interface TodoInput {
  title: string
  description?: string
  done?: boolean
  priority?: Priority
  tags?: string[]
  startDate?: string | null
  endDate?: string | null
  /** 子任务标题（按数组顺序）；已存在的子任务请走 PUT /api/todos/:id */
  subtasks?: string[]
}

/** 整条替换待办（PUT /api/todos/:id）；未传的字段取默认值 */
export interface TodoUpdate {
  title: string
  description?: string
  done?: boolean
  priority?: Priority
  tags?: string[]
  startDate?: string | null
  endDate?: string | null
  subtasks?: SubtaskInput[]
}

/** 子任务入参：带 id 表示保留（沿用原 id），不带 id 表示新建 */
export interface SubtaskInput {
  id?: string
  title: string
  done?: boolean
}

export interface TagSummary {
  tag: string
  count: number
}

/** 列表筛选：状态 / 标签 */
export type TodoStatusFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'done'
export type TodoFilter = { type: TodoStatusFilter } | { type: 'tag'; tag: string }

/** 列表视图里的分组桶，决定「今天 / 本周 / 以后」等分组 */
export type TodoBucket = 'overdue' | 'today' | 'week' | 'later' | 'none' | 'done'

export const FILTER_LABEL: Record<TodoStatusFilter, string> = {
  all: '全部任务',
  today: '今天',
  upcoming: '即将到期',
  overdue: '逾期',
  done: '已完成',
}

/** 侧边栏与详情里显示的优先级文案 */
export const PRIORITY_LABEL: Record<Priority, string> = {
  none: '无',
  low: '低',
  medium: '中',
  high: '高',
}

// 以下颜色与原型设计系统一致，供 web（UnoCSS 主题外的地方）与 cli 复用
export const PRIORITY_COLOR: Record<Priority, string | null> = {
  none: null,
  low: '#6e6e73',
  medium: '#eab308',
  high: '#dc2626',
}

/** 常用的默认标签（仅用于界面上的快捷选择，标签本身随待办创建） */
export const DEFAULT_TAGS = [
  '产品',
  '研发',
  '设计',
  '会议',
  '研究',
  '竞品',
  '支持',
  '财务',
  '生活',
  '健康',
  '行政',
  '发布',
] as const

export const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'] as const
