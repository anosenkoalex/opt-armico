import { Controller, Get, Query } from '@nestjs/common';
import { StatisticsService } from './statistics.service.js';
import { GetStatisticsDto } from './dto/get-statistics.dto.js';

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  getStatistics(@Query() query: GetStatisticsDto) {
    return this.statisticsService.getStatistics(query);
  }
}