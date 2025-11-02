import { z } from 'zod';

export const upsertConstraintSchema = z.object({
  id: z.string().cuid().optional(),
  type: z.string().min(1),
  payload: z.unknown(),
  userId: z.string().cuid().optional(),
  orgId: z.string().cuid().optional(),
});

export type UpsertConstraintDto = z.infer<typeof upsertConstraintSchema>;
