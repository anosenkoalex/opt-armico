import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  findForUser(userId: string, take?: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: take ?? 20,
    });
  }

  async notifyMany(
    userIds: string[],
    type: NotificationType,
    payload: Prisma.JsonObject,
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const actions = userIds.map((userId) =>
      this.prisma.notification.create({
        data: {
          userId,
          type,
          payload: payload as Prisma.InputJsonValue,
        },
      }),
    );

    await this.prisma.$transaction(actions);
  }
}
