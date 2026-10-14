import { describe, expect, test } from 'vitest'
import {
  addDays,
  bucketOf,
  compareTodos,
  daysBetween,
  daysInMonth,
  dateKey,
  deadlineOf,
  englishDateText,
  englishWeekdayText,
  formatDateRangeText,
  formatDateText,
  formatFileSize,
  isDateKey,
  isOverdue,
  isPriority,
  isValidDateRange,
  matchesStatusFilter,
  overdueDays,
  parseDateKey,
  shortDateText,
  todoTitle,
  todayKey,
  weekdayIndex,
  weekdayText,
} from './dates.ts'
import type { Todo } from './types.ts'

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    title: '示例',
    description: '',
    done: false,
    priority: 'none',
    tags: [],
    startDate: null,
    endDate: null,
    subtasks: [],
    attachments: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isDateKey', () => {
  test('接受合法的 yyyy-mm-dd', () => {
    expect(isDateKey('2026-10-14')).toBe(true)
    expect(isDateKey('2024-02-29')).toBe(true)
    expect(isDateKey('2026-12-31')).toBe(true)
  })

  test('拒绝格式错误与不存在的日期', () => {
    expect(isDateKey('2026-10-1')).toBe(false)
    expect(isDateKey('2026/10/14')).toBe(false)
    expect(isDateKey('20261014')).toBe(false)
    expect(isDateKey('')).toBe(false)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('2026-00-10')).toBe(false)
    expect(isDateKey('2023-02-29')).toBe(false)
    expect(isDateKey('2026-04-31')).toBe(false)
    expect(isDateKey('2026-10-00')).toBe(false)
  })
})

describe('dateKey / todayKey', () => {
  test('按本地时区格式化，不受 UTC 偏移影响', () => {
    // 本地时间的 10 月 14 日 00:30，在 UTC 里可能是 10 月 13 日
    expect(dateKey(new Date(2026, 9, 14, 0, 30))).toBe('2026-10-14')
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  test('todayKey 使用当前时间', () => {
    expect(todayKey(new Date(2026, 9, 14, 12))).toBe('2026-10-14')
  })
})

describe('parseDateKey', () => {
  test('解析成 UTC 零点，与本地时区无关', () => {
    expect(parseDateKey('2026-10-14')?.toISOString()).toBe('2026-10-14T00:00:00.000Z')
  })

  test('非法输入返回 undefined', () => {
    expect(parseDateKey('2026-2-3')).toBeUndefined()
    expect(parseDateKey('not-a-date')).toBeUndefined()
  })
})

describe('addDays', () => {
  test('跨月、跨年正常加减', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  test('非法输入原样返回', () => {
    expect(addDays('bad', 3)).toBe('bad')
  })
})

describe('daysBetween', () => {
  test('计算天数差（含方向）', () => {
    expect(daysBetween('2026-10-14', '2026-10-16')).toBe(2)
    expect(daysBetween('2026-10-16', '2026-10-14')).toBe(-2)
    expect(daysBetween('2026-10-14', '2026-10-14')).toBe(0)
  })

  test('跨年与非法输入', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('bad', '2026-10-14')).toBe(0)
  })
})

describe('weekdayIndex / weekdayText', () => {
  test('周一是 0、周日是 6', () => {
    expect(weekdayIndex('2026-10-12')).toBe(0) // 周一
    expect(weekdayIndex('2026-10-14')).toBe(2) // 周三
    expect(weekdayIndex('2026-10-18')).toBe(6) // 周日
  })

  test('非法输入返回 0 或空串', () => {
    expect(weekdayIndex('bad')).toBe(0)
    expect(weekdayText('bad')).toBe('')
    expect(weekdayText(null)).toBe('')
  })

  test('weekdayText 输出中文星期', () => {
    expect(weekdayText('2026-10-14')).toBe('周三')
  })
})

describe('daysInMonth', () => {
  test('常规月份与闰年二月', () => {
    expect(daysInMonth(2026, 10)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
  })

  test('非法输入返回 0', () => {
    expect(daysInMonth(2026, 13)).toBe(0)
    expect(daysInMonth(2026, 0)).toBe(0)
    expect(daysInMonth(2026.5, 10)).toBe(0)
  })
})

describe('日期文案', () => {
  test('formatDateText', () => {
    expect(formatDateText('2026-10-14')).toBe('2026年10月14日')
    expect(formatDateText(null)).toBe('')
    expect(formatDateText('bad')).toBe('bad')
  })

  test('formatDateRangeText 单日与区间', () => {
    expect(formatDateRangeText('2026-10-14', null)).toBe('2026年10月14日')
    expect(formatDateRangeText('2026-10-14', '2026-10-14')).toBe('2026年10月14日')
    expect(formatDateRangeText('2026-10-14', '2026-10-16')).toBe(
      '2026年10月14日 → 2026年10月16日（3 天）',
    )
  })

  test('formatDateRangeText 无开始日期返回空串', () => {
    expect(formatDateRangeText(null, '2026-10-16')).toBe('')
  })

  test('shortDateText / englishDateText / englishWeekdayText', () => {
    expect(shortDateText('2026-10-14')).toBe('10/14')
    expect(shortDateText(null)).toBe('')
    expect(englishDateText('2026-10-14')).toBe('Oct 14')
    expect(englishWeekdayText('2026-10-14')).toBe('Wed')
    expect(englishWeekdayText(null)).toBe('')
  })
})

describe('formatFileSize', () => {
  test('按 B / KB / MB / GB 分级', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('2 KB')
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatFileSize(0)).toBe('0 B')
  })

  test('非法输入兜底', () => {
    expect(formatFileSize(Number.NaN)).toBe('0 B')
    expect(formatFileSize(-10)).toBe('0 B')
  })
})

describe('截止日期与逾期', () => {
  test('deadlineOf 优先取结束日期', () => {
    expect(deadlineOf({ startDate: '2026-10-01', endDate: '2026-10-05' })).toBe('2026-10-05')
    expect(deadlineOf({ startDate: '2026-10-01', endDate: null })).toBe('2026-10-01')
    expect(deadlineOf({ startDate: null, endDate: null })).toBeNull()
  })

  test('isOverdue：未完成且截止日期早于今天', () => {
    const today = '2026-10-14'
    expect(isOverdue({ done: false, startDate: '2026-10-13', endDate: null }, today)).toBe(true)
    expect(isOverdue({ done: false, startDate: '2026-10-14', endDate: null }, today)).toBe(false)
    expect(isOverdue({ done: true, startDate: '2026-10-13', endDate: null }, today)).toBe(false)
    expect(isOverdue({ done: false, startDate: null, endDate: null }, today)).toBe(false)
    // 区间待办以结束日期为准
    expect(isOverdue({ done: false, startDate: '2026-10-10', endDate: '2026-10-16' }, today)).toBe(
      false,
    )
  })

  test('overdueDays 计算逾期天数', () => {
    const today = '2026-10-14'
    expect(overdueDays({ done: false, startDate: '2026-10-08', endDate: null }, today)).toBe(6)
    expect(overdueDays({ done: false, startDate: '2026-10-14', endDate: null }, today)).toBe(0)
  })
})

describe('bucketOf', () => {
  const today = '2026-10-14'

  test('按日期与完成状态分桶', () => {
    expect(bucketOf(makeTodo({ done: true }), today)).toBe('done')
    expect(bucketOf(makeTodo({ startDate: null }), today)).toBe('none')
    expect(bucketOf(makeTodo({ startDate: '2026-10-01' }), today)).toBe('overdue')
    expect(bucketOf(makeTodo({ startDate: '2026-10-14' }), today)).toBe('today')
    expect(bucketOf(makeTodo({ startDate: '2026-10-10', endDate: '2026-10-20' }), today)).toBe(
      'today',
    )
    expect(bucketOf(makeTodo({ startDate: '2026-10-19' }), today)).toBe('week')
    expect(bucketOf(makeTodo({ startDate: '2026-10-20' }), today)).toBe('week')
    expect(bucketOf(makeTodo({ startDate: '2026-10-21' }), today)).toBe('later')
  })
})

describe('matchesStatusFilter', () => {
  const today = '2026-10-14'
  const overdue = makeTodo({ startDate: '2026-10-01' })
  const todayTask = makeTodo({ startDate: '2026-10-14' })
  const upcoming = makeTodo({ startDate: '2026-10-20' })
  const doneTask = makeTodo({ done: true, startDate: '2026-10-01' })
  const undated = makeTodo()
  const tagged = makeTodo({ tags: ['研发'] })

  test('all / overdue / today / upcoming / done', () => {
    expect(matchesStatusFilter(overdue, { type: 'all' }, today)).toBe(true)
    expect(matchesStatusFilter(overdue, { type: 'overdue' }, today)).toBe(true)
    expect(matchesStatusFilter(todayTask, { type: 'overdue' }, today)).toBe(false)
    expect(matchesStatusFilter(todayTask, { type: 'today' }, today)).toBe(true)
    expect(matchesStatusFilter(overdue, { type: 'today' }, today)).toBe(false)
    expect(matchesStatusFilter(upcoming, { type: 'upcoming' }, today)).toBe(true)
    expect(matchesStatusFilter(todayTask, { type: 'upcoming' }, today)).toBe(false)
    expect(matchesStatusFilter(doneTask, { type: 'done' }, today)).toBe(true)
    expect(matchesStatusFilter(undated, { type: 'upcoming' }, today)).toBe(false)
  })

  test('tag 过滤', () => {
    expect(matchesStatusFilter(tagged, { type: 'tag', tag: '研发' }, today)).toBe(true)
    expect(matchesStatusFilter(tagged, { type: 'tag', tag: '设计' }, today)).toBe(false)
  })
})

describe('todoTitle', () => {
  test('空白标题兜底为未命名待办', () => {
    expect(todoTitle({ title: '写文档' })).toBe('写文档')
    expect(todoTitle({ title: '   ' })).toBe('未命名待办')
    expect(todoTitle({ title: '' })).toBe('未命名待办')
  })
})

describe('compareTodos', () => {
  test('先按日期升序，未安排最后', () => {
    const a = makeTodo({ id: 'a', startDate: '2026-10-14' })
    const b = makeTodo({ id: 'b', startDate: '2026-10-20' })
    const c = makeTodo({ id: 'c', startDate: null })

    expect(compareTodos(a, b)).toBeLessThan(0)
    expect(compareTodos(b, c)).toBeLessThan(0)
    expect(compareTodos(c, a)).toBeGreaterThan(0)
  })

  test('同日期按优先级降序，再按创建时间', () => {
    const low = makeTodo({ id: 'low', startDate: '2026-10-14', priority: 'low' })
    const high = makeTodo({ id: 'high', startDate: '2026-10-14', priority: 'high' })
    expect(compareTodos(high, low)).toBeLessThan(0)

    const older = makeTodo({ id: 'older', createdAt: '2026-10-01T00:00:00.000Z' })
    const newer = makeTodo({ id: 'newer', createdAt: '2026-10-02T00:00:00.000Z' })
    expect(compareTodos(older, newer)).toBeLessThan(0)
    expect(compareTodos(older, { ...older })).toBe(0)
  })
})

describe('isPriority', () => {
  test('识别四个合法优先级', () => {
    for (const value of ['none', 'low', 'medium', 'high']) {
      expect(isPriority(value)).toBe(true)
    }
    expect(isPriority('urgent')).toBe(false)
    expect(isPriority('')).toBe(false)
    expect(isPriority('HIGH')).toBe(false)
  })
})

describe('isValidDateRange', () => {
  test('正常组合', () => {
    expect(isValidDateRange('2026-10-14', null)).toBe(true)
    expect(isValidDateRange('2026-10-14', '2026-10-16')).toBe(true)
    expect(isValidDateRange('2026-10-14', '2026-10-14')).toBe(true)
    expect(isValidDateRange(null, null)).toBe(true)
  })

  test('非法组合', () => {
    expect(isValidDateRange(null, '2026-10-16')).toBe(false)
    expect(isValidDateRange('2026-10-16', '2026-10-14')).toBe(false)
    expect(isValidDateRange('bad', null)).toBe(false)
    expect(isValidDateRange('bad', '2026-10-14')).toBe(false)
    expect(isValidDateRange('2026-10-14', 'bad')).toBe(false)
  })
})
