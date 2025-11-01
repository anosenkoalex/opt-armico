import { z } from 'zod';

export const createAssignmentSchema = z
  .object({
    orgId: z.string().min(1),
    userId: z.string().min(1),
    workplaceId: z.string().min(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;
