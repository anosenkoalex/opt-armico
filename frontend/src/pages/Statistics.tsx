import {
  Card,
  DatePicker,
  Form,
  Modal,
  Result,
  Select,
  Table,
  Tabs,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Assignment,
  AssignmentStatus,
  PaginatedResponse,
  User,
  Workplace,
  fetchAssignments,
  fetchUsers,
  fetchWorkplaces,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { RangePicker } = DatePicker;

type AssignmentsQueryResult =
  | PaginatedResponse<Assignment>
  | {
      items: Assignment[];
      total: number;
      page: number;
      pageSize: number;
    };

type FiltersState = {
  userId?: string;
  workplaceId?: string;
  status?: AssignmentStatus;
  range?: [Dayjs, Dayjs] | null;
};

const statusOptions: AssignmentStatus[] = ['ACTIVE', 'ARCHIVED'];

const StatisticsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<'byUsers' | 'byWorkplaces'>(
    'byUsers',
  );
  const [filters, setFilters] = useState<FiltersState>({});

  // Модалка с деталями по сотруднику
  const [userDetails, setUserDetails] = useState<{
    visible: boolean;
    userId: string | null;
    name: string;
  }>({
    visible: false,
    userId: null,
    name: '',
  });

  // Модалка с деталями по рабочему месту
  const [workplaceDetails, setWorkplaceDetails] = useState<{
    visible: boolean;
    workplaceId: string | null;
    label: string;
  }>({
    visible: false,
    workplaceId: null,
    label: '',
  });

  if (!isAdmin) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  // Пользователи и рабочие места для фильтров
  const usersQuery = useQuery<User[]>({
    queryKey: ['users', 'all-for-statistics'],
    queryFn: async () => {
      const res = await fetchUsers({ page: 1, pageSize: 500 });
      return res.data;
    },
    enabled: isAdmin,
  });

  const workplacesQuery = useQuery<PaginatedResponse<Workplace>>({
    queryKey: ['workplaces', 'all-for-statistics'],
    queryFn: () =>
      fetchWorkplaces({
        page: 1,
        pageSize: 500,
      }),
    enabled: isAdmin,
  });

  // Подтягиваем все назначения за период/фильтры (первая страница, но большой pageSize)
  const assignmentsQuery = useQuery<AssignmentsQueryResult>({
    queryKey: [
      'statistics-assignments',
      {
        tab: activeTab,
        ...filters,
      },
    ],
    queryFn: () =>
      fetchAssignments({
        userId: filters.userId,
        workplaceId: filters.workplaceId,
        status: filters.status,
        from: filters.range?.[0]?.toISOString(),
        to: filters.range?.[1]?.toISOString(),
        page: 1,
        pageSize: 1000,
      }),
    keepPreviousData: true,
    enabled: isAdmin,
  });

  // Унифицированно достаём массив назначений
  const assignments: Assignment[] = useMemo(() => {
    const raw = assignmentsQuery.data as any;
    if (!raw) return [];
    return raw.data ?? raw.items ?? [];
  }, [assignmentsQuery.data]);

  // --- Агрегация по сотрудникам ---
  const byUsersData = useMemo(() => {
    const map: Record<
      string,
      {
        userId: string;
        name: string;
        email: string;
        workplaces: Set<string>;
        assignmentsCount: number;
        totalDays: number;
      }
    > = {};

    const rangeFrom = filters.range?.[0];
    const rangeTo = filters.range?.[1];

    for (const a of assignments) {
      if (!a.user) continue;

      const key = a.user.id;
      if (!map[key]) {
        map[key] = {
          userId: key,
          name: a.user.fullName ?? a.user.email,
          email: a.user.email,
          workplaces: new Set<string>(),
          assignmentsCount: 0,
          totalDays: 0,
        };
      }

      map[key].assignmentsCount += 1;

      if (a.workplace) {
        const label = a.workplace.code
          ? `${a.workplace.code} — ${a.workplace.name}`
          : a.workplace.name ?? '';
        if (label) {
          map[key].workplaces.add(label);
        }
      }

      // считаем дни в пределах выбранного диапазона
      let start = dayjs(a.startsAt);
      let end = a.endsAt ? dayjs(a.endsAt) : dayjs();

      if (rangeFrom && start.isBefore(rangeFrom)) {
        start = rangeFrom;
      }
      if (rangeTo && end.isAfter(rangeTo)) {
        end = rangeTo;
      }

      if (end.isBefore(start)) continue;

      const days =
        end.endOf('day').diff(start.startOf('day'), 'day') + 1; // минимум 1 день
      map[key].totalDays += days;
    }

    return Object.values(map).map((row) => ({
      ...row,
      workplaces: Array.from(row.workplaces).join(', '),
    }));
  }, [assignments, filters.range]);

  // --- Агрегация по рабочим местам ---
  const byWorkplacesData = useMemo(() => {
    const map: Record<
      string,
      {
        workplaceId: string;
        label: string;
        employees: Set<string>;
        assignmentsCount: number;
        totalDays: number;
      }
    > = {};

    const rangeFrom = filters.range?.[0];
    const rangeTo = filters.range?.[1];

    for (const a of assignments) {
      if (!a.workplace) continue;

      const key = a.workplace.id;
      const label = a.workplace.code
        ? `${a.workplace.code} — ${a.workplace.name}`
        : a.workplace.name ?? '';

      if (!map[key]) {
        map[key] = {
          workplaceId: key,
          label,
          employees: new Set<string>(),
          assignmentsCount: 0,
          totalDays: 0,
        };
      }

      map[key].assignmentsCount += 1;

      if (a.user) {
        map[key].employees.add(a.user.id);
      }

      let start = dayjs(a.startsAt);
      let end = a.endsAt ? dayjs(a.endsAt) : dayjs();

      if (rangeFrom && start.isBefore(rangeFrom)) {
        start = rangeFrom;
      }
      if (rangeTo && end.isAfter(rangeTo)) {
        end = rangeTo;
      }

      if (end.isBefore(start)) continue;

      const days =
        end.endOf('day').diff(start.startOf('day'), 'day') + 1;
      map[key].totalDays += days;
    }

    return Object.values(map).map((row) => ({
      ...row,
      employeesCount: row.employees.size,
    }));
  }, [assignments, filters.range]);

  const userColumns: ColumnsType<{
    userId: string;
    name: string;
    email: string;
    workplaces: string;
    assignmentsCount: number;
    totalDays: number;
  }> = [
    {
      title: t('statistics.byUsers.employee'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('statistics.byUsers.workplaces'),
      dataIndex: 'workplaces',
      key: 'workplaces',
      ellipsis: true,
    },
    {
      title: t('statistics.byUsers.assignmentsCount'),
      dataIndex: 'assignmentsCount',
      key: 'assignmentsCount',
    },
    {
      title: t('statistics.byUsers.totalDays'),
      dataIndex: 'totalDays',
      key: 'totalDays',
    },
  ];

  const workplaceColumns: ColumnsType<{
    workplaceId: string;
    label: string;
    employeesCount: number;
    assignmentsCount: number;
    totalDays: number;
  }> = [
    {
      title: t('statistics.byWorkplaces.workplace'),
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: t('statistics.byWorkplaces.employeesCount'),
      dataIndex: 'employeesCount',
      key: 'employeesCount',
    },
    {
      title: t('statistics.byWorkplaces.assignmentsCount'),
      dataIndex: 'assignmentsCount',
      key: 'assignmentsCount',
    },
    {
      title: t('statistics.byWorkplaces.totalDays'),
      dataIndex: 'totalDays',
      key: 'totalDays',
    },
  ];

  const isLoading =
    assignmentsQuery.isLoading ||
    usersQuery.isLoading ||
    workplacesQuery.isLoading;

  // --- Детали: список назначений по выбранному сотруднику / месту ---

  const userDetailAssignments = useMemo(
    () =>
      userDetails.userId
        ? assignments.filter((a) => a.userId === userDetails.userId)
        : [],
    [assignments, userDetails.userId],
  );

  const workplaceDetailAssignments = useMemo(
    () =>
      workplaceDetails.workplaceId
        ? assignments.filter(
            (a) => a.workplaceId === workplaceDetails.workplaceId,
          )
        : [],
    [assignments, workplaceDetails.workplaceId],
  );

  const detailColumns: ColumnsType<Assignment> = [
    {
      title: t('assignments.user'),
      dataIndex: ['user', 'email'],
      key: 'user',
      render: (_value, record) =>
        record.user?.fullName ?? record.user?.email ?? '',
    },
    {
      title: t('assignments.workplace'),
      dataIndex: ['workplace', 'name'],
      key: 'workplace',
      render: (_value, record) =>
        record.workplace
          ? record.workplace.code
            ? `${record.workplace.code} — ${record.workplace.name}`
            : record.workplace.name
          : '',
    },
    {
      title: t('assignments.timeframe'),
      dataIndex: 'startsAt',
      key: 'timeframe',
      render: (_value, record) =>
        `${dayjs(record.startsAt).format('DD.MM.YYYY')} → ${
          record.endsAt
            ? dayjs(record.endsAt).format('DD.MM.YYYY')
            : t('dashboard.openEnded')
        }`,
    },
    {
      title: t('assignments.status.title'),
      dataIndex: 'status',
      key: 'status',
      render: (value: AssignmentStatus) =>
        value === 'ACTIVE'
          ? t('assignments.status.active')
          : t('assignments.status.archived'),
    },
  ];

  return (
    <Card title={t('statistics.title')}>
      <Form
        layout="inline"
        className="mb-4"
        onValuesChange={(_changed, allValues) => {
          setFilters({
            userId: allValues.userId,
            workplaceId: allValues.workplaceId,
            status: allValues.status,
            range: allValues.range,
          });
        }}
      >
        <Form.Item name="userId" label={t('statistics.filters.user')}>
          <Select
            allowClear
            showSearch
            options={
              usersQuery.data?.map((u) => ({
                value: u.id,
                label: `${u.fullName ?? u.email} (${u.email})`,
              })) ?? []
            }
            placeholder={t('statistics.filters.user')}
            optionFilterProp="label"
            style={{ width: 260 }}
          />
        </Form.Item>

        <Form.Item
          name="workplaceId"
          label={t('statistics.filters.workplace')}
        >
          <Select
            allowClear
            showSearch
            options={
              workplacesQuery.data?.data.map((w) => ({
                value: w.id,
                label: `${w.code} — ${w.name}`,
              })) ?? []
            }
            placeholder={t('statistics.filters.workplace')}
            optionFilterProp="label"
            style={{ width: 280 }}
          />
        </Form.Item>

        <Form.Item name="status" label={t('statistics.filters.status')}>
          <Select
            allowClear
            style={{ width: 200 }}
            options={statusOptions.map((value) => ({
              value,
              label:
                value === 'ACTIVE'
                  ? t('assignments.status.active')
                  : t('assignments.status.archived'),
            }))}
          />
        </Form.Item>

        <Form.Item name="range" label={t('statistics.filters.period')}>
          <RangePicker />
        </Form.Item>
      </Form>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'byUsers' | 'byWorkplaces')}
        items={[
          {
            key: 'byUsers',
            label: t('statistics.tabByUsers'),
            children: (
              <Table
                rowKey="userId"
                dataSource={byUsersData}
                columns={userColumns}
                loading={isLoading}
                locale={{
                  emptyText: t('statistics.noData'),
                }}
                onRow={(record) => ({
                  onClick: () =>
                    setUserDetails({
                      visible: true,
                      userId: record.userId,
                      name: record.name,
                    }),
                })}
              />
            ),
          },
          {
            key: 'byWorkplaces',
            label: t('statistics.tabByWorkplaces'),
            children: (
              <Table
                rowKey="workplaceId"
                dataSource={byWorkplacesData}
                columns={workplaceColumns}
                loading={isLoading}
                locale={{
                  emptyText: t('statistics.noData'),
                }}
                onRow={(record) => ({
                  onClick: () =>
                    setWorkplaceDetails({
                      visible: true,
                      workplaceId: record.workplaceId,
                      label: record.label,
                    }),
                })}
              />
            ),
          },
        ]}
      />

      {/* Детали по сотруднику */}
      <Modal
        open={userDetails.visible}
        title={
          userDetails.name
            ? t('statistics.details.userTitle', {
                name: userDetails.name,
              })
            : t('statistics.details.userTitlePlain')
        }
        footer={null}
        onCancel={() =>
          setUserDetails({ visible: false, userId: null, name: '' })
        }
        width={900}
      >
        {userDetailAssignments.length === 0 ? (
          <Typography.Text type="secondary">
            {t('statistics.noDetails')}
          </Typography.Text>
        ) : (
          <Table
            rowKey="id"
            size="small"
            dataSource={userDetailAssignments}
            columns={detailColumns}
            pagination={false}
          />
        )}
      </Modal>

      {/* Детали по рабочему месту */}
      <Modal
        open={workplaceDetails.visible}
        title={
          workplaceDetails.label
            ? t('statistics.details.workplaceTitle', {
                workplace: workplaceDetails.label,
              })
            : t('statistics.details.workplaceTitlePlain')
        }
        footer={null}
        onCancel={() =>
          setWorkplaceDetails({
            visible: false,
            workplaceId: null,
            label: '',
          })
        }
        width={900}
      >
        {workplaceDetailAssignments.length === 0 ? (
          <Typography.Text type="secondary">
            {t('statistics.noDetails')}
          </Typography.Text>
        ) : (
          <Table
            rowKey="id"
            size="small"
            dataSource={workplaceDetailAssignments}
            columns={detailColumns}
            pagination={false}
          />
        )}
      </Modal>
    </Card>
  );
};

export default StatisticsPage;