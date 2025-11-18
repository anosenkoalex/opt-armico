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
import { WorkplacesService } from './workplaces.service.js';
import {
  CreateWorkplaceDto,
  createWorkplaceSchema,
} from './dto/create-workplace.dto.js';
import {
  UpdateWorkplaceDto,
  updateWorkplaceSchema,
} from './dto/update-workplace.dto.js';
import {
  ListWorkplacesDto,
  listWorkplacesSchema,
} from './dto/list-workplaces.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@Controller('workplaces')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkplacesController {
  constructor(private readonly workplacesService: WorkplacesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(
    @Body(new ZodValidationPipe(createWorkplaceSchema))
    payload: CreateWorkplaceDto,
  ) {
    return this.workplacesService.create(payload);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(
    @Query(new ZodValidationPipe(listWorkplacesSchema))
    query: ListWorkplacesDto,
  ) {
    return this.workplacesService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.workplacesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWorkplaceSchema))
    payload: UpdateWorkplaceDto,
  ) {
    return this.workplacesService.update(id, payload);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.workplacesService.remove(id);
  }
}