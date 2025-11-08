import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../common/prisma/prisma.service.js';

export type SmsSettingsDto = {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  sender: string;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Получить текущие настройки SMS.
   * Если записи в БД ещё нет — вернём дефолты.
   */
  async getSettings(): Promise<SmsSettingsDto> {
    const settings = await this.prisma.smsSettings.findFirst();

    if (!settings) {
      return {
        enabled: false,
        apiUrl: '',
        apiKey: '',
        sender: 'ARMICO',
      };
    }

    return {
      enabled: settings.enabled,
      apiUrl: settings.apiUrl ?? '',
      apiKey: settings.apiKey ?? '',
      sender: settings.sender ?? 'ARMICO',
    };
  }

  /**
   * Обновить / создать настройки SMS-шлюза (используется из Dev-панели).
   */
  async updateSettings(dto: SmsSettingsDto): Promise<void> {
    const existing = await this.prisma.smsSettings.findFirst();

    if (existing) {
      await this.prisma.smsSettings.update({
        where: { id: existing.id },
        data: {
          enabled: dto.enabled,
          apiUrl: dto.apiUrl,
          apiKey: dto.apiKey,
          sender: dto.sender,
        },
      });
    } else {
      await this.prisma.smsSettings.create({
        data: {
          enabled: dto.enabled,
          apiUrl: dto.apiUrl,
          apiKey: dto.apiKey,
          sender: dto.sender,
        },
      });
    }

    this.logger.log('SMS settings updated');
  }

  /**
   * Базовый метод отправки SMS. Используется и Dev-панелью, и уведомлениями.
   */
  async sendSms(phone: string, text: string): Promise<void> {
    const settings = await this.getSettings();

    if (!settings.enabled) {
      this.logger.warn(`SMS disabled in settings. Skip SMS to ${phone}`);
      return;
    }

    if (!settings.apiUrl || !settings.apiKey) {
      this.logger.warn(
        `SMS settings missing apiUrl/apiKey. Skip SMS to ${phone}`,
      );
      return;
    }

    if (!phone) {
      this.logger.warn('No phone number provided, skip SMS');
      return;
    }

    try {
      await axios.post(
        settings.apiUrl,
        {
          to: phone,
          from: settings.sender || 'ARMICO',
          text,
        },
        {
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      this.logger.log(`SMS sent to ${phone}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : JSON.stringify(err);
      this.logger.error(`Failed to send SMS to ${phone}: ${message}`);
    }
  }

  /**
   * Тестовое SMS из Dev-панели.
   */
  async sendTestSms(phone: string): Promise<void> {
    const text = 'Тестовое SMS из ARMICO CRM (developer panel)';
    await this.sendSms(phone, text);
  }

  /**
   * Уведомление сотрудника о назначении.
   * Вызывается, когда жмёшь "Оповестить" по назначению.
   */
  async sendAssignmentNotification(assignmentId: string): Promise<void> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: true,
        workplace: true,
      },
    });

    if (!assignment || !assignment.user) {
      this.logger.warn(
        `Assignment ${assignmentId} not found or user missing, skip SMS`,
      );
      return;
    }

    if (!assignment.user.phone) {
      this.logger.warn(
        `User ${assignment.user.id} has no phone, skip SMS`,
      );
      return;
    }

    const workplacePart = assignment.workplace
      ? `${assignment.workplace.code} — ${assignment.workplace.name}`
      : 'Рабочее место не указано';

    const periodPart = assignment.endsAt
      ? `с ${assignment.startsAt.toLocaleDateString('ru-RU')} по ${assignment.endsAt.toLocaleDateString('ru-RU')}`
      : `с ${assignment.startsAt.toLocaleDateString('ru-RU')}`;

    const text = ['Новое назначение', workplacePart, periodPart].join('\n');

    await this.sendSms(assignment.user.phone, text);
  }
}
