import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import {
  ListAssignmentsDto,
  listAssignmentsSchema,
} from './dto/list-assignments.dto.js';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(
    @Body(new ZodValidationPipe(createAssignmentSchema))
    payload: CreateAssignmentDto,
  ) {
    return this.assignmentsService.create(payload);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(
    @Query(new ZodValidationPipe(listAssignmentsSchema))
    query: ListAssignmentsDto,
  ) {
    return this.assignmentsService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.assignmentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema))
    payload: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.update(id, payload);
  }

  @Post(':id/notify')
  @Roles(UserRole.SUPER_ADMIN)
  notify(@Param('id') id: string) {
    return this.assignmentsService.notify(id);
  }
}
