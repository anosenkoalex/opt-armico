import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcryptjs';
import { ListUsersDto } from './dto/list-users.dto.js';

type SelectedUser = {
  id: string;
  email: string;
  orgId: string | null;
  fullName: string | null;
  position: string | null;
  role: UserRole;
  phone: string | null;
  createdAt: Date;
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
  constructor(private readonly prisma: PrismaService) {}

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
        },
      });
    }
  }

  // 🔑 Генератор случайного пароля
  private generatePassword(length = 10): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  private async ensureOrg(orgId?: string | null) {
    if (!orgId) return null;
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Организация не найдена');
    return org;
  }

  private async getDefaultOrg() {
    const org = await this.prisma.org.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) throw new NotFoundException('Default organization not found');
    return org;
  }

  async create(data: CreateUserDto) {
    const email = data.email.trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Пользователь с таким e-mail уже существует');

    let orgId =
      (data as CreateUserDto & { orgId?: string | null }).orgId ?? null;
    orgId = orgId ? (await this.ensureOrg(orgId))?.id ?? null : (await this.getDefaultOrg()).id;

    const rawPassword = data.password || this.generatePassword();
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
      },
      select: this.baseSelect(),
    });

    return { ...this.presentUser(created), rawPassword };
  }

  // 📋 Пагинация + фильтрация
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
    if (payload.password) payload.password = await bcrypt.hash(payload.password, 10);

    const updateData: Record<string, unknown> = {};
    if (payload.email !== undefined) updateData.email = payload.email.trim();
    if (payload.fullName !== undefined)
      updateData.fullName = payload.fullName?.trim() || null;
    if (payload.position !== undefined)
      updateData.position = payload.position?.trim() || null;
    if (payload.role !== undefined) updateData.role = payload.role;
    if (payload.phone !== undefined)
      updateData.phone = payload.phone?.trim() || null;
    if (payload.password) updateData.password = payload.password;

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

  // 🔔 Заглушка для отправки пароля (готова под интеграцию)
  async sendPassword(id: string): Promise<SendPasswordResult> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, phone: true, isSystemUser: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.isSystemUser)
      throw new BadRequestException('Отправка пароля системному пользователю запрещена');

    // Здесь потом добавится логика отправки SMS/Email
    throw new BadRequestException(
      'Отправка пароля пока не настроена (SMS/Email шлюзы не подключены)',
    );
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