import { Module } from '@nestjs/common';
import { WorkplacesService } from './workplaces.service.js';
import { WorkplacesController } from './workplaces.controller.js';

@Module({
  controllers: [WorkplacesController],
  providers: [WorkplacesService],
  exports: [WorkplacesService],
})
export class WorkplacesModule {}
