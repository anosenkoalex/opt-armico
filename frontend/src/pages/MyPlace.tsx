import { Card, Descriptions, Flex, Result, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Assignment, fetchCurrentWorkplace } from '../api/client.js';

const MyPlace = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery<Assignment | null>({
    queryKey: ['me', 'current-workplace'],
    queryFn: fetchCurrentWorkplace,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Flex justify="center" align="center" className="min-h-[40vh]">
        <Spin tip={t('common.loading')} />
      </Flex>
    );
  }

  if (isError) {
    return <Typography.Text type="danger">{t('common.error')}</Typography.Text>;
  }

  if (!data) {
    return (
      <Result status="info" title={t('myPlace.noAssignment')} />
    );
  }

  return (
    <Card title={t('myPlace.title')}>
      <Descriptions column={1} bordered>
        <Descriptions.Item label={t('assignments.workplace')}>
          {data.workplace?.name}
        </Descriptions.Item>
        <Descriptions.Item label={t('workplaces.address')}>
          {data.workplace?.address}
        </Descriptions.Item>
        <Descriptions.Item label={t('myPlace.startsAt')}>
          {new Date(data.startsAt).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label={t('myPlace.endsAt')}>
          {new Date(data.endsAt).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default MyPlace;
