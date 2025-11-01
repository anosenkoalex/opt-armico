import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AssignmentsService } from './assignments.service.js';
import {
  CreateAssignmentDto,
  createAssignmentSchema,
} from './dto/create-assignment.dto.js';
import {
  UpdateAssignmentDto,
  updateAssignmentSchema,
} from './dto/update-assignment.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER)
  create(
    @Body(new ZodValidationPipe(createAssignmentSchema)) payload: CreateAssignmentDto,
  ) {
    return this.assignmentsService.create(payload);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER)
  findAll() {
    return this.assignmentsService.findAll();
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.MANAGER,
    UserRole.VIEWER,
  )
  findOne(@Param('id') id: string) {
    return this.assignmentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema)) payload: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.update(id, payload);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER)
  remove(@Param('id') id: string) {
    return this.assignmentsService.remove(id);
  }
}
