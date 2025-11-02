import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PlansService } from './plans.service.js';
import { MatrixQueryDto, matrixQuerySchema } from './dto/matrix-query.dto.js';

@Controller('matrix')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class MatrixController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  fetch(@Query(new ZodValidationPipe(matrixQuerySchema)) query: MatrixQueryDto) {
    return this.plansService.getMatrix(query);
  }
}
