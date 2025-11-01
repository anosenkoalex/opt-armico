import { useQuery } from '@tanstack/react-query';
import { Table, Typography, Spin, Flex } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { fetchWorkplaces, Workplace } from '../api/client.js';

const Workplaces = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery<Workplace[]>({
    queryKey: ['workplaces'],
    queryFn: fetchWorkplaces,
    staleTime: 30000,
  });

  const columns: ColumnsType<Workplace> = [
    {
      title: t('layout.workplaces'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('workplaces.address'),
      dataIndex: 'address',
      key: 'address',
    },
    {
      title: t('workplaces.capacity'),
      dataIndex: 'capacity',
      key: 'capacity',
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
      <Typography.Title level={3}>{t('workplaces.title')}</Typography.Title>
      <Table rowKey="id" dataSource={data} columns={columns} pagination={false} />
    </div>
  );
};

export default Workplaces;
