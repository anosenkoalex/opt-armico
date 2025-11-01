import { z } from 'zod';
import { createWorkplaceSchema } from './create-workplace.dto.js';

export const updateWorkplaceSchema = createWorkplaceSchema.partial();

export type UpdateWorkplaceDto = z.infer<typeof updateWorkplaceSchema>;
