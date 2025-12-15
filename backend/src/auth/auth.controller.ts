import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto, loginSchema } from './dto/login.dto.js';
import { RegisterDto, registerSchema } from './dto/register.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

// ❗ FIX: guard лежит в common/guards, а не в auth/guards
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) payload: RegisterDto) {
    return this.authService.register(payload);
  }

  /**
   * ✅ КРИТИЧНО ДЛЯ ФРОНТА
   * Используется для проверки авторизации после login
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }
}