import { SlotStatus } from '@prisma/client';
import { z } from 'zod';

const slotInputSchema = z
  .object({
    userId: z.string().cuid(),
    orgId: z.string().cuid(),
    dateStart: z.coerce.date(),
    dateEnd: z.coerce.date(),
    status: z.nativeEnum(SlotStatus).optional(),
    colorCode: z.string().max(16).optional(),
    note: z.string().max(500).optional(),
    locked: z.coerce.boolean().optional(),
  })
  .refine((value) => value.dateStart <= value.dateEnd, {
    message: 'dateEnd must be after dateStart',
    path: ['dateEnd'],
  });

export const bulkAssignSchema = z.object({
  slots: z.array(slotInputSchema).min(1).max(500),
});

export type BulkAssignDto = z.infer<typeof bulkAssignSchema>;
export type BulkAssignSlotDto = z.infer<typeof slotInputSchema>;
