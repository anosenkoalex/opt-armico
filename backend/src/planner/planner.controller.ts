import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlannerService } from './planner.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AssignmentStatus, UserRole } from '@prisma/client';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';

const plannerMatrixSchema = z
  .object({
    mode: z.enum(['byUsers', 'byOrgs']).default('byUsers'),
    from: z.coerce.date(),
    to: z.coerce.date(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    userId: z.string().min(1).optional(),
    orgId: z.string().min(1).optional(),
    status: z.nativeEnum(AssignmentStatus).optional(),
  })
  .refine((data) => data.to >= data.from, {
    message: 'to must be after from',
    path: ['to'],
  });

type PlannerMatrixDto = z.infer<typeof plannerMatrixSchema>;

@Controller('planner')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get('matrix')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
  getMatrix(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(plannerMatrixSchema)) query: PlannerMatrixDto,
  ) {
    return this.plannerService.getMatrix(user, query);
  }
}
