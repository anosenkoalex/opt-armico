import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, UserRole, AssignmentStatus } from '@prisma/client';
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

  // ===== INIT SYSTEM ADMIN =====
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
          passwordPlain: null,
          role: UserRole.SUPER_ADMIN,
          orgId: org.id,
          fullName: 'System Administrator',
          isSystemUser: true,
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
    const isAdmin = data.role === UserRole.SUPER_ADMIN;

    const created = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        passwordPlain: isAdmin ? null : rawPassword,
        role: data.role ?? UserRole.USER,
        orgId,
        fullName: data.fullName?.trim() || null,
        position: data.position?.trim() || null,
        phone: data.phone?.trim() || null,
        isSystemUser: false,
        passwordSentAt: sendPassword ? new Date() : null,
        passwordUpdatedAt: new Date(),
      },
      include: {
        org: { select: { id: true, name: true, slug: true } },
      },
    });

    if (sendPassword && !isAdmin) {
      await this.sendEmailWithPassword(email, rawPassword);
    }

    return this.presentUser(created);
  }

  // ===== SEND PASSWORD (NO RESET IF POSSIBLE) =====
  async sendPassword(id: string): Promise<SendPasswordResult> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ConflictException('Пароль администратора не отправляется');
    }

    if (user.passwordPlain) {
      await this.sendEmailWithPassword(user.email, user.passwordPlain);

      await this.prisma.user.update({
        where: { id },
        data: { passwordSentAt: new Date() },
      });

      return {
        success: true,
        message: 'Пароль отправлен',
      };
    }

    return this.resetPasswordAndSend(id);
  }

  // ===== RESET PASSWORD + SEND =====
  async resetPasswordAndSend(id: string): Promise<SendPasswordResult> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ConflictException('Пароль администратора нельзя сбросить');
    }

    const newPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: {
        password: passwordHash,
        passwordPlain: newPassword,
        passwordUpdatedAt: new Date(),
        passwordSentAt: new Date(),
      },
    });

    await this.sendEmailWithPassword(user.email, newPassword);

    return {
      success: true,
      message: 'Новый пароль отправлен',
    };
  }

  // ===== EMAIL HELPER =====
  private async sendEmailWithPassword(email: string, password: string) {
    const appUrl =
      this.configService.get<string>('APP_URL') ??
      'https://grant-thornton.online';

    await this.emailService.sendHtmlEmail(
      email,
      'Доступ к CRM',
      `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2>Доступ к CRM</h2>
        <p>
          <b>Логин:</b> ${email}<br/>
          <b>Пароль:</b> ${password}
        </p>
        <a
          href="${appUrl.replace(/\/$/, '')}/login"
          style="display:inline-block;padding:10px 16px;background:#1677ff;color:#fff;text-decoration:none;border-radius:6px;margin-top:12px"
        >
          Войти в CRM
        </a>
      </div>
      `,
    );
  }

  // ===== LIST / UPDATE / DELETE =====
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

    const [items, total, usersWithAssignments] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.baseSelect(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
      // список userId, у которых есть АКТИВНЫЕ назначения (не удалённые)
      this.prisma.assignment.findMany({
        where: {
          status: AssignmentStatus.ACTIVE,
          deletedAt: null,
          user: { isSystemUser: false },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const usersWithAssignmentsSet = new Set(
      usersWithAssignments.map((x) => x.userId),
    );

    return {
      data: items.map((u) =>
        this.presentUser(u, usersWithAssignmentsSet),
      ),
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

    const updateData: Record<string, unknown> = {};

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
      updateData.passwordPlain = null;
      updateData.passwordUpdatedAt = new Date();
      updateData.passwordSentAt = null;
    }

    if (data.email !== undefined) updateData.email = data.email.trim();
    if (data.fullName !== undefined)
      updateData.fullName = data.fullName?.trim() || null;
    if (data.position !== undefined)
      updateData.position = data.position?.trim() || null;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.phone !== undefined)
      updateData.phone = data.phone?.trim() || null;

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

  private presentUser(
    user: SelectedUser,
    usersWithAssignments?: Set<string>,
  ) {
    const hasActiveAssignments = usersWithAssignments
      ? usersWithAssignments.has(user.id)
      : undefined;

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
      // флаг для фронта: есть ли у пользователя ХОТЯ БЫ ОДНО активное назначение
      hasActiveAssignments,
    };
  }
}