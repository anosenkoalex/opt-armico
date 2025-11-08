import { Module } from '@nestjs/common';
import { DevController } from './dev.controller.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { SmsModule } from '../sms/sms.module.js';

@Module({
  imports: [PrismaModule, SmsModule],
  controllers: [DevController],
})
export class DevModule {}
