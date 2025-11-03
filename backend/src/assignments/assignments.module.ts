import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service.js';
import { AssignmentsController } from './assignments.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
