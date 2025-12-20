import { Controller, Get, Query } from '@nestjs/common';
import { ReportService } from './report.service.js';

@Controller('work-reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * GET /work-reports?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=...
   * Используется:
   *  - в MyPlace для календаря отчётных часов
   *  - в статистике для "Количество отчётных часов"
   */
  @Get()
  getWorkReports(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.reportService.getWorkReports({
      from,
      to,
      userId,
    });
  }
}