import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  findMyNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('take') take?: string,
    @Query('limit') legacyLimit?: string,
  ) {
    const raw = take ?? legacyLimit ?? '';
    const parsedLimit = Number(raw);
    const take = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(Math.max(parsedLimit, 1), 50);
    return this.notificationsService.findForUser(user.sub, take);
  }
}
