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
    color: string | null; // 👈 ЦВЕТ РАБОЧЕГО МЕСТА
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

  /**
   * 📤 Экспорт планировщика в Excel.
   *
   * Формат:
   *  - строка 1: "Период: 21.11.2025 — 29.11.2025"
   *  - строка 2: заголовки: "Сотрудник | Рабочее место | 21.11.2025 | 22.11.2025 | ..."
   *  - дальше: по строке на каждое назначение
   *      в ячейках по дням — интервалы "HH:mm–HH:mm (Статус)" только там,
   *      где реально есть смены.
   */
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

    // локальный часовой пояс (Бишкек, +6)
    const LOCAL_OFFSET_MS = 6 * 60 * 60 * 1000;

    const toLocalDateKey = (d: Date): string => {
      // переносим в локальное время и берём YYYY-MM-DD
      const local = new Date(d.getTime() + LOCAL_OFFSET_MS);
      return local.toISOString().slice(0, 10); // 2025-11-21
    };

    const addDaysToKey = (key: string, days: number): string => {
      const year = Number(key.slice(0, 4));
      const month = Number(key.slice(5, 7)) - 1;
      const day = Number(key.slice(8, 10));
      const dt = new Date(Date.UTC(year, month, day));
      dt.setUTCDate(dt.getUTCDate() + days);
      return dt.toISOString().slice(0, 10);
    };

    const fromKey = toLocalDateKey(params.from);
    const toKey = toLocalDateKey(params.to);

    // список всех дней периода (как ключи YYYY-MM-DD)
    const dayKeys: string[] = [];
    {
      let cursor = fromKey;
      // строковое сравнение работает, т.к. формат нормализован
      while (cursor <= toKey) {
        dayKeys.push(cursor);
        cursor = addDaysToKey(cursor, 1);
      }
    }

    // для фильтра по assignments используем границы периода,
    // превращая YYYY-MM-DD в "день локальный, но в UTC"
    const rangeFrom = new Date(`${fromKey}T00:00:00.000Z`);
    const rangeTo = new Date(`${toKey}T23:59:59.999Z`);

    // Те же фильтры, что и в collectRows, но для выборки назначений под экспорт
    const isSuperAdmin = auth.role === UserRole.SUPER_ADMIN;
    const effectiveUserId = isSuperAdmin ? params.userId : auth.sub;
    const effectiveOrgId = isSuperAdmin ? params.orgId : auth.orgId;

    const where: Prisma.AssignmentWhereInput = {
      deletedAt: null,
      ...(params.status
        ? { status: params.status }
        : { status: AssignmentStatus.ACTIVE }),
      startsAt: { lte: rangeTo },
      OR: [{ endsAt: null }, { endsAt: { gte: rangeFrom } }],
      ...(effectiveUserId ? { userId: effectiveUserId } : {}),
    };

    if (effectiveOrgId) {
      where.workplace = { is: { orgId: effectiveOrgId } };
    }

    const orderBy: Prisma.AssignmentOrderByWithRelationInput[] =
      mode === 'byWorkplaces'
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
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
            color: true, // 👈 на будущее
          },
        },
        shifts: true,
      },
      orderBy,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Расписание');

    const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Bishkek',
    });

    const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bishkek',
    });

    const statusLabel = (status: AssignmentStatus): string => {
      return status === AssignmentStatus.ACTIVE ? 'Активно' : 'Архив';
    };

    // ----- колонки -----
    const columns: { header: string; key: string; width?: number }[] = [
      { header: 'Сотрудник', key: 'employee', width: 40 },
      { header: 'Рабочее место', key: 'workplace', width: 35 },
    ];

    const dayColumnKeys: string[] = [];

    for (const key of dayKeys) {
      const dt = new Date(`${key}T00:00:00.000Z`);
      const colKey = `d_${key}`;
      dayColumnKeys.push(colKey);
      columns.push({
        header: dateFormatter.format(dt),
        key: colKey,
        width: 18,
      });
    }

    sheet.columns = columns as any;

    // Строка "Период: ... "
    sheet.mergeCells(1, 1, 1, columns.length);
    const periodCell = sheet.getCell(1, 1);
    periodCell.value = `Период: ${dateFormatter.format(
      new Date(`${fromKey}T00:00:00.000Z`),
    )} — ${dateFormatter.format(new Date(`${toKey}T00:00:00.000Z`))}`;
    periodCell.font = { bold: true };

    // Заголовки
    const headerRow = sheet.getRow(2);
    headerRow.values = columns.map((c) => c.header);
    headerRow.font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 2 }];

    // Выровнять и включить перенос строк в колонках с днями
    for (let colIdx = 3; colIdx <= columns.length; colIdx++) {
      const col = sheet.getColumn(colIdx);
      col.alignment = {
        vertical: 'top',
        horizontal: 'left',
        wrapText: true,
      };
    }

    // ----- данные -----
    for (const assignment of assignments) {
      const employeeName = assignment.user?.fullName?.trim()
        ? assignment.user.fullName
        : assignment.user?.email ?? '';

      const workplaceLabel = assignment.workplace
        ? `${assignment.workplace.code}${
            assignment.workplace.name ? ` — ${assignment.workplace.name}` : ''
          }`
        : '';

      // Карта: ключ дня (YYYY-MM-DD) -> текст "18:00–00:00 (Активно)\n..."
      const dayTextMap: Record<string, string> = {};

      for (const shift of assignment.shifts as any[]) {
        const baseDate: Date | null =
          shift.date ?? shift.startsAt ?? shift.endsAt ?? null;
        if (!baseDate) continue;

        const dayKey = toLocalDateKey(baseDate);

        // пропускаем дни вне выбранного диапазона
        if (dayKey < fromKey || dayKey > toKey) continue;

        const startsAt: Date | null = shift.startsAt ?? null;
        const endsAt: Date | null = shift.endsAt ?? null;

        const fromStr = startsAt ? timeFormatter.format(startsAt) : '';
        const toStr = endsAt ? timeFormatter.format(endsAt) : '';

        if (!fromStr && !toStr) continue;

        const line = `${fromStr}–${toStr}${
          statusLabel(assignment.status)
            ? ` (${statusLabel(assignment.status)})`
            : ''
        }`;

        if (dayTextMap[dayKey]) {
          dayTextMap[dayKey] = `${dayTextMap[dayKey]}\n${line}`;
        } else {
          dayTextMap[dayKey] = line;
        }
      }

      const rowData: any = {
        employee: employeeName,
        workplace: workplaceLabel,
      };

      // раскладываем по колонкам дней
      dayKeys.forEach((key, idx) => {
        const colKey = dayColumnKeys[idx];
        if (dayTextMap[key]) {
          rowData[colKey] = dayTextMap[key];
        }
      });

      sheet.addRow(rowData);
    }

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
      deletedAt: null,
      ...(params.status
        ? { status: params.status }
        : { status: AssignmentStatus.ACTIVE }),
      startsAt: { lte: params.to },
      OR: [{ endsAt: null }, { endsAt: { gte: params.from } }],
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

    const workplaceSlots = new Map<string, PlannerMatrixSlot[]>();
    const workplaceMeta = new Map<
      string,
      {
        code: string;
        name: string | null;
        location: string | null;
        color: string | null;
      }
    >();
    const userGroups = new Map<
      string,
      { title: string; subtitle?: string; slots: PlannerMatrixSlot[] }
    >();

    for (const assignment of assignments) {
      const slot: PlannerMatrixSlot = {
        id: assignment.id,
        from: assignment.startsAt.toISOString(),
        to: assignment.endsAt ? assignment.endsAt.toISOString() : null,
        code: assignment.workplace.code,
        name: assignment.workplace.name,
        status: assignment.status,
        user: assignment.user ?? undefined,
        org: assignment.workplace.org ?? undefined,
        workplace: {
          id: assignment.workplace.id,
          code: assignment.workplace.code,
          name: assignment.workplace.name,
          location: assignment.workplace.location ?? null,
          color: assignment.workplace.color ?? null, // 👈 сюда кладём цвет
        },
      };

      const workplaceId = assignment.workplace.id;
      workplaceMeta.set(workplaceId, {
        code: assignment.workplace.code,
        name: assignment.workplace.name,
        location: assignment.workplace.location ?? null,
        color: assignment.workplace.color ?? null,
      });

      workplaceSlots.set(workplaceId, [
        ...(workplaceSlots.get(workplaceId) ?? []),
        slot,
      ]);

      const user = assignment.user;
      const userKey = user?.id ?? assignment.userId;
      const userTitle = user?.fullName?.trim()
        ? user.fullName
        : user?.email ?? assignment.userId;
      const userSubtitle = user?.position ?? undefined;

      const existing = userGroups.get(userKey);
      if (existing) existing.slots.push(slot);
      else
        userGroups.set(userKey, {
          title: userTitle,
          subtitle: userSubtitle || undefined,
          slots: [slot],
        });
    }

    if (params.mode === 'byWorkplaces') {
      const workplaceIds = Array.from(workplaceSlots.keys());
      const workplaceWhere: Prisma.WorkplaceWhereInput = {};

      if (workplaceIds.length > 0) {
        workplaceWhere.id = { in: workplaceIds };
      } else if (!effectiveOrgId) {
        return [];
      }

      if (effectiveOrgId) {
        workplaceWhere.orgId = effectiveOrgId;
      }

      const workplaces = await this.prisma.workplace.findMany({
        where: workplaceWhere,
        select: {
          id: true,
          code: true,
          name: true,
          location: true,
          color: true,
        },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      });

      const rows: PlannerMatrixRow[] = workplaces.map((workplace) => {
        const meta = workplaceMeta.get(workplace.id) ?? workplace;
        const titleParts = [meta.code?.trim(), meta.name?.trim()].filter(
          Boolean,
        );
        const subtitle = meta.location?.trim() ?? undefined;
        const slots = workplaceSlots.get(workplace.id) ?? [];

        return {
          key: workplace.id,
          title:
            titleParts.length > 0
              ? titleParts.join(' — ')
              : meta.code || meta.name || 'Рабочее место',
          subtitle,
          slots: slots.sort((a, b) => a.from.localeCompare(b.from)),
        };
      });

      return rows
        .filter(Boolean)
        .sort((a, b) =>
          (a?.title ?? '').localeCompare(b?.title ?? '', 'ru', {
            numeric: true,
          }),
        );
    }

    // режим по пользователям
    return Array.from(userGroups.entries())
      .map(([key, group]) => ({
        key,
        title: group.title,
        subtitle: group.subtitle,
        slots: group.slots.sort((a, b) => a.from.localeCompare(b.from)),
      }))
      .filter(Boolean)
      .sort((a, b) =>
        (a?.title ?? '').localeCompare(b?.title ?? '', 'ru', { numeric: true }),
      );
  }
}