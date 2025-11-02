import { Module } from '@nestjs/common';
import { PlansService } from './plans.service.js';
import { PlansController } from './plans.controller.js';
import { MatrixController } from './matrix.controller.js';
import { ConstraintsController } from './constraints.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [PlansController, MatrixController, ConstraintsController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
