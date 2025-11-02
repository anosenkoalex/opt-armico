import {
  Card,
  DatePicker,
  Flex,
  Result,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { MatrixRowByOrgs, MatrixRowByUsers, MatrixSlot, fetchMatrix } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { RangePicker } = DatePicker;

type Mode = 'byUsers' | 'byOrgs';

type PlannerRow = {
  key: string;
  title: string;
  subtitle: string;
  slots: MatrixSlot[];
};

const PlannerPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('byUsers');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ['matrix', mode, page, range[0]?.toISOString(), range[1]?.toISOString()],
    queryFn: async () =>
      fetchMatrix({
        mode,
        page,
        pageSize,
        dateFrom: range[0].startOf('day').toISOString(),
        dateTo: range[1].endOf('day').toISOString(),
      }),
    keepPreviousData: true,
  });

  if (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  const dataSource = useMemo<PlannerRow[]>(() => {
    if (!query.data) {
      return [];
    }

    if (query.data.mode === 'byUsers') {
      return query.data.rows.map((row: MatrixRowByUsers) => ({
        key: row.user.id,
        title: row.user.fullName ?? row.user.email,
        subtitle: row.user.position ?? '',
        slots: row.slots,
      }));
    }

    return query.data.rows.map((row: MatrixRowByOrgs) => ({
      key: row.org.id,
      title: `${row.org.slug.toUpperCase()} — ${row.org.name}`,
      subtitle: '',
      slots: row.slots,
    }));
  }, [query.data]);

  const columns = useMemo<ColumnsType<PlannerRow>>(
    () => [
      {
        title: mode === 'byUsers' ? t('planner.columns.employee') : t('planner.columns.org'),
        dataIndex: 'title',
        key: 'title',
        render: (_value, record) => (
          <Flex vertical gap={4}>
            <Typography.Text strong>{record.title}</Typography.Text>
            {record.subtitle ? (
              <Typography.Text type="secondary">{record.subtitle}</Typography.Text>
            ) : null}
          </Flex>
        ),
        width: '20%',
      },
      {
        title: t('planner.columns.slots'),
        dataIndex: 'slots',
        key: 'slots',
        render: (_value, record) => (
          <Flex gap={8} wrap>
            {record.slots.map((slot) => {
              const label = slot.org?.slug
                ? slot.org.slug.toUpperCase()
                : slot.plan?.name ?? '';
              const secondary =
                mode === 'byUsers'
                  ? slot.plan?.name ?? slot.org?.name ?? ''
                  : slot.user?.fullName ?? slot.user?.email ?? '';

              return (
                <Tag key={slot.id} color="blue">
                  <Flex vertical>
                    <Typography.Text strong>{label}</Typography.Text>
                    <Typography.Text type="secondary">
                      {dayjs(slot.dateStart).format('DD.MM')} — {dayjs(slot.dateEnd).format('DD.MM')}
                    </Typography.Text>
                    {secondary ? (
                      <Typography.Text type="secondary">{secondary}</Typography.Text>
                    ) : null}
                  </Flex>
                </Tag>
              );
            })}
            {record.slots.length === 0 && (
              <Typography.Text type="secondary">
                {t('planner.noSlots')}
              </Typography.Text>
            )}
          </Flex>
        ),
      },
    ],
    [mode, t],
  );

  const legend = useMemo(() => {
    if (!query.data) {
      return [];
    }

    const slots = query.data.mode === 'byUsers'
      ? query.data.rows.flatMap((row) => row.slots)
      : query.data.rows.flatMap((row) => row.slots);

    const unique = Array.from(
      new Map(
        slots
          .filter((slot) => slot.org?.slug)
          .map((slot) => [slot.org!.slug.toUpperCase(), slot.org?.name ?? ''] as [string, string]),
      ).entries(),
    );

    return unique;
  }, [query.data]);

  return (
    <Flex vertical gap={16}>
      <Card>
        <Flex gap={12} align="center" wrap>
          <Select
            value={mode}
            onChange={(value: Mode) => {
              setMode(value);
              setPage(1);
            }}
            options={[
              { value: 'byUsers', label: t('planner.mode.users') },
              { value: 'byOrgs', label: t('planner.mode.orgs') },
            ]}
          />
          <RangePicker
            value={range}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) {
                return;
              }
              setRange([value[0], value[1]]);
              setPage(1);
            }}
            allowClear={false}
            format="DD.MM.YYYY"
          />
          {query.isFetching && <Spin size="small" />}
        </Flex>
      </Card>

      <Card>
        <Table
          rowKey="key"
          loading={query.isLoading}
          columns={columns}
          dataSource={dataSource}
          pagination={{
            current: page,
            pageSize,
            total: query.data?.total ?? 0,
            onChange: (nextPage) => setPage(nextPage),
          }}
        />
      </Card>

      {legend.length > 0 ? (
        <Card title={t('planner.legendTitle')}>
          <Flex gap={8} wrap>
            {legend.map(([code, name]) => (
              <Tag key={code} color="blue">
                <Flex gap={4} align="center">
                  <Typography.Text strong>{code}</Typography.Text>
                  <Typography.Text type="secondary">{name}</Typography.Text>
                </Flex>
              </Tag>
            ))}
          </Flex>
        </Card>
      ) : null}
    </Flex>
  );
};

export default PlannerPage;
