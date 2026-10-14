import { useState } from 'react'
import type { Todo } from '@agent-todo/shared'
import { addDays, daysBetween, isOverdue, todoTitle, todayKey, weekdayIndex } from '@agent-todo/shared'
import { priorityColor } from '../helpers/display.ts'
import { OverdueCountBadge, PriorityDot } from './common.tsx'
import { ChevronLeftIcon, ChevronRightIcon } from './icons.tsx'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const BAR_TOP = 30
const BAR_HEIGHT = 22
const MIN_WEEK_HEIGHT = 120

export interface CalendarViewProps {
  todos: Todo[]
  cursor: { year: number; month: number }
  onChangeCursor: (cursor: { year: number; month: number }) => void
  onSelect: (id: string) => void
  onCreateAt: (date: string) => void
  onReschedule: (
    id: string,
    changes: { startDate?: string | null; endDate?: string | null },
  ) => void
  /** 拖拽预览高亮的日期集合 */
  previewDates: string[]
  onPreviewChange: (dates: string[]) => void
  onDragStateChange: (dragging: boolean) => void
}

interface Segment {
  todo: Todo
  /** 本段在周内的起止列（0-6） */
  start: number
  end: number
  lane: number
  isStart: boolean
  isEnd: boolean
}

/** 一周的网格：范围条按车道叠加在上方，单日待办落在对应格子里 */
function buildWeek(weekStart: string, todos: Todo[]) {
  const weekEnd = addDays(weekStart, 6)
  const segments: Segment[] = []

  for (const todo of todos) {
    const start = todo.startDate
    const end = todo.endDate ?? start
    if (!start || !end || end === start) continue
    if (start > weekEnd || end < weekStart) continue

    segments.push({
      todo,
      start: Math.max(0, daysBetween(weekStart, start)),
      end: Math.min(6, daysBetween(weekStart, end)),
      lane: 0,
      isStart: start >= weekStart,
      isEnd: end <= weekEnd,
    })
  }

  // 车道分配：同一行不重叠
  const lanes: Segment[][] = []
  for (const segment of segments) {
    let lane = 0
    while (lanes[lane]?.some((other) => !(segment.end < other.start || segment.start > other.end))) {
      lane += 1
    }

    segment.lane = lane
    ;(lanes[lane] ??= []).push(segment)
  }

  const cells = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index)
    return {
      date,
      chips: todos.filter(
        (todo) => todo.startDate === date && (todo.endDate ?? todo.startDate) === todo.startDate,
      ),
    }
  })

  const cap = Math.max(1, 3 - Math.ceil(lanes.length / 2))
  let lines = 0
  for (const cell of cells) {
    lines = Math.max(lines, Math.min(cell.chips.length, cap) + (cell.chips.length > cap ? 1 : 0))
  }

  // 单日待办的起始位置：避让本周的范围条（同原型：chips 从条下方开始）
  const barLanes = Math.max(0, ...segments.map((segment) => segment.lane + 1))
  const height = Math.max(
    MIN_WEEK_HEIGHT,
    BAR_TOP + Math.max(barLanes * BAR_HEIGHT, barLanes * BAR_HEIGHT + lines * BAR_HEIGHT) + 12,
  )

  return {
    segments,
    cells,
    capacity: cap,
    chipTop: BAR_TOP + barLanes * BAR_HEIGHT,
    height,
  }
}

/** 日历视图：月网格 + 拖拽改期 + 点空白新建 */
export function CalendarView({
  todos,
  cursor,
  onChangeCursor,
  onSelect,
  onCreateAt,
  onReschedule,
  previewDates,
  onPreviewChange,
  onDragStateChange,
}: CalendarViewProps) {
  const [drag, setDrag] = useState<{
    id: string
    mode: 'move' | 'resize-l' | 'resize-r'
    originStart: string
    originEnd: string
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const today = todayKey()

  const firstOfMonth = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-01`
  const offset = weekdayIndex(firstOfMonth)
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate()
  const weeks = Math.ceil((offset + daysInMonth) / 7)
  const gridStart = addDays(firstOfMonth, -offset)
  const dated = todos.filter((todo) => todo.startDate)
  const overdueCount = todos.filter((todo) => isOverdue(todo, today)).length
  const preview = new Set(previewDates)

  function moveMonth(step: number) {
    let month = cursor.month + step
    let year = cursor.year
    if (month < 0) {
      month = 11
      year -= 1
    }
    if (month > 11) {
      month = 0
      year += 1
    }
    onChangeCursor({ year, month })
  }

  /** 按拖拽模式算出「如果现在松手」的目标区间 */
  function previewRange(date: string): { start: string; end: string } {
    if (!drag) return { start: date, end: date }

    if (drag.mode === 'move') {
      const duration = daysBetween(drag.originStart, drag.originEnd)
      return { start: date, end: addDays(date, duration) }
    }
    if (drag.mode === 'resize-l') {
      return drag.originEnd < date
        ? { start: drag.originEnd, end: date }
        : { start: date, end: drag.originEnd }
    }

    return drag.originStart > date
      ? { start: date, end: drag.originStart }
      : { start: drag.originStart, end: date }
  }

  function dateRangeBetween(start: string, end: string): string[] {
    const total = daysBetween(start, end)
    return Array.from({ length: total + 1 }, (_, index) => addDays(start, index))
  }

  function startDrag(
    event: React.PointerEvent,
    todo: Todo,
    mode: 'move' | 'resize-l' | 'resize-r',
  ) {
    if (!todo.startDate) return
    event.preventDefault()
    event.stopPropagation()
    onDragStateChange(true)
    setDrag({
      id: todo.id,
      mode,
      originStart: todo.startDate,
      originEnd: todo.endDate ?? todo.startDate,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    })
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drag) return
    const moved =
      drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4
    if (moved !== drag.moved) setDrag({ ...drag, moved })

    const element = document.elementFromPoint(event.clientX, event.clientY)
    const cell = element?.closest<HTMLElement>('[data-date]')
    const date = cell?.dataset.date
    if (!date) {
      onPreviewChange([])
      return
    }

    const range = previewRange(date)
    onPreviewChange(dateRangeBetween(range.start, range.end))
  }

  function finishDrag(event: React.PointerEvent) {
    if (!drag) return
    const element = document.elementFromPoint(event.clientX, event.clientY)
    const date = element?.closest<HTMLElement>('[data-date]')?.dataset.date

    if (!drag.moved) {
      setDrag(null)
      onPreviewChange([])
      onDragStateChange(false)
      onSelect(drag.id)
      return
    }

    if (date) {
      if (drag.mode === 'move') {
        const duration = daysBetween(drag.originStart, drag.originEnd)
        onReschedule(drag.id, {
          startDate: date,
          endDate: duration > 0 ? addDays(date, duration) : null,
        })
      } else if (drag.mode === 'resize-l') {
        onReschedule(drag.id, {
          startDate: date,
          endDate: drag.originEnd <= date ? null : drag.originEnd,
        })
      } else {
        onReschedule(drag.id, { endDate: date > drag.originStart ? date : null })
      }
    }

    setDrag(null)
    onPreviewChange([])
    onDragStateChange(false)
  }

  function startCellCreate(event: React.PointerEvent, date: string) {
    const startX = event.clientX
    const startY = event.clientY
    const listener = (upEvent: PointerEvent) => {
      window.removeEventListener('pointerup', listener)
      if (Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY) < 5) onCreateAt(date)
    }
    window.addEventListener('pointerup', listener)
  }

  return (
    <div onPointerMove={handlePointerMove} onPointerUp={finishDrag} className="select-none">
      <div className="flex items-center justify-between mb-[18px]">
        <div className="flex items-center gap-[10px]">
          <div className="font-heading text-[28px] font-600">
            {cursor.year}年{cursor.month + 1}月
          </div>
          {overdueCount > 0 && <OverdueCountBadge count={overdueCount} />}
        </div>

        <div className="flex items-center gap-[6px]">
          <button type="button" className="btn-icon" aria-label="上个月" onClick={() => moveMonth(-1)}>
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="btn btn-secondary text-xs px-[12px] py-[6px]"
            onClick={() => {
              const now = new Date()
              onChangeCursor({ year: now.getFullYear(), month: now.getMonth() })
            }}
          >
            今天
          </button>
          <button type="button" className="btn-icon" aria-label="下个月" onClick={() => moveMonth(1)}>
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className="border border-border rounded-[var(--radius-lg)] overflow-hidden bg-bg">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((label) => (
            <div key={label} className="text-xs text-meta font-600 tracking-[0.04em] px-[10px] py-[8px]">
              {label}
            </div>
          ))}
        </div>

        {Array.from({ length: weeks }, (_, weekIndex) => {
          const weekStart = addDays(gridStart, weekIndex * 7)
          const week = buildWeek(weekStart, dated)

          return (
            <div
              key={weekStart}
              className="relative grid grid-cols-7 border-t border-border first:border-t-0"
              style={{ minHeight: week.height }}
            >
              {/* 范围条层：在日期格之上（否则被格子盖住点不到），但只在条本身可交互 */}
              <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: BAR_TOP }}>
                {week.segments.map((segment) => {
                  const overdue = isOverdue(segment.todo, today)
                  const dragging = drag?.id === segment.todo.id

                  return (
                    <div
                      key={`${segment.todo.id}-${weekStart}`}
                      className={[
                        'absolute h-[20px] flex items-center gap-[6px] px-[8px] rounded-full pointer-events-auto cursor-grab overflow-hidden transition-colors',
                        overdue ? 'bg-[var(--fg-soft-2)]' : 'bg-[var(--fg-soft-2)] hover:bg-[color-mix(in_oklab,var(--fg),transparent_84%)]',
                        dragging ? 'opacity-45 pointer-events-none' : '',
                      ].join(' ')}
                      style={{
                        left: `calc(${(segment.start / 7) * 100}% + 3px)`,
                        width: `calc(${((segment.end - segment.start + 1) / 7) * 100}% - 6px)`,
                        top: segment.lane * BAR_HEIGHT,
                      }}
                      onPointerDown={(event) => startDrag(event, segment.todo, 'move')}
                    >
                      {segment.isStart && (
                        <span
                          role="slider"
                          aria-label="调整开始日期"
                          aria-valuenow={0}
                          className="absolute inset-y-[1px] -left-[1px] w-[10px] cursor-ew-resize"
                          onPointerDown={(event) => startDrag(event, segment.todo, 'resize-l')}
                        />
                      )}
                      <PriorityDot color={priorityColor(segment.todo.priority)} small />
                      <span
                        className={`text-xs whitespace-nowrap overflow-hidden text-ellipsis ${
                          overdue ? 'text-danger-text font-600' : 'text-fg'
                        }`}
                      >
                        {todoTitle(segment.todo)}
                      </span>
                      {segment.isEnd && (
                        <span
                          role="slider"
                          aria-label="调整结束日期"
                          aria-valuenow={0}
                          className="absolute inset-y-[1px] -right-[1px] w-[10px] cursor-ew-resize"
                          onPointerDown={(event) => startDrag(event, segment.todo, 'resize-r')}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {week.cells.map((cell, cellIndex) => {
                const isOtherMonth = Number(cell.date.slice(5, 7)) - 1 !== cursor.month
                const isToday = cell.date === today
                const highlighted = preview.has(cell.date)

                return (
                  <div
                    key={cell.date}
                    data-date={cell.date}
                    onPointerDown={(event) => startCellCreate(event, cell.date)}
                    className={[
                      'relative min-h-[120px] cursor-pointer transition-colors',
                      cellIndex > 0 ? 'border-l border-border' : '',
                      isOtherMonth ? 'bg-surface' : 'hover:bg-surface-warm',
                      highlighted ? 'bg-accent-soft' : '',
                    ].join(' ')}
                  >
                    <div className="absolute top-[6px] left-[10px] right-[8px] flex items-center gap-[5px] text-xs">
                      <span
                        className={
                          isToday
                            ? 'num bg-accent text-accent-on rounded-full min-w-[22px] h-[22px] px-[6px] grid place-items-center font-600'
                            : `num ${isOtherMonth ? 'text-meta' : 'text-muted'}`
                        }
                      >
                        {Number(cell.date.slice(8, 10))}
                      </span>
                      {isToday && <span className="text-accent font-600">今天</span>}
                      {isOtherMonth && !isToday && (
                        <span className="num text-meta">{Number(cell.date.slice(5, 7))}月</span>
                      )}
                    </div>

                    <div
                      className="absolute left-[5px] right-[5px] z-20 flex flex-col gap-[3px]"
                      style={{ top: week.chipTop }}
                    >
                      {cell.chips.slice(0, week.capacity).map((todo) => {
                        const overdue = isOverdue(todo, today)
                        const dragging = drag?.id === todo.id

                        return (
                          <div
                            key={todo.id}
                            className={[
                              'cal-chip',
                              overdue
                                ? 'border-[color-mix(in_oklab,var(--danger),transparent_50%)]'
                                : '',
                              dragging ? 'opacity-45 pointer-events-none' : '',
                            ].join(' ')}
                            onPointerDown={(event) => startDrag(event, todo, 'move')}
                          >
                            <PriorityDot color={priorityColor(todo.priority)} small />
                            <span
                              className={`text-xs whitespace-nowrap overflow-hidden text-ellipsis ${
                                todo.done
                                  ? 'text-muted line-through'
                                  : overdue
                                    ? 'text-danger-text font-600'
                                    : 'text-fg'
                              }`}
                            >
                              {todoTitle(todo)}
                            </span>
                          </div>
                        )
                      })}
                      {cell.chips.length > week.capacity && (
                        <div className="num text-[11px] text-meta pl-[6px]">
                          +{cell.chips.length - week.capacity} 项
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-meta mt-[12px]">
        提示：拖拽待办可改日期，拖拽范围条两端可调整区间；点击空白日期可快速新建。
      </p>
    </div>
  )
}
