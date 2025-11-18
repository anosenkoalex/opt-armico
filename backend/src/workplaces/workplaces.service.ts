import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateWorkplaceDto } from './dto/create-workplace.dto.js';
import { UpdateWorkplaceDto } from './dto/update-workplace.dto.js';
import { ListWorkplacesDto } from './dto/list-workplaces.dto.js';

@Injectable()
export class WorkplacesService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere({
    search,
    isActive,
  }: ListWorkplacesDto): Prisma.WorkplaceWhereInput {
    const where: Prisma.WorkplaceWhereInput = {};

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    return where;
  }

  private handleUniqueError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        code: 'WORKPLACE_CODE_NOT_UNIQUE',
        message: 'Workplace code must be unique within the organization',
      });
    }

    if (error instanceof Prisma.NotFoundError) {
      throw new NotFoundException('Organization not found');
    }

    throw error;
  }

  async create(data: CreateWorkplaceDto) {
    try {
      await this.prisma.org.findUniqueOrThrow({ where: { id: data.orgId } });
      return await this.prisma.workplace.create({
        data,
        include: { org: { select: { id: true, name: true, slug: true } } },
      });
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async findAll(params: ListWorkplacesDto) {
    const { page, pageSize } = params;
    const where = this.buildWhere(params);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workplace.findMany({
        where,
        include: { org: { select: { id: true, name: true, slug: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workplace.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        pageSize,
      },
    };
  }

  async findOne(id: string) {
    const workplace = await this.prisma.workplace.findUnique({
      where: { id },
      include: { org: { select: { id: true, name: true, slug: true } } },
    });

    if (!workplace) {
      throw new NotFoundException('Workplace not found');
    }

    return workplace;
  }

  async update(id: string, data: UpdateWorkplaceDto) {
    await this.findOne(id);

    try {
      if (data.orgId) {
        await this.prisma.org.findUniqueOrThrow({ where: { id: data.orgId } });
      }
      return await this.prisma.workplace.update({
        where: { id },
        data,
        include: { org: { select: { id: true, name: true, slug: true } } },
      });
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async remove(id: string) {
    const workplace = await this.prisma.workplace.findUnique({
      where: { id },
      select: { id: true, code: true, name: true },
    });

    if (!workplace) {
      throw new NotFoundException('Workplace not found');
    }

    // 1) Считаем ТОЛЬКО активные назначения
    const activeAssignments = await this.prisma.assignment.count({
      where: {
        workplaceId: id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    if (activeAssignments > 0) {
      throw new BadRequestException(
        'Нельзя удалить рабочее место, пока к нему привязаны активные назначения. ' +
          'Сначала завершите или переназначьте сотрудников.',
      );
    }

    // 2) Архивные (и любые остальные) назначения просто удаляем вместе с рабочим местом
    await this.prisma.assignment.deleteMany({
      where: {
        workplaceId: id,
      },
    });

    await this.prisma.workplace.delete({
      where: { id },
    });

    return { success: true };
  }
}