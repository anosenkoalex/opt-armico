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
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
    const isWorker = user?.role === 'AUDITOR' || user?.role === 'ORG_MANAGER';

    const items = [{
      key: 'dashboard',
      path: '/dashboard',
      label: t('layout.dashboard'),
    }];

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
      );
    }

    return items;
  }, [user?.role, t]);

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
    <div className="w-80 max-h-80 overflow-y-auto px-3 py-2">
      {notifications.length === 0 ? (
        <Typography.Text type="secondary">
          {t('notifications.empty')}
        </Typography.Text>
      ) : (
        notifications.map((item) => {
          const workplace =
            (item.payload?.workplaceName as string | undefined) ??
            (item.payload?.workplaceCode as string | undefined) ??
            '';
          const date = dayjs(item.createdAt).format('DD.MM.YYYY HH:mm');
          const key =
            item.type === 'ASSIGNMENT_CREATED'
              ? 'notifications.created'
              : 'notifications.updated';

          return (
            <div key={item.id} className="py-2 border-b last:border-none">
              <Typography.Text strong>{t(key, { workplace })}</Typography.Text>
              <div>
                <Typography.Text type="secondary">{date}</Typography.Text>
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
        <div className="text-white text-lg font-semibold px-4 py-3">Armico</div>
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
              {t('layout.welcome')} {profile?.fullName ?? profile?.email ?? ''}
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
                <Button type="text" icon={<BellOutlined />} />
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
