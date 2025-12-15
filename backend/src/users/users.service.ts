import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcryptjs';
import { ListUsersDto } from './dto/list-users.dto.js';
import { EmailService } from '../notifications/email.service.js';
import { ConfigService } from '@nestjs/config';

type SelectedUser = {
  id: string;
  email: string;
  orgId: string | null;
  fullName: string | null;
  position: string | null;
  role: UserRole;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
  org: { id: string; name: string; slug: string } | null;
};

type SendPasswordResult = {
  success: boolean;
  message: string;
};

const DEFAULT_ADMIN_EMAIL = 'admin@armico.local';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_ORG_SLUG = 'armico';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    let org = await this.prisma.org.findUnique({
      where: { slug: DEFAULT_ORG_SLUG },
    });

    if (!org) {
      org = await this.prisma.org.create({
        data: { name: 'Armico', slug: DEFAULT_ORG_SLUG },
      });
    }

    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: DEFAULT_ADMIN_EMAIL },
    });

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      await this.prisma.user.create({
        data: {
          email: DEFAULT_ADMIN_EMAIL,
          password: passwordHash,
          role: UserRole.SUPER_ADMIN,
          orgId: org.id,
          fullName: 'System Administrator',
          position: null,
          phone: null,
          isSystemUser: true,
          passwordSentAt: new Date(),
          passwordUpdatedAt: new Date(),
        },
      });
    }
  }

  // ===== PASSWORD UTILS =====
  private generatePassword(length = 10): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  }

  // ===== ORG HELPERS =====
  private async ensureOrg(orgId?: string | null) {
    if (!orgId) return null;
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Организация не найдена');
    return org;
  }

  private async getDefaultOrg() {
    const org = await this.prisma.org.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!org) throw new NotFoundException('Default organization not found');
    return org;
  }

  // ===== CREATE USER =====
  async create(data: CreateUserDto & { sendPassword?: boolean }) {
    const email = data.email.trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Пользователь с таким e-mail уже существует');
    }

    let orgId =
      (data as CreateUserDto & { orgId?: string | null }).orgId ?? null;

    orgId = orgId
      ? (await this.ensureOrg(orgId))?.id ?? null
      : (await this.getDefaultOrg()).id;

    const sendPassword = data.sendPassword === true;

    const rawPassword =
      data.password && data.password.length > 0
        ? data.password
        : this.generatePassword();

    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const created = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: data.role ?? UserRole.USER,
        orgId,
        fullName: data.fullName?.trim() || null,
        position: data.position?.trim() || null,
        phone: data.phone?.trim() || null,
        isSystemUser: false,
        ...(sendPassword ? { passwordSentAt: new Date() } : {}),
      },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (sendPassword) {
      const appUrl =
        this.configService.get<string>('APP_URL') ??
        'https://grant-thornton.online';

      await this.emailService.sendHtmlEmail(
        email,
        'Доступ к CRM',
        `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <h2>Добро пожаловать в CRM</h2>
          <p><b>Логин:</b> ${email}<br/>
          <b>Пароль:</b> ${rawPassword}</p>
          <a
            href="${appUrl.replace(/\/$/, '')}/login"
            style="display:inline-block;padding:10px 16px;background:#1677ff;color:#fff;text-decoration:none;border-radius:6px;margin-top:12px"
          >
            Go to CRM
          </a>
        </div>
        `,
      ).catch((e) => this.logger.error(e));
    }

    return { ...this.presentUser(created), rawPassword };
  }

  // ===== SEND PASSWORD =====
  async sendPassword(id: string): Promise<SendPasswordResult> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const appUrl =
      this.configService.get<string>('APP_URL') ??
      'https://grant-thornton.online';

    await this.emailService
      .sendHtmlEmail(
        user.email,
        'Пароль к CRM',
        `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <h2>Пароль для входа</h2>
          <p><b>Логин:</b> ${user.email}<br/>
          <b>Пароль:</b> ${user.password}</p>
          <a
            href="${appUrl.replace(/\/$/, '')}/login"
            style="display:inline-block;padding:10px 16px;background:#1677ff;color:#fff;text-decoration:none;border-radius:6px;margin-top:12px"
          >
            Go to CRM
          </a>
        </div>
        `,
      )
      .catch((e) => this.logger.error(e));

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordSentAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Пароль отправлен на почту',
    };
  }

  // ===== LIST USERS =====
  async findAll(params: ListUsersDto) {
    const { page, pageSize, role, search } = params;
    const where: Prisma.UserWhereInput = { isSystemUser: false };

    if (role) where.role = role;
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.baseSelect(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items.map((u) => this.presentUser(u)),
      meta: { total, page, pageSize },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.baseSelect(),
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return this.presentUser(user);
  }

  async update(id: string, data: UpdateUserDto) {
    await this.findOne(id);

    const payload: UpdateUserDto & { password?: string | null } = { ...data };
    const updateData: Record<string, unknown> = {};

    if (payload.password) {
      updateData.password = await bcrypt.hash(payload.password, 10);
      updateData.passwordUpdatedAt = new Date();
      updateData.passwordSentAt = null;
    }

    if (payload.email !== undefined) updateData.email = payload.email.trim();
    if (payload.fullName !== undefined)
      updateData.fullName = payload.fullName?.trim() || null;
    if (payload.position !== undefined)
      updateData.position = payload.position?.trim() || null;
    if (payload.role !== undefined) updateData.role = payload.role;
    if (payload.phone !== undefined)
      updateData.phone = payload.phone?.trim() || null;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: this.baseSelect(),
    });

    return this.presentUser(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.notification.deleteMany({ where: { userId: id } });
    await this.prisma.assignment.deleteMany({ where: { userId: id } });

    const deleted = await this.prisma.user.delete({
      where: { id },
      select: this.baseSelect(),
    });

    return this.presentUser(deleted);
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { org: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      position: user.position ?? null,
      role: user.role,
      org: user.org
        ? { id: user.org.id, name: user.org.name, slug: user.org.slug }
        : null,
    };
  }

  private baseSelect() {
    return {
      id: true,
      email: true,
      orgId: true,
      fullName: true,
      position: true,
      role: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
      org: { select: { id: true, name: true, slug: true } },
    } as const;
  }

  private presentUser(user: SelectedUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      position: user.position ?? null,
      role: user.role,
      phone: user.phone ?? null,
      orgId: user.orgId,
      createdAt: user.createdAt.toISOString(),
      org: user.org
        ? { id: user.org.id, name: user.org.name, slug: user.org.slug }
        : null,
    };
  }
}