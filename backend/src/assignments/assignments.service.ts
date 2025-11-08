import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateAssignmentDto } from './dto/create-assignment.dto.js';
import { UpdateAssignmentDto } from './dto/update-assignment.dto.js';
import { ListAssignmentsDto } from './dto/list-assignments.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmailService } from '../notifications/email.service.js';
import { SmsService } from '../sms/sms.service.js';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly smsService: SmsService,
  ) {}

  private buildWhere(params: ListAssignmentsDto): Prisma.AssignmentWhereInput {
    const where: Prisma.AssignmentWhereInput = {};

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.workplaceId) {
      where.workplaceId = params.workplaceId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.from || params.to) {
      where.startsAt = {};

      if (params.from) {
        where.startsAt.gte = params.from;
      }

      if (params.to) {
        where.startsAt.lte = params.to;
      }
    }

    return where;
  }

  private async ensureNoOverlap(
    userId: string,
    startsAt: Date,
    endsAt: Date | null,
    assignmentId?: string,
  ) {
    const rangeEnd = endsAt ?? new Date('9999-12-31T23:59:59.999Z');

    const overlapping = await this.prisma.assignment.findFirst({
      where: {
        NOT: assignmentId ? { id: assignmentId } : undefined,
        userId,
        status: AssignmentStatus.ACTIVE,
        startsAt: { lte: rangeEnd },
        OR: [
          {
            endsAt: null,
          },
          {
            endsAt: { gte: startsAt },
          },
        ],
      },
    });

    if (overlapping) {
      throw new ConflictException(
        'У сотрудника уже есть активное назначение в этот период',
      );
    }
  }

  private async ensureWorkplaceInOrg(workplaceId: string, orgId: string) {
    const workplace = await this.prisma.workplace.findFirst({
      where: { id: workplaceId, orgId },
      select: { id: true },
    });

    if (!workplace) {
      throw new BadRequestException(
        'Рабочее место не принадлежит организации сотрудника',
      );
    }
  }

  private async ensureCanAssign(userId: string, workplaceId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        orgId: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Сотрудник не найден');
    }

    if (!user.orgId) {
      throw new BadRequestException(
        'Сотрудник не привязан к организации, назначение невозможно',
      );
    }

    await this.ensureWorkplaceInOrg(workplaceId, user.orgId);
  }

  private async resolveRecipients(userId: string, orgId: string) {
    const [orgAdmins, userEntity] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          orgId,
          role: UserRole.SUPER_ADMIN,
        },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
    ]);

    const recipients = new Set<string>();

    for (const admin of orgAdmins) {
      recipients.add(admin.id);
    }

    if (userEntity) {
      recipients.add(userEntity.id);
    }

    return Array.from(recipients);
  }

  async create(payload: CreateAssignmentDto) {
    await this.ensureCanAssign(payload.userId, payload.workplaceId);
    await this.ensureNoOverlap(
      payload.userId,
      payload.startsAt,
      payload.endsAt ?? null,
    );

    const assignment = await this.prisma.assignment.create({
      data: {
        userId: payload.userId,
        workplaceId: payload.workplaceId,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt ?? null,
        status: AssignmentStatus.ACTIVE,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, orgId: true },
        },
        workplace: {
          select: {
            id: true,
            code: true,
            name: true,
            orgId: true,
            org: { select: { id: true } },
          },
        },
      },
    });

    const recipients = await this.resolveRecipients(
      assignment.userId,
      assignment.workplace.orgId,
    );

    await this.notifications.notifyMany(
      recipients,
      NotificationType.ASSIGNMENT_CREATED,
      {
        assignmentId: assignment.id,
        userId: assignment.userId,
        workplaceId: assignment.workplaceId,
      },
    );

    return assignment;
  }

  async notify(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        workplace: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }

    if (!assignment.user?.email) {
      throw new BadRequestException('У сотрудника не указан email');
    }

    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException('Назначение не активно');
    }

    await this.email.sendAssignmentNotification({
      email: assignment.user.email,
      fullName: assignment.user.fullName ?? null,
      workplaceCode: assignment.workplace.code,
      workplaceName: assignment.workplace.name ?? null,
      startsAt: assignment.startsAt,
      endsAt: assignment.endsAt ?? null,
    });

    // 🔔 SMS-уведомление сотруднику (если настроен шлюз и указан телефон)
    await this.smsService.sendAssignmentNotification(id);

    return { success: true } as const;
  }

  async findAll(params: ListAssignmentsDto) {
    const { page, pageSize } = params;
    const where = this.buildWhere(params);
    const [items, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              org: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
          workplace: {
            select: {
              id: true,
              code: true,
              name: true,
              location: true,
              org: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
        orderBy: { startsAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            org: { select: { id: true, name: true, slug: true } },
          },
        },
        workplace: {
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
            org: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }

    return assignment;
  }

  async update(id: string, payload: UpdateAssignmentDto) {
    const existing = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Назначение не найдено');
    }

    if (payload.userId && payload.userId !== existing.userId) {
      await this.ensureCanAssign(payload.userId, payload.workplaceId ?? existing.workplaceId);
    }

    if (payload.startsAt || payload.endsAt !== undefined) {
      const startsAt = payload.startsAt ?? existing.startsAt;
      const endsAt =
        payload.endsAt === undefined ? existing.endsAt : payload.endsAt;
      await this.ensureNoOverlap(existing.userId, startsAt, endsAt, id);
    }

    const assignment = await this.prisma.assignment.update({
      where: { id },
      data: {
        userId: payload.userId ?? existing.userId,
        workplaceId: payload.workplaceId ?? existing.workplaceId,
        startsAt: payload.startsAt ?? existing.startsAt,
        endsAt:
          payload.endsAt === undefined ? existing.endsAt : payload.endsAt,
        status: payload.status ?? existing.status,
      },
    });

    const recipients = await this.resolveRecipients(
      assignment.userId,
      existing.user.orgId!,
    );

    await this.notifications.notifyMany(
      recipients,
      NotificationType.ASSIGNMENT_UPDATED,
      {
        assignmentId: assignment.id,
        userId: assignment.userId,
        workplaceId: assignment.workplaceId,
      },
    );

    return assignment;
  }

  async archive(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }

    if (assignment.status === AssignmentStatus.ARCHIVED) {
      throw new BadRequestException('Назначение уже в архиве');
    }

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        status: AssignmentStatus.ARCHIVED,
      },
    });

    const recipients = await this.resolveRecipients(
      updated.userId,
      (await this.prisma.workplace.findUnique({
        where: { id: updated.workplaceId },
        select: { orgId: true },
      }))!.orgId,
    );

    await this.notifications.notifyMany(
      recipients,
      NotificationType.ASSIGNMENT_CANCELLED,
      {
        assignmentId: updated.id,
        userId: updated.userId,
        workplaceId: updated.workplaceId,
      },
    );

    return updated;
  }

  async getHistoryForUser(userId: string, take = 10) {
    return this.prisma.assignment.findMany({
      where: { userId },
      include: {
        workplace: {
          select: { id: true, code: true, name: true, location: true },
        },
      },
      orderBy: { startsAt: 'desc' },
      take,
    });
  }
}
