import { Card, Flex, Result, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminFeed,
  fetchCurrentWorkplace,
  fetchMySchedule,
  fetchNotifications,
  type AdminFeedItem,
  type Notification,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const Dashboard = () => {
  const { t } = useTranslation();
  const { profile, user } = useAuth();

  const role = user?.role ?? 'USER';
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const currentWorkplaceQuery = useQuery({
    queryKey: ['me', 'current-workplace', 'dashboard'],
    queryFn: fetchCurrentWorkplace,
    refetchInterval: 60_000,
  });

  const adminFeedQuery = useQuery({
    queryKey: ['feed', 'admin'],
    queryFn: () => fetchAdminFeed(20),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'dashboard'],
    queryFn: () => fetchNotifications(20),
    enabled: !isAdmin,
    refetchInterval: 60_000,
  });

  const scheduleQuery = useQuery({
    queryKey: ['me', 'schedule', 'dashboard'],
    queryFn: fetchMySchedule,
    enabled: !isAdmin,
    refetchInterval: 120_000,
  });

  const upcomingSlot = useMemo(() => {
    if (!scheduleQuery.data) {
      return null;
    }

    const now = dayjs();
    const sorted = [...scheduleQuery.data].sort((a, b) =>
      dayjs(a.dateStart).diff(dayjs(b.dateStart)),
    );

    return (
      sorted.find((slot) => {
        const start = dayjs(slot.dateStart);
        const end = slot.dateEnd ? dayjs(slot.dateEnd) : null;

        if (end) {
          if (end.isBefore(now)) {
            return false;
          }
          return true;
        }

        return start.isSame(now, 'day') || start.isAfter(now);
      }) ?? null
    );
  }, [scheduleQuery.data]);

  if (!profile) {
    return (
      <Flex justify="center" align="center" className="min-h-[40vh]">
        <Spin tip={t('common.loading')} />
      </Flex>
    );
  }

  const currentWorkplace = currentWorkplaceQuery.data;

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2}>
        {t('dashboard.greeting', {
          name: profile.fullName ?? profile.email,
        })}
      </Typography.Title>

      <Card title={t('dashboard.currentPlace')}>
        {currentWorkplaceQuery.isLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : !currentWorkplace?.assignment ? (
          <Result status="info" title={t('dashboard.noCurrentAssignment')} />
        ) : (
          <Flex vertical gap={8}>
            <Typography.Text strong>
              {currentWorkplace.workplace?.code
                ? `${currentWorkplace.workplace.code} — `
                : ''}
              {currentWorkplace.workplace?.name}
            </Typography.Text>
            {currentWorkplace.workplace?.location ? (
              <Typography.Text type="secondary">
                {currentWorkplace.workplace.location}
              </Typography.Text>
            ) : null}
            <Typography.Text>
              {t('dashboard.assignmentPeriod', {
                start: dayjs(currentWorkplace.assignment.startsAt).format(
                  'DD.MM.YYYY HH:mm',
                ),
                end: currentWorkplace.assignment.endsAt
                  ? dayjs(currentWorkplace.assignment.endsAt).format(
                      'DD.MM.YYYY HH:mm',
                    )
                  : t('dashboard.openEnded'),
              })}
            </Typography.Text>
          </Flex>
        )}
      </Card>

      {isAdmin ? (
        <Card title={t('dashboard.adminFeedTitle')}>
          {adminFeedQuery.isLoading ? (
            <Flex justify="center" className="py-8">
              <Spin />
            </Flex>
          ) : !adminFeedQuery.data || adminFeedQuery.data.length === 0 ? (
            <Typography.Text type="secondary">
              {t('dashboard.noFeed')}
            </Typography.Text>
          ) : (
            adminFeedQuery.data.map((item: AdminFeedItem) => {
              const workplace =
                (item.payload.workplaceName as string | undefined) ??
                (item.payload.workplaceCode as string | undefined) ??
                '';
              const userName = item.user.fullName ?? item.user.email;
              const date = dayjs(item.createdAt).format('DD.MM.YYYY HH:mm');
              const key =
                item.type === 'ASSIGNMENT_CREATED'
                  ? 'notifications.created'
                  : item.type === 'ASSIGNMENT_MOVED'
                    ? 'notifications.moved'
                    : item.type === 'ASSIGNMENT_CANCELLED'
                      ? 'notifications.cancelled'
                      : 'notifications.updated';

              return (
                <div key={item.id} className="py-3 border-b last:border-none">
                  <Typography.Text strong>{t(key, { workplace })}</Typography.Text>
                  <div>
                    <Typography.Text>{userName}</Typography.Text>
                  </div>
                  <Typography.Text type="secondary">{date}</Typography.Text>
                </div>
              );
            })
          )}
        </Card>
      ) : (
        <Flex vertical gap={16}>
          <Card title={t('dashboard.notificationsTitle')}>
            {notificationsQuery.isLoading ? (
              <Flex justify="center" className="py-8">
                <Spin />
              </Flex>
            ) : !notificationsQuery.data ||
              notificationsQuery.data.length === 0 ? (
              <Typography.Text type="secondary">
                {t('notifications.empty')}
              </Typography.Text>
            ) : (
              notificationsQuery.data.map((item: Notification) => {
                const workplace =
                  (item.payload.workplaceName as string | undefined) ??
                  (item.payload.workplaceCode as string | undefined) ??
                  '';
                const date = dayjs(item.createdAt).format('DD.MM.YYYY HH:mm');
                const key =
                  item.type === 'ASSIGNMENT_CREATED'
                    ? 'notifications.created'
                    : item.type === 'ASSIGNMENT_MOVED'
                      ? 'notifications.moved'
                      : item.type === 'ASSIGNMENT_CANCELLED'
                        ? 'notifications.cancelled'
                        : 'notifications.updated';

                return (
                  <div key={item.id} className="py-2 border-b last:border-none">
                    <Typography.Text strong>
                      {t(key, { workplace })}
                    </Typography.Text>
                    <div>
                      <Typography.Text type="secondary">{date}</Typography.Text>
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          <Card title={t('dashboard.upcomingAssignment')}>
            {scheduleQuery.isLoading ? (
              <Flex justify="center" className="py-8">
                <Spin />
              </Flex>
            ) : !upcomingSlot ? (
              <Result
                status="info"
                title={t('dashboard.noUpcomingAssignment')}
              />
            ) : (
              <Flex vertical gap={8}>
                <Typography.Text strong>
                  {upcomingSlot.org?.slug
                    ? `${upcomingSlot.org.slug.toUpperCase()} — `
                    : ''}
                  {upcomingSlot.org?.name ?? upcomingSlot.plan?.name ?? ''}
                </Typography.Text>
                <Typography.Text>
                  {`${dayjs(upcomingSlot.dateStart).format(
                    'DD.MM.YYYY HH:mm',
                  )} — ${
                    upcomingSlot.dateEnd
                      ? dayjs(upcomingSlot.dateEnd).format('DD.MM.YYYY HH:mm')
                      : t('dashboard.openEnded')
                  }`}
                </Typography.Text>
                {upcomingSlot.plan?.name ? (
                  <Typography.Text type="secondary">
                    {upcomingSlot.plan.name}
                  </Typography.Text>
                ) : null}
              </Flex>
            )}
          </Card>
        </Flex>
      )}
    </Flex>
  );
};

export default Dashboard;
