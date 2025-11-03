import { Card, Flex, List, Result, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchCurrentWorkplace,
  fetchMySchedule,
  fetchAdminFeed,
  fetchRecentFeed,
  type FeedItem,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const Dashboard = () => {
  const { t } = useTranslation();
  const { profile, user } = useAuth();

  const role = user?.role ?? 'USER';
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isOrgManager = role === 'ORG_MANAGER';

  const currentWorkplaceQuery = useQuery({
    queryKey: ['me', 'current-workplace', 'dashboard'],
    queryFn: fetchCurrentWorkplace,
    refetchInterval: 60_000,
    enabled: !isAdmin,
  });

  const feedQuery = useQuery({
    queryKey: [
      'feed',
      isAdmin ? 'admin' : 'recent',
      role,
      profile?.org?.id ?? null,
      user?.id ?? null,
    ],
    queryFn: () => {
      const take = 20;

      if (isAdmin) {
        return fetchAdminFeed({ take });
      }

      const params: { take: number; orgId?: string } = { take };

      if (isOrgManager && profile?.org?.id) {
        params.orgId = profile.org.id;
      }

      return fetchRecentFeed(params);
    },
    enabled: !!profile,
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
  const feedItems = feedQuery.data ?? [];

  const renderFeedItem = (item: FeedItem) => {
    const date = dayjs(item.at).format('DD.MM.YYYY HH:mm');

    if (item.type === 'assignment') {
      const action = item.meta.action ?? 'updated';
      const workplace = item.meta.workplace;
      const workplaceTitle = workplace
        ? `${workplace.code ? `${workplace.code} — ` : ''}${workplace.name}`
        : '';
      const userName =
        item.meta.user?.fullName ?? item.meta.user?.email ?? undefined;
      const period = item.meta.period
        ? `${dayjs(item.meta.period.from).format('DD.MM.YYYY HH:mm')} — ${
            item.meta.period.to
              ? dayjs(item.meta.period.to).format('DD.MM.YYYY HH:mm')
              : t('dashboard.openEnded')
          }`
        : null;

      return (
        <List.Item key={`${item.type}-${item.meta.id}-${item.at}`}>
          <List.Item.Meta
            title={t(`dashboard.feed.assignment.${action}` as const, {
              workplace: workplaceTitle,
              user: userName ?? '',
            })}
            description={
              <Flex vertical gap={4}>
                {userName ? <Typography.Text>{userName}</Typography.Text> : null}
                {workplaceTitle ? (
                  <Typography.Text type="secondary">
                    {workplaceTitle}
                  </Typography.Text>
                ) : null}
                {period ? (
                  <Typography.Text type="secondary">{period}</Typography.Text>
                ) : null}
                <Typography.Text type="secondary">{date}</Typography.Text>
              </Flex>
            }
          />
        </List.Item>
      );
    }

    const action = item.meta.action ?? 'updated';
    const title = item.meta.code
      ? `${item.meta.code} — ${item.meta.name ?? ''}`.trim()
      : item.meta.name ?? '';
    const orgName = item.meta.org?.name;
    const statusLabel =
      typeof item.meta.isActive === 'boolean'
        ? item.meta.isActive
          ? t('common.active')
          : t('common.inactive')
        : null;

    return (
      <List.Item key={`${item.type}-${item.meta.id}-${item.at}`}>
        <List.Item.Meta
          title={t(`dashboard.feed.workplace.${action}` as const, {
            workplace: title,
          })}
          description={
            <Flex vertical gap={4}>
              {title ? <Typography.Text>{title}</Typography.Text> : null}
              {orgName ? (
                <Typography.Text type="secondary">{orgName}</Typography.Text>
              ) : null}
              {statusLabel ? (
                <Typography.Text type="secondary">
                  {statusLabel}
                </Typography.Text>
              ) : null}
              <Typography.Text type="secondary">{date}</Typography.Text>
            </Flex>
          }
        />
      </List.Item>
    );
  };

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2}>
        {t('dashboard.greeting', {
          name: profile.fullName ?? profile.email,
        })}
      </Typography.Title>

      {!isAdmin ? (
        <Card title={t('dashboard.currentAssignmentTitle')}>
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
      ) : null}

      <Card title={t('dashboard.feedTitle')}>
        {feedQuery.isLoading ? (
          <Flex justify="center" className="py-8">
            <Spin />
          </Flex>
        ) : feedItems.length === 0 ? (
          <Typography.Text type="secondary">
            {t('dashboard.noFeed')}
          </Typography.Text>
        ) : (
          <List
            dataSource={feedItems}
            renderItem={(item) => renderFeedItem(item)}
            split
          />
        )}
      </Card>

      {!isAdmin ? (
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
      ) : null}
    </Flex>
  );
};

export default Dashboard;
