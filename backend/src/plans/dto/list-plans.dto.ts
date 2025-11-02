import { PlanStatus } from '@prisma/client';
import { z } from 'zod';

export const listPlansSchema = z.object({
  status: z.nativeEnum(PlanStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListPlansDto = z.infer<typeof listPlansSchema>;
