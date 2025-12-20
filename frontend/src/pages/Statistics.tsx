import {
  Card,
  DatePicker,
  Form,
  Modal,
  Result,
  Select,
  Table,
  Typography,
  Calendar,
  Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchUsers, fetchStatistics, fetchWorkReports } from '../api/client.js';
import type {
  AssignmentStatus,
  User,
  ShiftKind,
  StatisticsRow,
  StatisticsResponse,
  WorkReport,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { RangePicker } = DatePicker;

type FiltersState = {
  userId?: string;
  workplaceId?: string;
  status?: AssignmentStatus;
  range?: [Dayjs, Dayjs] | null;
  kinds?: ShiftKind[];
};

const statusOptions: AssignmentStatus[] = ['ACTIVE', 'ARCHIVED'];

// Русские названия типов смен
const shiftKindLabels: Record<ShiftKind, string> = {
  DEFAULT: 'Обычная смена',
  OFFICE: 'Офис',
  REMOTE: 'Удалёнка',
  DAY_OFF: 'Выходной / Day off',
};

const shiftKindSelectOptions = (Object.keys(shiftKindLabels) as ShiftKind[]).map(
  (k) => ({
    value: k,
    label: shiftKindLabels[k],
  }),
);

type EmployeeRow = {
  userId: string;
  name: string;
  assignmentsSummary: string;
  workingDays: number;
  totalHours: number;
  /** Суммарные отчётные часы по WorkReport за период */
  reportedHours?: number | null;
};

const StatisticsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const canViewStatistics =
    user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  const defaultRange: [Dayjs, Dayjs] = [
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ];

  const [filters, setFilters] = useState<FiltersState>({
    range: defaultRange,
  });

  const [detailsUserId, setDetailsUserId] = useState<string | null>(null);
  const [detailsUserName, setDetailsUserName] = useState<string>('');

  const [reportUserId, setReportUserId] = useState<string | null>(null);
  const [reportUserName, setReportUserName] = useState<string>('');

  if (!canViewStatistics) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  /* ---------- справочник пользователей ---------- */

  const usersQuery = useQuery<User[]>({
    queryKey: ['users', 'all-for-statistics'],
    queryFn: async () => {
      const res = await fetchUsers({ page: 1, pageSize: 100 });
      return res.data;
    },
    enabled: canViewStatistics,
  });

  const effectiveFrom = filters.range?.[0] ?? defaultRange[0];
  const effectiveTo = filters.range?.[1] ?? defaultRange[1];

  /* ---------- основная статистика ---------- */

  const statisticsQuery = useQuery<StatisticsResponse>({
    queryKey: [
      'statistics',
      {
        userId: filters.userId,
        workplaceId: filters.workplaceId,
        from: effectiveFrom.format('YYYY-MM-DD'),
        to: effectiveTo.format('YYYY-MM-DD'),
      },
    ],
    queryFn: () =>
      fetchStatistics({
        from: effectiveFrom.format('YYYY-MM-DD'),
        to: effectiveTo.format('YYYY-MM-DD'),
        userId: filters.userId,
        workplaceId: filters.workplaceId,
      }),
    keepPreviousData: true,
    enabled: canViewStatistics,
  });

  const statistics = statisticsQuery.data;
  const allRows: StatisticsRow[] = statistics?.rows ?? [];

  // Мапа суммарных отчётных часов по пользователю (backend: StatisticsResponse.byUser[].reportedHour)
  const reportedHoursByUser = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (!statistics?.byUser) return map;
    for (const u of statistics.byUser) {
      map[u.userId] = u.reportedHour ?? null;
    }
    return map;
  }, [statistics]);

  /* ---------- опции рабочих мест для фильтра ---------- */

  const workplaceOptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of allRows) {
      if (!row.workplaceId) continue;
      if (!map[row.workplaceId]) {
        map[row.workplaceId] = row.workplaceName ?? row.workplaceId;
      }
    }
    return Object.entries(map).map(([id, name]) => ({
      value: id,
      label: name,
    }));
  }, [allRows]);

  /* ---------- фильтры по статусу и типу смены (на фронте) ---------- */

  const filteredRows: StatisticsRow[] = useMemo(() => {
    return allRows.filter((row) => {
      if (filters.status && row.assignmentStatus !== filters.status) {
        return false;
      }
      if (
        filters.kinds &&
        filters.kinds.length > 0 &&
        !filters.kinds.includes(row.shiftKind as ShiftKind)
      ) {
        return false;
      }
      return true;
    });
  }, [allRows, filters.status, filters.kinds]);

  /* ---------- агрегат по сотрудникам ---------- */

  const employeesData: EmployeeRow[] = useMemo(() => {
    const byUser: Record<
      string,
      {
        name: string;
        assignments: Record<
          string,
          { workplaceName: string; minDate: string; maxDate: string }
        >;
        daysSet: Set<string>;
        totalHours: number;
      }
    > = {};

    for (const row of filteredRows) {
      const uid = row.userId;
      if (!uid) continue;

      // дата для отображения – считаем от startsAt, а не от row.date,
      // чтобы не ловить сдвиги и странные значения в "date"
      const displayDate = dayjs(row.startsAt ?? row.date).format('YYYY-MM-DD');

      if (!byUser[uid]) {
        byUser[uid] = {
          name: row.userName ?? row.userId,
          assignments: {},
          daysSet: new Set<string>(),
          totalHours: 0,
        };
      }

      const userAgg = byUser[uid];

      // дни
      userAgg.daysSet.add(displayDate);

      // часы
      userAgg.totalHours += row.hours;

      // группируем по рабочему месту: 111 20.11–28.11
      const key = row.workplaceId;
      const workplaceName = row.workplaceName ?? 'Без названия';

      if (!userAgg.assignments[key]) {
        userAgg.assignments[key] = {
          workplaceName,
          minDate: displayDate,
          maxDate: displayDate,
        };
      } else {
        const a = userAgg.assignments[key];
        if (dayjs(displayDate).isBefore(a.minDate)) a.minDate = displayDate;
        if (dayjs(displayDate).isAfter(a.maxDate)) a.maxDate = displayDate;
      }
    }

    return Object.entries(byUser).map(([userId, agg]) => {
      const assignmentsSummary = Object.values(agg.assignments)
        .map((a) => {
          const from = dayjs(a.minDate).format('DD.MM.YYYY');
          const to = dayjs(a.maxDate).format('DD.MM.YYYY');
          return `${a.workplaceName} ${from}–${to}`;
        })
        .join('; ');

      const reported = reportedHoursByUser[userId] ?? null;

      return {
        userId,
        name: agg.name,
        assignmentsSummary,
        workingDays: agg.daysSet.size,
        totalHours: Number(agg.totalHours.toFixed(2)),
        reportedHours: reported,
      };
    });
  }, [filteredRows, reportedHoursByUser]);

  /* ---------- данные для модалки по сотруднику ---------- */

  const detailsRows = useMemo(() => {
    if (!detailsUserId) return [];

    const rows = filteredRows.filter((r) => r.userId === detailsUserId);

    // сначала активные, потом архив
    const statusOrder = (s: AssignmentStatus) => (s === 'ACTIVE' ? 0 : 1);

    return rows.slice().sort((a, b) => {
      // 1) по статусу (ACTIVE сверху)
      const so =
        statusOrder(a.assignmentStatus) - statusOrder(b.assignmentStatus);
      if (so !== 0) return so;

      // 2) по дате (раньше — выше)
      const da = dayjs(a.startsAt ?? a.date);
      const db = dayjs(b.startsAt ?? b.date);
      if (da.isBefore(db)) return -1;
      if (da.isAfter(db)) return 1;

      // 3) по времени внутри дня
      return dayjs(a.startsAt).diff(dayjs(b.startsAt));
    });
  }, [filteredRows, detailsUserId]);

  // Загрузка отчётных часов для выбранного пользователя (для календаря)
  const workReportsQuery = useQuery<WorkReport[]>({
    queryKey: [
      'workReports',
      {
        userId: reportUserId,
        from: effectiveFrom.format('YYYY-MM-DD'),
        to: effectiveTo.format('YYYY-MM-DD'),
      },
    ],
    queryFn: () =>
      fetchWorkReports({
        userId: reportUserId!,
        from: effectiveFrom.format('YYYY-MM-DD'),
        to: effectiveTo.format('YYYY-MM-DD'),
      }),
    enabled: !!reportUserId,
  });

  const workReportsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    if (!workReportsQuery.data) return map;
    for (const wr of workReportsQuery.data) {
      const key = wr.date;
      map[key] = (map[key] ?? 0) + wr.hours;
    }
    return map;
  }, [workReportsQuery.data]);

  const isLoading = statisticsQuery.isLoading || usersQuery.isLoading;

  /* ---------- колонки ---------- */

  const employeesColumns: ColumnsType<EmployeeRow> = [
    {
      title: 'Сотрудник',
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record) => (
        <a
          onClick={() => {
            setDetailsUserId(record.userId);
            setDetailsUserName(record.name);
          }}
        >
          {value}
        </a>
      ),
    },
    {
      title: 'Назначения',
      dataIndex: 'assignmentsSummary',
      key: 'assignmentsSummary',
      ellipsis: true,
    },
    {
      title: 'Рабочих дней',
      dataIndex: 'workingDays',
      key: 'workingDays',
    },
    {
      title: 'Количество часов',
      dataIndex: 'totalHours',
      key: 'totalHours',
      render: (value: number) => value.toFixed(2),
    },
    {
      title: 'Количество отчётных часов',
      dataIndex: 'reportedHours',
      key: 'reportedHours',
      render: (value: number | null | undefined, record) =>
        value != null ? (
          <a
            onClick={() => {
              setReportUserId(record.userId);
              setReportUserName(record.name);
            }}
          >
            {value.toFixed(2)}
          </a>
        ) : (
          '—'
        ),
    },
  ];

  const detailColumns: ColumnsType<StatisticsRow> = [
    {
      title: 'Дата',
      dataIndex: 'date',
      key: 'date',
      render: (_value, record) =>
        dayjs(record.startsAt ?? record.date).format('DD.MM.YYYY'),
    },
    {
      title: 'Рабочее место',
      dataIndex: 'workplaceName',
      key: 'workplaceName',
      render: (value: string | null) => value ?? '',
    },
    {
      title: 'Тип смены',
      dataIndex: 'shiftKind',
      key: 'shiftKind',
      render: (kind: ShiftKind) => shiftKindLabels[kind] ?? kind,
    },
    {
      title: 'Время',
      key: 'time',
      render: (_value, record) =>
        `${dayjs(record.startsAt).format('HH:mm')} → ${dayjs(
          record.endsAt ?? record.startsAt,
        ).format('HH:mm')}`,
    },
    {
      title: 'Статус назначения',
      dataIndex: 'assignmentStatus',
      key: 'assignmentStatus',
      render: (value: AssignmentStatus) =>
        value === 'ACTIVE' ? 'Активно' : 'В архиве',
    },
    {
      title: 'Часы',
      dataIndex: 'hours',
      key: 'hours',
      render: (value: number) => value.toFixed(2),
    },
  ];

  return (
    <Card title="Статистика назначений">
      {/* Фильтры */}
      <Form
        layout="inline"
        className="mb-4"
        initialValues={{ range: defaultRange }}
        onValuesChange={(_changed, allValues) => {
          setFilters({
            userId: allValues.userId,
            workplaceId: allValues.workplaceId,
            status: allValues.status,
            range: allValues.range,
            kinds: allValues.kinds,
          });
        }}
      >
        <Form.Item name="userId" label="Сотрудник">
          <Select
            allowClear
            showSearch
            options={
              usersQuery.data?.map((u) => ({
                value: u.id,
                label: `${u.fullName ?? u.email}`,
              })) ?? []
            }
            placeholder="Сотрудник"
            optionFilterProp="label"
            style={{ width: 260 }}
          />
        </Form.Item>

        <Form.Item name="workplaceId" label="Рабочее место">
          <Select
            allowClear
            showSearch
            options={workplaceOptions}
            placeholder="Рабочее место"
            optionFilterProp="label"
            style={{ width: 260 }}
          />
        </Form.Item>

        <Form.Item name="status" label="Статус">
          <Select
            allowClear
            style={{ width: 180 }}
            options={statusOptions.map((value) => ({
              value,
              label: value === 'ACTIVE' ? 'Активно' : 'В архиве',
            }))}
            placeholder="Любой"
          />
        </Form.Item>

        <Form.Item name="range" label="Период">
          <RangePicker />
        </Form.Item>

        <Form.Item name="kinds" label="Тип смены">
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 220 }}
            options={shiftKindSelectOptions}
            placeholder="Выберите тип смены"
          />
        </Form.Item>
      </Form>

      {/* Список сотрудников */}
      <Table
        rowKey="userId"
        dataSource={employeesData}
        columns={employeesColumns}
        loading={isLoading}
        locale={{
          emptyText: 'Нет данных за выбранный период',
        }}
      />

      {/* Календарь отчётных часов по пользователю */}
      <Modal
        open={!!reportUserId}
        title={
          reportUserName
            ? `Отчётные часы: ${reportUserName}`
            : 'Отчётные часы'
        }
        footer={null}
        width={800}
        onCancel={() => {
          setReportUserId(null);
          setReportUserName('');
        }}
      >
        {!reportUserId ? null : workReportsQuery.isLoading ? (
          <Spin />
        ) : workReportsQuery.data && workReportsQuery.data.length > 0 ? (
          <Calendar
            fullscreen={false}
            dateFullCellRender={(value) => {
              const key = value.format('YYYY-MM-DD');
              const hours = workReportsByDate[key];
              const outOfRange =
                value.isBefore(effectiveFrom, 'day') ||
                value.isAfter(effectiveTo, 'day');

              return (
                <div
                  style={{
                    textAlign: 'center',
                    opacity: outOfRange ? 0.35 : 1,
                  }}
                >
                  <div>{value.date()}</div>
                  {hours != null && (
                    <div style={{ fontSize: 11 }}>
                      <strong>{hours}</strong> ч
                    </div>
                  )}
                </div>
              );
            }}
            defaultValue={effectiveFrom}
          />
        ) : (
          <Typography.Text type="secondary">
            Нет отчётных часов за выбранный период.
          </Typography.Text>
        )}
      </Modal>

      {/* Детализация по сотруднику */}
      <Modal
        open={!!detailsUserId}
        title={
          detailsUserName
            ? `Детализация по сотруднику: ${detailsUserName}`
            : 'Детализация по сотруднику'
        }
        footer={null}
        width={1000}
        onCancel={() => {
          setDetailsUserId(null);
          setDetailsUserName('');
        }}
      >
        {detailsRows.length === 0 ? (
          <Typography.Text type="secondary">
            Нет данных по выбранному сотруднику за этот период.
          </Typography.Text>
        ) : (
          <Table
            rowKey="shiftId"
            size="small"
            dataSource={detailsRows}
            columns={detailColumns}
            pagination={false}
          />
        )}
      </Modal>
    </Card>
  );
};

export default StatisticsPage;