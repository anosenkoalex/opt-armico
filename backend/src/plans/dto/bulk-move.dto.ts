import { z } from 'zod';

export const bulkMoveSchema = z
  .object({
    slotIds: z.array(z.string().cuid()).min(1).max(500),
    newDateStart: z.coerce.date().optional(),
    newDateEnd: z.coerce.date().optional(),
    newOrgId: z.string().cuid().optional(),
    newUserId: z.string().cuid().optional(),
  })
  .refine(
    (value) => {
      if (value.newDateStart && value.newDateEnd) {
        return value.newDateStart <= value.newDateEnd;
      }
      return true;
    },
    {
      message: 'newDateEnd must be after newDateStart',
      path: ['newDateEnd'],
    },
  )
  .refine(
    (value) =>
      Boolean(value.newDateStart || value.newDateEnd || value.newOrgId || value.newUserId),
    {
      message: 'At least one update field is required',
      path: ['slotIds'],
    },
  );

export type BulkMoveDto = z.infer<typeof bulkMoveSchema>;
