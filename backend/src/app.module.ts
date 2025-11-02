import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { OrgsModule } from './orgs/orgs.module.js';
import { WorkplacesModule } from './workplaces/workplaces.module.js';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PlansModule } from './plans/plans.module.js';
import { PlannerModule } from './planner/planner.module.js';
import { FeedModule } from './feed/feed.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrgsModule,
    WorkplacesModule,
    AssignmentsModule,
    NotificationsModule,
    PlansModule,
    PlannerModule,
    FeedModule,
  ],
})
export class AppModule {}
