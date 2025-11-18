import {
  Button,
  Card,
  DatePicker,
  Form,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  TimePicker,
  Checkbox,
  Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';
import {
  Assignment,
  AssignmentStatus,
  PaginatedResponse,
  User,
  Workplace,
  createAssignment,
  fetchAssignments,
  fetchAssignmentsFromTrash,
  fetchUsers,
  fetchWorkplaces,
  notifyAssignment,
  updateAssignment,
  completeAssignment,
  deleteAssignment,
  restoreAssignment,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

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

const AssignmentsPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  // режим: обычные назначения / корзина
  const [showTrash, setShowTrash] = useState(false);

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

  // ⚙️ тянем всех несистемных юзеров (бэк уже фильтрует isSystemUser=false),
  // а на фронте дополнительно оставляем только role=USER
  const usersQuery = useQuery<PaginatedResponse<User>>({
    queryKey: ['users', 'for-assignments'],
    queryFn: () =>
      fetchUsers({
        page: 1,
        pageSize: 100, // <= важно: на бэке стоит max(100)
      }),
    enabled: canManageAssignments,
    keepPreviousData: true,
  });

  const workplacesQuery = useQuery<PaginatedResponse<Workplace>>({
    queryKey: ['workplaces', 'options'],
    queryFn: () => fetchWorkplaces({ page: 1, pageSize: 100, isActive: true }),
    enabled: canManageAssignments,
  });

  const handleAssignmentError = (error: unknown) => {
    const axiosError = error as AxiosError<{ message?: string | string[] }>;
    const msg = axiosError?.response?.data?.message;

    if (typeof msg === 'string') {
      const normalized = msg.toLowerCase();

      if (normalized.includes('overlap') || normalized.includes('пересек')) {
        message.error(t('assignments.overlapError'));
        return;
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

  const createMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('assignments.created'));
      setIsModalOpen(false);
      setEditingAssignment(null);
      form.resetFields();
      setShiftRows([]);
      setTimeRangeForAll(null);
      setApplyTimeToAll(true);
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
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
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('assignments.updated'));
      setIsModalOpen(false);
      setEditingAssignment(null);
      form.resetFields();
      setShiftRows([]);
      setTimeRangeForAll(null);
      setApplyTimeToAll(true);
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
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
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('assignments.completed'));
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  // 🗑 мягкое удаление (в корзину)
  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) => deleteAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(
        t('assignments.deleted', 'Назначение перемещено в корзину'),
      );
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  // ♻️ восстановление из корзины
  const restoreMutation = useMutation({
    mutationFn: (assignmentId: string) => restoreAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(
        t('assignments.restoredFromTrash', 'Назначение восстановлено'),
      );
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
    },
  });

  // Универсально достаём список назначений из data/items
  const assignments = useMemo(() => {
    const raw = assignmentsQuery.data as any;
    if (!raw) return [];
    return raw.data ?? raw.items ?? [];
  }, [assignmentsQuery.data]);

  // Универсально достаём пагинацию
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

  // Считаем, у скольких сотрудников сейчас 2 активных назначения (по текущему списку)
  const activeAssignmentsPerUser = useMemo(() => {
    const map: Record<string, number> = {};
    const now = dayjs();

    for (const item of assignments) {
      if (item.status !== 'ACTIVE') continue;

      const start = dayjs(item.startsAt);
      const end = item.endsAt ? dayjs(item.endsAt) : null;

      // активное "сейчас": start <= now <= end (или без конца)
      if (start.isAfter(now)) continue;
      if (end && end.isBefore(now)) continue;

      map[item.userId] = (map[item.userId] ?? 0) + 1;
    }

    return map;
  }, [assignments]);

  // единая функция открытия модалки редактирования (и для кнопки, и для клика по датам)
  const handleOpenEdit = useCallback(
    (record: Assignment) => {
      // в режиме корзины редактирование не даём
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
        // если с бэка пришли смены — восстанавливаем их
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
        // fallback: строим из общего периода, если есть
        const start = dayjs(record.startsAt);
        const end = record.endsAt ? dayjs(record.endsAt) : start;

        const startDate = start.startOf('day');
        const endDate = end.startOf('day');

        form.setFieldsValue({
          dateRange: [startDate, endDate],
        });

        if (startDate.isSame(endDate, 'day') && record.endsAt) {
          // если в один день — ставим одну смену по фактическому времени
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
          // иначе — только даты, времена проставит пользователь
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
          const count = activeAssignmentsPerUser[record.userId] ?? 0;

          return (
            <Space size="small">
              <span>{label}</span>
              {count >= 2 && !showTrash && (
                <Tag color="orange">{t('assignments.twoActiveTag')}</Tag>
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
        // в списке показываем только ДАТЫ (как ты просил),
        // по клику — попап с графиком (кроме корзины)
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
        render: (value: AssignmentStatus) => (
          <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>
            {value === 'ACTIVE'
              ? t('assignments.status.active')
              : t('assignments.status.archived')}
          </Tag>
        ),
      },
      {
        title: t('workplaces.actions'),
        key: 'actions',
        render: (_value, record) => {
          // 🔄 режим корзины — только восстановление
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

              {/* 🗑 появляется только для ARCHIVED, кидает в корзину */}
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
      activeAssignmentsPerUser,
      handleOpenEdit,
      notifyMutation,
      notifyingId,
      completeMutation.isPending,
      deleteMutation.isPending,
      restoreMutation.isPending,
      showTrash,
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

  // ➕ добавить ещё один интервал в тот же день – после последнего интервала этого дня
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

  // 🗑 удалить конкретный интервал
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

      // общий период назначения — min(startsAt) ... max(endsAt)
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

  // группируем смены по дате для аккуратного отображения блоками
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

  return (
    <Card
      title={t('assignments.manageTitle')}
      extra={
        <Space>
          <Button
            type={showTrash ? 'default' : 'primary'}
            onClick={() => setShowTrash(false)}
          >
            {t('assignments.viewActive', 'Назначения')}
          </Button>
          <Button
            type={showTrash ? 'primary' : 'default'}
            onClick={() => setShowTrash(true)}
          >
            {t('assignments.viewTrash', 'Корзина')}
          </Button>
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

          {/* старый isOpenEnded больше не нужен, поэтому убрали */}
        </Form>
      </Modal>
    </Card>
  );
};

export default AssignmentsPage;