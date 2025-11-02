import { z } from 'zod';

export const requestSwapSchema = z.object({
  comment: z.string().min(1).max(500),
});

export type RequestSwapDto = z.infer<typeof requestSwapSchema>;
