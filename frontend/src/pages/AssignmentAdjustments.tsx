import {
  Button,
  Card,
  Result,
  Space,
  Table,
  Tag,
  Typography,
  Select,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';

import {
  ScheduleAdjustment,
  ScheduleAdjustmentStatus,
  fetchScheduleAdjustments,
  approveScheduleAdjustment,
  rejectScheduleAdjustment,
} from '../api/client.js';

import { useAuth } from '../context/AuthContext.js';

const statusColor: Record<ScheduleAdjustmentStatus, string> = {
  PENDING: 'blue',
  APPROVED: 'green',
  REJECTED: 'red',
};

const AssignmentAdjustmentsPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  const canManage = isAdmin || isManager;

  const [statusFilter, setStatusFilter] = useState<
    ScheduleAdjustmentStatus | 'ALL'
  >('PENDING');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const adjustmentsQuery = useQuery({
    queryKey: ['schedule-adjustments', { statusFilter, page, pageSize }],
    queryFn: () =>
      fetchScheduleAdjustments({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        page,
        pageSize,
      }),
    enabled: canManage,
    keepPreviousData: true,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveScheduleAdjustment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedule-adjustments'] });
      message.success('Запрос корректировки одобрен');
    },
    onError: (error: unknown) => {
      const axiosError = error as AxiosError<{ message?: string }>;
      message.error(axiosError?.response?.data?.message || 'Ошибка');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectScheduleAdjustment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedule-adjustments'] });
      message.success('Запрос корректировки отклонён');
    },
    onError: (error: unknown) => {
      const axiosError = error as AxiosError<{ message?: string }>;
      message.error(axiosError?.response?.data?.message || 'Ошибка');
    },
  });

  const items = adjustmentsQuery.data?.items ?? [];
  const total = adjustmentsQuery.data?.total ?? 0;

  const columns: ColumnsType<ScheduleAdjustment> = useMemo(
    () => [
      {
        title: 'Создан',
        dataIndex: 'createdAt',
        responsive: ['md'],
        render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm'),
      },
      {
        title: 'Сотрудник',
        render: (_, record) =>
          record.user?.fullName ?? record.user?.email ?? '—',
      },
      {
        title: 'Место',
        responsive: ['md'],
        render: (_, record) => {
          const wp = record.assignment?.workplace;
          if (!wp) return '—';
          return wp.code ? `${wp.code} — ${wp.name}` : wp.name;
        },
      },
      {
        title: 'Дата',
        dataIndex: 'date',
        render: (value) => dayjs(value).format('DD.MM.YYYY'),
      },
      {
        title: 'Время / тип',
        responsive: ['md'],
        render: (_, record) => {
          const start = record.startsAt
            ? dayjs(record.startsAt).format('HH:mm')
            : null;
          const end = record.endsAt
            ? dayjs(record.endsAt).format('HH:mm')
            : null;

          const time =
            start && end ? `${start} → ${end}` : 'Без времени';

          const type =
            record.kind === 'DAY_OFF'
              ? 'Day Off'
              : record.kind === 'OFFICE'
              ? 'Офис'
              : record.kind === 'REMOTE'
              ? 'Удалёнка'
              : 'Обычная';

          return `${time} (${type})`;
        },
      },
      {
        title: 'Комментарий',
        dataIndex: 'comment',
        responsive: ['lg'],
        render: (v) => v || '—',
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        render: (v: ScheduleAdjustmentStatus) => (
          <Tag color={statusColor[v]}>
            {v === 'PENDING'
              ? 'Ожидание'
              : v === 'APPROVED'
              ? 'Одобрено'
              : 'Отклонено'}
          </Tag>
        ),
      },
      {
        title: 'Действия',
        render: (_, record) => {
          const pending = record.status === 'PENDING';

          return (
            <Space wrap>
              <Button
                type="link"
                disabled={!pending}
                onClick={() => approveMutation.mutate(record.id)}
              >
                Одобрить
              </Button>
              <Button
                type="link"
                danger
                disabled={!pending}
                onClick={() => rejectMutation.mutate(record.id)}
              >
                Отклонить
              </Button>
            </Space>
          );
        },
      },
    ],
    [approveMutation.isPending, rejectMutation.isPending],
  );

  if (!canManage) {
    return <Result status="403" title="Нет доступа" />;
  }

  return (
    <Card
      title="Запросы корректировок"
      bodyStyle={{ padding: 12 }}
      extra={
        <Space wrap>
          <Typography.Text>Статус:</Typography.Text>
          <Select
            value={statusFilter}
            style={{ minWidth: 160 }}
            onChange={(v) => {
              setStatusFilter(v as any);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Все' },
              { value: 'PENDING', label: 'Ожидание' },
              { value: 'APPROVED', label: 'Одобрено' },
              { value: 'REJECTED', label: 'Отклонено' },
            ]}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        dataSource={items}
        columns={columns}
        loading={adjustmentsQuery.isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
      />
    </Card>
  );
};

export default AssignmentAdjustmentsPage;