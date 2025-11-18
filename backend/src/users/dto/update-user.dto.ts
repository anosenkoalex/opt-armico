import { z } from 'zod';
import { createUserSchema } from './create-user.dto.js';

// Схема для обновления: всё опциональное
export const updateUserSchema = createUserSchema
  .partial()
  .extend({
    // На всякий случай явно говорим, что пароль тоже опционален
    password: createUserSchema.shape.password.optional(),
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;