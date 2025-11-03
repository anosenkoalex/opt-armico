import {
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

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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
      const dateFilter: Prisma.DateTimeFilter = {};

      if (params.from) {
        dateFilter.gte = params.from;
      }

      if (params.to) {
        dateFilter.lte = params.to;
      }

      where.startsAt = dateFilter;
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
        OR: [{ endsAt: null }, { endsAt: { gte: startsAt } }],
      },
    });

    if (overlapping) {
      throw new ConflictException({
        code: 'ASSIGNMENT_OVERLAP',
        message: 'Назначение пересекается по времени',
      });
    }
  }

  private buildNotificationPayload(
    assignment: Prisma.AssignmentGetPayload<{
      include: {
        workplace: {
          select: {
            id: true;
            code: true;
            name: true;
            location: true;
            orgId: true;
            org: { select: { id: true; name: true; slug: true } };
          };
        };
      };
    }>,
  ): Prisma.JsonObject {
    return {
      assignmentId: assignment.id,
      userId: assignment.userId,
      workplaceId: assignment.workplaceId,
      workplaceCode: assignment.workplace.code,
      workplaceName: assignment.workplace.name,
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt ? assignment.endsAt.toISOString() : null,
      status: assignment.status,
      orgId: assignment.workplace.orgId,
      orgName: assignment.workplace.org?.name ?? null,
      orgSlug: assignment.workplace.org?.slug ?? null,
    } satisfies Prisma.JsonObject;
  }

  private async resolveRecipients(
    userId: string,
    orgId: string | null,
  ): Promise<string[]> {
    const recipients = new Set<string>([userId]);

    if (orgId) {
      const managers = await this.prisma.user.findMany({
        where: { orgId, role: UserRole.ORG_MANAGER },
        select: { id: true },
      });

      for (const manager of managers) {
        recipients.add(manager.id);
      }
    }

    return Array.from(recipients);
  }

  async create(data: CreateAssignmentDto) {
    const status = data.status ?? AssignmentStatus.ACTIVE;

    if (status === AssignmentStatus.ACTIVE) {
      await this.ensureNoOverlap(
        data.userId,
        data.startsAt,
        data.endsAt ?? null,
      );
    }

    const assignment = await this.prisma.assignment.create({
      data: {
        userId: data.userId,
        workplaceId: data.workplaceId,
        startsAt: data.startsAt,
        endsAt: data.endsAt ?? null,
        status,
      },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        workplace: {
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
            orgId: true,
            org: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    const payload = this.buildNotificationPayload(assignment);
    const recipients = await this.resolveRecipients(
      assignment.userId,
      assignment.workplace.orgId,
    );

    await this.notifications.notifyMany(
      recipients,
      NotificationType.ASSIGNMENT_CREATED,
      payload,
    );

    return assignment;
  }

  async findAll(params: ListAssignmentsDto) {
    const { page, pageSize } = params;
    const where = this.buildWhere(params);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          workplace: {
            select: { id: true, code: true, name: true, location: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.assignment.count({ where }),
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
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        workplace: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async update(id: string, data: UpdateAssignmentDto) {
    const existing = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        workplace: {
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
            orgId: true,
            org: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Assignment not found');
    }

    const nextStatus = data.status ?? existing.status;
    const nextUserId = data.userId ?? existing.userId;
    const nextStartsAt = data.startsAt ?? existing.startsAt;
    const nextEndsAt =
      data.endsAt !== undefined ? (data.endsAt ?? null) : existing.endsAt;

    if (nextStatus === AssignmentStatus.ACTIVE) {
      await this.ensureNoOverlap(nextUserId, nextStartsAt, nextEndsAt, id);
    }

    const updateData: Prisma.AssignmentUpdateInput = {
      user: data.userId ? { connect: { id: data.userId } } : undefined,
      workplace: data.workplaceId
        ? { connect: { id: data.workplaceId } }
        : undefined,
      startsAt: data.startsAt ?? undefined,
      endsAt: data.endsAt !== undefined ? nextEndsAt : undefined,
      status: data.status ?? undefined,
    };

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        workplace: {
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
            orgId: true,
            org: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    const payload = this.buildNotificationPayload(updated);

    if (data.userId && data.userId !== existing.userId) {
      const cancelledPayload = this.buildNotificationPayload(existing);
      cancelledPayload.status = AssignmentStatus.ARCHIVED;

      const cancelledRecipients = await this.resolveRecipients(
        existing.userId,
        existing.workplace.orgId,
      );

      await this.notifications.notifyMany(
        cancelledRecipients,
        NotificationType.ASSIGNMENT_CANCELLED,
        cancelledPayload,
      );

      const createdRecipients = await this.resolveRecipients(
        updated.userId,
        updated.workplace.orgId,
      );

      await this.notifications.notifyMany(
        createdRecipients,
        NotificationType.ASSIGNMENT_CREATED,
        payload,
      );
    } else {
      let type: NotificationType = NotificationType.ASSIGNMENT_UPDATED;

      if (existing.status !== updated.status) {
        if (updated.status === AssignmentStatus.ARCHIVED) {
          type = NotificationType.ASSIGNMENT_CANCELLED;
        }
      }

      const datesChanged =
        existing.startsAt.getTime() !== updated.startsAt.getTime() ||
        (existing.endsAt?.getTime() ?? null) !==
          (updated.endsAt?.getTime() ?? null);

      if (type !== NotificationType.ASSIGNMENT_CANCELLED && datesChanged) {
        type = NotificationType.ASSIGNMENT_MOVED;
      }

      const recipients = await this.resolveRecipients(
        updated.userId,
        updated.workplace.orgId,
      );

      await this.notifications.notifyMany(recipients, type, payload);
    }

    return updated;
  }

  async getCurrentWorkplaceForUser(userId: string) {
    const now = new Date();

    return this.prisma.assignment.findFirst({
      where: {
        userId,
        status: AssignmentStatus.ACTIVE,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: { workplace: true },
      orderBy: { startsAt: 'desc' },
    });
  }

  getHistoryForUser(userId: string, take = 10) {
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
