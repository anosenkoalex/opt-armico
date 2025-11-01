import { z } from 'zod';
import { createUserSchema } from './create-user.dto.js';

export const updateUserSchema = createUserSchema
  .partial()
  .extend({ password: createUserSchema.shape.password.optional() });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
