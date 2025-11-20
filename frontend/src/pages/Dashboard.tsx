import { Button, Card, Col, Flex, List, Result, Row, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  fetchCurrentWorkplace,
  fetchMySchedule,
  fetchAdminFeed,
  fetchRecentFeed,
  fetchNotifications,
  type FeedItem,
  type Notification,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const role = user?.role ?? 'USER';
  const isAdmin = role === 'SUPER_ADMIN';

  const currentWorkplaceQuery = useQuery({
    queryKey: ['me', 'current-workplace', 'dashboard'],
    queryFn: fetchCurrentWorkplace,
    refetchInterval: 60_000,
    enabled: !isAdmin,
  });

  // фид оставил только для обычных юзеров, админ смотрит блок "Последние изменения"
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

      return fetchRecentFeed({ take });
    },
    enabled: !!profile && !isAdmin,
    refetchInterval: 60_000,
  });

  // 🔔 последние уведомления — то же самое, что и под колокольчиком
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'dashboard'],
    queryFn: () => fetchNotifications({ take: 20 }),
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
  const notifications = (notificationsQuery.data?.items ?? []) as Notification[];

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

  const renderNotification = (n: Notification) => {
    const createdAt = dayjs(n.createdAt).format('DD.MM.YYYY HH:mm');

    return (
      <List.Item key={n.id}>
        <List.Item.Meta
          title={n.title}
          description={
            <Flex vertical gap={4}>
              {n.body ? (
                <Typography.Text type="secondary">{n.body}</Typography.Text>
              ) : null}
              <Typography.Text type="secondary">{createdAt}</Typography.Text>
            </Flex>
          }
        />
      </List.Item>
    );
  };

  const sectionCards = (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12} xl={8}>
        <Card
          title={t('menu.assignments', 'Назначения')}
          extra={
            <Button
              type="primary"
              size="small"
              onClick={() => navigate('/assignments')}
            >
              {t('dashboard.openSection', 'Открыть')}
            </Button>
          }
        >
          <Typography.Text type="secondary">
            {t(
              'dashboard.sections.assignments',
              'Управление назначениями, статусами и оповещениями сотрудников.',
            )}
          </Typography.Text>
        </Card>
      </Col>

      <Col xs={24} md={12} xl={8}>
        <Card
          title={t('menu.planner', 'Планировщик')}
          extra={
            <Button
              type="primary"
              size="small"
              onClick={() => navigate('/planner')}
            >
              {t('dashboard.openSection', 'Открыть')}
            </Button>
          }
        >
          <Typography.Text type="secondary">
            {t(
              'dashboard.sections.planner',
              'Календарь смен и графиков по сотрудникам и рабочим местам.',
            )}
          </Typography.Text>
        </Card>
      </Col>

      <Col xs={24} md={12} xl={8}>
        <Card
          title={t('menu.workplaces', 'Рабочие места')}
          extra={
            <Button
              type="primary"
              size="small"
              onClick={() => navigate('/workplaces')}
            >
              {t('dashboard.openSection', 'Открыть')}
            </Button>
          }
        >
          <Typography.Text type="secondary">
            {t(
              'dashboard.sections.workplaces',
              'Справочник рабочих мест и кодов для назначения смен.',
            )}
          </Typography.Text>
        </Card>
      </Col>

      <Col xs={24} md={12} xl={8}>
        <Card
          title={t('menu.users', 'Сотрудники')}
          extra={
            <Button
              type="primary"
              size="small"
              onClick={() => navigate('/users')}
            >
              {t('dashboard.openSection', 'Открыть')}
            </Button>
          }
        >
          <Typography.Text type="secondary">
            {t(
              'dashboard.sections.users',
              'Профили сотрудников, роли и доступы к системе.',
            )}
          </Typography.Text>
        </Card>
      </Col>

      <Col xs={24} md={12} xl={8}>
        <Card
          title={t('menu.statistics', 'Статистика')}
          extra={
            <Button
              type="primary"
              size="small"
              onClick={() => navigate('/statistics')}
            >
              {t('dashboard.openSection', 'Открыть')}
            </Button>
          }
        >
          <Typography.Text type="secondary">
            {t(
              'dashboard.sections.statistics',
              'Отчёты по отработанным часам, статусам и архиву назначений.',
            )}
          </Typography.Text>
        </Card>
      </Col>
    </Row>
  );

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2}>
        {t('dashboard.greeting', {
          name: profile.fullName ?? profile.email,
        })}
      </Typography.Title>

      {isAdmin ? (
        <>
          <Card title={t('dashboard.lastChanges', 'Последние изменения')}>
            {notificationsQuery.isLoading ? (
              <Flex justify="center" className="py-8">
                <Spin />
              </Flex>
            ) : notifications.length === 0 ? (
              <Typography.Text type="secondary">
                {t('dashboard.noFeed', 'Изменений пока нет')}
              </Typography.Text>
            ) : (
              <List
                dataSource={notifications}
                renderItem={renderNotification}
                split
              />
            )}
          </Card>

          {sectionCards}
        </>
      ) : (
        <>
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
              <List dataSource={feedItems} renderItem={renderFeedItem} split />
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
        </>
      )}
    </Flex>
  );
};

export default Dashboard;