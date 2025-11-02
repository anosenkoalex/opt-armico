import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PlansService } from './plans.service.js';
import {
  UpsertConstraintDto,
  upsertConstraintSchema,
} from './dto/upsert-constraint.dto.js';

@Controller('constraints')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ConstraintsController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  list() {
    return this.plansService.listConstraints();
  }

  @Post()
  upsert(
    @Body(new ZodValidationPipe(upsertConstraintSchema)) payload: UpsertConstraintDto,
  ) {
    return this.plansService.upsertConstraint(payload);
  }
}
