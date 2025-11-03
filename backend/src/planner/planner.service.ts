import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';

export type PlannerMode = 'byUsers' | 'byOrgs';

export interface PlannerMatrixQuery {
  mode: PlannerMode;
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
  userId?: string;
  orgId?: string;
  status?: AssignmentStatus;
}

interface PlannerMatrixSlot {
  id: string;
  from: string;
  to: string | null;
  code: string;
  name: string;
  status: AssignmentStatus;
  user?: {
    id: string;
    email: string;
    fullName: string | null;
    position: string | null;
  };
  org?: {
    id: string;
    name: string;
    slug: string;
  };
}

interface PlannerMatrixRow {
  key: string;
  title: string;
  subtitle?: string;
  slots: PlannerMatrixSlot[];
}

export interface PlannerMatrixResponse {
  mode: PlannerMode;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  rows: PlannerMatrixRow[];
}

@Injectable()
export class PlannerService {
  constructor(private readonly prisma: PrismaService) {}

  async getMatrix(
    auth: JwtPayload,
    params: PlannerMatrixQuery,
  ): Promise<PlannerMatrixResponse> {
    const isSuperAdmin = auth.role === UserRole.SUPER_ADMIN;

    if (!isSuperAdmin && params.mode === 'byOrgs' && !auth.orgId) {
      throw new NotFoundException('Пользователь не привязан к организации');
    }

    const effectiveUserId = isSuperAdmin ? params.userId : auth.sub;
    const effectiveOrgId = isSuperAdmin ? params.orgId : auth.orgId;

    const where: Prisma.AssignmentWhereInput = {
      startsAt: { lte: params.to },
      OR: [{ endsAt: null }, { endsAt: { gte: params.from } }],
      ...(params.status ? { status: params.status } : {}),
      ...(effectiveUserId ? { userId: effectiveUserId } : {}),
    };

    if (effectiveOrgId) {
      where.workplace = { is: { orgId: effectiveOrgId } };
    }

    const orderBy: Prisma.AssignmentOrderByWithRelationInput[] =
      params.mode === 'byOrgs'
        ? [{ workplace: { orgId: 'asc' } }, { startsAt: 'asc' }]
        : [{ userId: 'asc' }, { startsAt: 'asc' }];

    const assignments = await this.prisma.assignment.findMany({
      where,
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
          include: {
            org: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy,
    });

    const groups = new Map<string, PlannerMatrixRow>();

    for (const assignment of assignments) {
      const slot: PlannerMatrixSlot = {
        id: assignment.id,
        from: assignment.startsAt.toISOString(),
        to: assignment.endsAt ? assignment.endsAt.toISOString() : null,
        code: assignment.workplace.code,
        name: assignment.workplace.name,
        status: assignment.status,
        user: assignment.user,
        org: assignment.workplace.org ?? undefined,
      };

      if (params.mode === 'byOrgs') {
        const orgId = assignment.workplace.orgId;
        const org = assignment.workplace.org;
        const key = orgId;
        const title = org?.name?.trim() ? org.name : 'Без названия';

        const existing = groups.get(key);

        if (!existing) {
          groups.set(key, {
            key,
            title,
            slots: [slot],
          });
        } else {
          existing.slots.push(slot);
        }
      } else {
        const user = assignment.user;
        const key = user?.id ?? assignment.userId;
        const title = user?.fullName ?? user?.email ?? assignment.userId;
        const subtitle = user?.position ?? '';

        const existing = groups.get(key);

        if (!existing) {
          groups.set(key, {
            key,
            title,
            subtitle: subtitle || undefined,
            slots: [slot],
          });
        } else {
          existing.slots.push(slot);
        }
      }
    }

    const sortedGroups = Array.from(groups.values()).map((group) => ({
      ...group,
      slots: group.slots.sort((a, b) => a.from.localeCompare(b.from)),
    }));

    const total = sortedGroups.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const paginatedRows = sortedGroups.slice(start, end);

    return {
      mode: params.mode,
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      page: params.page,
      pageSize: params.pageSize,
      total,
      rows: paginatedRows,
    };
  }
}
