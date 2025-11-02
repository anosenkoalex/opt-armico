import { UserRole } from '@prisma/client';
import { z } from 'zod';

const allowedRoles: UserRole[] = [
  UserRole.AUDITOR,
  UserRole.ORG_MANAGER,
  UserRole.ADMIN,
];

export const createUserSchema = z.object({
  fullName: z
    .string({ required_error: 'ФИО обязательно' })
    .min(1, 'ФИО обязательно'),
  email: z
    .string({ required_error: 'Email обязателен' })
    .min(1, 'Email обязателен')
    .email('Укажите корректный email'),
  password: z
    .string({ required_error: 'Пароль обязателен' })
    .min(6, 'Пароль должен быть не короче 6 символов'),
  role: z
    .nativeEnum(UserRole, {
      required_error: 'Роль обязательна',
      invalid_type_error: 'Роль обязательна',
    })
    .refine((value) => allowedRoles.includes(value), {
      message: 'Роль должна быть AUDITOR, ORG_MANAGER или ADMIN',
    }),
  orgId: z
    .string({ invalid_type_error: 'Организация указана неверно' })
    .min(1, 'Организация указана неверно')
    .optional(),
  position: z
    .string({ invalid_type_error: 'Должность указана неверно' })
    .min(1, 'Должность указана неверно')
    .optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
