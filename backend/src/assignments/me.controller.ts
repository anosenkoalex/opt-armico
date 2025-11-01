import { Controller, Get, UseGuards } from '@nestjs/common';
import { AssignmentsService } from './assignments.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get('current-workplace')
  async currentWorkplace(@CurrentUser() user: JwtPayload) {
    const assignment = await this.assignmentsService.findCurrentWorkplaceForUser(
      user.sub,
    );

    if (!assignment) {
      return null;
    }

    return assignment;
  }
}
