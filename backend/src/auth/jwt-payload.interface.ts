import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  orgId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
