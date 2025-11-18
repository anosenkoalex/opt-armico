import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service.js';
import { AssignmentsController } from './assignments.controller.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmailService } from '../notifications/email.service.js';
import { SmsService } from '../sms/sms.service.js';

@Module({
  controllers: [AssignmentsController],
  providers: [
    AssignmentsService,
    PrismaService,
    NotificationsService,
    EmailService,
    SmsService,
  ],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}