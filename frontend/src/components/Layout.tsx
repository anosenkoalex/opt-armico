import { useState } from 'react';
import { Layout, Menu, Button, Space, Typography, Select } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: 'dashboard', path: '/', labelKey: 'layout.dashboard' },
  { key: 'workplaces', path: '/workplaces', labelKey: 'layout.workplaces' },
  { key: 'assignments', path: '/assignments', labelKey: 'layout.assignments' },
  { key: 'my-place', path: '/my-place', labelKey: 'layout.myPlace' },
];

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { t, i18n } = useTranslation();
  const { logout, user } = useAuth();

  const selectedKey =
    menuItems.find((item) =>
      item.path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.path),
    )?.key ?? 'dashboard';

  return (
    <Layout className="min-h-screen">
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} breakpoint="lg">
        <div className="text-white text-lg font-semibold px-4 py-3">Armico</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={(info) => {
            const target = menuItems.find((item) => item.key === info.key);
            if (target) {
              navigate(target.path);
            }
          }}
          items={menuItems.map((item) => ({
            key: item.key,
            label: t(item.labelKey),
          }))}
        />
      </Sider>
      <Layout>
        <Header className="bg-white px-6 flex items-center justify-between shadow-sm">
          <Typography.Text className="font-medium">
            {t('layout.welcome')} {user?.email ?? ''}
          </Typography.Text>
          <Space size="middle">
            <Select
              value={i18n.language}
              options={languageOptions}
              aria-label={t('common.language')}
              onChange={(value) => {
                void i18n.changeLanguage(value);
              }}
              style={{ width: 120 }}
            />
            <Button onClick={logout}>{t('layout.logout')}</Button>
          </Space>
        </Header>
        <Content className="p-6 bg-gray-100 min-h-0">
          <div className="bg-white rounded-lg shadow-sm p-6 min-h-[70vh]">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
