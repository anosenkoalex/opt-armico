import { z } from 'zod';
import { UserRole } from '@prisma/client';

// Zod-схема для создания пользователя
export const createUserSchema = z.object({
  // E-mail обязателен и должен быть валидным
  email: z.string().email(),

  // Пароль опционален — если не передадут, сгенерим сами в сервисе
  password: z.string().min(6).optional(),

  // ФИО — опционально, просто строка
  fullName: z.string().optional(),

  // Должность (опционально)
  position: z.string().optional(),

  // Телефон для SMS (опционально)
  phone: z.string().optional(),

  // Роль (SUPER_ADMIN / MANAGER / USER), по умолчанию потом можно подставить USER
  role: z.nativeEnum(UserRole).optional(),
});

// Тип DTO берём из Zod-схемы
export type CreateUserDto = z.infer<typeof createUserSchema>;