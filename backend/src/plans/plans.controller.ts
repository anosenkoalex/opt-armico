import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PlansService } from './plans.service.js';
import { CreatePlanDto, createPlanSchema } from './dto/create-plan.dto.js';
import { ListPlansDto, listPlansSchema } from './dto/list-plans.dto.js';
import { GetPlanQueryDto, getPlanQuerySchema } from './dto/get-plan.dto.js';
import { AutoAssignDto, autoAssignSchema } from './dto/auto-assign.dto.js';
import { BulkAssignDto, bulkAssignSchema } from './dto/bulk-assign.dto.js';
import { BulkMoveDto, bulkMoveSchema } from './dto/bulk-move.dto.js';
import { UpdateSlotDto, updateSlotSchema } from './dto/update-slot.dto.js';

@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createPlanSchema)) payload: CreatePlanDto) {
    return this.plansService.createPlan(payload);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listPlansSchema)) query: ListPlansDto) {
    return this.plansService.listPlans(query);
  }

  @Get(':id')
  getPlan(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(getPlanQuerySchema)) query: GetPlanQueryDto,
  ) {
    return this.plansService.getPlan(id, query);
  }

  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.plansService.publishPlan(id);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.plansService.archivePlan(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.plansService.deletePlan(id);
  }

  @Post(':id/slots/auto-assign')
  autoAssign(
    @Param('id') planId: string,
    @Body(new ZodValidationPipe(autoAssignSchema)) payload: AutoAssignDto,
  ) {
    return this.plansService.autoAssign(planId, payload);
  }

  @Post(':id/slots/bulk-assign')
  bulkAssign(
    @Param('id') planId: string,
    @Body(new ZodValidationPipe(bulkAssignSchema)) payload: BulkAssignDto,
  ) {
    return this.plansService.bulkAssign(planId, payload);
  }

  @Patch(':id/slots/bulk-move')
  bulkMove(
    @Param('id') planId: string,
    @Body(new ZodValidationPipe(bulkMoveSchema)) payload: BulkMoveDto,
  ) {
    return this.plansService.bulkMove(planId, payload);
  }

  @Patch(':id/slots/:slotId')
  updateSlot(
    @Param('id') planId: string,
    @Param('slotId') slotId: string,
    @Body(new ZodValidationPipe(updateSlotSchema)) payload: UpdateSlotDto,
  ) {
    return this.plansService.updateSlot(planId, slotId, payload);
  }

  @Delete(':id/slots/:slotId')
  deleteSlot(@Param('id') planId: string, @Param('slotId') slotId: string) {
    return this.plansService.deleteSlot(planId, slotId);
  }
}
