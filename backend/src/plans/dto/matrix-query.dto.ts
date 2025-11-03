import { z } from 'zod';

const matrixModeSchema = z
  .enum(['byUsers', 'byWorkplaces', 'byOrgs'])
  .default('byUsers')
  .transform((mode) => (mode === 'byOrgs' ? 'byWorkplaces' : mode))
  .pipe(z.enum(['byUsers', 'byWorkplaces']));

export const matrixQuerySchema = z.object({
  mode: matrixModeSchema,
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});

export type MatrixQueryDto = z.infer<typeof matrixQuerySchema>;
