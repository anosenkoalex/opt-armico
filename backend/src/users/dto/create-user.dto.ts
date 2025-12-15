import { z } from 'zod';
import { UserRole } from '@prisma/client';

// Zod-схема для создания пользователя
export const createUserSchema = z.object({
  // E-mail обязателен и должен быть валидным
  email: z.string().email(),

  // Пароль опционален — если не передадут, сгенерим сами
  password: z.string().min(6).optional(),

  // ФИО
  fullName: z.string().optional(),

  // Должность
  position: z.string().optional(),

  // Телефон
  phone: z.string().optional(),

  // Роль
  role: z.nativeEnum(UserRole).optional(),

  // 🔥 ГАЛОЧКА: отправлять пароль при создании
  // ❗ по умолчанию false — письмо уходит ТОЛЬКО если явно поставили галку
  sendPassword: z.boolean().optional().default(false),
});

// DTO
export type CreateUserDto = z.infer<typeof createUserSchema>;