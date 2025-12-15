import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AssignmentStatus, SlotStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';

// ====== Zod-схемы ======

const requestSwapSchema = z.object({
  comment: z.string().min(1, 'Комментарий обязателен'),
});
type RequestSwapDto = z.infer<typeof requestSwapSchema>;

const requestAssignmentAdjustmentSchema = z.object({
  comment: z.string().min(1, 'Комментарий обязателен'),
});
type RequestAssignmentAdjustmentDto = z.infer<
  typeof requestAssignmentAdjustmentSchema
>;

// 🔐 СМЕНА ПАРОЛЯ
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Текущий пароль обязателен'),
  newPassword: z.string().min(6, 'Новый пароль минимум 6 символов'),
});
type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Профиль текущего пользователя
   * GET /me
   */
  @Get()
  async getMe(@CurrentUser() user: JwtPayload) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: {
        org: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!dbUser) {
      throw new NotFoundException('Пользователь не найден');
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      position: dbUser.position,
      role: dbUser.role,
      org: dbUser.org,
    };
  }

  /**
   * 🔐 СМЕНА ПАРОЛЯ ПОЛЬЗОВАТЕЛЕМ
   * PATCH /me/change-password
   */
  @Patch('change-password')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
  ) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!dbUser) {
      throw new NotFoundException('Пользователь не найден');
    }

    const isValid = await bcrypt.compare(
      body.currentPassword,
      dbUser.password,
    );

    if (!isValid) {
      throw new BadRequestException('Неверный текущий пароль');
    }

    const newHash = await bcrypt.hash(body.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.sub },
      data: {
        password: newHash,
        passwordUpdatedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Текущее рабочее место + история назначений
   * GET /me/current-workplace
   */
  @Get('current-workplace')
  async getCurrentWorkplace(@CurrentUser() user: JwtPayload) {
    const assignments = await this.prisma.assignment.findMany({
      where: { userId: user.sub },
      include: {
        workplace: {
          select: {
            id: true,
            code: true,
            name: true,
            location: true,
            org: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        shifts: {
          orderBy: [
            { date: 'asc' as const },
            { startsAt: 'asc' as const },
          ],
        },
      },
      orderBy: [{ startsAt: 'asc' }],
    });

    if (assignments.length === 0) {
      return {
        workplace: null,
        assignment: null,
        history: [],
      };
    }

    const now = new Date();

    const current =
      assignments.find(
        (a) =>
          a.status === AssignmentStatus.ACTIVE &&
          a.startsAt <= now &&
          (!a.endsAt || a.endsAt >= now),
      ) ??
      assignments.find(
        (a) => a.status === AssignmentStatus.ACTIVE && !a.endsAt,
      ) ??
      null;

    const history = assignments
      .filter((a) => !current || a.id !== current.id)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return {
      workplace: current?.workplace ?? null,
      assignment: current,
      history,
    };
  }

  /**
   * Моё расписание
   * GET /me/schedule
   */
  @Get('schedule')
  async getSchedule(@CurrentUser() user: JwtPayload) {
    const slots = await this.prisma.slot.findMany({
      where: { userId: user.sub },
      include: {
        plan: { select: { id: true, name: true, status: true } },
        org: { select: { id: true, name: true, slug: true } },
        user: {
          select: { id: true, email: true, fullName: true, position: true },
        },
      },
      orderBy: [{ dateStart: 'asc' }],
    });

    return slots;
  }

  /**
   * Подтвердить слот
   */
  @Patch('slots/:slotId/confirm')
  async confirmMySlot(
    @CurrentUser() user: JwtPayload,
    @Param('slotId') slotId: string,
  ) {
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, userId: user.sub },
    });

    if (!slot) {
      throw new NotFoundException('Слот не найден');
    }

    if (slot.status === SlotStatus.CANCELLED) {
      throw new BadRequestException('Отменённый слот нельзя подтвердить');
    }

    return this.prisma.slot.update({
      where: { id: slot.id },
      data: { status: SlotStatus.CONFIRMED },
      include: {
        plan: { select: { id: true, name: true, status: true } },
        org: { select: { id: true, name: true, slug: true } },
        user: {
          select: { id: true, email: true, fullName: true, position: true },
        },
      },
    });
  }

  /**
   * Запрос корректировки слота
   */
  @Post('slots/:slotId/request-swap')
  async requestSwap(
    @CurrentUser() user: JwtPayload,
    @Param('slotId') slotId: string,
    @Body(new ZodValidationPipe(requestSwapSchema)) body: RequestSwapDto,
  ) {
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, userId: user.sub },
    });

    if (!slot) {
      throw new NotFoundException('Слот не найден');
    }

    if (slot.status === SlotStatus.CANCELLED) {
      throw new BadRequestException(
        'Нельзя запросить корректировку для отменённого слота',
      );
    }

    return this.prisma.slot.update({
      where: { id: slot.id },
      data: {
        status: SlotStatus.REPLACED,
        note: body.comment,
      },
      include: {
        plan: { select: { id: true, name: true, status: true } },
        org: { select: { id: true, name: true, slug: true } },
        user: {
          select: { id: true, email: true, fullName: true, position: true },
        },
      },
    });
  }

  /**
   * Запрос корректировки назначения
   */
  @Post('assignments/:assignmentId/request-adjustment')
  async requestAssignmentAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodValidationPipe(requestAssignmentAdjustmentSchema))
    body: RequestAssignmentAdjustmentDto,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { workplace: true, user: true },
    });

    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }

    if (assignment.userId !== user.sub) {
      throw new ForbiddenException('Нельзя изменить чужое назначение');
    }

    const adjustment = await this.prisma.assignmentAdjustment.create({
      data: {
        assignmentId: assignment.id,
        userId: user.sub,
        date: assignment.startsAt,
        comment: body.comment,
        status: 'PENDING' as any,
      },
    });

    return { success: true, id: adjustment.id };
  }
}