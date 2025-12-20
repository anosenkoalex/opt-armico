import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';

type GetWorkReportsParams = {
  from?: string;
  to?: string;
  userId?: string;
};

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkReports(params: GetWorkReportsParams) {
    const where: Prisma.WorkReportWhereInput = {};

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.from || params.to) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (params.from) {
        dateFilter.gte = dayjs(params.from).startOf('day').toDate();
      }
      if (params.to) {
        dateFilter.lte = dayjs(params.to).endOf('day').endOf('day').toDate();
      }
      where.date = dateFilter;
    }

    const reports = await this.prisma.workReport.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    // фронту — строка YYYY-MM-DD
    return reports.map((r) => ({
      ...r,
      date: dayjs(r.date).format('YYYY-MM-DD'),
    }));
  }
}