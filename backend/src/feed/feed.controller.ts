import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';

@Controller('feed')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('admin')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAdminFeed(
    @Query('take') take?: string,
    @Query('userId') userId?: string,
    @Query('orgId') orgId?: string,
  ) {
    const parsed = Number.parseInt(take ?? '', 10);
    const limit = Number.isNaN(parsed) ? 20 : parsed;
    return this.feedService.getScopedFeed({ take: limit, userId, orgId });
  }

  @Get('recent')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.AUDITOR,
    UserRole.ORG_MANAGER,
  )
  getRecentFeed(
    @CurrentUser() user: JwtPayload,
    @Query('take') take?: string,
    @Query('orgId') orgId?: string,
  ) {
    const parsed = Number.parseInt(take ?? '', 10);
    const limit = Number.isNaN(parsed) ? 20 : parsed;

    if (user.role === UserRole.AUDITOR) {
      return this.feedService.getScopedFeed({ take: limit, userId: user.sub });
    }

    if (user.role === UserRole.ORG_MANAGER) {
      const effectiveOrgId = orgId ?? user.orgId ?? undefined;
      return this.feedService.getScopedFeed({ take: limit, orgId: effectiveOrgId });
    }

    return this.feedService.getScopedFeed({ take: limit });
  }
}
