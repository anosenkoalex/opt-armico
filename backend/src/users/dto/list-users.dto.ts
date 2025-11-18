import { UserRole } from '@prisma/client';
import { z } from 'zod';

export const listUsersSchema = z
  .object({
    role: z.nativeEnum(UserRole).optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    // ⬇️ тут расширяем лимит до 500, чтобы фронтовый pageSize=500 проходил
    pageSize: z.coerce.number().int().min(1).max(500).default(20),
  });

export type ListUsersDto = z.infer<typeof listUsersSchema>;