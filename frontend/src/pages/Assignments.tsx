import {
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Form,
  Input,
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
  AssignmentRequest,
  AssignmentRequestStatus,
  approveAssignmentRequest,
  fetchAssignmentRequests,
  rejectAssignmentRequest,
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

type AssignmentsQueryResult =
  | PaginatedResponse<Assignment>
  | {
      items: Assignment[];
      total: number;
      page: number;
      pageSize: number;
    };

type ShiftKindType = 'DEFAULT' | 'OFFICE' | 'REMOTE' | 'DAY_OFF';

type ShiftRow = {
  key: string;
  date: Dayjs;
  startTime: Dayjs | null;
  endTime: Dayjs | null;
  kind: ShiftKindType;
};

type ProposedShift = {
  startsAt: string;
  endsAt: string;
  kindLabel: string | null;
};

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


  const [isAssignmentRequestsModalOpen, setIsAssignmentRequestsModalOpen] =
    useState(false);
  const [currentAssignmentRequestIndex, setCurrentAssignmentRequestIndex] =
    useState(0);
  const [approveRequest, setApproveRequest] =
    useState<AssignmentRequest | null>(null);
  // 🔹 модалка со свободными сотрудниками
  const [isFreeUsersModalOpen, setIsFreeUsersModalOpen] = useState(false);

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

  // 🔢 все активные назначения (для подсчёта по сотрудникам)
  const assignmentsAllActiveQuery = useQuery<AssignmentsQueryResult>({
    queryKey: ['assignments', 'all-active'],
    queryFn: () =>
      fetchAssignments({
        status: 'ACTIVE',
        page: 1,
        pageSize: 100, // бэковый лимит
      }),
    enabled: canManageAssignments && !showTrash,
    staleTime: 60_000,
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

  
  const assignmentRequestsQuery = useQuery({
    queryKey: ['assignment-requests', 'for-assignments', 'PENDING'],
    queryFn: () =>
      fetchAssignmentRequests({
        page: 1,
        pageSize: 50,
        status: 'PENDING',
      }),
    enabled: canManageAssignments,
    staleTime: 30_000,
  });

const adjustments: ScheduleAdjustment[] = useMemo(() => {
    const raw: any = scheduleAdjustmentsQuery.data;
    if (!raw) return [];
    return (raw.items ?? raw.data ?? []) as ScheduleAdjustment[];
  }, [scheduleAdjustmentsQuery.data]);

  const pendingAdjustments: ScheduleAdjustment[] = useMemo(
    () => adjustments.filter((a) => a.status === 'PENDING'),
    [adjustments],
  );

  const adjustmentsCount = useMemo(() => {
    const raw: any = scheduleAdjustmentsQuery.data;
    const base = pendingAdjustments.length;
    const metaTotal = raw?.meta?.total ?? raw?.total;
    return typeof metaTotal === 'number' ? metaTotal : base;
  }, [scheduleAdjustmentsQuery.data, pendingAdjustments]);

  
  const [locallyProcessedAssignmentRequestIds, setLocallyProcessedAssignmentRequestIds] =
    useState<string[]>([]);

  const rawAssignmentRequests: AssignmentRequest[] =
    (assignmentRequestsQuery.data?.data as AssignmentRequest[] | undefined) ?? [];

  const pendingAssignmentRequests = useMemo(
    () =>
      rawAssignmentRequests.filter(
        (r) => !locallyProcessedAssignmentRequestIds.includes(r.id),
      ),
    [rawAssignmentRequests, locallyProcessedAssignmentRequestIds],
  );

  const pendingAssignmentRequestsCount = pendingAssignmentRequests.length;

const assignmentsWithAdjustment = useMemo(() => {
    const set = new Set<string>();
    pendingAdjustments.forEach((adj) => {
      if (adj.assignmentId) set.add(adj.assignmentId);
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
    mutationFn: async (payload: {
      id: string;
      managerComment?: string;
      assignmentId?: string;
      newWorkplaceId?: string | null;
    }) => {
      const { id, managerComment, assignmentId, newWorkplaceId } = payload;

      if (assignmentId && newWorkplaceId) {
        await updateAssignment(assignmentId, { workplaceId: newWorkplaceId } as any);
      }

      return approveScheduleAdjustment(id, {
        managerComment,
      });
    },
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



  const handleAssignmentRequestProcessed = (id: string) => {
    // Локально убираем запрос из списка, чтобы он сразу пропадал из UI
    setLocallyProcessedAssignmentRequestIds((prev) =>
      prev.includes(id) ? prev : [...prev, id],
    );

    // Подправляем индекс текущего запроса относительно нового количества
    setCurrentAssignmentRequestIndex((prevIndex) => {
      const total = pendingAssignmentRequests.length;
      const nextTotal = Math.max(0, total - 1);

      if (nextTotal === 0) {
        setIsAssignmentRequestsModalOpen(false);
        return 0;
      }

      if (prevIndex >= nextTotal) {
        return Math.max(0, nextTotal - 1);
      }

      return prevIndex;
    });
  };
  const approveAssignmentRequestMutation = useMutation({
    mutationFn: (payload: { id: string; decisionComment?: string }) =>
      approveAssignmentRequest(payload.id, {
        decisionComment: payload.decisionComment,
      }),
    onSuccess: (_data, variables) => {
      handleAssignmentRequestProcessed(variables.id);
      queryInvalidateAll();
      message.success(
        t('assignments.requestApproved', 'Запрос на назначение одобрен'),
      );
    },
    onError: (error: unknown, variables) => {
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const msg = axiosError?.response?.data?.message;

      if (typeof msg === 'string') {
        const normalized = msg.toLowerCase();

        if (
          normalized.includes('уже обработан') ||
          normalized.includes('already processed')
        ) {
          // Бэк говорит, что запрос уже обработан — локально тоже его убираем
          if (variables?.id) {
            handleAssignmentRequestProcessed(variables.id);
            queryInvalidateAll();
          }
          message.info(msg);
          return;
        }
      }

      handleAssignmentError(error);
    },
  });

  const rejectAssignmentRequestMutation = useMutation({
    mutationFn: (payload: { id: string; decisionComment?: string }) =>
      rejectAssignmentRequest(payload.id, {
        decisionComment: payload.decisionComment,
      }),
    onSuccess: (_data, variables) => {
      handleAssignmentRequestProcessed(variables.id);
      queryInvalidateAll();
      message.success(
        t('assignments.requestRejected', 'Запрос на назначение отклонён'),
      );
    },
    onError: (error: unknown, variables) => {
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const msg = axiosError?.response?.data?.message;

      if (typeof msg === 'string') {
        const normalized = msg.toLowerCase();

        if (
          normalized.includes('уже обработан') ||
          normalized.includes('already processed')
        ) {
          if (variables?.id) {
            handleAssignmentRequestProcessed(variables.id);
            queryInvalidateAll();
          }
          message.info(msg);
          return;
        }
      }

      handleAssignmentError(error);
    },
  });

  const mapKindLabelToKind = (label?: string | null): ShiftKindType => {
    if (!label) return 'DEFAULT';
    const v = label.trim().toLowerCase();

    // Русские подписи из UI/комментариев
    if (v.includes('офис')) return 'OFFICE';
    if (v.includes('удал') || v.includes('remote')) return 'REMOTE';
    if (v.includes('day off') || v.includes('выход') || v.includes('больнич')) {
      return 'DAY_OFF';
    }

    // Если кто-то прислал уже enum-значение
    if (v === 'office') return 'OFFICE';
    if (v === 'remote') return 'REMOTE';
    if (v === 'day_off') return 'DAY_OFF';
    if (v === 'default') return 'DEFAULT';

    return 'DEFAULT';
  };

  const parseAssignmentRequestIntervalsFromComment = (
    comment?: string | null,
  ): Record<string, ProposedShift[]> => {
    const result: Record<string, ProposedShift[]> = {};
    if (!comment) return result;

    // Поддержка формата с маркером (как в корректировках)
    const marker = 'Интервалы, которые сотрудник предлагает:';
    const markerIdx = comment.indexOf(marker);

    const slice = markerIdx >= 0 ? comment.slice(markerIdx + marker.length) : comment;

    const lines = slice
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

  const openApproveAssignmentRequest = (r: AssignmentRequest) => {
    setApproveRequest(r);
    setEditingAssignment(null);

    // закрываем модалку со списком запросов, чтобы была одна логика/один UI
    setIsAssignmentRequestsModalOpen(false);

    form.resetFields();
    setShiftRows([]);
    setTimeRangeForAll(null);
    setApplyTimeToAll(true);

    const startDate = dayjs(r.dateFrom).startOf('day');
    const endDate = dayjs(r.dateTo).startOf('day');

    const userIdFromRequest =
      r.requesterId ??
      r.userId ??
      (r.requester && 'id' in r.requester ? r.requester.id : undefined) ??
      (r.user && 'id' in r.user ? r.user.id : undefined);

    form.setFieldsValue({
      userId: userIdFromRequest,
      workplaceId: r.workplaceId,
      status: 'ACTIVE',
      dateRange: [startDate, endDate],
    });

    const parsedByDate = parseAssignmentRequestIntervalsFromComment(r.comment);

    const rows: ShiftRow[] = [];
    let current = startDate.clone();
    while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
      const dateKey = current.format('YYYY-MM-DD');
      const list = parsedByDate[dateKey] ?? [];

      if (list.length) {
        list.forEach((it, idx) => {
          const [sh, sm] = it.startsAt.split(':').map((x) => Number(x));
          const [eh, em] = it.endsAt.split(':').map((x) => Number(x));
          const st = dayjs().hour(sh).minute(sm).second(0).millisecond(0);
          const en = dayjs().hour(eh).minute(em).second(0).millisecond(0);

          rows.push({
            key: `${r.id}-${dateKey}-${idx}`,
            date: current.clone(),
            startTime: st,
            endTime: en,
            kind: mapKindLabelToKind(it.kindLabel),
          });
        });
      } else {
        rows.push({
          key: `${r.id}-${dateKey}`,
          date: current.clone(),
          startTime: null,
          endTime: null,
          kind: 'DEFAULT',
        });
      }

      current = current.add(1, 'day');
    }

    setShiftRows(sortShiftRows(rows));
    setIsModalOpen(true);
  };


  const renderAssignmentRequestsContent = () => {
    if (assignmentRequestsQuery.isLoading && !pendingAssignmentRequests.length) {
      return (
        <Result
          status="info"
          title={t('common.loading', 'Загрузка...')}
        />
      );
    }

    if (!pendingAssignmentRequests.length) {
      return (
        <Result
          status="info"
          title={t('assignments.noRequests', 'Запросов нет')}
        />
      );
    }

    const total = pendingAssignmentRequests.length;
    const safeIndex =
      currentAssignmentRequestIndex < 0
        ? 0
        : currentAssignmentRequestIndex >= total
        ? total - 1
        : currentAssignmentRequestIndex;

    const request = pendingAssignmentRequests[safeIndex];

    const requesterUser = (request as any).requester as User | undefined;
    const legacyUserFromRequest = (request as any).user as User | undefined;

    const userIdFromRequest =
      (request as any).requesterId ??
      (request as any).userId ??
      requesterUser?.id ??
      legacyUserFromRequest?.id ??
      null;

    const userFromUsers =
      userIdFromRequest && userById[userIdFromRequest]
        ? userById[userIdFromRequest]
        : undefined;

    const userForDisplay = requesterUser || legacyUserFromRequest || userFromUsers;

    const userLabel =
      (typeof userForDisplay?.fullName === 'string' &&
        userForDisplay.fullName.trim()) ||
      (typeof userForDisplay?.email === 'string' &&
        userForDisplay.email.trim()) ||
      (userIdFromRequest ?? '') ||
      t('assignments.user', 'Сотрудник');

    const workplaceLabel = request.workplace
      ? `${request.workplace.code ? `${request.workplace.code} — ` : ''}${request.workplace.name}`
      : t('assignments.workplace', 'Рабочее место');

    const dateFrom = dayjs(request.dateFrom);
    const dateTo = dayjs(request.dateTo);

    const intervalsByDate =
      parseAssignmentRequestIntervalsFromComment(request.comment);

    const dateKeys = Object.keys(intervalsByDate).sort();

    const handlePrev = () => {
      if (total <= 1) return;
      setCurrentAssignmentRequestIndex(
        safeIndex === 0 ? total - 1 : safeIndex - 1,
      );
    };

    const handleNext = () => {
      if (total <= 1) return;
      setCurrentAssignmentRequestIndex(
        safeIndex === total - 1 ? 0 : safeIndex + 1,
      );
    };

    const handleApprove = () => {
      openApproveAssignmentRequest(request);
    };

    const handleReject = () => {
      Modal.confirm({
        title: t(
          'assignments.requestRejectConfirmTitle',
          'Отклонить запрос на назначение?',
        ),
        content: t(
          'assignments.requestRejectConfirmContent',
          'Запрос будет отклонён без создания назначения.',
        ),
        okText: t('common.reject', 'Отказать'),
        cancelText: t('common.cancel', 'Отмена'),
        centered: true,
        onOk: () =>
          rejectAssignmentRequestMutation
            .mutateAsync({ id: request.id })
            .catch(() => undefined),
      });
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Typography.Text>
            {t('assignments.requestCounter', 'Запрос {{current}} из {{total}}', {
              current: safeIndex + 1,
              total,
            })}
          </Typography.Text>
        </div>

        <Card size="small" bordered>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary">
                {t('assignments.user', 'Сотрудник')}:
              </Typography.Text>
              <br />
              <Typography.Text strong>{userLabel}</Typography.Text>
            </div>

            <div>
              <Typography.Text type="secondary">
                {t('assignments.workplace', 'Рабочее место')}:
              </Typography.Text>
              <br />
              <Typography.Text strong>{workplaceLabel}</Typography.Text>
            </div>

            <div>
              <Typography.Text type="secondary">
                {t('assignments.period', 'Период')}:
              </Typography.Text>
              <br />
              <Typography.Text strong>
                {dateFrom.format('DD.MM.YYYY')} – {dateTo.format('DD.MM.YYYY')}
              </Typography.Text>
            </div>

            <div>
              <Typography.Text type="secondary">
                {t('assignments.intervals', 'Интервалы')}:
              </Typography.Text>
              <br />
              {dateKeys.length === 0 && (
                <Typography.Text>—</Typography.Text>
              )}
              <Space
                direction="vertical"
                size={4}
                style={{ marginTop: 4, width: '100%' }}
              >
                {dateKeys.map((dateKey) => {
                  const date = dayjs(dateKey, 'YYYY-MM-DD');
                  const list = intervalsByDate[dateKey] ?? [];
                  return (
                    <div key={dateKey}>
                      <Typography.Text strong>
                        {date.format('DD.MM.YYYY')}
                      </Typography.Text>
                      <br />
                      {list.length === 0 ? (
                        <Typography.Text>—</Typography.Text>
                      ) : (
                        list.map((it, idx) => (
                          <Typography.Text key={idx}>
                            {it.startsAt} – {it.endsAt}
                            {it.kindLabel ? ` (${it.kindLabel})` : ''}
                            {idx < list.length - 1 ? ', ' : ''}
                          </Typography.Text>
                        ))
                      )}
                    </div>
                  );
                })}
              </Space>
            </div>

          </Space>
        </Card>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 16,
          }}
        >
          <Space>
            {total > 1 && (
              <Button onClick={handlePrev}>
                ◀
              </Button>
            )}
          </Space>

          <Space>
            <Button type="primary" onClick={handleApprove}>
              {t('common.approve', 'Одобрить')}
            </Button>
            <Button danger onClick={handleReject}>
              {t('common.reject', 'Отказать')}
            </Button>
          </Space>

          <Space>
            {total > 1 && (
              <Button onClick={handleNext}>
                ▶
              </Button>
            )}
          </Space>
        </div>
      </div>
    );
  };


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

  const allActiveAssignments: Assignment[] = useMemo(() => {
    const raw = assignmentsAllActiveQuery.data as any;
    if (!raw) return [];
    return raw.data ?? raw.items ?? [];
  }, [assignmentsAllActiveQuery.data]);

  const assignmentsCountByUser: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    allActiveAssignments.forEach((a) => {
      if (!a.userId) return;
      map[a.userId] = (map[a.userId] ?? 0) + 1;
    });
    return map;
  }, [allActiveAssignments]);

  const handleOpenEdit = useCallback(
    (record: Assignment) => {
      if (showTrash) return;

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

            // ✅ Режим одобрения запроса на назначение:
      // 1) создаём Assignment
      // 2) помечаем запрос как APPROVED
      if (approveRequest) {
        payload.status = 'ACTIVE';
        await createMutation.mutateAsync(payload);
        await approveAssignmentRequestMutation.mutateAsync({
          id: approveRequest.id,
        });
        setApproveRequest(null);
        return;
      }

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

  const allUsers: User[] = usersQuery.data?.data ?? [];

  const userById: Record<string, User> = useMemo(() => {
    const map: Record<string, User> = {};
    (allUsers || []).forEach((u) => {
      if (u && u.id) {
        map[u.id] = u;
      }
    });
    return map;
  }, [allUsers]);

  const usersWithoutActiveAssignments: User[] = useMemo(
    () =>
      allUsers.filter(
        (u) => u.role === 'USER' && (assignmentsCountByUser[u.id] ?? 0) === 0,
      ),
    [allUsers, assignmentsCountByUser],
  );

  const userOptions =
    allUsers
      .filter((u) => u.role === 'USER')
      .map((item) => {
        const count = assignmentsCountByUser[item.id] ?? 0;
        const baseLabel = `${item.fullName ?? item.email} (${item.email})`;

        return {
          value: item.id,
          label: (
            <span
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <span
                style={{
                  color: count === 0 ? '#389e0d' : 'inherit',
                }}
              >
                {baseLabel}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: count === 0 ? '#389e0d' : '#999',
                  marginLeft: 8,
                }}
              >
                {count === 0
                  ? 'нет активных назначений'
                  : `${count} активн.`}
              </span>
            </span>
          ),
          searchLabel: baseLabel,
        };
      }) ?? [];

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

  const parseDesiredWorkplaceLabelFromComment = (
    comment?: string | null,
  ): string | null => {
    if (!comment) return null;
    const prefix = 'Желаемое рабочее место:';
    const line = comment
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith(prefix));
    if (!line) return null;
    const label = line.slice(prefix.length).trim();
    return label || null;
  };

  // 🔧 ОБНОВЛЁННЫЙ БЛОК: собираем интервалы из всех запросов по этому назначению
  const proposedShiftsByDate = useMemo(() => {
    const merged: Record<string, ProposedShift[]> = {};

    adjustmentsForModal.forEach((adj) => {
      if (!adj.comment || !adj.comment.trim()) return;

      const parsed = parseRequestedScheduleFromComment(adj.comment);

      Object.entries(parsed).forEach(([dateKey, shifts]) => {
        if (!merged[dateKey]) {
          merged[dateKey] = [];
        }
        merged[dateKey].push(...shifts);
      });
    });

    return merged;
  }, [adjustmentsForModal]);

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

  const changesSummaryByDate = useMemo(() => {
    const result: { dateKey: string; text: string }[] = [];

    datesForComparison.forEach((dateKey) => {
      const orig = originalShiftsByDate[dateKey] ?? [];
      const next = proposedShiftsByDate[dateKey] ?? [];

      if (!orig.length && !next.length) return;

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
        orig.map((s) => (s.kind ?? 'DEFAULT').toString(),
        ),
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

      if (sameTimes && sameKinds) return;

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

  const desiredWorkplaceLabelForModal = useMemo(() => {
    for (const adj of adjustmentsForModal) {
      const label = parseDesiredWorkplaceLabelFromComment(adj.comment);
      if (label) {
        return label;
      }
    }
    return null;
  }, [adjustmentsForModal]);

  const desiredWorkplaceOptionForModal = useMemo(
    () =>
      desiredWorkplaceLabelForModal
        ? workplaceOptions.find((o) => o.label === desiredWorkplaceLabelForModal) ?? null
        : null,
    [desiredWorkplaceLabelForModal, workplaceOptions],
  );

  const currentWorkplaceLabelForModal = useMemo(() => {
    const wp: any = (adjustmentsModalAssignment as any)?.workplace;
    if (!wp || !wp.name) return null;
    return wp.code ? `${wp.code} — ${wp.name}` : wp.name;
  }, [adjustmentsModalAssignment]);


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

          <Badge
            count={pendingAssignmentRequestsCount}
            size="small"
            overflowCount={99}
            offset={[8, 0]}
          >
            <Button
              type="default"
              onClick={() => {
                setCurrentAssignmentRequestIndex(0);
                setIsAssignmentRequestsModalOpen(true);
              }}
            >
              {t('assignments.assignmentRequests', 'Запросы на назначение')}
            </Button>
          </Badge>

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
      {/* Фильтры + индикатор свободных сотрудников */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 16,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <Form
          layout="inline"
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
              optionFilterProp="searchLabel"
              style={{ width: 260 }}
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

        {!showTrash && (
          <Typography.Text
            type="secondary"
            style={{ whiteSpace: 'nowrap', marginBottom: 4 }}
          >
            Свободных сотрудников:{' '}
            {usersQuery.isLoading || assignmentsAllActiveQuery.isLoading
              ? '…'
              : usersWithoutActiveAssignments.length}
            {usersWithoutActiveAssignments.length > 0 &&
              !usersQuery.isLoading &&
              !assignmentsAllActiveQuery.isLoading && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => setIsFreeUsersModalOpen(true)}
                  style={{ paddingLeft: 8 }}
                >
                  Показать
                </Button>
              )}
          </Typography.Text>
        )}
      </div>

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

      {/* модалка со свободными сотрудниками */}
      
      <Modal
        open={isAssignmentRequestsModalOpen}
        onCancel={() => {
          setCurrentAssignmentRequestIndex(0);
          setIsAssignmentRequestsModalOpen(false);
        }}
        footer={null}
        width={980}
        title={t(
          'assignments.assignmentRequestsTitle',
          'Запросы на назначение',
        )}
      >
                {renderAssignmentRequestsContent()}
      </Modal>

<Modal
        open={isFreeUsersModalOpen}
        title="Сотрудники без активных назначений"
        onCancel={() => setIsFreeUsersModalOpen(false)}
        footer={
          <Button type="primary" onClick={() => setIsFreeUsersModalOpen(false)}>
            Закрыть
          </Button>
        }
      >
        {usersQuery.isLoading || assignmentsAllActiveQuery.isLoading ? (
          <Typography.Paragraph>Загрузка...</Typography.Paragraph>
        ) : usersWithoutActiveAssignments.length === 0 ? (
          <Typography.Paragraph>
            Все сотрудники имеют хотя бы одно активное назначение.
          </Typography.Paragraph>
        ) : (
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            {usersWithoutActiveAssignments.map((u) => (
              <li key={u.id}>
                {u.fullName ?? u.email} {u.email ? `(${u.email})` : ''}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* модалка создания/редактирования */}
      <Modal
        title={
          approveRequest
            ? t('assignments.approveRequestTitle', 'Одобрить запрос на назначение')
            : editingAssignment
              ? t('assignments.editTitle')
              : t('assignments.createTitle')
        }
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingAssignment(null);
          setApproveRequest(null);
          form.resetFields();
          setShiftRows([]);
          setTimeRangeForAll(null);
          setApplyTimeToAll(true);
        }}
        onOk={handleModalOk}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={createMutation.isPending || updateMutation.isPending || approveAssignmentRequestMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('assignments.user')}
            name="userId"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              disabled={!!approveRequest}
              showSearch
              options={userOptions}
              optionFilterProp="searchLabel"
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
              disabled={!!approveRequest}
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
              disabled={!!approveRequest}
              format="DD.MM.YYYY"
              onChange={approveRequest ? undefined : handleDateRangeChange}
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
                    disabled={!!approveRequest}
                    format="HH:mm"
                    value={
                      timeRangeForAll &&
                      timeRangeForAll[0] &&
                      timeRangeForAll[1]
                        ? timeRangeForAll
                        : null
                    }
                    onChange={(range) => {
                      if (approveRequest) return;
                      if (!range) {
                        setTimeRangeForAll(null);
                        return;
                      }
                      setTimeRangeForAll(range);
                      applyTimeRangeToAllRows(range);
                    }}
                  />
                  <Checkbox
                    disabled={!!approveRequest}
                    checked={applyTimeToAll}
                    onChange={(e) => {
                      if (approveRequest) return;
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
                            disabled={!!approveRequest}
                            onClick={() => {
                              if (approveRequest) return;
                              addIntervalForDate(rowsForDate[0].date);
                            }}
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
                              disabled={!!approveRequest}
                              format="HH:mm"
                              value={
                                row.startTime && row.endTime
                                  ? [row.startTime, row.endTime]
                                  : null
                              }
                              onChange={(range) => {
                                if (approveRequest) return;
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
                              disabled={!!approveRequest}
                              size="small"
                              style={{ minWidth: 160 }}
                              value={row.kind}
                              onChange={(value: ShiftKindType) => {
                                if (approveRequest) return;
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
                            {shiftRows.length > 1 && !approveRequest && (
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

      {/* модалка запросов корректировок */}
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

            {(currentWorkplaceLabelForModal || desiredWorkplaceLabelForModal) && (
              <>
                <Typography.Title
                  level={5}
                  style={{ marginTop: 0, marginBottom: 8 }}
                >
                  {t(
                    'assignments.adjustments.workplaceTitle',
                    'Рабочее место',
                  )}
                </Typography.Title>
                <Typography.Paragraph style={{ marginBottom: 8 }}>
                  {currentWorkplaceLabelForModal && (
                    <div>
                      <Typography.Text type="secondary">
                        {t(
                          'assignments.adjustments.currentWorkplace',
                          'Текущее:',
                        )}
                      </Typography.Text>{' '}
                      {currentWorkplaceLabelForModal}
                    </div>
                  )}
                  {desiredWorkplaceLabelForModal && (
                    <div>
                      <Typography.Text type="secondary">
                        {t(
                          'assignments.adjustments.desiredWorkplace',
                          'Запросил перевод на:',
                        )}
                      </Typography.Text>{' '}
                      {desiredWorkplaceLabelForModal}
                    </div>
                  )}
                </Typography.Paragraph>
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
                  const newWorkplaceId = desiredWorkplaceOptionForModal?.value ?? null;

                  const payloads = adjustmentsForModal.map((adj) => ({
                    id: adj.id,
                    managerComment: undefined as string | undefined,
                    assignmentId: adj.assignmentId,
                    newWorkplaceId,
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