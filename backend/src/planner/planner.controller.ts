// src/planner/planner.controller.ts
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { PlannerService } from './planner.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AssignmentStatus, UserRole } from '@prisma/client';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';
import type { Response } from 'express';

const plannerModeSchema = z
  .enum(['byUsers', 'byWorkplaces', 'byOrgs'])
  .default('byUsers')
  .transform((mode) => (mode === 'byOrgs' ? 'byWorkplaces' : mode))
  .pipe(z.enum(['byUsers', 'byWorkplaces']));

const plannerMatrixSchema = z
  .object({
    mode: plannerModeSchema,
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

const plannerExportSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    mode: z.enum(['workplaces', 'users']).default('workplaces'),
    status: z.nativeEnum(AssignmentStatus).optional(),
    userId: z.string().min(1).optional(),
    orgId: z.string().min(1).optional(),
  })
  .refine((data) => data.to >= data.from, {
    message: 'to must be after from',
    path: ['to'],
  });

type PlannerExportDto = z.infer<typeof plannerExportSchema>;

@Controller('planner')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get('matrix')
  // 👇 ДОБАВИЛИ UserRole.USER, чтобы сотрудники тоже могли смотреть матрицу
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.USER)
  getMatrix(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(plannerMatrixSchema)) query: PlannerMatrixDto,
  ) {
    return this.plannerService.getMatrix(user, query);
  }

  @Get('export')
  // 👇 Если не хочешь давать эксел обычным юзерам — убери отсюда USER
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.USER)
  async export(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(plannerExportSchema)) query: PlannerExportDto,
    @Res() res: Response,
  ) {
    const buffer = await this.plannerService.exportMatrixToExcel(user, query);

    res
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .setHeader('Content-Disposition', 'attachment; filename="schedule.xlsx"')
      .send(buffer);
  }
}