import { z } from 'zod';

export const createWorkplaceSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  capacity: z.number().int().nonnegative().default(0),
});

export type CreateWorkplaceDto = z.infer<typeof createWorkplaceSchema>;
