import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';

@Controller('feed')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('admin')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAdminFeed(@Query('take') take?: string) {
    const parsed = Number.parseInt(take ?? '', 10);
    const limit = Number.isNaN(parsed) ? 20 : parsed;
    return this.feedService.getAdminFeed(limit);
  }
}
