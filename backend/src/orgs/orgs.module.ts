import { Module } from '@nestjs/common';
import { OrgsService } from './orgs.service.js';
import { OrgsController } from './orgs.controller.js';

@Module({
  controllers: [OrgsController],
  providers: [OrgsService],
  exports: [OrgsService],
})
export class OrgsModule {}
