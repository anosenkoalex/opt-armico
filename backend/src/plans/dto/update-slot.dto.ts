import { SlotStatus } from '@prisma/client';
import { z } from 'zod';

export const updateSlotSchema = z
  .object({
    userId: z.string().cuid().optional(),
    orgId: z.string().cuid().optional(),
    dateStart: z.coerce.date().optional(),
    dateEnd: z.coerce.date().optional(),
    status: z.nativeEnum(SlotStatus).optional(),
    colorCode: z.string().max(16).optional(),
    note: z.string().max(500).nullable().optional(),
    locked: z.coerce.boolean().optional(),
  })
  .refine(
    (value) => {
      if (value.dateStart && value.dateEnd) {
        return value.dateStart <= value.dateEnd;
      }
      return true;
    },
    {
      message: 'dateEnd must be after dateStart',
      path: ['dateEnd'],
    },
  );

export type UpdateSlotDto = z.infer<typeof updateSlotSchema>;
