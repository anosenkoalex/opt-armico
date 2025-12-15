// frontend/src/pages/Dashboard.tsx
import { RightOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Flex,
  List,
  Row,
  Spin,
  Statistic,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminFeed,
  fetchAssignments,
  fetchNotifications,
  fetchRecentFeed,
  fetchUsers,
  fetchWorkplaces,
  type FeedItem,
  type Notification,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

type AnyResponse =
  | any[]
  | {
      items?: any[];
      data?: any[];
      total?: number;
      count?: number;
      meta?: { total?: number; count?: number };
      pagination?: { total?: number; count?: number };
    };

const getTotal = (res: AnyResponse | undefined): number => {
  if (!res) return 0;
  if (Array.isArray(res)) return res.length;

  const total =
    (typeof res.total === 'number' ? res.total : undefined) ??
    (typeof res.count === 'number' ? res.count : undefined) ??
    (typeof res.meta?.total === 'number' ? res.meta.total : undefined) ??
    (typeof res.meta?.count === 'number' ? res.meta.count : undefined) ??
    (typeof res.pagination?.total === 'number'
      ? res.pagination.total
      : undefined) ??
    (typeof res.pagination?.count === 'number'
      ? res.pagination.count
      : undefined);

  if (typeof total === 'number') return total;

  const items = res.items ?? res.data;
  if (Array.isArray(items)) return items.length;

  return 0;
};

const safeName = (
  profile?: { fullName?: string | null; email?: string | null },
  role?: string,
) => {
  const fullName = profile?.fullName?.trim();
  if (fullName) return fullName;

  if (role === 'SUPER_ADMIN') return 'Администратор';
  return profile?.email ?? '';
};

type NotificationView = {
  title: string;
  description?: string | null;
  createdAt: string;
  targetPath?: string | null;
};

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const role = profile?.role ?? user?.role ?? 'USER';
  const isAdmin = role === 'SUPER_ADMIN';

  // USER вообще не видит Dashboard
  if (role === 'USER') {
    return <Navigate to="/my-place" replace />;
  }

  // ====== 1) Последние события (берём из уведомлений, как под колокольчиком) ======
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'dashboard', 'last5'],
    queryFn: () => fetchNotifications(5),
    enabled: !!profile,
    refetchInterval: 60_000,
  });

  const notifications = (notificationsQuery.data ?? []) as Notification[];

  // ====== 2) Мини-статистика для админа ======
  const usersCountQuery = useQuery({
    queryKey: ['dashboard', 'counts', 'users'],
    queryFn: async () => {
      // @ts-ignore
      const res = await fetchUsers({ page: 1, take: 1 });
      return res as AnyResponse;
    },
    enabled: !!profile && isAdmin,
    refetchInterval: 60_000,
  });

  const workplacesCountQuery = useQuery({
    queryKey: ['dashboard', 'counts', 'workplaces'],
    queryFn: async () => {
      // @ts-ignore
      const res = await fetchWorkplaces({ page: 1, take: 1 });
      return res as AnyResponse;
    },
    enabled: !!profile && isAdmin,
    refetchInterval: 60_000,
  });

  const activeAssignmentsCountQuery = useQuery({
    queryKey: ['dashboard', 'counts', 'assignments', 'active'],
    queryFn: async () => {
      try {
        // @ts-ignore
        const res = await fetchAssignments({
          page: 1,
          take: 1,
          status: 'ACTIVE',
        });
        return res as AnyResponse;
      } catch {
        // @ts-ignore
        const res = await fetchAssignments({
          page: 1,
          take: 1,
          filter: { status: 'ACTIVE' },
        });
        return res as AnyResponse;
      }
    },
    enabled: !!profile && isAdmin,
    refetchInterval: 60_000,
  });

  const usersCount = getTotal(usersCountQuery.data);
  const workplacesCount = getTotal(workplacesCountQuery.data);
  const activeAssignmentsCount = getTotal(activeAssignmentsCountQuery.data);

  // ====== 3) Feed для MANAGER (как было) ======
  const feedQuery = useQuery({
    queryKey: [
      'feed',
      isAdmin ? 'admin' : 'recent',
      role,
      profile?.org?.id ?? null,
      user?.id ?? null,
    ],
    queryFn: () => {
      const take = 10;

      if (isAdmin) {
        return fetchAdminFeed({ take });
      }

      return fetchRecentFeed({ take });
    },
    enabled: !!profile && !isAdmin,
    refetchInterval: 60_000,
  });

  const feedItems = (feedQuery.data ?? []) as FeedItem[];

  const getNotificationView = (n: Notification): NotificationView => {
    const createdAt = dayjs((n as any).createdAt).format('DD.MM.YYYY HH:mm');

    const type: string = (n as any).type ?? '';
    const payload: any = (n as any).payload ?? {};

    const employeeName: string =
      (payload.userFullName as string | undefined) ??
      (payload.userEmail as string | undefined) ??
      '';

    const workplaceCode: string = (payload.workplaceCode as string | undefined) ?? '';
    const workplaceName: string = (payload.workplaceName as string | undefined) ?? '';
    const workplaceLabel = [workplaceCode, workplaceName].filter(Boolean).join(' — ');

    const whoAndWhere = [employeeName, workplaceLabel].filter(Boolean).join(' — ');

    // если у бэка уже есть title/body — используем как fallback
    const fallbackTitle: string =
      (n as any).title ?? t('notifications.generic', 'Уведомление');
    const fallbackBody: string | undefined = (n as any).body ?? undefined;

    // Заголовки по типам, чтобы не было “пустых дат”
    let title = fallbackTitle;

    if (type === 'ASSIGNMENT_CREATED') {
      title = t('notifications.assignmentCreatedShort', 'Новое назначение');
    } else if (type === 'ASSIGNMENT_MOVED') {
      title = t('notifications.assignmentMovedShort', 'Назначение изменено');
    } else if (type === 'ASSIGNMENT_CANCELLED') {
      title = t('notifications.assignmentCancelledShort', 'Назначение отменено');
    } else if (type === 'ASSIGNMENT_UPDATED') {
      const adjustmentType: string | undefined = payload.adjustmentType ?? undefined;

      if (adjustmentType === 'REQUESTED') {
        title = t(
          'notifications.scheduleCorrectionRequestedShort',
          'Запрос на корректировку графика',
        );
      } else if (adjustmentType === 'APPROVED') {
        title = t(
          'notifications.scheduleCorrectionApprovedShort',
          'Корректировка графика одобрена',
        );
      } else if (adjustmentType === 'REJECTED') {
        title = t(
          'notifications.scheduleCorrectionRejectedShort',
          'Корректировка графика отклонена',
        );
      } else {
        title = t('notifications.assignmentUpdatedShort', 'Назначение обновлено');
      }
    }

    // Куда вести при клике
    let targetPath: string | null = null;
    if (type.startsWith('ASSIGNMENT_')) targetPath = '/assignments';
    else if (type.startsWith('WORKPLACE_')) targetPath = '/workplaces';
    else if (type.startsWith('USER_')) targetPath = '/users';

    const description =
      whoAndWhere || fallbackBody || null;

    return { title, description, createdAt, targetPath };
  };

  const renderNotification = (n: Notification) => {
    const view = getNotificationView(n);

    return (
      <List.Item
        key={(n as any).id}
        style={{ cursor: view.targetPath ? 'pointer' : 'default' }}
        onClick={() => {
          if (view.targetPath) navigate(view.targetPath);
        }}
      >
        <List.Item.Meta
          title={<Typography.Text strong>{view.title}</Typography.Text>}
          description={
            <Flex vertical gap={4}>
              {view.description ? (
                <Typography.Text type="secondary">{view.description}</Typography.Text>
              ) : null}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {view.createdAt}
              </Typography.Text>
            </Flex>
          }
        />
      </List.Item>
    );
  };

  const renderFeedItem = (item: FeedItem) => {
    const date = dayjs(item.at).format('DD.MM.YYYY HH:mm');

    if (item.type === 'assignment') {
      const action = item.meta.action ?? 'updated';
      const workplace = item.meta.workplace;
      const workplaceTitle = workplace
        ? `${workplace.code ? `${workplace.code} — ` : ''}${workplace.name}`
        : '';
      const userName = item.meta.user?.fullName ?? item.meta.user?.email ?? undefined;

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
                  <Typography.Text type="secondary">{workplaceTitle}</Typography.Text>
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

    return (
      <List.Item key={`${item.type}-${item.meta.id}-${item.at}`}>
        <List.Item.Meta
          title={t(`dashboard.feed.workplace.${action}` as const, { workplace: title })}
          description={
            <Flex vertical gap={4}>
              {title ? <Typography.Text>{title}</Typography.Text> : null}
              <Typography.Text type="secondary">{date}</Typography.Text>
            </Flex>
          }
        />
      </List.Item>
    );
  };

  if (!profile) {
    return (
      <Flex justify="center" align="center" className="min-h-[40vh]">
        <Spin tip={t('common.loading')} />
      </Flex>
    );
  }

  const name = safeName(profile as any, role);

  const clickableCardStyle: React.CSSProperties = {
    cursor: 'pointer',
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: 28,
    lineHeight: '32px',
    fontWeight: 600,
  };

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2}>
        {t('dashboard.greeting', { name })}
      </Typography.Title>

      {/* ===== ADMIN: 3 цифры + последние 5 событий ===== */}
      {isAdmin ? (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card
                title={t('dashboard.activeAssignments', 'Активные назначения')}
                style={clickableCardStyle}
                hoverable
                onClick={() => navigate('/assignments')}
                extra={<RightOutlined />}
              >
                {activeAssignmentsCountQuery.isLoading ? (
                  <Flex justify="center" className="py-6">
                    <Spin />
                  </Flex>
                ) : (
                  <Statistic value={activeAssignmentsCount} valueStyle={statValueStyle} />
                )}
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card
                title={t('dashboard.usersCount', 'Сотрудники')}
                style={clickableCardStyle}
                hoverable
                onClick={() => navigate('/users')}
                extra={<RightOutlined />}
              >
                {usersCountQuery.isLoading ? (
                  <Flex justify="center" className="py-6">
                    <Spin />
                  </Flex>
                ) : (
                  <Statistic value={usersCount} valueStyle={statValueStyle} />
                )}
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card
                title={t('dashboard.workplacesCount', 'Рабочие места')}
                style={clickableCardStyle}
                hoverable
                onClick={() => navigate('/workplaces')}
                extra={<RightOutlined />}
              >
                {workplacesCountQuery.isLoading ? (
                  <Flex justify="center" className="py-6">
                    <Spin />
                  </Flex>
                ) : (
                  <Statistic value={workplacesCount} valueStyle={statValueStyle} />
                )}
              </Card>
            </Col>
          </Row>

          <Card title={t('dashboard.lastChanges', 'Последние события')}>
            {notificationsQuery.isLoading ? (
              <Flex justify="center" className="py-8">
                <Spin />
              </Flex>
            ) : notifications.length === 0 ? (
              <Typography.Text type="secondary">
                {t('dashboard.noFeed', 'Событий пока нет')}
              </Typography.Text>
            ) : (
              <List dataSource={notifications} renderItem={renderNotification} split />
            )}
          </Card>
        </>
      ) : (
        <>
          {/* MANAGER: оставляем как было у тебя (фид/прочие блоки) */}
          <Card title={t('dashboard.feedTitle', 'Лента')}>
            {feedQuery.isLoading ? (
              <Flex justify="center" className="py-8">
                <Spin />
              </Flex>
            ) : feedItems.length === 0 ? (
              <Typography.Text type="secondary">
                {t('dashboard.noFeed', 'Событий пока нет')}
              </Typography.Text>
            ) : (
              <List dataSource={feedItems} renderItem={renderFeedItem} split />
            )}
          </Card>
        </>
      )}
    </Flex>
  );
};

export default Dashboard;