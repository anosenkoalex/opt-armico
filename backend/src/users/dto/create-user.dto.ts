import { UserRole } from '@prisma/client';
import { z } from 'zod';

export const createUserSchema = z.object({
  orgId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole).default(UserRole.WORKER),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
