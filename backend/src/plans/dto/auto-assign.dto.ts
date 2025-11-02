import { z } from 'zod';

export const autoAssignSchema = z
  .object({
    orgId: z.string().cuid(),
    teamSize: z.coerce.number().int().min(1).max(100),
    dateStart: z.coerce.date(),
    dateEnd: z.coerce.date(),
    respectConstraints: z.coerce.boolean().optional().default(true),
  })
  .refine((value) => value.dateStart <= value.dateEnd, {
    message: 'dateEnd must be after dateStart',
    path: ['dateEnd'],
  });

export type AutoAssignDto = z.infer<typeof autoAssignSchema>;
