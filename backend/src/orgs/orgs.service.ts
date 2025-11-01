import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateOrgDto } from './dto/create-org.dto.js';
import { UpdateOrgDto } from './dto/update-org.dto.js';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateOrgDto) {
    return this.prisma.org.create({ data });
  }

  findAll() {
    return this.prisma.org.findMany({
      include: {
        users: true,
        workplaces: true,
      },
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.org.findUnique({
      where: { id },
      include: {
        users: true,
        workplaces: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async update(id: string, data: UpdateOrgDto) {
    await this.findOne(id);
    return this.prisma.org.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.assignment.deleteMany({ where: { orgId: id } });
    await this.prisma.workplace.deleteMany({ where: { orgId: id } });
    await this.prisma.user.deleteMany({ where: { orgId: id } });
    return this.prisma.org.delete({ where: { id } });
  }
}
