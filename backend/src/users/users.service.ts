import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

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
        data: {
          name: 'Armico',
          slug: DEFAULT_ORG_SLUG,
        },
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
          position: 'Administrator',
        },
      });
    }
  }

  private async ensureOrg(orgId?: string | null) {
    if (!orgId) {
      return null;
    }

    const org = await this.prisma.org.findUnique({ where: { id: orgId } });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async create(data: CreateUserDto) {
    const org = await this.ensureOrg(data.orgId ?? null);
    const passwordHash = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        email: data.email,
        password: passwordHash,
        role: data.role ?? UserRole.USER,
        orgId: org?.id ?? null,
        fullName: data.fullName ?? null,
        position: data.position ?? null,
      },
      select: this.baseSelect(),
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: this.baseSelect(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.baseSelect(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, data: UpdateUserDto) {
    await this.findOne(id);
    const payload: UpdateUserDto & { password?: string | null } = { ...data };

    if ('orgId' in payload) {
      const org = await this.ensureOrg(payload.orgId);
      payload.orgId = org?.id ?? undefined;
    }

    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }

    const updateData: Record<string, unknown> = {};

    if (payload.email !== undefined) {
      updateData.email = payload.email;
    }

    if (payload.orgId !== undefined) {
      updateData.orgId = payload.orgId;
    }

    if (payload.fullName !== undefined) {
      updateData.fullName = payload.fullName;
    }

    if (payload.position !== undefined) {
      updateData.position = payload.position;
    }

    if (payload.role !== undefined) {
      updateData.role = payload.role;
    }

    if (payload.password) {
      updateData.password = payload.password;
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: this.baseSelect(),
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.notification.deleteMany({ where: { userId: id } });
    await this.prisma.assignment.deleteMany({ where: { userId: id } });
    return this.prisma.user.delete({ where: { id } });
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        org: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      position: user.position ?? null,
      role: user.role,
      org: user.org
        ? {
            id: user.org.id,
            name: user.org.name,
            slug: user.org.slug,
          }
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
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}
