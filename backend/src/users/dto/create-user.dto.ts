import { z } from 'zod';

const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'ORG_MANAGER',
  'AUDITOR',
  'USER',
] as const;

export const CreateUserSchema = z.object({
  fullName: z.string().min(2, 'Укажите ФИО'),
  email: z.string().email('Некорректный e-mail'),
  password: z.string().min(6, 'Минимум 6 символов'),
  role: z.enum(ROLES).default('AUDITOR'),
  orgId: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value : undefined)),
  position: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value : undefined)),
});

export const createUserSchema = CreateUserSchema;

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
