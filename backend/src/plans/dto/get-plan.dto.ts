import { z } from 'zod';

export const getPlanQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type GetPlanQueryDto = z.infer<typeof getPlanQuerySchema>;
