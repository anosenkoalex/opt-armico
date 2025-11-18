import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('feed')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('admin')
  @Roles(UserRole.SUPER_ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.USER)
  getRecentFeed(
    @CurrentUser() user: JwtPayload,
    @Query('take') take?: string,
    @Query('orgId') orgId?: string,
  ) {
    const parsed = Number.parseInt(take ?? '', 10);
    const limit = Number.isNaN(parsed) ? 20 : parsed;

    if (user.role === UserRole.SUPER_ADMIN) {
      return this.feedService.getScopedFeed({ take: limit, orgId });
    }

    return this.feedService.getScopedFeed({ take: limit, userId: user.sub });
  }
}