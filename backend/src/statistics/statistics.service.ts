import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { GetStatisticsDto } from './dto/get-statistics.dto.js';
import dayjs from 'dayjs';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(dto: GetStatisticsDto) {
    const from = dayjs(dto.from).startOf('day').toDate();
    const to = dayjs(dto.to).endOf('day').toDate();

    const shifts = await this.prisma.assignmentShift.findMany({
      where: {
        date: { gte: from, lte: to },
        kind: dto.kinds?.length ? { in: dto.kinds } : undefined,
        assignment: {
          // ВАЖНО: не фильтруем deletedAt, чтобы видеть даже «корзину»
          userId: dto.userId,
          workplaceId: dto.workplaceId,
          status: dto.assignmentStatuses?.length
            ? { in: dto.assignmentStatuses }
            : undefined,
        },
      },
      include: {
        assignment: {
          include: {
            user: true,
            workplace: true,
          },
        },
      },
    });

    const rows = shifts.map((s) => {
      const start = dayjs(s.startsAt);
      const end = s.endsAt ? dayjs(s.endsAt) : null;
      const hours = end ? end.diff(start, 'minute') / 60 : 0;

      return {
        shiftId: s.id,
        date: dayjs(s.date).format('YYYY-MM-DD'),

        userId: s.assignment.userId,
        userName: s.assignment.user?.fullName ?? s.assignment.user?.email,

        workplaceId: s.assignment.workplaceId,
        workplaceName: s.assignment.workplace?.name,

        assignmentStatus: s.assignment.status,
        shiftKind: s.kind,

        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() ?? null,

        hours,
      };
    });

    const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);

    const byUserMap: Record<
      string,
      { userId: string; userName: string | null; totalHours: number; byKind: Record<string, number> }
    > = {};

    for (const row of rows) {
      if (!byUserMap[row.userId]) {
        byUserMap[row.userId] = {
          userId: row.userId,
          userName: row.userName ?? null,
          totalHours: 0,
          byKind: {},
        };
      }
      byUserMap[row.userId].totalHours += row.hours;
      byUserMap[row.userId].byKind[row.shiftKind] =
        (byUserMap[row.userId].byKind[row.shiftKind] ?? 0) + row.hours;
    }

    const byUser = Object.values(byUserMap);

    const byWorkplaceMap: Record<
      string,
      { workplaceId: string; workplaceName: string | null; totalHours: number }
    > = {};

    for (const row of rows) {
      if (!byWorkplaceMap[row.workplaceId]) {
        byWorkplaceMap[row.workplaceId] = {
          workplaceId: row.workplaceId,
          workplaceName: row.workplaceName ?? null,
          totalHours: 0,
        };
      }
      byWorkplaceMap[row.workplaceId].totalHours += row.hours;
    }

    const byWorkplace = Object.values(byWorkplaceMap);

    return {
      totalShifts: rows.length,
      totalHours,
      byUser,
      byWorkplace,
      rows,
    };
  }
}