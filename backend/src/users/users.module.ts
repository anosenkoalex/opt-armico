import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { MeController } from './me.controller.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { PlansModule } from '../plans/plans.module.js';

@Module({
  imports: [AssignmentsModule, PlansModule],
  controllers: [UsersController, MeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
