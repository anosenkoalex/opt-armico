import { z } from 'zod';

export const createPlanSchema = z
  .object({
    name: z.string().min(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((value) => value.startsAt <= value.endsAt, {
    message: 'startsAt must be before endsAt',
    path: ['endsAt'],
  });

export type CreatePlanDto = z.infer<typeof createPlanSchema>;
