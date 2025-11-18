import { z } from 'zod';
import { assignmentBaseSchema } from './create-assignment.dto.js';

/**
 * Update DTO для назначения.
 * Все поля делаем частичными (partial),
 * но сохраняем валидацию диапазона дат:
 * если обе заданы — endsAt должна быть позже startsAt.
 * Разрешаем endsAt = null (бессрочное назначение).
 *
 * Дополнительно:
 *  - при передаче shifts проверяем, что у каждой смены
 *    время окончания позже времени начала.
 *  - kind (тип смены) берётся из enum ShiftKind (DEFAULT/OFFICE/REMOTE/DAY_OFF)
 */
export const updateAssignmentSchema = assignmentBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    // 1. Проверка общего диапазона назначения
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Дата окончания должна быть позже даты начала',
      });
    }

    // 2. Проверка смен (если переданы)
    if (data.shifts) {
      data.shifts.forEach((shift, index) => {
        if (
          shift &&
          shift.startsAt &&
          shift.endsAt &&
          shift.endsAt <= shift.startsAt
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['shifts', index, 'endsAt'],
            message: 'Время окончания смены должно быть позже времени начала',
          });
        }
      });
    }
  });

export type UpdateAssignmentDto = z.infer<typeof updateAssignmentSchema>;