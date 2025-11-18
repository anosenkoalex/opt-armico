import { Module } from '@nestjs/common';
import { SmsService } from './sms.service.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}