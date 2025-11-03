import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1).optional(),
  position: z.string().min(1).optional(),
  orgId: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).default(UserRole.USER),
});

export type RegisterDto = z.infer<typeof registerSchema>;
