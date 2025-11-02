import { Button, Result, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchUsers, type User } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const UsersPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const columns: ColumnsType<User & { key: string }> = useMemo(
    () => [
      {
        title: t('users.fullName'),
        dataIndex: 'fullName',
        key: 'fullName',
        render: (_value, record) => record.fullName ?? '—',
      },
      {
        title: t('users.email'),
        dataIndex: 'email',
        key: 'email',
      },
      {
        title: t('users.role'),
        dataIndex: 'role',
        key: 'role',
        render: (value: User['role']) => t(`users.roles.${value}` as const),
      },
      {
        title: t('users.position'),
        dataIndex: 'position',
        key: 'position',
        render: (_value, record) => record.position ?? '—',
      },
      {
        title: t('users.org'),
        dataIndex: ['org', 'name'],
        key: 'org',
        render: (_value, record) => record.org?.name ?? t('users.noOrg'),
      },
    ],
    [t],
  );

  if (!isAdmin) {
    return (
      <Result status="403" title={t('admin.accessDenied')} />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Typography.Title level={3} className="!mb-0">
          {t('users.title')}
        </Typography.Title>
        <Button type="primary" onClick={() => navigate('/users/create')}>
          {t('users.createAction')}
        </Button>
      </div>
      <Table
        rowKey={(record) => record.id}
        loading={usersQuery.isLoading}
        dataSource={(usersQuery.data ?? []).map((item) => ({ ...item, key: item.id }))}
        columns={columns}
      />
    </div>
  );
};

export default UsersPage;
