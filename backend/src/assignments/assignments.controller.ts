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
import { z } from 'zod';

// DTO для массовых действий с корзиной
const bulkTrashActionSchema = z.object({
  ids: z
    .array(z.string().min(1, 'id обязателен'))
    .nonempty('Нужно указать хотя бы одно id'),
});

type BulkTrashActionDto = z.infer<typeof bulkTrashActionSchema>;

/**
 * 🔧 DTO для запроса корректировки расписания по назначению
 */
const requestScheduleAdjustmentSchema = z.object({
  date: z
    .string()
    .min(1, 'Дата обязательна')
    .refine(
      (val) =>
        !Number.isNaN(Date.parse(val)) ||
        /^\d{4}-\d{2}-\d{2}$/.test(val),
      'Некорректный формат даты',
    ),
  startsAt: z
    .string()
    .optional()
    .refine(
      (val) => !val || !Number.isNaN(Date.parse(val)),
      'Некорректный формат времени начала',
    ),
  endsAt: z
    .string()
    .optional()
    .refine(
      (val) => !val || !Number.isNaN(Date.parse(val)),
      'Некорректный формат времени окончания',
    ),
  kind: z.enum(['DEFAULT', 'OFFICE', 'REMOTE', 'DAY_OFF']).optional(),
  comment: z.string().min(1, 'Комментарий обязателен').max(2000),
});

export type RequestScheduleAdjustmentDto = z.infer<
  typeof requestScheduleAdjustmentSchema
>;

/**
 * 🔧 Фильтры для списка запросов корректировок (для менеджера/админа)
 */
const listScheduleAdjustmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  userId: z.string().optional(),
  assignmentId: z.string().optional(),
});

export type ListScheduleAdjustmentsDto = z.infer<
  typeof listScheduleAdjustmentsSchema
>;

/**
 * 🔧 Решение по запросу корректировки (одобрить / отклонить)
 */
const scheduleAdjustmentDecisionSchema = z.object({
  managerComment: z.string().max(2000).optional(),
});

export type ScheduleAdjustmentDecisionDto = z.infer<
  typeof scheduleAdjustmentDecisionSchema
>;

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
   * Список назначений в корзине (deletedAt != null)
   */
  @Get('trash')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findAllInTrash(
    @Query(new ZodValidationPipe(listAssignmentsSchema))
    query: ListAssignmentsDto,
  ) {
    return this.assignmentsService.findAllInTrash(query);
  }

  // ================================================================
  //        🔔 БЛОК ЗАПРОСОВ НА КОРРЕКТИРОВКУ РАСПИСАНИЯ
  // ================================================================

  /**
   * 📝 Пользователь запрашивает корректировку по конкретному назначению.
   *
   * POST /assignments/:id/adjustments
   */
  @Post(':id/adjustments')
  @Roles(UserRole.USER, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  requestScheduleAdjustment(
    @Param('id') assignmentId: string,
    @Body(new ZodValidationPipe(requestScheduleAdjustmentSchema))
    payload: RequestScheduleAdjustmentDto,
  ) {
    return this.assignmentsService.requestScheduleAdjustment(
      assignmentId,
      payload,
    );
  }

  /**
   * 📋 Список всех запросов корректировок (для менеджера/админа),
   * с фильтрами по статусу / сотруднику / назначению.
   *
   * GET /assignments/adjustments
   *
   * ВАЖНО: этот маршрут должен идти ДО @Get(':id'),
   * иначе /assignments/adjustments будет обрабатываться как :id.
   */
  @Get('adjustments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  listScheduleAdjustments(
    @Query(new ZodValidationPipe(listScheduleAdjustmentsSchema))
    query: ListScheduleAdjustmentsDto,
  ) {
    return this.assignmentsService.listScheduleAdjustments(query);
  }

  /**
   * ✅ Одобрить запрос корректировки
   *
   * POST /assignments/adjustments/:adjustmentId/approve
   */
  @Post('adjustments/:adjustmentId/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  approveScheduleAdjustment(
    @Param('adjustmentId') adjustmentId: string,
    @Body(new ZodValidationPipe(scheduleAdjustmentDecisionSchema))
    payload: ScheduleAdjustmentDecisionDto,
  ) {
    return this.assignmentsService.decideScheduleAdjustment(
      adjustmentId,
      'APPROVED',
      payload,
    );
  }

  /**
   * ❌ Отклонить запрос корректировки
   *
   * POST /assignments/adjustments/:adjustmentId/reject
   */
  @Post('adjustments/:adjustmentId/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  rejectScheduleAdjustment(
    @Param('adjustmentId') adjustmentId: string,
    @Body(new ZodValidationPipe(scheduleAdjustmentDecisionSchema))
    payload: ScheduleAdjustmentDecisionDto,
  ) {
    return this.assignmentsService.decideScheduleAdjustment(
      adjustmentId,
      'REJECTED',
      payload,
    );
  }

  // ================================================================
  //                    ОСТАЛЬНОЙ ФУНКЦИОНАЛ
  // ================================================================

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

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  softDelete(@Param('id') id: string) {
    return this.assignmentsService.softDelete(id);
  }

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

  @Post(':id/complete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  complete(@Param('id') id: string) {
    return this.assignmentsService.complete(id);
  }

  @Post('trash/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  exportFromTrash(
    @Body(new ZodValidationPipe(bulkTrashActionSchema))
    payload: BulkTrashActionDto,
  ) {
    return this.assignmentsService.exportFromTrash(payload.ids);
  }

  @Post('trash/delete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  bulkDeleteFromTrash(
    @Body(new ZodValidationPipe(bulkTrashActionSchema))
    payload: BulkTrashActionDto,
  ) {
    return this.assignmentsService.bulkDeleteFromTrash(payload.ids);
  }

  @Post('trash/export-and-delete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  exportAndDeleteFromTrash(
    @Body(new ZodValidationPipe(bulkTrashActionSchema))
    payload: BulkTrashActionDto,
  ) {
    return this.assignmentsService.exportAndDeleteFromTrash(payload.ids);
  }
}