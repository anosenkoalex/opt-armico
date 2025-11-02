import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';

const ASSIGNMENT_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.ASSIGNMENT_CREATED,
  NotificationType.ASSIGNMENT_UPDATED,
  NotificationType.ASSIGNMENT_MOVED,
  NotificationType.ASSIGNMENT_CANCELLED,
];

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminFeed(take = 20) {
    const limit = Math.min(Math.max(take, 1), 100);

    const notifications = await this.prisma.notification.findMany({
      where: { type: { in: ASSIGNMENT_NOTIFICATION_TYPES } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            position: true,
          },
        },
      },
    });

    return notifications.map((item) => ({
      id: item.id,
      type: item.type,
      createdAt: item.createdAt,
      payload: item.payload,
      user: item.user,
    }));
  }
}
