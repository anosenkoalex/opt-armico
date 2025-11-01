import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateWorkplaceDto } from './dto/create-workplace.dto.js';
import { UpdateWorkplaceDto } from './dto/update-workplace.dto.js';

@Injectable()
export class WorkplacesService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateWorkplaceDto) {
    return this.prisma.workplace.create({ data });
  }

  findAll() {
    return this.prisma.workplace.findMany({ include: { org: true } });
  }

  async findOne(id: string) {
    const workplace = await this.prisma.workplace.findUnique({
      where: { id },
      include: { org: true },
    });

    if (!workplace) {
      throw new NotFoundException('Workplace not found');
    }

    return workplace;
  }

  async update(id: string, data: UpdateWorkplaceDto) {
    await this.findOne(id);
    return this.prisma.workplace.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.assignment.deleteMany({ where: { workplaceId: id } });
    return this.prisma.workplace.delete({ where: { id } });
  }
}
