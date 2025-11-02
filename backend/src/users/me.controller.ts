import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { UsersService } from './users.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { AssignmentStatus } from '@prisma/client';
import { PlansService } from '../plans/plans.service.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { requestSwapSchema, RequestSwapDto } from '../plans/dto/request-swap.dto.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly assignmentsService: AssignmentsService,
    private readonly plansService: PlansService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Get('current-workplace')
  async getCurrentWorkplace(@CurrentUser() user: JwtPayload) {
    const [currentAssignment, history] = await Promise.all([
      this.assignmentsService.getCurrentWorkplaceForUser(user.sub),
      this.assignmentsService.getHistoryForUser(user.sub, 10),
    ]);

    const now = new Date();

    const historyItems = history.filter((assignment) => {
      if (currentAssignment && assignment.id === currentAssignment.id) {
        return false;
      }

      if (assignment.status === AssignmentStatus.ARCHIVED) {
        return true;
      }

      return assignment.endsAt ? assignment.endsAt < now : false;
    });

    return {
      workplace: currentAssignment?.workplace ?? null,
      assignment: currentAssignment ?? null,
      history: historyItems,
    };
  }

  @Get('schedule')
  getSchedule(@CurrentUser() user: JwtPayload) {
    return this.plansService.getScheduleForUser(user.sub);
  }

  @Patch('slots/:slotId/confirm')
  confirmSlot(@CurrentUser() user: JwtPayload, @Param('slotId') slotId: string) {
    return this.plansService.confirmSlotForUser(user.sub, slotId);
  }

  @Post('slots/:slotId/request-swap')
  requestSwap(
    @CurrentUser() user: JwtPayload,
    @Param('slotId') slotId: string,
    @Body(new ZodValidationPipe(requestSwapSchema)) payload: RequestSwapDto,
  ) {
    return this.plansService.requestSwap(user.sub, slotId, payload);
  }
}
