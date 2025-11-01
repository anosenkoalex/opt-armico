import { z } from 'zod';

export const createOrgSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1).default('UTC'),
});

export type CreateOrgDto = z.infer<typeof createOrgSchema>;
