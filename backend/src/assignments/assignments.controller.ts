import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Delete,
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  create(
    @Body(new ZodValidationPipe(createAssignmentSchema))
    payload: CreateAssignmentDto,
  ) {
    return this.assignmentsService.create(payload);
  }

  /**
   * Обычный список назначений (ТОЛЬКО не удалённые)
   */
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findAll(
    @Query(new ZodValidationPipe(listAssignmentsSchema))
    query: ListAssignmentsDto,
  ) {
    return this.assignmentsService.findAll(query);
  }

  /**
   * Список назначений в корзине (isDeleted = true)
   */
  @Get('trash')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findAllInTrash(
    @Query(new ZodValidationPipe(listAssignmentsSchema))
    query: ListAssignmentsDto,
  ) {
    return this.assignmentsService.findAllInTrash(query);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findOne(@Param('id') id: string) {
    return this.assignmentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema))
    payload: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.update(id, payload);
  }

  /**
   * Мягкое удаление назначения → в корзину
   */
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  softDelete(@Param('id') id: string) {
    return this.assignmentsService.softDelete(id);
  }

  /**
   * Восстановление назначения из корзины
   */
  @Post(':id/restore')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  restoreFromTrash(@Param('id') id: string) {
    return this.assignmentsService.restoreFromTrash(id);
  }

  @Post(':id/notify')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  notify(@Param('id') id: string) {
    return this.assignmentsService.notify(id);
  }

  // ✅ Завершение назначения (ARCHIVED + автозаполнение endsAt при необходимости)
  @Post(':id/complete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  complete(@Param('id') id: string) {
    return this.assignmentsService.complete(id);
  }
}