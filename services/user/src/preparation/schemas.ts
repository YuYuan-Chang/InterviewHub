import { z } from 'zod';
import { decodeCursor, HttpError } from '@interviewhub/shared';

const text = (max: number) => z.string().trim().min(1).max(max);
export const planSchema = z.object({
  name: text(120),
  company: z.string().trim().max(120).default(''),
  role: z.string().trim().max(120).default(''),
  collectionId: z.string().uuid().nullable().default(null),
});
export const taskSchema = z.object({
  title: text(300),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'Invalid calendar date')
    .nullable()
    .default(null),
  completed: z.boolean().default(false),
});
export const interviewSchema = z.object({
  stage: z.enum([
    'recruiter_screen',
    'online_assessment',
    'technical',
    'system_design',
    'behavioral',
    'onsite',
    'other',
  ]),
  scheduledAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(5000).default(''),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
});
export const listSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  view: z.enum(['upcoming', 'past']).optional(),
});
export function cursorWhere(cursor: string | undefined, field: 'createdAt' | 'scheduledAt') {
  const raw = decodeCursor(cursor);
  if (raw === undefined) return {};
  const parsed = z
    .object({ id: z.string().uuid(), time: z.string().datetime(), field: z.literal(field) })
    .safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Malformed cursor');
  const time = new Date(parsed.data.time);
  return { OR: [{ [field]: { gt: time } }, { [field]: time, id: { gt: parsed.data.id } }] };
}
export function scheduleWhere(view: 'upcoming' | 'past', now: Date) {
  return view === 'upcoming'
    ? { status: 'scheduled', scheduledAt: { gte: now } }
    : { OR: [{ scheduledAt: { lt: now } }, { status: { in: ['completed', 'cancelled'] } }] };
}
