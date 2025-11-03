import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const CreateUserSchema = z.object({
  fullName: z.string().min(2, 'Укажите ФИО'),
  email: z.string().email('Некорректный e-mail'),
  password: z.string().min(6, 'Минимум 6 символов'),
  role: z.nativeEnum(UserRole).default(UserRole.USER),
  orgId: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value : undefined)),
  position: z.string().optional(),
});

export const createUserSchema = CreateUserSchema;

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
