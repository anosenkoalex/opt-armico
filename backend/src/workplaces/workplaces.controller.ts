import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { WorkplacesService } from './workplaces.service.js';
import { CreateWorkplaceDto, createWorkplaceSchema } from './dto/create-workplace.dto.js';
import { UpdateWorkplaceDto, updateWorkplaceSchema } from './dto/update-workplace.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';

@Controller('workplaces')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkplacesController {
  constructor(private readonly workplacesService: WorkplacesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER)
  create(
    @Body(new ZodValidationPipe(createWorkplaceSchema)) payload: CreateWorkplaceDto,
  ) {
    return this.workplacesService.create(payload);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER)
  findAll() {
    return this.workplacesService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.workplacesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWorkplaceSchema)) payload: UpdateWorkplaceDto,
  ) {
    return this.workplacesService.update(id, payload);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  remove(@Param('id') id: string) {
    return this.workplacesService.remove(id);
  }
}
