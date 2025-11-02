import { z } from 'zod';

export const CreateUserSchema = z.object({
  fullName: z.string().min(2, 'Укажите ФИО'),
  email: z.string().email('Некорректный e-mail'),
  password: z.string().min(6, 'Минимум 6 символов'),
  role: z.enum(['AUDITOR', 'ORG_MANAGER', 'ADMIN']).default('AUDITOR'),
  orgId: z.string().optional(),
  position: z.string().optional(),
});

export const createUserSchema = CreateUserSchema;

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
