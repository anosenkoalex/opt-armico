import { useQuery } from '@tanstack/react-query';
import { Table, Typography, Spin, Flex } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { Assignment, fetchAssignments } from '../api/client.js';

const Assignments = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery<Assignment[]>({
    queryKey: ['assignments'],
    queryFn: fetchAssignments,
    staleTime: 30000,
  });

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      hour12: false,
    });

  const columns: ColumnsType<Assignment> = [
    {
      title: t('assignments.user'),
      dataIndex: ['user', 'email'],
      key: 'user',
      render: (_value, record) => record.user?.email ?? '—',
    },
    {
      title: t('assignments.workplace'),
      dataIndex: ['workplace', 'name'],
      key: 'workplace',
      render: (_value, record) => record.workplace?.name ?? '—',
    },
    {
      title: t('assignments.timeframe'),
      key: 'timeframe',
      render: (_value, record) =>
        `${formatDateTime(record.startsAt)} → ${formatDateTime(record.endsAt)}`,
    },
  ];

  if (isLoading) {
    return (
      <Flex justify="center" align="center" className="min-h-[40vh]">
        <Spin tip={t('common.loading')} />
      </Flex>
    );
  }

  if (isError || !data) {
    return <Typography.Text type="danger">{t('common.error')}</Typography.Text>;
  }

  return (
    <div>
      <Typography.Title level={3}>{t('assignments.title')}</Typography.Title>
      <Table
        rowKey="id"
        dataSource={data}
        columns={columns}
        locale={{ emptyText: t('assignments.empty') }}
        pagination={false}
      />
    </div>
  );
};

export default Assignments;
