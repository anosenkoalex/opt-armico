import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Plan, PlanStatus, Prisma, SlotStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AutoAssignDto } from './dto/auto-assign.dto.js';
import { BulkAssignDto, BulkAssignSlotDto } from './dto/bulk-assign.dto.js';
import { BulkMoveDto } from './dto/bulk-move.dto.js';
import { CreatePlanDto } from './dto/create-plan.dto.js';
import { GetPlanQueryDto } from './dto/get-plan.dto.js';
import { ListPlansDto } from './dto/list-plans.dto.js';
import { MatrixQueryDto } from './dto/matrix-query.dto.js';
import { RequestSwapDto } from './dto/request-swap.dto.js';
import { UpdateSlotDto } from './dto/update-slot.dto.js';
import { UpsertConstraintDto } from './dto/upsert-constraint.dto.js';

const matrixSelect = {
  id: true,
  email: true,
  fullName: true,
  position: true,
};

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createPlan(payload: CreatePlanDto) {
    const plan = await this.prisma.plan.create({
      data: {
        name: payload.name,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
      },
    });

    return plan;
  }

  async listPlans(query: ListPlansDto) {
    const where: Prisma.PlanWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.from || query.to) {
      where.AND = [];

      if (query.from) {
        where.AND.push({ endsAt: { gte: query.from } });
      }

      if (query.to) {
        where.AND.push({ startsAt: { lte: query.to } });
      }
    }

    const skip = (query.page - 1) * query.pageSize;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.plan.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.plan.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  async getPlan(id: string, query: GetPlanQueryDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const skip = (query.page - 1) * query.pageSize;

    const [slots, total] = await this.prisma.$transaction([
      this.prisma.slot.findMany({
        where: { planId: id },
        orderBy: { dateStart: 'asc' },
        skip,
        take: query.pageSize,
        include: {
          user: { select: matrixSelect },
          org: true,
        },
      }),
      this.prisma.slot.count({ where: { planId: id } }),
    ]);

    return {
      plan,
      slots: {
        data: slots,
        meta: {
          total,
          page: query.page,
          pageSize: query.pageSize,
        },
      },
    };
  }

  async publishPlan(id: string) {
    const plan = await this.ensurePlan(id);

    if (plan.status === PlanStatus.PUBLISHED) {
      return plan;
    }

    if (plan.status === PlanStatus.ARCHIVED) {
      throw new BadRequestException('Archived plan cannot be published');
    }

    return this.prisma.plan.update({
      where: { id },
      data: { status: PlanStatus.PUBLISHED },
    });
  }

  async archivePlan(id: string) {
    const plan = await this.ensurePlan(id);

    if (plan.status === PlanStatus.ARCHIVED) {
      return plan;
    }

    return this.prisma.plan.update({
      where: { id },
      data: { status: PlanStatus.ARCHIVED },
    });
  }

  async deletePlan(id: string) {
    const plan = await this.ensurePlan(id);

    if (plan.status !== PlanStatus.DRAFT) {
      throw new BadRequestException('Only draft plans can be deleted');
    }

    await this.prisma.slot.deleteMany({ where: { planId: id } });
    await this.prisma.plan.delete({ where: { id } });

    return { id };
  }

  async autoAssign(planId: string, payload: AutoAssignDto) {
    const plan = await this.ensurePlan(planId);

    this.assertPlanMutable(plan);

    if (payload.dateEnd < plan.startsAt || plan.endsAt < payload.dateStart) {
      throw new BadRequestException('Dates are outside of plan range');
    }

    const org = await this.prisma.org.findUnique({ where: { id: payload.orgId } });

    if (!org) {
      throw new NotFoundException('Organisation not found');
    }

    const existingSlots = await this.prisma.slot.findMany({
      where: {
        planId,
        OR: [
          { dateStart: { lte: payload.dateEnd }, dateEnd: { gte: payload.dateStart } },
          { dateStart: { gte: payload.dateStart, lte: payload.dateEnd } },
        ],
      },
      select: {
        userId: true,
        dateStart: true,
        dateEnd: true,
      },
    });

    const rangeSlots = existingSlots.map((slot) => ({
      userId: slot.userId,
      dateStart: slot.dateStart,
      dateEnd: slot.dateEnd,
    }));

    const userCounts = new Map<string, number>();

    for (const slot of existingSlots) {
      userCounts.set(slot.userId, (userCounts.get(slot.userId) ?? 0) + 1);
    }

    const users = await this.prisma.user.findMany({
      where: {
        role: { not: 'SUPER_ADMIN' },
      },
      select: { id: true },
    });

    const constraints = payload.respectConstraints
      ? await this.prisma.constraint.findMany({
          where: {
            OR: [
              { userId: null, orgId: null },
              { userId: null, orgId: payload.orgId },
              { userId: { in: users.map((user) => user.id) } },
            ],
          },
        })
      : [];

    const planned: BulkAssignSlotDto[] = [];

    const sortedUsers = [...users].sort((a, b) => {
      const countA = userCounts.get(a.id) ?? 0;
      const countB = userCounts.get(b.id) ?? 0;

      if (countA === countB) {
        return a.id.localeCompare(b.id);
      }

      return countA - countB;
    });

    const isUserAvailable = (userId: string) => {
      if (!payload.respectConstraints) {
        return true;
      }

      const relevant = constraints.filter(
        (item) => item.userId === userId || (!item.userId && (!item.orgId || item.orgId === payload.orgId)),
      );

      for (const constraint of relevant) {
        if (constraint.type === 'ORG_BLACKLIST') {
          const value = constraint.payload as unknown;

          if (Array.isArray(value) && value.includes(payload.orgId)) {
            return false;
          }

          if (
            typeof value === 'object' &&
            value !== null &&
            Array.isArray((value as Record<string, unknown>).orgIds) &&
            ((value as Record<string, unknown>).orgIds as unknown[]).includes(payload.orgId)
          ) {
            return false;
          }
        }

        if (constraint.type === 'AVAILABILITY') {
          const value = constraint.payload as Record<string, unknown> | null;
          const unavailable =
            value && Array.isArray(value.unavailable)
              ? (value.unavailable as Array<Record<string, unknown>>)
              : [];

          for (const item of unavailable) {
            const from = item.from ? new Date(item.from as string) : null;
            const to = item.to ? new Date(item.to as string) : null;

            if (!from || !to) {
              continue;
            }

            if (!(to < payload.dateStart || from > payload.dateEnd)) {
              return false;
            }
          }
        }

        if (constraint.type === 'MAX_SLOTS_PER_WEEK') {
          const value = constraint.payload as Record<string, unknown> | null;
          const limit = typeof value?.limit === 'number' ? value.limit : null;

          if (limit) {
            const weekNumber = this.getIsoWeekKey(payload.dateStart);
            const userWeekCount = rangeSlots.filter((slot) => {
              return (
                slot.userId === userId &&
                this.getIsoWeekKey(slot.dateStart) === weekNumber &&
                !(slot.dateEnd < payload.dateStart || slot.dateStart > payload.dateEnd)
              );
            }).length;

            if (userWeekCount >= limit) {
              return false;
            }
          }
        }
      }

      const overlapping = rangeSlots.some((slot) => {
        return (
          slot.userId === userId &&
          !(slot.dateEnd < payload.dateStart || slot.dateStart > payload.dateEnd)
        );
      });

      return !overlapping;
    };

    for (const user of sortedUsers) {
      if (planned.length >= payload.teamSize) {
        break;
      }

      if (!isUserAvailable(user.id)) {
        continue;
      }

      planned.push({
        userId: user.id,
        orgId: payload.orgId,
        dateStart: payload.dateStart,
        dateEnd: payload.dateEnd,
        status: SlotStatus.PLANNED,
        colorCode: org.slug?.toUpperCase() ?? null,
      });

      rangeSlots.push({
        userId: user.id,
        dateStart: payload.dateStart,
        dateEnd: payload.dateEnd,
      });
    }

    if (planned.length < payload.teamSize) {
      throw new BadRequestException('Not enough available employees for auto assignment');
    }

    const created = await this.createSlots(planId, planned, plan);

    await this.notifyUsers(
      created.map((slot) => slot.userId),
      NotificationType.ASSIGNMENT_CREATED,
      {
        planId,
        orgId: payload.orgId,
      },
    );

    return created;
  }

  async bulkAssign(planId: string, payload: BulkAssignDto) {
    const plan = await this.ensurePlan(planId);
    this.assertPlanMutable(plan);

    const created = await this.createSlots(planId, payload.slots, plan);

    await this.notifyUsers(
      created.map((slot) => slot.userId),
      NotificationType.ASSIGNMENT_CREATED,
      {
        planId,
      },
    );

    return created;
  }

  async bulkMove(planId: string, payload: BulkMoveDto) {
    const plan = await this.ensurePlan(planId);
    this.assertPlanMutable(plan);

    const slots = await this.prisma.slot.findMany({
      where: { id: { in: payload.slotIds }, planId },
    });

    if (slots.length !== payload.slotIds.length) {
      throw new NotFoundException('Some slots were not found in this plan');
    }

    const updates = slots.map((slot) => {
      if (slot.locked && (payload.newDateStart || payload.newDateEnd || payload.newOrgId || payload.newUserId)) {
        throw new ForbiddenException(`Slot ${slot.id} is locked and cannot be moved`);
      }

      const nextDateStart = payload.newDateStart ?? slot.dateStart;
      const nextDateEnd = payload.newDateEnd ?? slot.dateEnd;

      if (nextDateEnd < nextDateStart) {
        throw new BadRequestException('dateEnd must be after dateStart');
      }

      return this.prisma.slot.update({
        where: { id: slot.id },
        data: {
          dateStart: nextDateStart,
          dateEnd: nextDateEnd,
          orgId: payload.newOrgId ?? slot.orgId,
          userId: payload.newUserId ?? slot.userId,
        },
      });
    });

    const updated = await this.prisma.$transaction(updates);

    await this.notifyUsers(
      updated.map((slot) => slot.userId),
      NotificationType.ASSIGNMENT_UPDATED,
      {
        planId,
      },
    );

    return updated;
  }

  async updateSlot(planId: string, slotId: string, payload: UpdateSlotDto) {
    const plan = await this.ensurePlan(planId);
    this.assertPlanMutable(plan);

    const slot = await this.prisma.slot.findFirst({ where: { id: slotId, planId } });

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    const touchingLockedFields =
      slot.locked &&
      (payload.dateStart !== undefined ||
        payload.dateEnd !== undefined ||
        payload.orgId !== undefined ||
        payload.userId !== undefined);

    if (touchingLockedFields) {
      throw new ForbiddenException('Slot is locked and cannot be modified');
    }

    const nextDateStart = payload.dateStart ?? slot.dateStart;
    const nextDateEnd = payload.dateEnd ?? slot.dateEnd;

    if (nextDateEnd < nextDateStart) {
      throw new BadRequestException('dateEnd must be after dateStart');
    }

    const updated = await this.prisma.slot.update({
      where: { id: slot.id },
      data: {
        dateStart: nextDateStart,
        dateEnd: nextDateEnd,
        orgId: payload.orgId ?? slot.orgId,
        userId: payload.userId ?? slot.userId,
        status: payload.status ?? slot.status,
        colorCode: payload.colorCode ?? slot.colorCode,
        note: payload.note ?? slot.note,
        locked: payload.locked ?? slot.locked,
      },
    });

    await this.notifyUsers([updated.userId], NotificationType.ASSIGNMENT_UPDATED, {
      planId,
      slotId,
    });

    return updated;
  }

  async deleteSlot(planId: string, slotId: string) {
    const plan = await this.ensurePlan(planId);
    this.assertPlanMutable(plan);

    const slot = await this.prisma.slot.findFirst({ where: { id: slotId, planId } });

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    if (slot.locked) {
      throw new ForbiddenException('Slot is locked and cannot be removed');
    }

    await this.prisma.slot.delete({ where: { id: slotId } });

    await this.notifyUsers([slot.userId], NotificationType.ASSIGNMENT_UPDATED, {
      planId,
      slotId,
      removed: true,
    });

    return { id: slotId };
  }

  async getMatrix(query: MatrixQueryDto) {
    if (query.dateFrom > query.dateTo) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    const skip = (query.page - 1) * query.pageSize;

    const slotWhere: Prisma.SlotWhereInput = {
      dateStart: { lte: query.dateTo },
      dateEnd: { gte: query.dateFrom },
      plan: {
        status: { not: PlanStatus.ARCHIVED },
      },
    };

    if (query.mode === 'byUsers') {
      const [users, total] = await this.prisma.$transaction([
        this.prisma.user.findMany({
          skip,
          take: query.pageSize,
          orderBy: { fullName: 'asc' },
          select: {
            ...matrixSelect,
            slots: {
              where: slotWhere,
              orderBy: { dateStart: 'asc' },
              include: {
                org: true,
                plan: { select: { id: true, name: true } },
              },
            },
          },
        }),
        this.prisma.user.count(),
      ]);

      return {
        mode: query.mode,
        page: query.page,
        pageSize: query.pageSize,
        total,
        rows: users.map((user) => ({
          user,
          slots: user.slots,
        })),
      };
    }

    const [orgs, total] = await this.prisma.$transaction([
      this.prisma.org.findMany({
        skip,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          slots: {
            where: slotWhere,
            orderBy: { dateStart: 'asc' },
            include: {
              user: { select: matrixSelect },
              plan: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.org.count(),
    ]);

    return {
      mode: query.mode,
      page: query.page,
      pageSize: query.pageSize,
      total,
      rows: orgs.map((org) => ({
        org,
        slots: org.slots,
      })),
    };
  }

  async listConstraints() {
    return this.prisma.constraint.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertConstraint(payload: UpsertConstraintDto) {
    if (payload.id) {
      return this.prisma.constraint.update({
        where: { id: payload.id },
        data: {
          type: payload.type,
          payload: payload.payload as Prisma.InputJsonValue,
          userId: payload.userId ?? null,
          orgId: payload.orgId ?? null,
        },
      });
    }

    return this.prisma.constraint.create({
      data: {
        type: payload.type,
        payload: payload.payload as Prisma.InputJsonValue,
        userId: payload.userId ?? null,
        orgId: payload.orgId ?? null,
      },
    });
  }

  async getScheduleForUser(userId: string) {
    const now = new Date();

    const slots = await this.prisma.slot.findMany({
      where: {
        userId,
        dateEnd: { gte: now },
      },
      orderBy: { dateStart: 'asc' },
      include: {
        plan: true,
        org: true,
      },
    });

    return slots;
  }

  async confirmSlotForUser(userId: string, slotId: string) {
    const slot = await this.prisma.slot.findFirst({ where: { id: slotId, userId } });

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    if (slot.status === SlotStatus.CANCELLED) {
      throw new BadRequestException('Cancelled slot cannot be confirmed');
    }

    const updated = await this.prisma.slot.update({
      where: { id: slotId },
      data: { status: SlotStatus.CONFIRMED },
    });

    await this.notifyUsers([userId], NotificationType.ASSIGNMENT_UPDATED, {
      planId: slot.planId,
      slotId,
      status: SlotStatus.CONFIRMED,
    });

    return updated;
  }

  async requestSwap(userId: string, slotId: string, payload: RequestSwapDto) {
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, userId },
      include: {
        plan: true,
        org: true,
      },
    });

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    const noteLine = `[swap] ${new Date().toISOString()} ${payload.comment}`;
    const updated = await this.prisma.slot.update({
      where: { id: slotId },
      data: {
        note: slot.note ? `${slot.note}\n${noteLine}` : noteLine,
        status: SlotStatus.REPLACED,
      },
    });

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      },
      select: { id: true },
    });

    await this.notifyUsers(
      admins.map((admin) => admin.id),
      NotificationType.ASSIGNMENT_UPDATED,
      {
        planId: slot.planId,
        slotId,
        orgId: slot.orgId,
        comment: payload.comment,
        requestedBy: userId,
      },
    );

    return updated;
  }

  private async ensurePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  private assertPlanMutable(plan: Plan) {
    if (plan.status === PlanStatus.ARCHIVED) {
      throw new BadRequestException('Archived plan cannot be modified');
    }
  }

  private async createSlots(planId: string, slots: BulkAssignSlotDto[], plan?: Plan) {
    const resolvedPlan = plan ?? (await this.ensurePlan(planId));

    const uniqueOrgIds = [...new Set(slots.map((slot) => slot.orgId))];

    const orgs = await this.prisma.org.findMany({
      where: { id: { in: uniqueOrgIds } },
      select: { id: true, slug: true },
    });

    const orgSlugMap = new Map(orgs.map((org) => [org.id, org.slug]));

    const actions = slots.map((slot) =>
      this.prisma.slot.create({
        data: {
          planId: resolvedPlan.id,
          userId: slot.userId,
          orgId: slot.orgId,
          dateStart: slot.dateStart,
          dateEnd: slot.dateEnd,
          status: slot.status ?? SlotStatus.PLANNED,
          colorCode:
            slot.colorCode ??
            (orgSlugMap.get(slot.orgId)
              ? orgSlugMap.get(slot.orgId)!.toUpperCase()
              : null),
          note: slot.note ?? null,
          locked: slot.locked ?? false,
        },
      }),
    );

    return this.prisma.$transaction(actions);
  }

  private async notifyUsers(
    userIds: string[],
    type: NotificationType,
    payload: Prisma.JsonObject,
  ) {
    const uniqueIds = [...new Set(userIds)].filter(Boolean);

    if (uniqueIds.length === 0) {
      return;
    }

    await this.notificationsService.notifyMany(uniqueIds, type, payload);
  }

  private getIsoWeekKey(date: Date) {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const diffDays = Math.floor((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1;
    const weekNo = Math.ceil(diffDays / 7);
    return `${utcDate.getUTCFullYear()}-${weekNo}`;
  }
}
