import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma, UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';

export type PlannerMode = 'byUsers' | 'byWorkplaces';

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
  workplace?: {
    id: string;
    code: string;
    name: string;
    location: string | null;
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
    const { page, pageSize, ...rest } = params;
    const rows = await this.collectRows(auth, rest);
    const total = rows.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    const paginatedRows = rows.slice(start, end);

    return {
      mode: params.mode,
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      page,
      pageSize,
      total,
      rows: paginatedRows,
    };
  }

  async exportMatrixToExcel(
    auth: JwtPayload,
    params: {
      from: Date;
      to: Date;
      mode: 'workplaces' | 'users';
      status?: AssignmentStatus;
      userId?: string;
      orgId?: string;
    },
  ): Promise<Buffer> {
    const mode: PlannerMode =
      params.mode === 'users' ? 'byUsers' : 'byWorkplaces';

    const rows = await this.collectRows(auth, {
      mode,
      from: params.from,
      to: params.to,
      status: params.status,
      userId: params.userId,
      orgId: params.orgId,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Расписание');

    sheet.columns = [
      { header: 'Сотрудник', key: 'employee', width: 40 },
      { header: 'Рабочее место', key: 'workplace', width: 40 },
      { header: 'Дата начала', key: 'startsAt', width: 20 },
      { header: 'Дата окончания', key: 'endsAt', width: 20 },
      { header: 'Статус', key: 'status', width: 20 },
    ];

    for (const row of rows) {
      for (const slot of row.slots) {
        const employeeName = slot.user?.fullName?.trim()
          ? slot.user.fullName
          : slot.user?.email ?? '';
        const workplaceLabel = slot.workplace
          ? `${slot.workplace.code}${
              slot.workplace.name ? ` — ${slot.workplace.name}` : ''
            }`
          : `${slot.code}${slot.name ? ` — ${slot.name}` : ''}`;

        const startsAt = slot.from ? new Date(slot.from) : undefined;
        const endsAt = slot.to ? new Date(slot.to) : null;

        sheet.addRow({
          employee: employeeName,
          workplace: workplaceLabel,
          startsAt,
          endsAt,
          status: slot.status,
        });
      }
    }

    sheet.getColumn(3).numFmt = 'dd.mm.yyyy';
    sheet.getColumn(4).numFmt = 'dd.mm.yyyy';

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async collectRows(
    auth: JwtPayload,
    params: Omit<PlannerMatrixQuery, 'page' | 'pageSize'>,
  ): Promise<PlannerMatrixRow[]> {
    const isSuperAdmin = auth.role === UserRole.SUPER_ADMIN;

    if (!isSuperAdmin && params.mode === 'byWorkplaces' && !auth.orgId) {
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
      params.mode === 'byWorkplaces'
        ? [{ workplace: { code: 'asc' } }, { startsAt: 'asc' }]
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
        workplace: {
          id: assignment.workplace.id,
          code: assignment.workplace.code,
          name: assignment.workplace.name,
          location: assignment.workplace.location ?? null,
        },
      };

      if (params.mode === 'byWorkplaces') {
        const workplace = assignment.workplace;
        const key = workplace.id;
        const namePart = workplace.name?.trim();
        const codePart = workplace.code?.trim();
        const title = [codePart, namePart].filter(Boolean).join(' — ');
        const subtitle = workplace.location?.trim();

        const existing = groups.get(key);

        if (!existing) {
          groups.set(key, {
            key,
            title: title || codePart || namePart || 'Рабочее место',
            subtitle: subtitle || undefined,
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

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        slots: group.slots.sort((a, b) => a.from.localeCompare(b.from)),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }));
  }
}
