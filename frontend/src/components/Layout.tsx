import { BellOutlined } from '@ant-design/icons';
import {
  Badge,
  Button,
  Dropdown,
  Layout,
  Menu,
  Skeleton,
  Space,
  Spin,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchNotifications } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { Header, Sider, Content } = Layout;

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { logout, user, profile, isFetchingProfile } = useAuth();

  const navigationItems = useMemo(() => {
    const isAdmin = user?.role === 'SUPER_ADMIN';
    const isWorker = user?.role === 'USER';
    const isDevUser = user?.email === 'dev@armico.local';

    const items = [
      {
        key: 'dashboard',
        path: '/dashboard',
        label: t('layout.dashboard'),
      },
    ];

    if (isWorker) {
      items.push({
        key: 'my-place',
        path: '/my-place',
        label: t('layout.mySchedule'),
      });
    }

    if (isAdmin) {
      items.push(
        {
          key: 'assignments',
          path: '/assignments',
          label: t('layout.assignments'),
        },
        {
          key: 'planner',
          path: '/planner',
          label: t('layout.planner'),
        },
        {
          key: 'workplaces',
          path: '/workplaces',
          label: t('layout.workplaces'),
        },
        {
          key: 'users',
          path: '/users',
          label: t('layout.users'),
        },
        {
          key: 'statistics',
          path: '/statistics',
          label: t('layout.statistics'),
        },
      );
    }

    // Dev-панель только для dev@armico.local
    if (isDevUser) {
      items.push({
        key: 'dev',
        path: '/dev',
        label: 'Developer console',
      });
    }

    return items;
  }, [user?.role, user?.email, t]);

  const selectedKey = useMemo(() => {
    const match = navigationItems.find((item) =>
      item.path === '/dashboard'
        ? location.pathname === '/dashboard'
        : location.pathname.startsWith(item.path),
    );
    return match?.key ?? navigationItems[0]?.key ?? '';
  }, [location.pathname, navigationItems]);

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'me'],
    queryFn: () => fetchNotifications(10),
    refetchInterval: 60_000,
  });

  const notifications = notificationsQuery.data ?? [];

  const notificationsOverlay = (
    <div className="w-96 max-h-80 bg-white rounded-lg shadow-lg px-4 py-3 overflow-y-auto">
      <Typography.Title level={5} style={{ marginBottom: 8 }}>
        {t('notifications.title', 'Уведомления')}
      </Typography.Title>

      {notificationsQuery.isLoading ? (
        <Typography.Text type="secondary">
          {t('common.loading')}
        </Typography.Text>
      ) : notifications.length === 0 ? (
        <Typography.Text type="secondary">
          {t('notifications.empty')}
        </Typography.Text>
      ) : (
        notifications.map((item) => {
          const createdAt = dayjs(item.createdAt).format('DD.MM.YYYY HH:mm');

          const employeeName =
            (item.payload?.userFullName as string | undefined) ??
            (item.payload?.userEmail as string | undefined) ??
            '';

          const workplaceCode =
            (item.payload?.workplaceCode as string | undefined) ?? '';
          const workplaceName =
            (item.payload?.workplaceName as string | undefined) ?? '';

          const workplaceLabel = [workplaceCode, workplaceName]
            .filter(Boolean)
            .join(' — ');

          let title = '';
          let description: string | null = null;

          // Базовые типы уведомлений по назначениям
          if (item.type === 'ASSIGNMENT_CREATED') {
            title = t(
              'notifications.assignmentCreatedShort',
              'Новое назначение',
            );
          } else if (item.type === 'ASSIGNMENT_MOVED') {
            title = t(
              'notifications.assignmentMovedShort',
              'Назначение изменено',
            );
          } else if (item.type === 'ASSIGNMENT_CANCELLED') {
            title = t(
              'notifications.assignmentCancelledShort',
              'Назначение отменено',
            );
          } else if (item.type === 'ASSIGNMENT_UPDATED') {
            title = t(
              'notifications.assignmentUpdatedShort',
              'Назначение обновлено',
            );
          }
          // Заложка под будущие уведомления по корректировкам графика
          else if (item.type === 'SCHEDULE_CORRECTION_REQUESTED') {
            title = t(
              'notifications.scheduleCorrectionRequestedShort',
              'Запрос на корректировку графика',
            );
          } else if (item.type === 'SCHEDULE_CORRECTION_APPROVED') {
            title = t(
              'notifications.scheduleCorrectionApprovedShort',
              'Корректировка графика одобрена',
            );
          } else if (item.type === 'SCHEDULE_CORRECTION_REJECTED') {
            title = t(
              'notifications.scheduleCorrectionRejectedShort',
              'Корректировка графика отклонена',
            );
          } else {
            // Непонятный тип — просто текст по умолчанию
            title = t('notifications.generic', 'Уведомление');
          }

          const whoAndWhere = [employeeName, workplaceLabel]
            .filter(Boolean)
            .join(' — ');

          description = whoAndWhere || null;

          return (
            <div
              key={item.id}
              className="py-2 border-b last:border-b-0"
              style={{ fontSize: 13 }}
            >
              <Typography.Text strong>{title}</Typography.Text>
              {description && (
                <div>
                  <Typography.Text>{description}</Typography.Text>
                </div>
              )}
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {createdAt}
                </Typography.Text>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <Layout className="min-h-screen">
      <Sider breakpoint="lg">
        <div className="text-white text-lg font-semibold px-4 py-3">
          Armico
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={navigationItems.map((item) => ({
            key: item.key,
            label: item.label,
          }))}
          onClick={(info) => {
            const target = navigationItems.find(
              (item) => item.key === info.key,
            );
            if (target) {
              navigate(target.path);
            }
          }}
        />
      </Sider>
      <Layout>
        <Header className="bg-white px-6 flex items-center justify-between shadow-sm">
          <Space size="middle">
            <Typography.Text className="font-medium">
              {t('layout.welcome')}{' '}
              {profile?.fullName ?? profile?.email ?? ''}
            </Typography.Text>
            {isFetchingProfile && <Spin size="small" />}
          </Space>
          <Space size="large">
            <Dropdown
              trigger={['click']}
              dropdownRender={() => notificationsOverlay}
              placement="bottomRight"
            >
              <Badge
                count={notifications.length}
                overflowCount={99}
                offset={[-4, 4]}
              >
                <Button
                  type="text"
                  shape="circle"
                  icon={<BellOutlined />}
                  aria-label="Notifications"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              </Badge>
            </Dropdown>
            <Button onClick={logout}>{t('layout.logout')}</Button>
          </Space>
        </Header>
        <Content className="p-6 bg-gray-100 min-h-0">
          <div className="bg-white rounded-lg shadow-sm p-6 min-h-[70vh]">
            {isFetchingProfile && !profile ? <Skeleton active /> : <Outlet />}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;