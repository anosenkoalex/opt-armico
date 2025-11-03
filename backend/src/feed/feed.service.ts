import { Injectable } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';

export type FeedItemType = 'assignment' | 'workplace';

export type FeedItem = {
  title: string;
  type: FeedItemType;
  at: string;
  meta: Record<string, unknown>;
};

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminFeed(take = 20) {
    return this.getFeed({ take });
  }

  async getScopedFeed(params: { take?: number; userId?: string; orgId?: string }) {
    return this.getFeed(params);
  }

  private async getFeed(params: { take?: number; userId?: string; orgId?: string }) {
    const limit = Math.min(Math.max(params.take ?? 20, 1), 100);

    const [assignments, workplaces] = await Promise.all([
      this.prisma.assignment.findMany({
        where: {
          ...(params.userId ? { userId: params.userId } : {}),
          ...(params.orgId
            ? { workplace: { is: { orgId: params.orgId } } }
            : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              position: true,
            },
          },
          workplace: {
            select: {
              id: true,
              code: true,
              name: true,
              orgId: true,
              org: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.workplace.findMany({
        where: params.orgId ? { orgId: params.orgId } : {},
        include: {
          org: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    const combined = [
      ...assignments.map((assignment) => ({
        title: 'Назначение',
        type: 'assignment' as const,
        at: assignment.updatedAt,
        meta: {
          id: assignment.id,
          action:
            assignment.status === AssignmentStatus.ARCHIVED
              ? 'cancelled'
              : assignment.updatedAt.getTime() === assignment.createdAt.getTime()
                ? 'created'
                : 'updated',
          user: assignment.user
            ? {
                id: assignment.user.id,
                email: assignment.user.email,
                fullName: assignment.user.fullName,
                position: assignment.user.position,
              }
            : null,
          workplace: {
            id: assignment.workplace.id,
            code: assignment.workplace.code,
            name: assignment.workplace.name,
          },
          org: assignment.workplace.org
            ? {
                id: assignment.workplace.org.id,
                name: assignment.workplace.org.name,
                slug: assignment.workplace.org.slug,
              }
            : null,
          period: {
            from: assignment.startsAt.toISOString(),
            to: assignment.endsAt ? assignment.endsAt.toISOString() : null,
          },
          status: assignment.status,
        },
      })),
      ...workplaces.map((workplace) => ({
        title: 'Рабочее место',
        type: 'workplace' as const,
        at: workplace.updatedAt,
        meta: {
          id: workplace.id,
          action:
            workplace.updatedAt.getTime() === workplace.createdAt.getTime()
              ? 'created'
              : 'updated',
          code: workplace.code,
          name: workplace.name,
          isActive: workplace.isActive,
          org: workplace.org
            ? {
                id: workplace.org.id,
                name: workplace.org.name,
                slug: workplace.org.slug,
              }
            : null,
        },
      })),
    ];

    return combined
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit)
      .map<FeedItem>((item) => ({
        title: item.title,
        type: item.type,
        at: item.at.toISOString(),
        meta: item.meta,
      }));
  }
}
