import {
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Form,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tag,
  TimePicker,
  Typography,
  message,
  Row,
  Col,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState, useCallback } from 'react';
import type { Key } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';
import {
  Assignment,
  AssignmentShift,
  AssignmentStatus,
  PaginatedResponse,
  ScheduleAdjustment,
  User,
  Workplace,
  approveScheduleAdjustment,
  completeAssignment,
  createAssignment,
  deleteAssignment,
  fetchAssignments,
  fetchAssignmentsFromTrash,
  fetchScheduleAdjustments,
  fetchUsers,
  fetchWorkplaces,
  hardDeleteTrashAssignments,
  notifyAssignment,
  rejectScheduleAdjustment,
  restoreAssignment,
  updateAssignment,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { useNavigate } from 'react-router-dom';

const statusOptions: AssignmentStatus[] = ['ACTIVE', 'ARCHIVED'];

// Ответ бэка может быть старый (data/meta) или новый (items/total)
type AssignmentsQueryResult =
  | PaginatedResponse<Assignment>
  | {
      items: Assignment[];
      total: number;
      page: number;
      pageSize: number;
    };

// локальный тип для вида смены (совпадает с enum ShiftKind в Prisma)
type ShiftKindType = 'DEFAULT' | 'OFFICE' | 'REMOTE' | 'DAY_OFF';

type ShiftRow = {
  key: string;
  date: Dayjs;
  startTime: Dayjs | null;
  endTime: Dayjs | null;
  kind: ShiftKindType;
};

// смена, распарсенная из комментария сотрудника (для "стало")
type ProposedShift = {
  startsAt: string; // HH:mm
  endsAt: string; // HH:mm
  kindLabel: string | null;
};

// сортируем смены по дате и времени начала, чтобы все даты шли подряд
const sortShiftRows = (rows: ShiftRow[]): ShiftRow[] => {
  return [...rows].sort((a, b) => {
    if (a.date.isBefore(b.date, 'day')) return -1;
    if (a.date.isAfter(b.date, 'day')) return 1;

    const aStart = a.startTime;
    const bStart = b.startTime;

    if (aStart && bStart) {
      if (aStart.isBefore(bStart)) return -1;
      if (aStart.isAfter(bStart)) return 1;
    }

    return 0;
  });
};

// 🔧 helper: короткие русские месяцы
const RU_MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

// 🔧 helper: сформировать CSV по сменам: даты — в заголовках
const buildAssignmentsCsv = (rows: Assignment[]): string => {
  const dateSet = new Set<string>();

  rows.forEach((item) => {
    const anyItem: any = item as any;
    const shifts = Array.isArray(anyItem.shifts) ? anyItem.shifts : [];

    if (shifts.length > 0) {
      shifts.forEach((s: any) => {
        const dSrc = s.date ?? s.startsAt ?? s.endsAt;
        if (!dSrc) return;
        const dKey = dayjs(dSrc).format('YYYY-MM-DD');
        dateSet.add(dKey);
      });
    } else if (item.startsAt) {
      const dKey = dayjs(item.startsAt).format('YYYY-MM-DD');
      dateSet.add(dKey);
    }
  });

  const dateKeysSorted = Array.from(dateSet).sort();

  const dateHeaders = dateKeysSorted.map((dKey) => {
    const [, monthStr, dayStr] = dKey.split('-');
    const monthIndex = Math.max(0, Math.min(11, Number(monthStr) - 1));
    const monthLabel = RU_MONTHS_SHORT[monthIndex] ?? monthStr;
    const dayNum = String(Number(dayStr));
    return `${dayNum}.${monthLabel}`;
  });

  const header = [
    'ID',
    'Сотрудник',
    'Email',
    'Рабочее место',
    'Код рабочего места',
    'Статус',
    ...dateHeaders,
  ];

  const lines = rows.map((item) => {
    const anyItem: any = item as any;
    const shifts = Array.isArray(anyItem.shifts) ? anyItem.shifts : [];

    const dateToIntervals: Record<string, string[]> = {};

    if (shifts.length > 0) {
      shifts.forEach((s: any) => {
        const dSrc = s.date ?? s.startsAt ?? s.endsAt;
        if (!dSrc) return;
        const dKey = dayjs(dSrc).format('YYYY-MM-DD');

        const start = s.startsAt ? dayjs(s.startsAt) : null;
        const end = s.endsAt ? dayjs(s.endsAt) : null;
        if (!start || !end) return;

        const interval = `${start.format('HH:mm:ss')}-${end.format(
          'HH:mm:ss',
        )}`;

        if (!dateToIntervals[dKey]) dateToIntervals[dKey] = [];
        dateToIntervals[dKey].push(interval);
      });
    } else if (item.startsAt) {
      const start = dayjs(item.startsAt);
      const end = item.endsAt ? dayjs(item.endsAt) : start;
      const dKey = start.format('YYYY-MM-DD');
      dateToIntervals[dKey] = [
        `${start.format('HH:mm:ss')}-${end.format('HH:mm:ss')}`,
      ];
    }

    const dateCols = dateKeysSorted.map((dKey) => {
      const list = dateToIntervals[dKey];
      return list && list.length ? list.join(', ') : '';
    });

    const employeeName = item.user?.fullName ?? '';
    const employeeEmail = item.user?.email ?? '';
    const workplaceName = item.workplace?.name ?? '';
    const workplaceCode = item.workplace?.code ?? '';
    const status = item.status;

    const cols = [
      item.id,
      employeeName,
      employeeEmail,
      workplaceName,
      workplaceCode,
      status,
      ...dateCols,
    ];

    return cols
      .map((value) => {
        const v = value ?? '';
        const str = String(v);
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(';');
  });

  return [header.join(';'), ...lines].join('\r\n');
};

// 🔧 helper: скачать CSV как файл (с UTF-8 BOM для Excel)
const downloadCsv = (rows: Assignment[], prefix: string) => {
  if (!rows.length) {
    throw new Error('NO_ROWS');
  }

  const csv = buildAssignmentsCsv(rows);
  const csvWithBom = '\uFEFF' + csv;

  const blob = new Blob([csvWithBom], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

const AssignmentsPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<{
    userId?: string;
    workplaceId?: string;
    status?: AssignmentStatus;
    range?: [Dayjs, Dayjs] | null;
  }>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] =
    useState<Assignment | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const [shiftRows, setShiftRows] = useState<ShiftRow[]>([]);
  const [timeRangeForAll, setTimeRangeForAll] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [applyTimeToAll, setApplyTimeToAll] = useState<boolean>(true);

  const [showTrash, setShowTrash] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [highlightedUserId, setHighlightedUserId] = useState<string | null>(
    null,
  );
  const [adjustmentsModalAssignment, setAdjustmentsModalAssignment] =
    useState<Assignment | null>(null);

  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  const canManageAssignments = isAdmin || isManager;

  const assignmentsQuery = useQuery<AssignmentsQueryResult>({
    queryKey: [
      'assignments',
      {
        ...filters,
        page,
        pageSize,
        trash: showTrash ? 1 : 0,
      },
    ],
    queryFn: () =>
      showTrash
        ? fetchAssignmentsFromTrash({
            userId: filters.userId,
            workplaceId: filters.workplaceId,
            status: filters.status,
            from: filters.range?.[0]?.toISOString(),
            to: filters.range?.[1]?.toISOString(),
            page,
            pageSize,
          })
        : fetchAssignments({
            userId: filters.userId,
            workplaceId: filters.workplaceId,
            status: filters.status,
            from: filters.range?.[0]?.toISOString(),
            to: filters.range?.[1]?.toISOString(),
            page,
            pageSize,
          }),
    keepPreviousData: true,
    enabled: canManageAssignments,
  });

  const usersQuery = useQuery<PaginatedResponse<User>>({
    queryKey: ['users', 'for-assignments'],
    queryFn: () =>
      fetchUsers({
        page: 1,
        pageSize: 100,
      }),
    enabled: canManageAssignments,
    keepPreviousData: true,
  });

  const workplacesQuery = useQuery<PaginatedResponse<Workplace>>({
    queryKey: ['workplaces', 'options'],
    queryFn: () => fetchWorkplaces({ page: 1, pageSize: 100, isActive: true }),
    enabled: canManageAssignments,
  });

  // 🔍 тянем только PENDING-запросы корректировок
  const scheduleAdjustmentsQuery = useQuery({
    queryKey: ['schedule-adjustments', 'for-assignments', 'PENDING'],
    queryFn: () =>
      fetchScheduleAdjustments({
        page: 1,
        pageSize: 50,
        status: 'PENDING',
      }),
    enabled: canManageAssignments,
    staleTime: 30_000,
  });

  // универсально достаём список запросов: data или items
  const adjustments: ScheduleAdjustment[] = useMemo(() => {
    const raw: any = scheduleAdjustmentsQuery.data;
    if (!raw) return [];
    return (raw.items ?? raw.data ?? []) as ScheduleAdjustment[];
  }, [scheduleAdjustmentsQuery.data]);

  // только PENDING-запросы (для индикатора и подсветки)
  const pendingAdjustments: ScheduleAdjustment[] = useMemo(
    () => adjustments.filter((a) => a.status === 'PENDING'),
    [adjustments],
  );

  // количество PENDING-запросов для индикатора
  const adjustmentsCount = useMemo(() => {
    const raw: any = scheduleAdjustmentsQuery.data;
    const base = pendingAdjustments.length;
    const metaTotal = raw?.meta?.total ?? raw?.total;
    return typeof metaTotal === 'number' ? metaTotal : base;
  }, [scheduleAdjustmentsQuery.data, pendingAdjustments]);

  // для подсветки назначений с PENDING-запросами
  const assignmentsWithAdjustment = useMemo(() => {
    const set = new Set<string>();
    pendingAdjustments.forEach((adj) => {
      if (adj.assignmentId) {
        set.add(adj.assignmentId);
      }
    });
    return set;
  }, [pendingAdjustments]);

  const handleAssignmentError = (
    error: unknown,
    userIdForHighlight?: string,
  ) => {
    const axiosError = error as AxiosError<{ message?: string | string[] }>;
    const msg = axiosError?.response?.data?.message;

    if (typeof msg === 'string') {
      const normalized = msg.toLowerCase();

      if (normalized.includes('overlap') || normalized.includes('пересек')) {
        message.error(t('assignments.overlapError'));
        return;
      }

      if (userIdForHighlight) {
        setHighlightedUserId(userIdForHighlight);
        setTimeout(() => {
          setHighlightedUserId((current) =>
            current === userIdForHighlight ? null : current,
          );
        }, 5000);
      }

      message.error(msg);
      return;
    }

    if (Array.isArray(msg)) {
      message.error(msg.join('\n'));
      return;
    }

    message.error(msg ?? t('common.error'));
  };

  const queryInvalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
    void queryClient.invalidateQueries({
      queryKey: ['schedule-adjustments'],
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => createAssignment(payload),
    onSuccess: () => {
      queryInvalidateAll();
      message.success(t('assignments.created'));
      setIsModalOpen(false);
      setEditingAssignment(null);
      form.resetFields();
      setShiftRows([]);
      setTimeRangeForAll(null);
      setApplyTimeToAll(true);
    },
    onError: (error, variables: any) => {
      handleAssignmentError(error, variables?.userId);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Parameters<typeof updateAssignment>[1];
    }) => updateAssignment(id, values),
    onSuccess: () => {
      queryInvalidateAll();
      message.success(t('assignments.updated'));
      setIsModalOpen(false);
      setEditingAssignment(null);
      form.resetFields();
      setShiftRows([]);
      setTimeRangeForAll(null);
      setApplyTimeToAll(true);
    },
    onError: (error, variables: any) => {
      handleAssignmentError(error, variables?.values?.userId);
    },
  });

  const notifyMutation = useMutation({
    mutationFn: (assignmentId: string) => notifyAssignment(assignmentId),
    onMutate: (assignmentId: string) => {
      setNotifyingId(assignmentId);
    },
    onSuccess: () => {
      message.success(t('assignments.notifySuccess'));
    },
    onError: (error: unknown) => {
      const axiosError = error as AxiosError<{ message?: string } | string>;
      const responseMessage =
        typeof axiosError?.response?.data === 'string'
          ? axiosError.response.data
          : axiosError?.response?.data?.message;

      if (typeof responseMessage === 'string' && responseMessage.trim()) {
        message.error(responseMessage);
        return;
      }

      message.error(t('assignments.notifyError'));
    },
    onSettled: () => {
      setNotifyingId(null);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (assignmentId: string) => completeAssignment(assignmentId),
    onSuccess: () => {
      queryInvalidateAll();
      message.success(t('assignments.completed'));
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) => deleteAssignment(assignmentId),
    onSuccess: () => {
      queryInvalidateAll();
      message.success(
        t('assignments.deleted', 'Назначение перемещено в корзину'),
      );
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (assignmentId: string) => restoreAssignment(assignmentId),
    onSuccess: () => {
      queryInvalidateAll();
      message.success(
        t('assignments.restoredFromTrash', 'Назначение восстановлено'),
      );
      setSelectedRowKeys([]);
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  const hardDeleteTrashMutation = useMutation({
    mutationFn: (ids: string[]) => hardDeleteTrashAssignments(ids),
    onSuccess: (result) => {
      queryInvalidateAll();
      setSelectedRowKeys([]);
      message.success(
        t(
          'assignments.trash.hardDeleteSuccess',
          'Выбранные назначения удалены навсегда',
        ) + (result?.deletedCount ? ` (${result.deletedCount})` : ''),
      );
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  const approveAdjustmentMutation = useMutation({
    mutationFn: (payload: { id: string; managerComment?: string }) =>
      approveScheduleAdjustment(payload.id, {
        managerComment: payload.managerComment,
      }),
    onSuccess: () => {
      queryInvalidateAll();
      message.success(
        t(
          'assignments.adjustmentApproved',
          'Корректировка расписания одобрена',
        ),
      );
      setAdjustmentsModalAssignment(null);
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  const rejectAdjustmentMutation = useMutation({
    mutationFn: (payload: { id: string; managerComment?: string }) =>
      rejectScheduleAdjustment(payload.id, {
        managerComment: payload.managerComment,
      }),
    onSuccess: () => {
      queryInvalidateAll();
      message.success(
        t(
          'assignments.adjustmentRejected',
          'Корректировка расписания отклонена',
        ),
      );
      setAdjustmentsModalAssignment(null);
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  const assignments = useMemo(() => {
    const raw = assignmentsQuery.data as any;
    if (!raw) return [];
    return raw.data ?? raw.items ?? [];
  }, [assignmentsQuery.data]);

  const pagination = useMemo(() => {
    const raw = assignmentsQuery.data as any;
    if (!raw) {
      return { total: 0, page, pageSize };
    }

    if (raw.meta) {
      return raw.meta;
    }

    return {
      total: raw.total ?? 0,
      page: raw.page ?? page,
      pageSize: raw.pageSize ?? pageSize,
    };
  }, [assignmentsQuery.data, page, pageSize]);

  const handleOpenEdit = useCallback(
    (record: Assignment) => {
      if (showTrash) {
        return;
      }

      setEditingAssignment(record);
      form.resetFields();
      setShiftRows([]);
      setTimeRangeForAll(null);
      setApplyTimeToAll(true);

      form.setFieldsValue({
        userId: record.userId,
        workplaceId: record.workplaceId,
        status: record.status,
      });

      const anyRecord: any = record as any;
      const recordShifts = Array.isArray(anyRecord.shifts)
        ? anyRecord.shifts
        : [];

      if (recordShifts.length > 0) {
        const rows: ShiftRow[] = recordShifts.map(
          (s: any, index: number) => ({
            key: s.id ?? `${record.id}-${index}`,
            date: dayjs(s.date),
            startTime: dayjs(s.startsAt),
            endTime: dayjs(s.endsAt),
            kind: (s.kind as ShiftKindType | undefined) ?? 'DEFAULT',
          }),
        );

        const dates = rows.map((r) => r.date);
        const minDate = dates.reduce((min, d) =>
          d.isBefore(min) ? d : min,
        );
        const maxDate = dates.reduce((max, d) =>
          d.isAfter(max) ? d : max,
        );

        form.setFieldsValue({
          dateRange: [minDate.startOf('day'), maxDate.startOf('day')],
        });
        setShiftRows(sortShiftRows(rows));
      } else {
        const start = dayjs(record.startsAt);
        const end = record.endsAt ? dayjs(record.endsAt) : start;

        const startDate = start.startOf('day');
        const endDate = end.startOf('day');

        form.setFieldsValue({
          dateRange: [startDate, endDate],
        });

        if (startDate.isSame(endDate, 'day') && record.endsAt) {
          setShiftRows(
            sortShiftRows([
              {
                key: record.id,
                date: startDate,
                startTime: start,
                endTime: end,
                kind: 'DEFAULT',
              },
            ]),
          );
        } else {
          const rows: ShiftRow[] = [];
          let current = startDate.clone();
          while (
            current.isBefore(endDate) ||
            current.isSame(endDate, 'day')
          ) {
            rows.push({
              key: `${record.id}-${current.toISOString()}`,
              date: current,
              startTime: null,
              endTime: null,
              kind: 'DEFAULT',
            });
            current = current.add(1, 'day');
          }
          setShiftRows(sortShiftRows(rows));
        }
      }

      setIsModalOpen(true);
    },
    [
      form,
      setEditingAssignment,
      setShiftRows,
      setTimeRangeForAll,
      setApplyTimeToAll,
      setIsModalOpen,
      showTrash,
    ],
  );

  const columns: ColumnsType<Assignment> = useMemo(
    () => [
      {
        title: t('assignments.user'),
        dataIndex: ['user', 'email'],
        key: 'user',
        render: (_value: unknown, record: Assignment) => {
          const label =
            record.user?.fullName ?? record.user?.email ?? t('assignments.user');

          const isHighlighted =
            !showTrash &&
            record.status === 'ACTIVE' &&
            highlightedUserId === record.userId;

          return (
            <Space size="small">
              <span>{label}</span>
              {isHighlighted && (
                <Tag color="orange">
                  {t(
                    'assignments.twoActiveTag',
                    'У сотрудника уже 2 активных назначения',
                  )}
                </Tag>
              )}
            </Space>
          );
        },
      },
      {
        title: t('assignments.workplace'),
        dataIndex: ['workplace', 'name'],
        key: 'workplace',
        render: (_value: unknown, record: Assignment) => (
          <span>
            {record.workplace?.code ? `${record.workplace.code} — ` : ''}
            {record.workplace?.name}
          </span>
        ),
      },
      {
        title: t('assignments.timeframe'),
        dataIndex: 'startsAt',
        key: 'timeframe',
        render: (_value: unknown, record: Assignment) => (
          <Button
            type="link"
            onClick={() => handleOpenEdit(record)}
            style={{ padding: 0 }}
          >
            {dayjs(record.startsAt).format('DD.MM.YYYY')} →{' '}
            {record.endsAt
              ? dayjs(record.endsAt).format('DD.MM.YYYY')
              : t('dashboard.openEnded')}
          </Button>
        ),
      },
      {
        title: t('assignments.status.title'),
        dataIndex: 'status',
        key: 'status',
        render: (value: AssignmentStatus, record: Assignment) => {
          const hasAdjustment = assignmentsWithAdjustment.has(record.id);

          return (
            <Space size="small">
              <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>
                {value === 'ACTIVE'
                  ? t('assignments.status.active')
                  : t('assignments.status.archived')}
              </Tag>
              {hasAdjustment && (
                <Tag color="orange">
                  {t(
                    'assignments.hasAdjustmentRequest',
                    'Есть запрос корректировки',
                  )}
                </Tag>
              )}
            </Space>
          );
        },
      },
      {
        title: t('workplaces.actions'),
        key: 'actions',
        render: (_value, record) => {
          if (showTrash) {
            return (
              <Space size="small">
                <Button
                  type="link"
                  onClick={() => {
                    Modal.confirm({
                      title: t(
                        'assignments.restoreConfirmTitle',
                        'Восстановить назначение?',
                      ),
                      content: t(
                        'assignments.restoreConfirmDescription',
                        'Назначение будет восстановлено из корзины.',
                      ),
                      okText: t('assignments.restore', 'Восстановить'),
                      cancelText: t('common.cancel'),
                      centered: true,
                      onOk: () =>
                        restoreMutation
                          .mutateAsync(record.id)
                          .catch(() => undefined),
                    });
                  }}
                  loading={restoreMutation.isPending}
                >
                  {t('assignments.restore', 'Восстановить')}
                </Button>
              </Space>
            );
          }

          const canNotify =
            record.status === 'ACTIVE' && Boolean(record.user?.email);
          const canComplete = record.status === 'ACTIVE';
          const canDelete = record.status === 'ARCHIVED';

          const hasAdjustment = assignmentsWithAdjustment.has(record.id);

          return (
            <Space size="small">
              <Button
                type="link"
                onClick={() => {
                  handleOpenEdit(record);
                }}
              >
                {t('common.edit')}
              </Button>

              <Button
                type="link"
                disabled={!canComplete}
                loading={completeMutation.isPending}
                onClick={() => {
                  if (!canComplete) return;

                  Modal.confirm({
                    title: t('assignments.completeConfirmTitle'),
                    content: t('assignments.completeConfirmDescription'),
                    okText: t('assignments.complete'),
                    cancelText: t('common.cancel'),
                    centered: true,
                    onOk: () =>
                      completeMutation
                        .mutateAsync(record.id)
                        .catch(() => undefined),
                  });
                }}
              >
                {t('assignments.complete')}
              </Button>

              <Button
                type="link"
                disabled={!canNotify}
                loading={
                  notifyMutation.isPending && notifyingId === record.id
                }
                onClick={() => {
                  if (!canNotify) {
                    return;
                  }

                  const workplaceLabel = record.workplace
                    ? `${record.workplace.code} — ${record.workplace.name}`
                    : '';
                  const employeeName =
                    record.user?.fullName ?? record.user?.email ?? '';

                  Modal.confirm({
                    title: t('assignments.notifyConfirmTitle'),
                    content: t('assignments.notifyConfirmDescription', {
                      user: employeeName,
                      workplace: workplaceLabel,
                    }),
                    okText: t('assignments.notifyConfirmOk'),
                    cancelText: t('common.cancel'),
                    centered: true,
                    onOk: () =>
                      notifyMutation
                        .mutateAsync(record.id)
                        .catch(() => undefined),
                  });
                }}
              >
                {t('assignments.notify')}
              </Button>

              {hasAdjustment && (
                <Button
                  type="link"
                  onClick={() => setAdjustmentsModalAssignment(record)}
                >
                  {t(
                    'assignments.viewAdjustments',
                    'Запрос корректировки',
                  )}
                </Button>
              )}

              <Button
                type="link"
                danger
                disabled={!canDelete}
                loading={deleteMutation.isPending}
                onClick={() => {
                  if (!canDelete) return;

                  Modal.confirm({
                    title: t(
                      'assignments.deleteConfirmTitle',
                      'Удалить назначение?',
                    ),
                    content: t(
                      'assignments.deleteConfirmDescription',
                      'Назначение будет перемещено в корзину.',
                    ),
                    okText: t('common.delete') ?? 'Удалить',
                    cancelText: t('common.cancel'),
                    centered: true,
                    onOk: () =>
                      deleteMutation
                        .mutateAsync(record.id)
                        .catch(() => undefined),
                  });
                }}
              >
                {t('common.delete') ?? 'Удалить'}
              </Button>
            </Space>
          );
        },
      },
    ],
    [
      t,
      handleOpenEdit,
      notifyMutation,
      notifyingId,
      completeMutation.isPending,
      deleteMutation.isPending,
      restoreMutation.isPending,
      showTrash,
      highlightedUserId,
      assignmentsWithAdjustment,
    ],
  );

  const handleDateRangeChange = (
    dates: [Dayjs | null, Dayjs | null] | null,
  ) => {
    if (!dates || !dates[0] || !dates[1]) {
      setShiftRows([]);
      return;
    }

    const [startDateRaw, endDateRaw] = dates;
    const startDate = startDateRaw.startOf('day');
    const endDate = endDateRaw.startOf('day');

    const rows: ShiftRow[] = [];
    let current = startDate.clone();

    while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
      rows.push({
        key: current.toISOString(),
        date: current,
        startTime:
          timeRangeForAll && timeRangeForAll[0] && applyTimeToAll
            ? timeRangeForAll[0]
            : null,
        endTime:
          timeRangeForAll && timeRangeForAll[1] && applyTimeToAll
            ? timeRangeForAll[1]
            : null,
        kind: 'DEFAULT',
      });
      current = current.add(1, 'day');
    }

    setShiftRows(sortShiftRows(rows));
  };

  const applyTimeRangeToAllRows = (
    range: [Dayjs | null, Dayjs | null] | null,
    forceApply?: boolean,
  ) => {
    if (!range || !range[0] || !range[1]) return;

    if (!applyTimeToAll && !forceApply) return;

    setShiftRows((prev) =>
      sortShiftRows(
        prev.map((row) => ({
          ...row,
          startTime: range[0],
          endTime: range[1],
        })),
      ),
    );
  };

  const addIntervalForDate = (date: Dayjs) => {
    setShiftRows((prev) => {
      const newRow: ShiftRow = {
        key: `${date.toISOString()}-${Date.now()}-${Math.random()}`,
        date,
        startTime:
          timeRangeForAll && timeRangeForAll[0] && applyTimeToAll
            ? timeRangeForAll[0]
            : null,
        endTime:
          timeRangeForAll && timeRangeForAll[1] && applyTimeToAll
            ? timeRangeForAll[1]
            : null,
        kind: 'DEFAULT',
      };

      return sortShiftRows([...prev, newRow]);
    });
  };

  const removeRow = (key: string) => {
    setShiftRows((prev) => prev.filter((r) => r.key !== key));
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const dateRange = values.dateRange as
        | [Dayjs | null, Dayjs | null]
        | undefined;

      if (!dateRange || !dateRange[0] || !dateRange[1]) {
        message.error(t('assignments.validation.startRequired'));
        return;
      }

      if (shiftRows.length === 0) {
        message.error(
          t('assignments.validation.shiftsRequired') ??
            'Укажите график смен.',
        );
        return;
      }

      const filledRows = shiftRows.filter(
        (row) => row.startTime && row.endTime,
      );

      if (filledRows.length === 0) {
        message.error(
          t('assignments.validation.shiftsTimeRequired') ??
            'Укажите время работы хотя бы для одного дня.',
        );
        return;
      }

      const shifts = filledRows.map((row) => {
        const date = row.date.startOf('day');
        const startTime = row.startTime!;
        const endTime = row.endTime!;

        const startsAt = date
          .hour(startTime.hour())
          .minute(startTime.minute())
          .second(0)
          .millisecond(0);
        const endsAt = date
          .hour(endTime.hour())
          .minute(endTime.minute())
          .second(0)
          .millisecond(0);

        return {
          date: date.toISOString(),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          kind: row.kind,
        };
      });

      const globalStartsAt = shifts.reduce((min, s) => {
        const d = dayjs(s.startsAt);
        return d.isBefore(min) ? d : min;
      }, dayjs(shifts[0].startsAt));

      const globalEndsAt = shifts.reduce((max, s) => {
        const d = dayjs(s.endsAt);
        return d.isAfter(max) ? d : max;
      }, dayjs(shifts[0].endsAt));

      const payload: any = {
        userId: values.userId,
        workplaceId: values.workplaceId,
        status: values.status,
        startsAt: globalStartsAt.toISOString(),
        endsAt: globalEndsAt.toISOString(),
        shifts,
      };

      if (editingAssignment) {
        await updateMutation.mutateAsync({
          id: editingAssignment.id,
          values: payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
      }
    }
  };

  if (!canManageAssignments) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  const userOptions =
    usersQuery.data?.data
      .filter((u) => u.role === 'USER')
      .map((item) => ({
        value: item.id,
        label: `${item.fullName ?? item.email} (${item.email})`,
      })) ?? [];

  const workplaceOptions =
    workplacesQuery.data?.data.map((item) => ({
      value: item.id,
      label: `${item.code} — ${item.name}`,
    })) ?? [];

  const groupedShiftRows = useMemo(() => {
    const map: Record<string, ShiftRow[]> = {};
    shiftRows.forEach((row) => {
      const key = row.date.format('YYYY-MM-DD');
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(row);
    });
    return map;
  }, [shiftRows]);

  const rowSelection = showTrash
    ? {
        selectedRowKeys,
        onChange: (keys: Key[]) => setSelectedRowKeys(keys),
      }
    : undefined;

  const getSelectedIds = () => selectedRowKeys.map(String);

  const handleExportSelected = () => {
    const ids = getSelectedIds();
    if (!ids.length) {
      message.warning(
        t(
          'assignments.trash.noSelection',
          'Сначала выберите хотя бы одно назначение в корзине',
        ),
      );
      return;
    }

    const rows = assignments.filter((a) => ids.includes(a.id));

    try {
      downloadCsv(rows, 'assignments-trash');
      message.success(
        t(
          'assignments.trash.exportSuccess',
          'Выбранные назначения выгружены в Excel-таблицу',
        ),
      );
    } catch (e: any) {
      if (e?.message === 'NO_ROWS') {
        message.warning(
          t(
            'assignments.trash.emptyExport',
            'Нет данных для экспорта по выбранным назначениям',
          ),
        );
      } else {
        console.error(e);
        message.error(
          t(
            'assignments.trash.exportError',
            'Не удалось сформировать файл экспорта',
          ),
        );
      }
    }
  };

  const handleHardDeleteSelected = () => {
    const ids = getSelectedIds();
    if (!ids.length) {
      message.warning(
        t(
          'assignments.trash.noSelection',
          'Сначала выберите хотя бы одно назначение в корзине',
        ),
      );
      return;
    }

    Modal.confirm({
      title: t(
        'assignments.trash.hardDeleteConfirmTitle',
        'Удалить выбранные назначения навсегда?',
      ),
      content: t(
        'assignments.trash.hardDeleteConfirmDescription',
        'Они будут удалены без возможности восстановления.',
      ),
      okText: t('common.delete') ?? 'Удалить',
      cancelText: t('common.cancel'),
      centered: true,
      okButtonProps: { danger: true },
      onOk: () => hardDeleteTrashMutation.mutate(ids),
    });
  };

  const handleExportAndDeleteSelected = () => {
    const ids = getSelectedIds();
    if (!ids.length) {
      message.warning(
        t(
          'assignments.trash.noSelection',
          'Сначала выберите хотя бы одно назначение в корзине',
        ),
      );
      return;
    }

    const rows = assignments.filter((a) => ids.includes(a.id));

    Modal.confirm({
      title: t(
        'assignments.trash.exportAndDeleteConfirmTitle',
        'Выгрузить и удалить выбранные назначения?',
      ),
      content: t(
        'assignments.trash.exportAndDeleteConfirmDescription',
        'Сначала будет сформирован файл с выбранными назначениями, затем они будут удалены из корзины.',
      ),
      okText: t('assignments.trash.exportAndDelete', 'Скачать и удалить'),
      cancelText: t('common.cancel'),
      centered: true,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          downloadCsv(rows, 'assignments-trash-export-and-delete');
        } catch (e: any) {
          if (e?.message === 'NO_ROWS') {
            message.warning(
              t(
                'assignments.trash.emptyExport',
                'Нет данных для экспорта по выбранным назначениям',
              ),
            );
            return;
          } else {
            console.error(e);
            message.error(
              t(
                'assignments.trash.exportAndDeleteError',
                'Не удалось выгрузить и удалить назначения',
              ),
            );
            return;
          }
        }

        hardDeleteTrashMutation.mutate(ids);
      },
    });
  };

  const adjustmentsForModal: ScheduleAdjustment[] = useMemo(() => {
    if (!adjustmentsModalAssignment) return [];
    return pendingAdjustments.filter(
      (adj) => adj.assignmentId === adjustmentsModalAssignment.id,
    );
  }, [adjustmentsModalAssignment, pendingAdjustments]);

  const assignmentIntervalText =
    adjustmentsModalAssignment &&
    `${dayjs(adjustmentsModalAssignment.startsAt).format('DD.MM.YYYY')} → ${
      adjustmentsModalAssignment.endsAt
        ? dayjs(adjustmentsModalAssignment.endsAt).format('DD.MM.YYYY')
        : t('dashboard.openEnded')
    }`;

  // Оригинальные смены назначения по датам — для «Назначенный график (было)»
  const originalShiftsByDate = useMemo(() => {
    const map: Record<string, AssignmentShift[]> = {};
    if (!adjustmentsModalAssignment?.shifts) return map;

    adjustmentsModalAssignment.shifts.forEach((shift) => {
      const key = dayjs(shift.date).format('YYYY-MM-DD');
      if (!map[key]) map[key] = [];
      map[key].push(shift);
    });

    return map;
  }, [adjustmentsModalAssignment]);

  // парсим комментарий сотрудника и получаем полный предложенный график
  const parseRequestedScheduleFromComment = (
    comment?: string | null,
  ): Record<string, ProposedShift[]> => {
    const result: Record<string, ProposedShift[]> = {};
    if (!comment) return result;

    const marker = 'Интервалы, которые сотрудник предлагает:';
    const idx = comment.indexOf(marker);
    if (idx === -1) return result;

    const lines = comment
      .slice(idx + marker.length)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const re =
      /^(\d{2}\.\d{2}\.\d{4}):\s+(\d{2}:\d{2})\s*→\s*(\d{2}:\d{2})(?:\s*\((.+)\))?$/;

    lines.forEach((line) => {
      const match = line.match(re);
      if (!match) return;

      const [, dateStr, startStr, endStr, kindLabel] = match;
      const [dayStr, monthStr, yearStr] = dateStr.split('.');
      const dateKey = dayjs(
        `${yearStr}-${monthStr}-${dayStr}`,
        'YYYY-MM-DD',
      ).format('YYYY-MM-DD');

      if (!result[dateKey]) result[dateKey] = [];
      result[dateKey].push({
        startsAt: startStr,
        endsAt: endStr,
        kindLabel: kindLabel ?? null,
      });
    });

    return result;
  };

  // предложенный график по датам — из комментария
  const proposedShiftsByDate = useMemo(() => {
    const anyWithComment = adjustmentsForModal.find(
      (adj) => adj.comment && adj.comment.trim(),
    );
    if (!anyWithComment) return {};
    return parseRequestedScheduleFromComment(anyWithComment.comment);
  }, [adjustmentsForModal]);

  // Список всех дат, которые нужно показывать в было/стало
  const datesForComparison = useMemo(() => {
    const set = new Set<string>();

    Object.keys(originalShiftsByDate).forEach((d) => set.add(d));
    Object.keys(proposedShiftsByDate).forEach((d) => set.add(d));

    return Array.from(set).sort();
  }, [originalShiftsByDate, proposedShiftsByDate]);

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

  const formatTime = (iso: string | null | undefined) =>
    iso ? dayjs(iso).format('HH:mm') : '--:--';

  // Резюме изменений для блока "Комментарии сотрудника"
  const changesSummaryByDate = useMemo(() => {
    const result: { dateKey: string; text: string }[] = [];

    datesForComparison.forEach((dateKey) => {
      const orig = originalShiftsByDate[dateKey] ?? [];
      const next = proposedShiftsByDate[dateKey] ?? [];

      if (!orig.length && !next.length) {
        return;
      }

      const origTimes = new Set(
        orig.map(
          (s) =>
            `${formatTime(s.startsAt)}-${formatTime(s.endsAt)}`,
        ),
      );
      const nextTimes = new Set(
        next.map((s) => `${s.startsAt}-${s.endsAt}`),
      );

      const sameTimes =
        origTimes.size === nextTimes.size &&
        [...origTimes].every((v) => nextTimes.has(v));

      const origKinds = new Set(
        orig.map((s) => (s.kind ?? 'DEFAULT').toString()),
      );
      const nextKinds = new Set(
        next.length
          ? next.map((s) =>
              (s.kindLabel ?? 'DEFAULT').toString().toUpperCase(),
            )
          : origKinds,
      );

      const sameKinds =
        origKinds.size === nextKinds.size &&
        [...origKinds].every((v) => nextKinds.has(v));

      if (sameTimes && sameKinds) {
        return;
      }

      const dateLabel = dayjs(dateKey).format('DD.MM.YYYY');
      const parts: string[] = [];
      if (!sameTimes) parts.push('время');
      if (!sameKinds) parts.push('статус');

      let text: string;
      if (parts.length === 2) {
        text = `${dateLabel}: корректировал время и статус`;
      } else {
        text = `${dateLabel}: корректировал ${parts[0]}`;
      }

      result.push({ dateKey, text });
    });

    return result;
  }, [datesForComparison, originalShiftsByDate, proposedShiftsByDate]);

  const hasChangesSummary = changesSummaryByDate.length > 0;

  return (
    <Card
      title={t('assignments.manageTitle')}
      extra={
        <Space>
          <Button
            type={showTrash ? 'default' : 'primary'}
            onClick={() => {
              setShowTrash(false);
              setSelectedRowKeys([]);
              setPage(1);
            }}
          >
            {t('assignments.viewActive', 'Назначения')}
          </Button>
          <Button
            type={showTrash ? 'primary' : 'default'}
            onClick={() => {
              setShowTrash(true);
              setSelectedRowKeys([]);
              setPage(1);
            }}
          >
            {t('assignments.viewTrash', 'Корзина')}
          </Button>

          {/* 🔔 кнопка перехода на /schedule-adjustments с индикатором количества */}
          <Badge
            count={adjustmentsCount}
            size="small"
            overflowCount={99}
            offset={[8, 0]}
          >
            <Button
              type="default"
              onClick={() => navigate('/schedule-adjustments')}
            >
              {t(
                'assignments.scheduleAdjustmentsButton',
                'Запросы на корректировку',
              )}
            </Button>
          </Badge>

          {!showTrash && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                form.setFieldsValue({ status: 'ACTIVE' });
                setEditingAssignment(null);
                setShiftRows([]);
                setTimeRangeForAll(null);
                setApplyTimeToAll(true);
                setIsModalOpen(true);
              }}
            >
              {t('assignments.add')}
            </Button>
          )}

          {showTrash && (
            <>
              <Button
                onClick={handleExportSelected}
                disabled={!selectedRowKeys.length}
              >
                {t(
                  'assignments.trash.exportSelected',
                  'Скачать выбранные',
                )}
              </Button>
              <Button
                danger
                onClick={handleHardDeleteSelected}
                disabled={
                  !selectedRowKeys.length || hardDeleteTrashMutation.isPending
                }
                loading={hardDeleteTrashMutation.isPending}
              >
                {t(
                  'assignments.trash.hardDeleteSelected',
                  'Удалить выбранные',
                )}
              </Button>
              <Button
                danger
                onClick={handleExportAndDeleteSelected}
                disabled={
                  !selectedRowKeys.length || hardDeleteTrashMutation.isPending
                }
                loading={hardDeleteTrashMutation.isPending}
              >
                {t(
                  'assignments.trash.exportAndDeleteSelected',
                  'Скачать и удалить',
                )}
              </Button>
            </>
          )}
        </Space>
      }
    >
      <Form
        layout="inline"
        className="mb-4"
        onValuesChange={(_changedValues, allValues) => {
          setFilters({
            userId: allValues.userId,
            workplaceId: allValues.workplaceId,
            status: allValues.status,
            range: allValues.range,
          });
          setPage(1);
        }}
      >
        <Form.Item name="userId" label={t('assignments.user')}>
          <Select
            allowClear
            showSearch
            options={userOptions}
            placeholder={t('assignments.filters.user')}
            loading={usersQuery.isLoading}
            optionFilterProp="label"
            style={{ width: 240 }}
          />
        </Form.Item>
        <Form.Item name="workplaceId" label={t('assignments.workplace')}>
          <Select
            allowClear
            showSearch
            options={workplaceOptions}
            placeholder={t('assignments.filters.workplace')}
            loading={workplacesQuery.isLoading}
            optionFilterProp="label"
            style={{ width: 260 }}
          />
        </Form.Item>
        <Form.Item name="status" label={t('assignments.status.title')}>
          <Select
            allowClear
            options={statusOptions.map((value) => ({
              value,
              label:
                value === 'ACTIVE'
                  ? t('assignments.status.active')
                  : t('assignments.status.archived'),
            }))}
            style={{ width: 180 }}
          />
        </Form.Item>
        <Form.Item name="range" label={t('assignments.filters.period')}>
          <DatePicker.RangePicker showTime format="DD.MM.YYYY HH:mm" />
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        dataSource={assignments}
        columns={columns}
        loading={assignmentsQuery.isLoading}
        rowSelection={rowSelection}
        pagination={{
          current: page,
          pageSize,
          total: pagination.total ?? 0,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize ?? pageSize);
          },
          showSizeChanger: true,
        }}
      />

      {/* Модалка создания/редактирования назначения */}
      <Modal
        title={
          editingAssignment
            ? t('assignments.editTitle')
            : t('assignments.createTitle')
        }
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingAssignment(null);
          form.resetFields();
          setShiftRows([]);
          setTimeRangeForAll(null);
          setApplyTimeToAll(true);
        }}
        onOk={handleModalOk}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('assignments.user')}
            name="userId"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              showSearch
              options={userOptions}
              optionFilterProp="label"
              placeholder={t('assignments.filters.user')}
              loading={usersQuery.isLoading}
            />
          </Form.Item>
          <Form.Item
            label={t('assignments.workplace')}
            name="workplaceId"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              showSearch
              options={workplaceOptions}
              optionFilterProp="label"
              placeholder={t('assignments.filters.workplace')}
              loading={workplacesQuery.isLoading}
            />
          </Form.Item>
          <Form.Item
            label={t('assignments.status.title')}
            name="status"
            initialValue="ACTIVE"
          >
            <Select
              options={statusOptions.map((value) => ({
                value,
                label:
                  value === 'ACTIVE'
                    ? t('assignments.status.active')
                    : t('assignments.status.archived'),
              }))}
            />
          </Form.Item>

          <Form.Item
            label={t('assignments.filters.period')}
            name="dateRange"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <DatePicker.RangePicker
              format="DD.MM.YYYY"
              onChange={handleDateRangeChange}
            />
          </Form.Item>

          {shiftRows.length > 0 && (
            <>
              <Divider />
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text strong>
                  {t('assignments.shiftsTitle', 'График смен по дням')}
                </Typography.Text>

                <Space
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                  }}
                >
                  <TimePicker.RangePicker
                    format="HH:mm"
                    value={
                      timeRangeForAll &&
                      timeRangeForAll[0] &&
                      timeRangeForAll[1]
                        ? timeRangeForAll
                        : null
                    }
                    onChange={(range) => {
                      if (!range) {
                        setTimeRangeForAll(null);
                        return;
                      }
                      setTimeRangeForAll(range);
                      applyTimeRangeToAllRows(range);
                    }}
                  />
                  <Checkbox
                    checked={applyTimeToAll}
                    onChange={(e) => {
                      setApplyTimeToAll(e.target.checked);
                      if (e.target.checked && timeRangeForAll) {
                        applyTimeRangeToAllRows(timeRangeForAll, true);
                      }
                    }}
                  >
                    {t(
                      'assignments.applyToAllDays',
                      'Применить ко всем датам',
                    )}
                  </Checkbox>
                </Space>

                {Object.entries(groupedShiftRows).map(
                  ([dateKey, rowsForDate]) => {
                    const dateLabel =
                      rowsForDate[0]?.date.format('DD.MM.YYYY') ?? dateKey;

                    return (
                      <div
                        key={dateKey}
                        style={{
                          border: '1px solid #f0f0f0',
                          borderRadius: 8,
                          padding: 12,
                          background: '#fafafa',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                          }}
                        >
                          <Typography.Text strong>
                            {dateLabel}
                          </Typography.Text>
                          <Button
                            size="small"
                            type="link"
                            onClick={() =>
                              addIntervalForDate(rowsForDate[0].date)
                            }
                          >
                            {t(
                              'assignments.addIntervalForDay',
                              'Добавить интервал',
                            )}
                          </Button>
                        </div>

                        {rowsForDate.map((row) => (
                          <Space
                            key={row.key}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              width: '100%',
                              marginBottom: 4,
                            }}
                          >
                            <TimePicker.RangePicker
                              format="HH:mm"
                              value={
                                row.startTime && row.endTime
                                  ? [row.startTime, row.endTime]
                                  : null
                              }
                              onChange={(range) => {
                                setShiftRows((prev) =>
                                  sortShiftRows(
                                    prev.map((r) =>
                                      r.key === row.key
                                        ? {
                                            ...r,
                                            startTime: range?.[0] ?? null,
                                            endTime: range?.[1] ?? null,
                                          }
                                        : r,
                                    ),
                                  ),
                                );
                              }}
                            />
                            <Select
                              size="small"
                              style={{ minWidth: 160 }}
                              value={row.kind}
                              onChange={(value: ShiftKindType) => {
                                setShiftRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key
                                      ? { ...r, kind: value }
                                      : r,
                                  ),
                                );
                              }}
                              options={[
                                {
                                  value: 'DEFAULT',
                                  label: t(
                                    'assignments.shiftKind.default',
                                    'Обычная смена',
                                  ),
                                },
                                {
                                  value: 'OFFICE',
                                  label: t(
                                    'assignments.shiftKind.office',
                                    'Офис',
                                  ),
                                },
                                {
                                  value: 'REMOTE',
                                  label: t(
                                    'assignments.shiftKind.remote',
                                    'Удалёнка',
                                  ),
                                },
                                {
                                  value: 'DAY_OFF',
                                  label: t(
                                    'assignments.shiftKind.dayOff',
                                    'Day off / больничный',
                                  ),
                                },
                              ]}
                            />
                            {shiftRows.length > 1 && (
                              <Button
                                size="small"
                                type="link"
                                danger
                                onClick={() => removeRow(row.key)}
                              >
                                {t('common.delete') ?? 'Удалить'}
                              </Button>
                            )}
                          </Space>
                        ))}
                      </div>
                    );
                  },
                )}
              </Space>
            </>
          )}
        </Form>
      </Modal>

      {/* 🔔 Модалка запросов корректировок по назначению */}
      <Modal
        open={!!adjustmentsModalAssignment}
        width={900}
        title={t(
          'assignments.adjustmentsModalTitle',
          'Запросы корректировки по назначению',
        )}
        onCancel={() => setAdjustmentsModalAssignment(null)}
        footer={null}
      >
        {!adjustmentsModalAssignment || adjustmentsForModal.length === 0 ? (
          <Typography.Text>
            {t(
              'assignments.adjustmentsModalEmpty',
              'По этому назначению нет запросов корректировки.',
            )}
          </Typography.Text>
        ) : (
          <>
            {assignmentIntervalText && (
              <>
                <Typography.Text strong>
                  {t(
                    'assignments.adjustmentAssignmentInterval',
                    'Интервал назначения',
                  )}
                  : {assignmentIntervalText}
                </Typography.Text>
                <Divider />
              </>
            )}

            <Card
              size="small"
              style={{ marginBottom: 16 }}
              bodyStyle={{ padding: 16 }}
            >
              <Row gutter={24}>
                <Col xs={24} md={12}>
                  <Typography.Text strong>
                    Назначенный график (было)
                  </Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {datesForComparison.map((dateKey) => {
                      const dateLabel = dayjs(dateKey).format('DD.MM.YYYY');
                      const shifts = originalShiftsByDate[dateKey] ?? [];

                      return (
                        <Typography.Paragraph
                          key={dateKey}
                          style={{ marginBottom: 8 }}
                        >
                          <div style={{ fontWeight: 500 }}>{dateLabel}</div>
                          {shifts.length > 0 ? (
                            shifts.map((s) => {
                              const time = `${formatTime(
                                s.startsAt,
                              )} → ${formatTime(s.endsAt)}`;
                              const kindLabel = getShiftKindLabel(s.kind);
                              return (
                                <div key={s.id ?? `${time}-${kindLabel}`}>
                                  {time} ({kindLabel})
                                </div>
                              );
                            })
                          ) : (
                            <div>
                              {t(
                                'assignments.adjustments.noOriginal',
                                'Смен не было',
                              )}
                            </div>
                          )}
                        </Typography.Paragraph>
                      );
                    })}
                  </div>
                </Col>

                <Col xs={24} md={12}>
                  <Typography.Text strong>
                    Предложенная корректировка (стало)
                  </Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {datesForComparison.map((dateKey) => {
                      const dateLabel = dayjs(dateKey).format('DD.MM.YYYY');
                      const list = proposedShiftsByDate[dateKey] ?? [];

                      return (
                        <Typography.Paragraph
                          key={dateKey}
                          style={{ marginBottom: 8 }}
                        >
                          <div style={{ fontWeight: 500 }}>{dateLabel}</div>
                          {list.length > 0 ? (
                            list.map((adj, index) => {
                              const time = `${adj.startsAt} → ${adj.endsAt}`;
                              const kindLabel =
                                adj.kindLabel ??
                                t(
                                  'assignments.shiftKind.default',
                                  'Обычная смена',
                                );
                              return (
                                <div key={`${time}-${index}`}>
                                  {time} ({kindLabel})
                                </div>
                              );
                            })
                          ) : (
                            <div>
                              {t(
                                'assignments.adjustments.noProposal',
                                'Без изменений',
                              )}
                            </div>
                          )}
                        </Typography.Paragraph>
                      );
                    })}
                  </div>
                </Col>
              </Row>
            </Card>

            {hasChangesSummary && (
              <>
                <Typography.Title
                  level={5}
                  style={{ marginTop: 16, marginBottom: 8 }}
                >
                  {t(
                    'assignments.adjustments.comments',
                    'Комментарии сотрудника',
                  )}
                </Typography.Title>
                <Card size="small" bodyStyle={{ padding: 16 }}>
                  {changesSummaryByDate.map((item) => (
                    <Typography.Paragraph
                      key={item.dateKey}
                      style={{ marginBottom: 4 }}
                    >
                      {item.text}
                    </Typography.Paragraph>
                  ))}
                </Card>
              </>
            )}

            <Space
              style={{
                marginTop: 24,
                width: '100%',
                justifyContent: 'flex-end',
                display: 'flex',
              }}
            >
              <Button
                type="primary"
                loading={approveAdjustmentMutation.isPending}
                onClick={() => {
                  const payloads = adjustmentsForModal.map((adj) => ({
                    id: adj.id,
                    managerComment: undefined as string | undefined,
                  }));

                  (async () => {
                    for (const p of payloads) {
                      await approveAdjustmentMutation.mutateAsync(p);
                    }
                  })().catch(() => undefined);
                }}
              >
                {t('common.approve', 'Одобрить')}
              </Button>
              <Button
                danger
                loading={rejectAdjustmentMutation.isPending}
                onClick={() => {
                  const payloads = adjustmentsForModal.map((adj) => ({
                    id: adj.id,
                    managerComment: undefined as string | undefined,
                  }));

                  (async () => {
                    for (const p of payloads) {
                      await rejectAdjustmentMutation.mutateAsync(p);
                    }
                  })().catch(() => undefined);
                }}
              >
                {t('common.reject', 'Отклонить')}
              </Button>
            </Space>
          </>
        )}
      </Modal>
    </Card>
  );
};

export default AssignmentsPage;