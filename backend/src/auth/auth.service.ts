import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
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

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        orgId: org?.id ?? null,
        fullName: fullName ?? null,
        position: position ?? null,
        role: role ?? UserRole.USER,
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
