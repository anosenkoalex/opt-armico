import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';

type DevCurrentUser = {
  id: string;
  email: string;
  role: UserRole;
};

type DevSmsSettingsBody = {
  enabled?: boolean;
  provider?: string | null;
  apiUrl?: string | null;
  apiKey?: string | null;
  sender?: string | null;
};

type DevTestSmsBody = {
  phone: string;
  text?: string;
};

// Email — пока заглушки, без сохранения в БД
type DevEmailSettingsBody = {
  enabled?: boolean;
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  user?: string | null;
  password?: string | null;
  from?: string | null;
};

type DevTestEmailBody = {
  email: string;
};

@Controller('dev')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Допуск только:
   *  - dev@armico.local
   *  - SUPER_ADMIN
   */
  private ensureDev(user: DevCurrentUser | null | undefined): void {
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (
      user.email !== 'dev@armico.local' &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied');
    }
  }

  // ---------- SMS НАСТРОЙКИ ----------

  @Get('sms-settings')
  async getSmsSettings(@CurrentUser() user: DevCurrentUser) {
    this.ensureDev(user);

    const settings = await this.smsService.getSettings();

    // provider у нас в БД не хранится — просто поле "для себя", фронт может его показывать как заметку
    return {
      enabled: settings.enabled,
      provider: null as string | null,
      apiUrl: settings.apiUrl || null,
      apiKey: settings.apiKey || null,
      sender: settings.sender || null,
    };
  }

  @Put('sms-settings')
  async updateSmsSettings(
    @CurrentUser() user: DevCurrentUser,
    @Body() body: DevSmsSettingsBody,
  ) {
    this.ensureDev(user);

    await this.smsService.updateSettings({
      enabled: Boolean(body.enabled),
      apiUrl: body.apiUrl?.trim() ?? '',
      apiKey: body.apiKey?.trim() ?? '',
      sender: body.sender?.trim() || 'ARMICO',
    });

    return { success: true };
  }

  @Post('test-sms')
  async testSms(
    @CurrentUser() user: DevCurrentUser,
    @Body() body: DevTestSmsBody,
  ) {
    this.ensureDev(user);

    const phone = body.phone?.trim();
    if (!phone) {
      throw new BadRequestException('phone is required');
    }

    const text = body.text?.trim() || 'Тестовое SMS из Armico CRM';
    await this.smsService.sendSms(phone, text);

    return { success: true };
  }

  // ---------- EMAIL НАСТРОЙКИ (ПОКА ЗАГЛУШКА) ----------

  @Get('email-settings')
  async getEmailSettings(@CurrentUser() user: DevCurrentUser) {
    this.ensureDev(user);

    // Пока просто возвращаем дефолты, без реального хранилища
    return {
      enabled: false,
      host: null as string | null,
      port: null as number | null,
      secure: true,
      user: null as string | null,
      from: null as string | null,
    };
  }

  @Put('email-settings')
  async updateEmailSettings(
    @CurrentUser() user: DevCurrentUser,
    @Body() _body: DevEmailSettingsBody,
  ) {
    this.ensureDev(user);

    // Здесь в будущем можно будет сохранять настройки в БД/конфиг.
    // Сейчас просто принимаем и делаем вид, что сохранили.
    return { success: true };
  }

  @Post('test-email')
  async testEmail(
    @CurrentUser() user: DevCurrentUser,
    @Body() body: DevTestEmailBody,
  ) {
    this.ensureDev(user);

    const email = body.email?.trim();
    if (!email) {
      throw new BadRequestException('email is required');
    }

    // Здесь в будущем будет реальная отправка письма через EmailService.
    // Сейчас честно говорим, что шлюз не настроен.
    throw new BadRequestException(
      'Email-шлюз пока не настроен. Проверьте настройки SMTP в Developer Console.',
    );
  }

  // ---------- ЛОГИ ----------

  @Get('logs')
  async getLogs(@CurrentUser() user: DevCurrentUser) {
    this.ensureDev(user);

    const [assignments, notifications] = await Promise.all([
      this.prisma.assignment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: true,
          workplace: true,
        },
      }),
      this.prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: true,
        },
      }),
    ]);

    return { assignments, notifications };
  }

  // ---------- БЭКАП (JSON-дамп основных таблиц) ----------

  @Post('backup')
  async createBackup(@CurrentUser() user: DevCurrentUser) {
    this.ensureDev(user);

    const [orgs, users, workplaces, assignments, plans, slots, constraints] =
      await Promise.all([
        this.prisma.org.findMany(),
        this.prisma.user.findMany(),
        this.prisma.workplace.findMany(),
        this.prisma.assignment.findMany(),
        this.prisma.plan.findMany(),
        this.prisma.slot.findMany(),
        this.prisma.constraint.findMany(),
      ]);

    return {
      createdAt: new Date().toISOString(),
      orgs,
      users,
      workplaces,
      assignments,
      plans,
      slots,
      constraints,
    };
  }
}