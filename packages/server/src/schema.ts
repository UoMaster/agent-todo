// 请求体校验（zod）：校验失败由 zValidator 直接返回 { error, message }

import { z } from 'zod'

export const prioritySchema = z.enum(['none', 'low', 'medium', 'high'])

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 yyyy-mm-dd')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number]
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, '日期不存在')

const subtaskInputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string(),
  done: z.boolean().optional(),
})

/** 日期区间：未安排 → 两个都必须为空；单日 → 只有开始；区间 → 结束不早于开始 */
const dateRangeSchema = {
  startDate: dateKeySchema.nullish(),
  endDate: dateKeySchema.nullish(),
}

function refineDateRange(
  value: { startDate?: string | null; endDate?: string | null },
  ctx: z.RefinementCtx,
) {
  const start = value.startDate ?? null
  const end = value.endDate ?? null

  if (start === null && end !== null) {
    ctx.addIssue({ code: 'custom', message: '设置结束日期前必须设置开始日期', path: ['startDate'] })
    return
  }
  if (start !== null && end !== null && end < start) {
    ctx.addIssue({ code: 'custom', message: '结束日期不能早于开始日期', path: ['endDate'] })
  }
}

export const createTodoSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    done: z.boolean().optional(),
    priority: prioritySchema.optional(),
    tags: z.array(z.string()).optional(),
    subtasks: z.array(z.string()).optional(),
    ...dateRangeSchema,
  })
  .superRefine(refineDateRange)

export const updateTodoSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    done: z.boolean().optional(),
    priority: prioritySchema.optional(),
    tags: z.array(z.string()).optional(),
    subtasks: z.array(subtaskInputSchema).optional(),
    ...dateRangeSchema,
  })
  .superRefine(refineDateRange)

export const listQuerySchema = z.object({
  status: z.enum(['all', 'today', 'upcoming', 'overdue', 'done']).optional(),
  tag: z.string().min(1).optional(),
  q: z.string().optional(),
})

export const todoIdParamSchema = z.object({
  id: z.uuid(),
})

export const attachmentIdParamSchema = z.object({
  id: z.uuid(),
})

/** 单个附件大小上限（200 MB） */
export const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024
