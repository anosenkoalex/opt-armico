import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, EmailService],
  exports: [NotificationsService, EmailService], // 👈 ВАЖНО
})
export class NotificationsModule {}