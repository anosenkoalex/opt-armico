import { z } from 'zod';
import { createOrgSchema } from './create-org.dto.js';

export const updateOrgSchema = createOrgSchema.partial();

export type UpdateOrgDto = z.infer<typeof updateOrgSchema>;
