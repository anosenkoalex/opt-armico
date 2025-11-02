import { z } from 'zod';

export const matrixQuerySchema = z.object({
  mode: z.enum(['byUsers', 'byOrgs']).default('byUsers'),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});

export type MatrixQueryDto = z.infer<typeof matrixQuerySchema>;
