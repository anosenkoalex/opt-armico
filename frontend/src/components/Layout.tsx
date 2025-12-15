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

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'me'],
    queryFn: () => fetchNotifications(10),
    refetchInterval: 60_000,
  });

  const notifications = notificationsQuery.data ?? [];

  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  const isWorker = user?.role === 'USER';
  const isDevUser = user?.email === 'dev@armico.local';

  // 👇 НЕ ПОКАЗЫВАЕМ EMAIL ДЛЯ SUPER_ADMIN (и вообще если нет fullName)
  // Для админа без имени показываем "Администратор"
  const displayName = useMemo(() => {
    const fullName = (profile?.fullName ?? '').trim();
    if (fullName) return fullName;

    // если это супер-админ — не светим email
    if (isAdmin) return t('layout.adminFallbackName', 'Администратор');

    // для остальных — можно показывать email (если имени нет)
    return (profile?.email ?? '').trim();
  }, [profile?.fullName, profile?.email, isAdmin, t]);

  // Навигация нужна только для админов/менеджеров/dev
  const navigationItems = useMemo(() => {
    if (!(isAdmin || isManager || isDevUser)) return [];

    const items = [
      {
        key: 'dashboard',
        path: '/dashboard',
        label: t('layout.dashboard'),
      },
    ];

    if (isAdmin || isManager) {
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

    if (isDevUser) {
      items.push({
        key: 'dev',
        path: '/dev',
        label: 'Developer console',
      });
    }

    return items;
  }, [isAdmin, isManager, isDevUser, t]);

  const selectedKey = useMemo(() => {
    if (!navigationItems.length) return '';
    const match = navigationItems.find((item) =>
      item.path === '/dashboard'
        ? location.pathname === '/dashboard'
        : location.pathname.startsWith(item.path),
    );
    return match?.key ?? navigationItems[0]?.key ?? '';
  }, [location.pathname, navigationItems]);

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

          const payload: any = item.payload ?? {};
          const employeeName =
            (payload.userFullName as string | undefined) ??
            (payload.userEmail as string | undefined) ??
            '';

          const workplaceCode =
            (payload.workplaceCode as string | undefined) ?? '';
          const workplaceName =
            (payload.workplaceName as string | undefined) ?? '';

          const workplaceLabel = [workplaceCode, workplaceName]
            .filter(Boolean)
            .join(' — ');

          const adjustmentType =
            (payload.adjustmentType as
              | 'REQUESTED'
              | 'APPROVED'
              | 'REJECTED'
              | undefined) ?? undefined;

          let title = '';
          let description: string | null = null;

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
          } else if (item.type === 'ASSIGNMENT_UPDATED' && adjustmentType) {
            // Специальные заголовки для корректировок графика
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
              title = t(
                'notifications.assignmentUpdatedShort',
                'Назначение обновлено',
              );
            }
          } else if (item.type === 'ASSIGNMENT_UPDATED') {
            title = t(
              'notifications.assignmentUpdatedShort',
              'Назначение обновлено',
            );
          } else {
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

  // ===== ЛЕЙАУТ ДЛЯ РАБОТНИКА (USER): НИКАКОГО МЕНЮ, ТОЛЬКО ОДНА СТРАНИЦА =====
  if (isWorker && !isAdmin && !isManager && !isDevUser) {
    return (
      <Layout className="min-h-screen">
        <Header className="bg-white px-6 flex items-center justify-between shadow-sm">
          <Space size="middle">
            <Typography.Text className="font-medium">
              {t('layout.welcome')}{' '}
              {displayName}
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
    );
  }

  // ===== АДМИН / МЕНЕДЖЕР / DEV — С САЙДБАРОМ, КАК РАНЬШЕ =====
  return (
    <Layout className="min-h-screen">
      <Sider breakpoint="lg">
        <div className="text-white text-lg font-semibold px-4 py-3">
          Grant Thornton
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
              {displayName}
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