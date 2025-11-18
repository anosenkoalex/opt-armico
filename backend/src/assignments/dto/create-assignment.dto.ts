import { AssignmentStatus, ShiftKind } from '@prisma/client';
import { z } from 'zod';

export const assignmentShiftSchema = z.object({
  /**
   * Тип смены:
   * - DEFAULT — обычная смена
   * - DAY_OFF — выходной / больничный / отгул
   * - OFFICE  — работа в офисе
   * - REMOTE  — удалённая работа
   */
  kind: z.nativeEnum(ShiftKind).default(ShiftKind.DEFAULT),

  /**
   * Дата смены (день).
   * Можно передавать как '2025-11-15' или полный ISO — z.coerce.date() всё съест.
   */
  date: z.coerce.date(),

  /**
   * Время начала смены (конкретный DateTime).
   * На фронте можно собирать из date + "08:00", "13:00" и т.п.
   */
  startsAt: z.coerce.date(),

  /**
   * Время окончания смены (конкретный DateTime).
   */
  endsAt: z.coerce.date(),
});

export const assignmentBaseSchema = z.object({
  userId: z.string().min(1, 'Не указан сотрудник'),
  workplaceId: z.string().min(1, 'Не указано рабочее место'),

  /**
   * Общий период назначения.
   * Можно ставить равным первой и последней смене, либо использовать для фильтрации.
   */
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),

  status: z.nativeEnum(AssignmentStatus).optional(),

  /**
   * Набор смен по дням и часам работы.
   * Например:
   * 15.11.2025 08:00–12:00, 13:00–18:00 (DEFAULT)
   * 16.11.2025 10:00–14:00 (REMOTE)
   * 17.11.2025 (DAY_OFF) — можно будет сделать смену как выходной
   */
  shifts: z
    .array(assignmentShiftSchema)
    .min(1, 'Нужно указать хотя бы одну смену'),
});

/**
 * Проверка корректности диапазона дат и смен.
 * - endsAt (если задана) должна быть позже startsAt
 * - у каждой смены endsAt > startsAt
 */
export const createAssignmentSchema = assignmentBaseSchema.superRefine(
  (data, ctx) => {
    // 1. Проверяем общий период назначения
    if (data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Дата окончания должна быть позже даты начала',
      });
    }

    // 2. Проверяем каждую смену
    data.shifts.forEach((shift, index) => {
      if (shift.endsAt <= shift.startsAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shifts', index, 'endsAt'],
          message: 'Время окончания смены должно быть позже времени начала',
        });
      }
    });
  },
);

export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;