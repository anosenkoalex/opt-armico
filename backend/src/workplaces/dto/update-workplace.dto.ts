import { z } from 'zod';
import { createWorkplaceSchema } from './create-workplace.dto.js';

// partial() → все поля становятся необязательными,
// включая color, поэтому ничего дополнительно добавлять не нужно.
export const updateWorkplaceSchema = createWorkplaceSchema.partial();

export type UpdateWorkplaceDto = z.infer<typeof updateWorkplaceSchema>;