import { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Result,
  Modal,
  message,
  Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  ScheduleAdjustment,
  ScheduleAdjustmentStatus,
  fetchScheduleAdjustments,
  approveScheduleAdjustment,
  rejectScheduleAdjustment,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const statusColors: Record<ScheduleAdjustmentStatus, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
};

type ScheduleAdjustmentsQueryResult = {
  items: ScheduleAdjustment[];
  total: number;
  page: number;
  pageSize: number;
  data: ScheduleAdjustment[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
};

const ScheduleAdjustmentsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  const canManage = isAdmin || isManager;

  const [statusFilter, setStatusFilter] = useState<
    ScheduleAdjustmentStatus | undefined
  >('PENDING');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const adjustmentsQuery = useQuery<ScheduleAdjustmentsQueryResult>({
    queryKey: ['schedule-adjustments', { page, pageSize, status: statusFilter }],
    queryFn: () =>
      fetchScheduleAdjustments({
        page,
        pageSize,
        status: statusFilter,
      }),
    enabled: canManage,
    keepPreviousData: true,
  });

  const approveMutation = useMutation({
    mutationFn: ({
      id,
      managerComment,
    }: {
      id: string;
      managerComment?: string;
    }) => approveScheduleAdjustment(id, { managerComment }),
    onSuccess: () => {
      message.success(
        t('scheduleAdjustments.approved', 'Запрос корректировки одобрен'),
      );
      void queryClient.invalidateQueries({ queryKey: ['schedule-adjustments'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => {
      console.error('approveScheduleAdjustment error', error);
      message.error(
        t(
          'scheduleAdjustments.approveError',
          'Не удалось одобрить запрос корректировки',
        ),
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      id,
      managerComment,
    }: {
      id: string;
      managerComment?: string;
    }) => rejectScheduleAdjustment(id, { managerComment }),
    onSuccess: () => {
      message.success(
        t('scheduleAdjustments.rejected', 'Запрос корректировки отклонён'),
      );
      void queryClient.invalidateQueries({ queryKey: ['schedule-adjustments'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => {
      console.error('rejectScheduleAdjustment error', error);
      message.error(
        t(
          'scheduleAdjustments.rejectError',
          'Не удалось отклонить запрос корректировки',
        ),
      );
    },
  });

  const adjustments: ScheduleAdjustment[] = useMemo(
    () => adjustmentsQuery.data?.items ?? [],
    [adjustmentsQuery.data],
  );

  const pagination = useMemo(
    () => ({
      current: adjustmentsQuery.data?.page ?? page,
      pageSize: adjustmentsQuery.data?.pageSize ?? pageSize,
      total: adjustmentsQuery.data?.total ?? 0,
    }),
    [adjustmentsQuery.data, page, pageSize],
  );

  const getShiftKindLabel = (kind: string | null | undefined) => {
    if (!kind || kind === 'DEFAULT') {
      return t('assignments.shiftKind.default', 'Обычная смена');
    }
    if (kind === 'OFFICE') {
      return t('assignments.shiftKind.office', 'Офис');
    }
    if (kind === 'REMOTE') {
      return t('assignments.shiftKind.remote', 'Удалёнка');
    }
    if (kind === 'DAY_OFF') {
      return t('assignments.shiftKind.dayOff', 'Day off / больничный');
    }
    return kind;
  };

  const columns: ColumnsType<ScheduleAdjustment> = [
    {
      title: t('scheduleAdjustments.createdAt', 'Создано'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm'),
      width: 150,
    },
    {
      title: t('scheduleAdjustments.user', 'Сотрудник'),
      dataIndex: ['user', 'email'],
      key: 'user',
      render: (_: unknown, record: ScheduleAdjustment) => {
        const name = record.user?.fullName || record.user?.email || '';
        return <span>{name}</span>;
      },
      width: 200,
    },
    {
      title: t('scheduleAdjustments.workplace', 'Рабочее место'),
      dataIndex: ['assignment', 'workplace', 'name'],
      key: 'workplace',
      render: (_: unknown, record: ScheduleAdjustment) => {
        const wp = record.assignment?.workplace;
        if (!wp) return '-';
        return <span>{wp.code ? `${wp.code} — ${wp.name}` : wp.name}</span>;
      },
      width: 220,
    },
    {
      title: t('scheduleAdjustments.date', 'Дата / время / тип'),
      key: 'date',
      render: (_: unknown, record: ScheduleAdjustment) => {
        const dateLabel = dayjs(record.date).format('DD.MM.YYYY');
        const timeLabel =
          record.startsAt && record.endsAt
            ? `${dayjs(record.startsAt).format('HH:mm')} → ${dayjs(
                record.endsAt,
              ).format('HH:mm')}`
            : t('scheduleAdjustments.timeNotSet', 'Время не указано');

        const kindLabel = getShiftKindLabel(record.kind);

        return (
          <Space direction="vertical" size={0}>
            <span>{dateLabel}</span>
            <span>{timeLabel}</span>
            <span style={{ fontSize: 12, color: '#888' }}>{kindLabel}</span>
          </Space>
        );
      },
      width: 220,
    },
    {
      title: t('scheduleAdjustments.comment', 'Комментарий сотрудника'),
      dataIndex: 'comment',
      key: 'comment',
      render: (value: string) => value || '-',
      width: 280,
    },
    {
      title: t('scheduleAdjustments.status', 'Статус'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ScheduleAdjustmentStatus) => (
        <Tag color={statusColors[value]}>
          {value === 'PENDING' &&
            t('scheduleAdjustments.status.pending', 'Ожидает решения')}
          {value === 'APPROVED' &&
            t('scheduleAdjustments.status.approved', 'Одобрено')}
          {value === 'REJECTED' &&
            t('scheduleAdjustments.status.rejected', 'Отклонено')}
        </Tag>
      ),
      width: 160,
    },
    {
      title: t('scheduleAdjustments.managerComment', 'Комментарий менеджера'),
      dataIndex: 'managerComment',
      key: 'managerComment',
      render: (value?: string | null) => value || '-',
      width: 240,
    },
    {
      title: t('scheduleAdjustments.actions', 'Действия'),
      key: 'actions',
      render: (_: unknown, record: ScheduleAdjustment) => {
        if (record.status !== 'PENDING') {
          return null;
        }

        const loading =
          approveMutation.isPending || rejectMutation.isPending;

        return (
          <Space size="small">
            <Button
              type="link"
              onClick={() => {
                Modal.confirm({
                  title: t(
                    'scheduleAdjustments.approveConfirmTitle',
                    'Одобрить запрос корректировки?',
                  ),
                  content: t(
                    'scheduleAdjustments.approveConfirmContent',
                    'Будет применена корректировка графика для этого назначения.',
                  ),
                  okText: t('scheduleAdjustments.approve', 'Одобрить'),
                  cancelText: t('common.cancel', 'Отмена'),
                  centered: true,
                  onOk: () =>
                    approveMutation
                      .mutateAsync({
                        id: record.id,
                        managerComment: undefined,
                      })
                      .catch(() => undefined),
                });
              }}
              loading={loading}
            >
              {t('scheduleAdjustments.approve', 'Одобрить')}
            </Button>
            <Button
              type="link"
              danger
              onClick={() => {
                Modal.confirm({
                  title: t(
                    'scheduleAdjustments.rejectConfirmTitle',
                    'Отклонить запрос корректировки?',
                  ),
                  content: t(
                    'scheduleAdjustments.rejectConfirmContent',
                    'Сотрудник увидит, что запрос отклонён.',
                  ),
                  okText: t('scheduleAdjustments.reject', 'Отклонить'),
                  cancelText: t('common.cancel', 'Отмена'),
                  centered: true,
                  onOk: () =>
                    rejectMutation
                      .mutateAsync({
                        id: record.id,
                        managerComment: undefined,
                      })
                      .catch(() => undefined),
                });
              }}
              loading={loading}
            >
              {t('scheduleAdjustments.reject', 'Отклонить')}
            </Button>
          </Space>
        );
      },
      width: 200,
    },
  ];

  if (!canManage) {
    return (
      <Result
        status="403"
        title={t('admin.accessDenied', 'Доступ запрещён')}
      />
    );
  }

  return (
    <Card
      title={t(
        'scheduleAdjustments.title',
        'Запросы на корректировку расписания',
      )}
      extra={
        <Space>
          <Select
            style={{ width: 220 }}
            value={statusFilter}
            allowClear
            placeholder={t(
              'scheduleAdjustments.filterByStatus',
              'Фильтр по статусу',
            )}
            onChange={(value) => {
              setStatusFilter(value as ScheduleAdjustmentStatus | undefined);
              setPage(1);
            }}
            options={[
              {
                value: 'PENDING',
                label: t(
                  'scheduleAdjustments.status.pending',
                  'Ожидает решения',
                ),
              },
              {
                value: 'APPROVED',
                label: t(
                  'scheduleAdjustments.status.approved',
                  'Одобрено',
                ),
              },
              {
                value: 'REJECTED',
                label: t(
                  'scheduleAdjustments.status.rejected',
                  'Отклонено',
                ),
              },
            ]}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        dataSource={adjustments}
        columns={columns}
        loading={adjustmentsQuery.isLoading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize ?? pageSize);
          },
          showSizeChanger: true,
        }}
        scroll={{ x: 1200 }}
      />
    </Card>
  );
};

export default ScheduleAdjustmentsPage;