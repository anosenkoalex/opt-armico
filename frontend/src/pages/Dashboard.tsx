import { Button, Empty, Flex, List, Space, Spin, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkplaces, Workplace } from '../api/client.js';
import { useTranslation } from 'react-i18next';

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery<Workplace[]>({
    queryKey: ['workplaces'],
    queryFn: fetchWorkplaces,
  });

  if (isLoading) {
    return (
      <Flex justify="center" align="center" className="min-h-[40vh]">
        <Spin tip={t('common.loading')} />
      </Flex>
    );
  }

  if (isError) {
    return (
      <Typography.Text type="danger">{t('common.error')}</Typography.Text>
    );
  }

  return (
    <Space direction="vertical" className="w-full" size="large">
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} className="!mb-0">
          {t('dashboard.title')}
        </Typography.Title>
        <Space>
          <Button type="primary">{t('dashboard.create')}</Button>
          <Button type="default" onClick={() => navigate('/assignments')}>
            {t('dashboard.assignmentsLink')}
          </Button>
        </Space>
      </Flex>
      {data && data.length > 0 ? (
        <List
          itemLayout="horizontal"
          dataSource={data}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={item.name}
                description={`${t('workplaces.address')}: ${item.address}`}
              />
              <Typography.Text>
                {t('workplaces.capacity')}: {item.capacity}
              </Typography.Text>
            </List.Item>
          )}
        />
      ) : (
        <Empty description={t('dashboard.empty')} />
      )}
    </Space>
  );
};

export default Dashboard;
