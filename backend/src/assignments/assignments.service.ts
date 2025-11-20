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
  ShiftKind,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CreateAssignmentDto } from './dto/create-assignment.dto.js';
import { UpdateAssignmentDto } from './dto/update-assignment.dto.js';
import { ListAssignmentsDto } from './dto/list-assignments.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmailService } from '../notifications/email.service.js';
import { SmsService } from '../sms/sms.service.js';

type AdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type RequestScheduleAdjustmentPayload = {
  date: string;
  startsAt?: string;
  endsAt?: string;
  kind?: ShiftKind | string;
  comment: string;
};

type ListScheduleAdjustmentsParams = {
  page?: number;
  pageSize?: number;
  status?: AdjustmentStatus;
  userId?: string;
  assignmentId?: string;
};

type ScheduleAdjustmentDecisionPayload = {
  managerComment?: string;
};

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  private readonly smsService: SmsService,
  ) {}

  /**
   * Приводим from/to к Date
   */
  private normalizeRange(params: ListAssignmentsDto): {
    from: Date;
    to: Date;
  } {
    const rawFrom = params.from;
    const rawTo = params.to;

    const from =
      rawFrom instanceof Date
        ? rawFrom
        : rawFrom
        ? new Date(rawFrom)
        : new Date('1970-01-01T00:00:00.000Z');

    const to =
      rawTo instanceof Date
        ? rawTo
        : rawTo
        ? new Date(rawTo)
        : new Date('9999-12-31T23:59:59.999Z');

    return { from, to };
  }

  /**
   * Базовый where для обычных списков:
   *  - берём только НЕ удалённые (deletedAt = null)
   */
  private buildWhere(params: ListAssignmentsDto): Prisma.AssignmentWhereInput {
    const where: Prisma.AssignmentWhereInput = {
      deletedAt: null,
    };

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.workplaceId) {
      where.workplaceId = params.workplaceId;
    }

    if (params.status) {
      where.status = params.status;
    }

    /**
     * Фильтрация по периоду:
     * берём все назначения, чьи интервалы [startsAt, endsAt/null=∞]
     * ПЕРЕСЕКАЮТСЯ с [from, to].
     */
    if (params.from || params.to) {
      const { from, to } = this.normalizeRange(params);

      where.AND = [
        // начало не позже конца выбранного периода
        { startsAt: { lte: to } },
        {
          // либо открытое (endsAt = null), либо конец не раньше начала периода
          OR: [{ endsAt: null }, { endsAt: { gte: from } }],
        },
      ];
    }

    return where;
  }

  /**
   * Отдельный where для КОРЗИНЫ (только удалённые).
   * Логика та же, но deletedAt != null.
   */
  private buildTrashWhere(
    params: ListAssignmentsDto,
  ): Prisma.AssignmentWhereInput {
    const where: Prisma.AssignmentWhereInput = {
      deletedAt: { not: null },
    };

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
      const { from, to } = this.normalizeRange(params);

      where.AND = [
        { startsAt: { lte: to } },
        {
          OR: [{ endsAt: null }, { endsAt: { gte: from } }],
        },
      ];
    }

    return where;
  }

  /**
   * Проверяем пересечение интервалов назначений для сотрудника.
   * Разрешаем максимум 2 пересекающихся ACTIVE назначения.
   * На третье пересечение — кидаем ошибку.
   */
  private async ensureNoOverlap(
    userId: string,
    startsAt: Date,
    endsAt: Date | null,
    assignmentId?: string,
  ) {
    const rangeEnd = endsAt ?? new Date('9999-12-31T23:59:59.999Z');

    const overlapping = await this.prisma.assignment.findMany({
      where: {
        NOT: assignmentId ? { id: assignmentId } : undefined,
        userId,
        status: AssignmentStatus.ACTIVE,
        deletedAt: null,
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
      select: { id: true },
    });

    if (overlapping.length >= 2) {
      throw new ConflictException(
        'У сотрудника уже есть два активных назначения в этот период',
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

  // 🔒 Проверяем, что назначаем только обычного сотрудника (USER), не системного
  private async ensureCanAssign(userId: string, workplaceId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        orgId: true,
        role: true,
        isSystemUser: true,
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

    // Назначать можно только обычных сотрудников (USER),
    // админов / девелопера / менеджеров / системных — нельзя
    if (user.role !== UserRole.USER || user.isSystemUser) {
      throw new BadRequestException(
        'Назначать можно только сотрудников с ролью USER',
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
    const { shifts, ...rest } = payload as any;

    await this.ensureCanAssign(rest.userId, rest.workplaceId);
    await this.ensureNoOverlap(
      rest.userId,
      rest.startsAt,
      rest.endsAt ?? null,
    );

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          userId: rest.userId,
          workplaceId: rest.workplaceId,
          startsAt: rest.startsAt,
          endsAt: rest.endsAt ?? null,
          status: rest.status ?? AssignmentStatus.ACTIVE,
          // deletedAt по умолчанию null в Prisma-схеме
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

      // создаём смены для назначения
      await tx.assignmentShift.createMany({
        data: (shifts ?? []).map((shift: any) => ({
          assignmentId: created.id,
          date: shift.date,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          kind:
            shift.kind && ShiftKind[shift.kind as keyof typeof ShiftKind]
              ? shift.kind
              : ShiftKind.DEFAULT,
        })),
      });

      // возвращаем назначение уже с подгруженными сменами
      return tx.assignment.findUnique({
        where: { id: created.id },
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
          shifts: true,
        },
      });
    });

    const recipients = await this.resolveRecipients(
      assignment!.userId,
      assignment!.workplace.orgId,
    );

    await this.notifications.notifyMany(
      recipients,
      NotificationType.ASSIGNMENT_CREATED,
      {
        assignmentId: assignment!.id,
        userId: assignment!.userId,
        workplaceId: assignment!.workplaceId,
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

    if (!assignment || assignment.deletedAt) {
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
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
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
          shifts: true,
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

  /**
   * Список назначений в корзине (deletedAt != null).
   * Это пригодится для экрана "Корзина" на фронте.
   */
  async findAllInTrash(params: ListAssignmentsDto) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
    const where = this.buildTrashWhere(params);

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
          shifts: true,
        },
        orderBy: { deletedAt: 'desc' },
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
        shifts: true,
      },
    });

    if (!assignment || assignment.deletedAt) {
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

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Назначение не найдено');
    }

    const { shifts, ...rest } = payload as any;

    const effectiveUserId = rest.userId ?? existing.userId;
    const effectiveWorkplaceId = rest.workplaceId ?? existing.workplaceId;

    if (rest.userId && rest.userId !== existing.userId) {
      await this.ensureCanAssign(effectiveUserId, effectiveWorkplaceId);
    }

    if (rest.startsAt || rest.endsAt !== undefined) {
      const startsAt = rest.startsAt ?? existing.startsAt;
      const endsAt =
        rest.endsAt === undefined ? existing.endsAt : rest.endsAt;
      await this.ensureNoOverlap(effectiveUserId, startsAt, endsAt, id);
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.assignment.update({
        where: { id },
        data: {
          userId: effectiveUserId,
          workplaceId: effectiveWorkplaceId,
          startsAt: rest.startsAt ?? existing.startsAt,
          endsAt:
            rest.endsAt === undefined ? existing.endsAt : rest.endsAt,
          status: rest.status ?? existing.status,
        },
      });

      if (Array.isArray(shifts)) {
        // Перезаписываем смены
        await tx.assignmentShift.deleteMany({
          where: { assignmentId: id },
        });

        if (shifts.length > 0) {
          await tx.assignmentShift.createMany({
            data: shifts.map((shift: any) => ({
              assignmentId: id,
              date: shift.date,
              startsAt: shift.startsAt,
              endsAt: shift.endsAt,
              kind:
                shift.kind && ShiftKind[shift.kind as keyof typeof ShiftKind]
                  ? shift.kind
                  : ShiftKind.DEFAULT,
            })),
          });
        }
      }

      return tx.assignment.findUnique({
        where: { id: updated.id },
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
          shifts: true,
        },
      });
    });

    const recipients = await this.resolveRecipients(
      assignment!.userId,
      existing.user.orgId!,
    );

    await this.notifications.notifyMany(
      recipients,
      NotificationType.ASSIGNMENT_UPDATED,
      {
        assignmentId: assignment!.id,
        userId: assignment!.userId,
        workplaceId: assignment!.workplaceId,
      },
    );

    return assignment;
  }

  async archive(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });

    if (!assignment || assignment.deletedAt) {
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

    const workplace = await this.prisma.workplace.findUnique({
      where: { id: updated.workplaceId },
      select: { orgId: true },
    });

    const recipients = await this.resolveRecipients(
      updated.userId,
      workplace!.orgId,
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

  /**
   * Завершение назначения:
   *  - только для ACTIVE
   *  - переводим в ARCHIVED
   *  - если endsAt пустой или в будущем — ставим сейчас
   */
  async complete(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        workplace: {
          select: { orgId: true },
        },
      },
    });

    if (!assignment || assignment.deletedAt) {
      throw new NotFoundException('Назначение не найдено');
    }

    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException('Назначение уже завершено');
    }

    const now = new Date();

    const finalEndsAt =
      assignment.endsAt && assignment.endsAt <= now
        ? assignment.endsAt
        : now;

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        status: AssignmentStatus.ARCHIVED,
        endsAt: finalEndsAt,
      },
    });

    const recipients = await this.resolveRecipients(
      updated.userId,
      assignment.workplace.orgId,
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

  /**
   * Мягкое удаление: перенос в корзину.
   *  - выставляем deletedAt = now (факт удаления)
   *  - статус в базе оставляем, но если вдруг был ACTIVE — переводим в ARCHIVED
   */
  async softDelete(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });

    if (!assignment || assignment.deletedAt) {
      throw new NotFoundException('Назначение не найдено');
    }

    const newStatus =
      assignment.status === AssignmentStatus.ACTIVE
        ? AssignmentStatus.ARCHIVED
        : assignment.status;

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: newStatus,
      },
    });

    const workplace = await this.prisma.workplace.findUnique({
      where: { id: updated.workplaceId },
      select: { orgId: true },
    });

    if (workplace?.orgId) {
      const recipients = await this.resolveRecipients(
        updated.userId,
        workplace.orgId,
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
    }

    return updated;
  }

  /**
   * Восстановление из корзины:
   *  - deletedAt = null
   *  - статус не меняем (как был, так и остаётся, обычно ARCHIVED)
   */
  async restoreFromTrash(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });

    if (!assignment || !assignment.deletedAt) {
      throw new NotFoundException('Назначение не найдено в корзине');
    }

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        deletedAt: null,
      },
    });

    return updated;
  }

  // Текущее назначение пользователя (для /me/current-workplace и прочего)
  async getCurrentWorkplaceForUser(userId: string) {
    const now = new Date();

    return this.prisma.assignment.findFirst({
      where: {
        userId,
        status: AssignmentStatus.ACTIVE,
        deletedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      include: {
        workplace: {
          select: { id: true, code: true, name: true, location: true },
        },
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  async getHistoryForUser(userId: string, take = 10) {
    return this.prisma.assignment.findMany({
      where: { userId, deletedAt: null },
      include: {
        workplace: {
          select: { id: true, code: true, name: true, location: true },
        },
      },
      orderBy: { startsAt: 'desc' },
      take,
    });
  }

  /**
   * 📥 Экспорт назначений из корзины по списку id.
   * Возвращаем JSON, фронт сам делает таблицу/Excel/CSV.
   */
  async exportFromTrash(ids: string[]) {
    if (!ids.length) {
      return [];
    }

    const items = await this.prisma.assignment.findMany({
      where: {
        id: { in: ids },
        deletedAt: { not: null },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            position: true,
          },
        },
        workplace: {
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
          },
        },
        shifts: true,
      },
      orderBy: { startsAt: 'desc' },
    });

    return items;
  }

  /**
   * 🗑 Окончательное удаление назначений из корзины (hard delete).
   */
  async bulkDeleteFromTrash(ids: string[]) {
    if (!ids.length) {
      return { deletedCount: 0 };
    }

    const result = await this.prisma.assignment.deleteMany({
      where: {
        id: { in: ids },
        deletedAt: { not: null },
      },
    });

    return { deletedCount: result.count };
  }

  /**
   * 📥 + 🗑 Экспорт + удаление:
   *  - достаём объекты
   *  - удаляем их из БД
   *  - возвращаем данные на фронт
   */
  async exportAndDeleteFromTrash(ids: string[]) {
    if (!ids.length) {
      return [];
    }

    return this.prisma.$transaction(async (tx) => {
      const items = await tx.assignment.findMany({
        where: {
          id: { in: ids },
          deletedAt: { not: null },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              position: true,
            },
          },
          workplace: {
            select: {
              id: true,
              code: true,
              name: true,
              location: true,
            },
          },
          shifts: true,
        },
        orderBy: { startsAt: 'desc' },
      });

      if (!items.length) {
        return [];
      }

      await tx.assignment.deleteMany({
        where: {
          id: { in: items.map((a) => a.id) },
          deletedAt: { not: null },
        },
      });

      return items;
    });
  }

  // ============================================================
  //      🔔 ЗАПРОСЫ НА КОРРЕКТИРОВКУ РАСПИСАНИЯ
  // ============================================================

  /**
   * Нормализуем дату: поддерживаем как ISO, так и просто YYYY-MM-DD.
   */
  private parseDateOnly(dateStr: string): Date {
    const iso =
      /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00.000Z` : dateStr;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Некорректная дата корректировки');
    }
    return d;
  }

  /**
   * 📝 Пользователь подаёт запрос на корректировку по назначению.
   *
   * Пока что это просто запись в отдельную таблицу + нотификации.
   * Автоматически сами смены мы НЕ правим (это можно будет добавить позже,
   * когда утрясём логику статистики).
   */
  async requestScheduleAdjustment(
    assignmentId: string,
    payload: RequestScheduleAdjustmentPayload,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: {
          select: { id: true, orgId: true },
        },
        workplace: {
          select: { id: true, orgId: true, code: true, name: true },
        },
      },
    });

    if (!assignment || assignment.deletedAt) {
      throw new NotFoundException('Назначение не найдено');
    }

    if (!assignment.user) {
      throw new BadRequestException('У назначения не найден сотрудник');
    }

    const date = this.parseDateOnly(payload.date);
    const startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
    const endsAt = payload.endsAt ? new Date(payload.endsAt) : null;

    const kind: ShiftKind =
      (payload.kind as ShiftKind) ?? ShiftKind.DAY_OFF;

    const adjustment = await this.prisma.assignmentAdjustment.create({
      data: {
        assignmentId: assignment.id,
        userId: assignment.userId,
        date,
        startsAt,
        endsAt,
        kind,
        comment: payload.comment.trim(),
        status: 'PENDING',
      } as any,
    });

    // Уведомляем участника + админов организации,
    // чтобы у менеджера/супера в колокольчике появился запрос.
    const orgId =
      assignment.workplace?.orgId ?? assignment.user.orgId ?? null;

    if (orgId) {
      const recipients = await this.resolveRecipients(
        assignment.userId,
        orgId,
      );

      await this.notifications.notifyMany(
        recipients,
        NotificationType.ASSIGNMENT_UPDATED,
        {
          assignmentId: assignment.id,
          userId: assignment.userId,
          workplaceId: assignment.workplaceId,
          adjustmentId: adjustment.id,
          adjustmentType: 'REQUESTED',
        },
      );
    }

    return adjustment;
  }

  /**
   * 📋 Список запросов корректировок для менеджера/админа.
   */
  async listScheduleAdjustments(params: ListScheduleAdjustmentsParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }
    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.assignmentId) {
      where.assignmentId = params.assignmentId;
    }

    const [items, total] = await Promise.all([
      this.prisma.assignmentAdjustment.findMany({
        where,
        include: {
          assignment: {
            include: {
              workplace: {
                select: { id: true, code: true, name: true },
              },
              user: {
                select: { id: true, fullName: true, email: true },
              },
            },
          },
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }) as any,
      this.prisma.assignmentAdjustment.count({ where }) as any,
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * ✅ / ❌ Решение по запросу корректировки.
   *
   * Сейчас:
   *  - меняем статус PENDING → APPROVED / REJECTED
   *  - сохраняем комментарий менеджера
   *  - шлём нотификации
   *
   * В будущем сюда можно добавить автопроставление DAY_OFF и т.п.
   */
  async decideScheduleAdjustment(
    adjustmentId: string,
    decision: AdjustmentStatus,
    payload: ScheduleAdjustmentDecisionPayload,
  ) {
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new BadRequestException('Некорректный статус решения');
    }

    const adjustment = await this.prisma.assignmentAdjustment.findUnique({
      where: { id: adjustmentId },
      include: {
        assignment: {
          include: {
            workplace: { select: { id: true, orgId: true, code: true, name: true } },
            user: { select: { id: true, orgId: true } },
          },
        },
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    if (!adjustment) {
      throw new NotFoundException('Запрос корректировки не найден');
    }

    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException('По этому запросу уже принято решение');
    }

    const updated = await this.prisma.assignmentAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: decision,
        managerComment: payload.managerComment ?? null,
      } as any,
    });

    const assignment = adjustment.assignment;
    const orgId =
      assignment?.workplace?.orgId ?? assignment?.user?.orgId ?? null;

    if (orgId && assignment) {
      const recipients = await this.resolveRecipients(
        assignment.userId,
        orgId,
      );

      await this.notifications.notifyMany(
        recipients,
        NotificationType.ASSIGNMENT_UPDATED,
        {
          assignmentId: assignment.id,
          userId: assignment.userId,
          workplaceId: assignment.workplaceId,
          adjustmentId: adjustment.id,
          adjustmentType:
            decision === 'APPROVED'
              ? 'APPROVED'
              : 'REJECTED',
        },
      );
    }

    return updated;
  }
}