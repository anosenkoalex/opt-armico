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

    // 1. Собираем все смены в периоде (основная логика как была)
    const shifts = await this.prisma.assignmentShift.findMany({
      where: {
        date: { gte: from, lte: to },
        kind: dto.kinds?.length ? { in: dto.kinds } : undefined,
        assignment: {
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
        userName:
          s.assignment.user?.fullName ??
          s.assignment.user?.email ??
          null,

        workplaceId: s.assignment.workplaceId,
        workplaceName: s.assignment.workplace?.name ?? null,

        assignmentStatus: s.assignment.status,
        shiftKind: s.kind,

        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() ?? null,

        hours,
      };
    });

    const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);

    // 2. Отчётные часы из WorkReport — считаем отдельно и не ломаем статистику,
    //    если тут что-то упадёт.
    let reportedHourByUser: Record<string, number> = {};
    let totalReportedHours = 0;

    try {
      const userIdsFromShifts = Array.from(new Set(rows.map((r) => r.userId)));

      const workReports = await this.prisma.workReport.findMany({
        where: {
          date: { gte: from, lte: to },
          userId: dto.userId
            ? dto.userId
            : userIdsFromShifts.length
            ? { in: userIdsFromShifts }
            : undefined,
        },
      });

      for (const r of workReports) {
        reportedHourByUser[r.userId] =
          (reportedHourByUser[r.userId] ?? 0) + r.hours;
      }

      totalReportedHours = Object.values(reportedHourByUser).reduce(
        (sum, h) => sum + h,
        0,
      );
    } catch (err) {
      // Логируем, но не роняем статистику
      // eslint-disable-next-line no-console
      console.error('Failed to aggregate work reports for statistics', err);
      reportedHourByUser = {};
      totalReportedHours = 0;
    }

    // 3. Агрегация по пользователю
    const byUserMap: Record<
      string,
      {
        userId: string;
        userName: string | null;
        totalHours: number;
        byKind: Record<string, number>;
        /** Суммарные отчётные часы (из WorkReport) */
        reportedHour?: number | null;
      }
    > = {};

    for (const row of rows) {
      if (!byUserMap[row.userId]) {
        byUserMap[row.userId] = {
          userId: row.userId,
          userName: row.userName,
          totalHours: 0,
          byKind: {},
          reportedHour: null,
        };
      }
      byUserMap[row.userId].totalHours += row.hours;
      byUserMap[row.userId].byKind[row.shiftKind] =
        (byUserMap[row.userId].byKind[row.shiftKind] ?? 0) + row.hours;
    }

    // Примешиваем суммарные отчётные часы
    for (const [userId, hours] of Object.entries(reportedHourByUser)) {
      if (!byUserMap[userId]) {
        byUserMap[userId] = {
          userId,
          userName: null,
          totalHours: 0,
          byKind: {},
          reportedHour: null,
        };
      }
      byUserMap[userId].reportedHour = hours;
    }

    const byUser = Object.values(byUserMap);

    // 4. Агрегация по рабочему месту
    const byWorkplaceMap: Record<
      string,
      {
        workplaceId: string;
        workplaceName: string | null;
        totalHours: number;
      }
    > = {};

    for (const row of rows) {
      if (!byWorkplaceMap[row.workplaceId]) {
        byWorkplaceMap[row.workplaceId] = {
          workplaceId: row.workplaceId,
          workplaceName: row.workplaceName,
          totalHours: 0,
        };
      }
      byWorkplaceMap[row.workplaceId].totalHours += row.hours;
    }

    const byWorkplace = Object.values(byWorkplaceMap);

    // 5. Результат
    return {
      totalShifts: rows.length,
      totalHours,
      totalReportedHours,
      byUser,
      byWorkplace,
      rows,
    };
  }
}