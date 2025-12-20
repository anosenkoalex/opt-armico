import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';      // ✅ основной
import * as bcryptjs from 'bcryptjs';  // ⚠️ поддержка старых/сломаных хешей
import { PrismaService } from '../common/prisma/prisma.service.js';
import { JwtPayload } from './jwt-payload.interface.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let isPasswordValid = false;
    let usedLegacyHash = false;

    // 1️⃣ Пробуем НОРМАЛЬНЫЙ bcrypt (как было раньше)
    try {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch {
      isPasswordValid = false;
    }

    // 2️⃣ Если не совпало — пробуем bcryptjs (кодекс мог насрать)
    if (!isPasswordValid) {
      try {
        isPasswordValid = await bcryptjs.compare(password, user.password);
        usedLegacyHash = isPasswordValid;
      } catch {
        isPasswordValid = false;
      }
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3️⃣ Если пароль совпал через bcryptjs — ПЕРЕХЕШИРОВАТЬ НОРМАЛЬНО
    if (usedLegacyHash) {
      const newHash = await bcrypt.hash(password, 10);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: newHash,
          passwordUpdatedAt: new Date(),
        },
      });
    }

    return user;
  }

  async login({ email, password }: LoginDto) {
    const user = await this.validateUser(email, password);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }

  async register({
    email,
    password,
    orgId,
    fullName,
    position,
    role,
  }: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new BadRequestException({
        code: 'EMAIL_TAKEN',
        message: 'Email already in use',
      });
    }

    let org = null;
    if (orgId) {
      org = await this.prisma.org.findUnique({ where: { id: orgId } });

      if (!org) {
        throw new BadRequestException({
          code: 'ORG_NOT_FOUND',
          message: 'Organization not found',
        });
      }
    }

    // ✅ Всегда хешируем НОРМАЛЬНЫМ bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        orgId: org?.id ?? null,
        fullName: fullName ?? null,
        position: position ?? null,
        role: role ?? UserRole.USER,
        passwordSentAt: new Date(),
        passwordUpdatedAt: new Date(),
      },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}