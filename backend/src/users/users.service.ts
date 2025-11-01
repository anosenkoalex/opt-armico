import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const orgName = 'Armico';
    let org = await this.prisma.org.findFirst({ where: { name: orgName } });

    if (!org) {
      org = await this.prisma.org.create({
        data: {
          name: orgName,
          timezone: 'UTC',
        },
      });
    }

    const adminEmail = 'admin@armico.local';
    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await this.prisma.user.create({
        data: {
          email: adminEmail,
          password: passwordHash,
          role: UserRole.SUPER_ADMIN,
          orgId: org.id,
        },
      });
    }
  }

  async create(data: CreateUserDto) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: { ...data, password: passwordHash },
    });
  }

  findAll() {
    return this.prisma.user.findMany();
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, data: UpdateUserDto) {
    await this.findOne(id);
    const payload = { ...data } as UpdateUserDto & { password?: string };

    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: payload,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.assignment.deleteMany({ where: { userId: id } });
    return this.prisma.user.delete({ where: { id } });
  }
}
