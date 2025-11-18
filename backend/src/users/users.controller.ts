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
import { UsersService } from './users.service.js';
import { CreateUserDto, createUserSchema } from './dto/create-user.dto.js';
import { UpdateUserDto, updateUserSchema } from './dto/update-user.dto.js';
import { ListUsersDto, listUsersSchema } from './dto/list-users.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Создание нового пользователя.
   * Разрешено только SUPER_ADMIN.
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(
    @Body(new ZodValidationPipe(createUserSchema)) payload: CreateUserDto,
  ) {
    return this.usersService.create(payload);
  }

  /**
   * Получение списка пользователей с пагинацией и фильтрацией.
   * Разрешено только SUPER_ADMIN.
   */
  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(
    @Query(new ZodValidationPipe(listUsersSchema)) query: ListUsersDto,
  ) {
    return this.usersService.findAll(query);
  }

  /**
   * Получение данных конкретного пользователя по ID.
   */
  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * Обновление данных пользователя.
   * SUPER_ADMIN может редактировать всех.
   */
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) payload: UpdateUserDto,
  ) {
    return this.usersService.update(id, payload);
  }

  /**
   * Удаление пользователя.
   * Полное удаление возможно только для обычных (USER) ролей.
   */
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  /**
   * Отправка пользователю сгенерированного или установленного пароля.
   * Если шлюз не настроен — вернёт ошибку.
   */
  @Post(':id/send-password')
  @Roles(UserRole.SUPER_ADMIN)
  async sendPassword(@Param('id') id: string) {
    return this.usersService.sendPassword(id);
  }
}