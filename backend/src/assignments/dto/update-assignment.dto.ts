import { z } from 'zod';
import { createAssignmentSchema } from './create-assignment.dto.js';

export const updateAssignmentSchema = createAssignmentSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'endsAt must be after startsAt',
      });
    }
  });

export type UpdateAssignmentDto = z.infer<typeof updateAssignmentSchema>;
