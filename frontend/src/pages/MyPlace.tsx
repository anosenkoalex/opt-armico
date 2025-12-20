/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Button,
  Card,
  Descriptions,
  Flex,
  List,
  Modal,
  Calendar,
  Result,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  Select,
  TimePicker,
  Space,
  Input,
  InputNumber,
  Form,
  DatePicker,
  Checkbox,
  Divider,
  Alert,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { Assignment, CurrentWorkplaceResponse, Slot, AssignmentRequest, PlannerMatrixResponse, PlannerMatrixRow, PlannerMatrixSlot } from '../api/client.js';

import {
  fetchCurrentWorkplace,
  fetchMySchedule,
  requestAssignmentScheduleAdjustment,
  changeMyPassword,
  requestAssignment,
  fetchWorkplaces,
  fetchAssignmentRequests,
  createMyWorkReport,
  fetchPlannerMatrix,
} from '../api/client.js';
import type { WorkReport, StatisticsResponse } from '../api/client.js';
import { fetchWorkReports, fetchStatistics } from '../api/client.js';


import { useAuth } from '../context/AuthContext.js';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const GRID_CELL_WIDTH = 80;
const GRID_ROW_HEIGHT = 36;
const GRID_ROW_VERTICAL_PADDING = 8;
const GRID_MAX_HEIGHT = 440;
const GRID_HEADER_HEIGHT = GRID_ROW_HEIGHT + GRID_ROW_VERTICAL_PADDING * 2;

const clampDateToRange = (d: Dayjs, from: Dayjs, to: Dayjs) => {
  if (d.isBefore(from, 'day')) return from;
  if (d.isAfter(to, 'day')) return to;
  return d;
};

type PlannerRowWithLanes = {
  row: PlannerMatrixRow;
  visibleSlots: PlannerMatrixSlot[];
  laneById: Record<string, number>;
  lanesCount: number;
  primaryWorkplaceKey: string;
};

function buildLanesForMyPlace(
  slots: PlannerMatrixSlot[],
): { laneById: Record<string, number>; lanesCount: number } {
  const sorted = [...slots].sort(
    (a, b) => dayjs(a.from).valueOf() - dayjs(b.from).valueOf(),
  );

  const laneEndTimes: Dayjs[] = [];
  const laneById: Record<string, number> = {};

  for (const slot of sorted) {
    const start = dayjs(slot.from);
    let laneIndex = 0;

    for (let i = 0; i < laneEndTimes.length; i++) {
      if (
        !laneEndTimes[i] ||
        laneEndTimes[i].isSame(start) ||
        laneEndTimes[i].isBefore(start)
      ) {
        laneIndex = i;
        break;
      }
      laneIndex = laneEndTimes.length;
    }

    if (laneIndex === laneEndTimes.length) {
      laneEndTimes.push(dayjs(slot.to ?? slot.from));
    } else {
      laneEndTimes[laneIndex] = dayjs(slot.to ?? slot.from);
    }

    laneById[slot.id] = laneIndex;
  }

  return { laneById, lanesCount: laneEndTimes.length || 1 };
}


type ShiftKindType = 'DEFAULT' | 'OFFICE' | 'REMOTE' | 'DAY_OFF';
type AssignmentStatus = 'ACTIVE' | 'ARCHIVED' | 'PENDING' | 'REJECTED';

type AssignmentWithStats = Assignment & {
  activeSlots: number;
  totalSlots: number;
  totalMinutes: number;
};

type Workplace = {
  id: string;
  code?: string | null;
  name: string;
  isActive?: boolean | null;
};

type PaginatedResponse<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
};

type CorrectionInterval = {
  date: Dayjs;
  from: Dayjs;
  to: Dayjs;
  shiftKind: ShiftKindType;
};

function humanizeDateRange(from: Dayjs, to: Dayjs) {
  const fromStr = from.format('DD.MM.YYYY');
  const toStr = to.format('DD.MM.YYYY');
  if (fromStr === toStr) return fromStr;
  return `${fromStr} → ${toStr}`;
}

/**
 * Достаём начало/конец назначения независимо от того, как оно названо в API.
 */
function getAssignmentInterval(assignment: any): [Dayjs | null, Dayjs | null] {
  const startRaw =
    assignment.from ??
    assignment.startsAt ??
    assignment.dateFrom ??
    assignment.startDate ??
    null;

  const endRaw =
    assignment.to ?? assignment.endsAt ?? assignment.dateTo ?? assignment.endDate ?? null;

  if (!startRaw && !endRaw) return [null, null];

  const start = startRaw ? dayjs(startRaw) : endRaw ? dayjs(endRaw) : null;
  const end = endRaw ? dayjs(endRaw) : start;

  if (!start || !end) return [null, null];
  return [start, end];
}

function buildDateRangeKeys(from: Dayjs, to: Dayjs) {
  const start = from.startOf('day');
  const end = to.startOf('day');
  const keys: string[] = [];
  let cursor = start;

  while (!cursor.isAfter(end, 'day')) {
    keys.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }

  return keys;
}

const MyPlacePage = () => {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const currentUserId = profile?.id ?? (user as any)?.sub ?? (user as any)?.id ?? null;

  const [selectedAssignment, setSelectedAssignment] =
    useState<AssignmentWithStats | null>(null);
  const [selectedAssignmentShifts, setSelectedAssignmentShifts] = useState<
    { date: Dayjs; from: Dayjs; to: Dayjs; hours: number }[]
  >([]);

  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionAssignment, setCorrectionAssignment] =
    useState<AssignmentWithStats | null>(null);

  const [correctionIntervals, setCorrectionIntervals] = useState<
    Record<string, CorrectionInterval[]>
  >({});

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm] = Form.useForm();
  const [changePasswordError, setChangePasswordError] =
    useState<string | null>(null);

  const [isCorrectionSubmitting, setIsCorrectionSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  // ====== новый блок: запрос назначения (как "создать назначение") ======
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm] = Form.useForm();
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);

  const [workplaceSearch, setWorkplaceSearch] = useState<string>('');
  const [requestPeriod, setRequestPeriod] = useState<[Dayjs, Dayjs] | null>(null);
  const [requestIntervals, setRequestIntervals] = useState<
    Record<string, CorrectionInterval[]>
  >({});
  const [requestApplyToAll, setRequestApplyToAll] = useState(true);
  const [isLastRejectedAlertClosed, setIsLastRejectedAlertClosed] =
    useState(false);

  // отчёт по отработанным часам
  const [isWorkReportModalOpen, setIsWorkReportModalOpen] =
    useState(false);
  const [isWorkReportSubmitting, setIsWorkReportSubmitting] =
    useState(false);
  const [workReportForm] = Form.useForm();
  const [workReportSelectedDate, setWorkReportSelectedDate] =
    useState<Dayjs | null>(dayjs());
  const [workReportHoursByDate, setWorkReportHoursByDate] =
    useState<Record<string, number | null>>({});

  // состояние для личной статистики пользователя
  const [myStatsFrom, setMyStatsFrom] = useState<Dayjs>(
    dayjs().startOf('month'),
  );
  const [myStatsTo, setMyStatsTo] = useState<Dayjs>(dayjs().endOf('month'));

  // мини-планировщик (график назначений)
  const [plannerFromDate, setPlannerFromDate] = useState<Dayjs | null>(null);
  const [plannerToDate, setPlannerToDate] = useState<Dayjs | null>(null);
  const [plannerAutoRangeInitialized, setPlannerAutoRangeInitialized] =
    useState(false);


  // глобальный интервал времени (для "применить ко всем датам")
  const [requestGlobalTime, setRequestGlobalTime] = useState<
    [Dayjs | null, Dayjs | null]
  >([dayjs().hour(9).minute(0).second(0), dayjs().hour(18).minute(0).second(0)]);

  // ====== КВЕРИ ======

  const {
    data: workplaceData,
    isLoading: isWorkplaceLoading,
    isError: isWorkplaceError,
  } = useQuery<CurrentWorkplaceResponse>({
    queryKey: ['my-place', 'current-workplace'],
    enabled: !!user,
    queryFn: () => fetchCurrentWorkplace(),
  });

  const {
    data: mySchedule,
    isLoading: isScheduleLoading,
    isError: isScheduleError,
  } = useQuery<{ assignments: Assignment[]; slots: Slot[] }>({
    queryKey: ['my-place', 'schedule'],
    enabled: !!user,
    queryFn: () => fetchMySchedule(),
  });

  const assignmentDatesSet = useMemo(() => {
    const set = new Set<string>();
    if (!mySchedule?.assignments) return set;
    for (const a of mySchedule.assignments) {
      if (!a.shifts) continue;
      for (const sh of a.shifts as any[]) {
        if (!sh?.date) continue;
        const d = dayjs(sh.date);
        if (d.isValid()) {
          set.add(d.format('YYYY-MM-DD'));
        }
      }
    }
    return set;
  }, [mySchedule]);


  // Загрузка отчётов по отработанным часам для текущего пользователя
  const loadWorkReportsForDate = async (baseDate: Dayjs) => {
    try {
      if (!user) return;

      const from = baseDate.startOf('month').format('YYYY-MM-DD');
      const to = baseDate.endOf('month').format('YYYY-MM-DD');

      if (!currentUserId) return;

      const reports: WorkReport[] = await fetchWorkReports({
        userId: currentUserId,
        from,
        to,
      });

      const map: Record<string, number | null> = {};
      for (const report of reports) {
        if (!report.date) continue;
        map[report.date] = (map[report.date] ?? 0) + report.hours;
      }

      setWorkReportHoursByDate(map);
    } catch (error: any) {
      console.error('Failed to load work reports', error);

      const msg =
        error?.response?.data?.message ??
        error?.message ??
        t(
          'myPlace.workReportLoadError',
          'Не удалось загрузить отчёты по часам. Попробуйте ещё раз.',
        );

      message.error(String(msg));
    }
  };


  const {
    data: myAssignmentRequestsPage,
    isLoading: isMyAssignmentRequestsLoading,
    refetch: refetchMyAssignmentRequests,
  } = useQuery<PaginatedResponse<AssignmentRequest>>({
    queryKey: ['my-place', 'assignment-requests', { requesterId: user?.sub }],
    enabled: !!user,
    queryFn: () =>
      fetchAssignmentRequests({
        requesterId: user!.sub,
        page: 1,
        pageSize: 50,
      }),
  });


  const canViewPlannerGrid = !!user;

  const effectivePlannerFromDate = useMemo(
    () => plannerFromDate ?? dayjs().startOf('month'),
    [plannerFromDate],
  );
  const effectivePlannerToDate = useMemo(
    () => plannerToDate ?? dayjs().endOf('month'),
    [plannerToDate],
  );

  const {
    data: plannerMatrix,
    isLoading: isPlannerMatrixLoading,
  } = useQuery<PlannerMatrixResponse>({
    queryKey: [
      'my-place',
      'planner-matrix',
      {
        from: effectivePlannerFromDate.toISOString(),
        to: effectivePlannerToDate.toISOString(),
      },
    ],
    enabled: !!user && canViewPlannerGrid,
    queryFn: () =>
      fetchPlannerMatrix({
        mode: 'byUsers',
        from: effectivePlannerFromDate.toISOString(),
        to: effectivePlannerToDate.toISOString(),
        page: 1,
        pageSize: 200,
        status: 'ACTIVE',
      }),
    keepPreviousData: true,
  });


  const {
    data: workplacesPage,
    isLoading: isAllWorkplacesLoading,
  } = useQuery<PaginatedResponse<Workplace>>({
    queryKey: ['my-place', 'workplaces', { search: workplaceSearch }],
    enabled: !!user && isRequestModalOpen,
    queryFn: () =>
      fetchWorkplaces({
        search: workplaceSearch || undefined,
        isActive: true,
        page: 1,
        pageSize: 100,
      }),
  });

  // Личная статистика текущего пользователя
  const {
    data: myStatsData,
    isLoading: isMyStatsLoading,
    error: myStatsError,
  } = useQuery<StatisticsResponse>({
    queryKey: [
      'my-place',
      'statistics',
      currentUserId,
      myStatsFrom?.format('YYYY-MM-DD'),
      myStatsTo?.format('YYYY-MM-DD'),
    ],
    enabled: !!currentUserId && !!myStatsFrom && !!myStatsTo,
    queryFn: () =>
      fetchStatistics({
        from: myStatsFrom!.format('YYYY-MM-DD'),
        to: myStatsTo!.format('YYYY-MM-DD'),
        userId: currentUserId!,
      }),
    keepPreviousData: true,
  });

  const assignments = mySchedule?.assignments ?? [];
  const slots = mySchedule?.slots ?? [];

  const myAssignmentRequests: AssignmentRequest[] =
    myAssignmentRequestsPage?.data ?? [];

  const pendingAssignmentRequests = useMemo(
    () =>
      myAssignmentRequests.filter((r) => {
        // считаем "ожидающими" те запросы, по которым ещё не принято решение на бекенде
        // (decidedAt === null). Это более надёжно, чем доверять полю status,
        // т.к. формат статусов мог меняться.
        return !r.decidedAt;
      }),
    [myAssignmentRequests],
  );

  const pendingAssignmentRequestsCount = pendingAssignmentRequests.length;

  // авто-подбор диапазона дат для мини-планировщика
  useEffect(() => {
    if (!plannerMatrix || plannerAutoRangeInitialized) {
      return;
    }

    if (!plannerMatrix.rows || plannerMatrix.rows.length === 0) {
      return;
    }

    let minStart: Dayjs | null = null;
    let maxEnd: Dayjs | null = null;

    for (const row of plannerMatrix.rows) {
      for (const slot of row.slots) {
        if (slot.status === 'ARCHIVED') continue;

        const start = dayjs(slot.from);
        const end = dayjs(slot.to ?? slot.from);

        if (!minStart || start.isBefore(minStart)) {
          minStart = start;
        }
        if (!maxEnd || end.isAfter(maxEnd)) {
          maxEnd = end;
        }
      }
    }

    if (minStart) {
      const proposedFrom = minStart.startOf('day');
      const proposedTo = (maxEnd || minStart).endOf('day');

      setPlannerFromDate(proposedFrom);
      setPlannerToDate(proposedTo);
      setPlannerAutoRangeInitialized(true);
    }
  }, [plannerMatrix, plannerAutoRangeInitialized]);

  const plannerDays = useMemo(() => {
    if (!plannerFromDate || !plannerToDate) return [];

    const days: Dayjs[] = [];
    let current = plannerFromDate.startOf('day');
    const last = plannerToDate.startOf('day');

    while (current.isBefore(last) || current.isSame(last, 'day')) {
      days.push(current);
      current = current.add(1, 'day');
    }

    return days;
  }, [plannerFromDate, plannerToDate]);

  const plannerRowsWithLanes: PlannerRowWithLanes[] = useMemo(() => {
    if (!plannerMatrix || !plannerFromDate || !plannerToDate) return [];

    const rows: PlannerRowWithLanes[] = plannerMatrix.rows.map((row) => {
      const visibleSlots = row.slots.filter(
        (slot) => slot.status !== 'ARCHIVED',
      ) as PlannerMatrixSlot[];

      const { laneById, lanesCount } = buildLanesForMyPlace(visibleSlots);

      let primaryWorkplaceKey = '';
      if (visibleSlots.length > 0) {
        let earliestStart: Dayjs | null = null;
        let key = '';
        for (const slot of visibleSlots) {
          const start = dayjs(slot.from);
          if (!earliestStart || start.isBefore(earliestStart)) {
            earliestStart = start;
            const anySlot: any = slot;
            const code =
              anySlot.workplaceCode ?? anySlot.workplace?.code ?? '';
            const name =
              anySlot.workplaceName ?? anySlot.workplace?.name ?? '';
            key = `${code} ${name}`.trim().toLowerCase();
          }
        }
        primaryWorkplaceKey = key;
      }

      return { row, visibleSlots, laneById, lanesCount, primaryWorkplaceKey };
    });

    rows.sort((a, b) => {
      if (a.primaryWorkplaceKey && b.primaryWorkplaceKey) {
        const byWp = a.primaryWorkplaceKey.localeCompare(
          b.primaryWorkplaceKey,
          'ru',
        );
        if (byWp !== 0) return byWp;
      }

      return (a.row.title || '').localeCompare(b.row.title || '', 'ru');
    });

    if (user?.sub) {
      const index = rows.findIndex((r) => r.row.key === user.sub);
      if (index > 0) {
        const [me] = rows.splice(index, 1);
        rows.unshift(me);
      }
    }

    return rows;
  }, [plannerMatrix, plannerFromDate, plannerToDate, user?.sub]);


  const plannerLeftBodyRef = useRef<HTMLDivElement | null>(null);
  const plannerRightBodyRef = useRef<HTMLDivElement | null>(null);

  const handlePlannerRightScroll = (e: any) => {
    if (plannerLeftBodyRef.current) {
      plannerLeftBodyRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handlePlannerLeftWheel = (e: any) => {
    if (plannerRightBodyRef.current) {
      plannerRightBodyRef.current.scrollTop += e.deltaY;
      e.preventDefault();
    }
  };


  const latestRejectedAssignmentRequest = useMemo(() => {
    const rejected = myAssignmentRequests.filter(
      (r) => r.status === 'REJECTED',
    );

    if (!rejected.length) {
      return null;
    }

    return rejected
      .slice()
      .sort(
        (a, b) =>
          dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf(),
      )[0];
  }, [myAssignmentRequests]);

  const showLatestRejectedAssignmentRequest =
    !!latestRejectedAssignmentRequest &&
    dayjs().diff(dayjs(latestRejectedAssignmentRequest.createdAt), 'day') <= 7;

  // Ключ в localStorage, чтобы помнить, что пользователь уже закрыл
  // уведомление об отклонённом запросе. Привязываем к пользователю и
  // конкретному запросу, чтобы для нового отклонённого запроса
  // уведомление снова появилось.
  const lastRejectedAlertStorageKey = useMemo(() => {
    if (!latestRejectedAssignmentRequest || !user?.sub) return null;

    return `myPlace:lastRejectedAlertClosed:${user.sub}:${latestRejectedAssignmentRequest.id}`;
  }, [user?.sub, latestRejectedAssignmentRequest?.id]);

  useEffect(() => {
    if (!showLatestRejectedAssignmentRequest || !lastRejectedAlertStorageKey) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = window.localStorage.getItem(lastRejectedAlertStorageKey);
      if (stored === '1') {
        setIsLastRejectedAlertClosed(true);
      } else {
        setIsLastRejectedAlertClosed(false);
      }
    } catch (error) {
      // ignore storage errors
      console.error('Failed to read last rejected alert state', error);
    }
  }, [showLatestRejectedAssignmentRequest, lastRejectedAlertStorageKey]);

  const myAssignments: AssignmentWithStats[] = useMemo(() => {
    if (!mySchedule?.assignments || !mySchedule.slots) return [];

    const slotsByAssignment = mySchedule.slots.reduce<Record<string, Slot[]>>(
      (acc, slot) => {
        const key = (slot as any).assignmentId ?? 'unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(slot);
        return acc;
      },
      {},
    );

    return mySchedule.assignments.map((assignment) => {
      const slotsForAssignment = slotsByAssignment[assignment.id] ?? [];

      const activeSlots = slotsForAssignment.filter(
        (slot) => slot.status === 'CONFIRMED',
      ).length;

      const totalSlots = slotsForAssignment.length;

      let totalMinutes = 0;
      slotsForAssignment.forEach((slot) => {
        const from = dayjs((slot as any).from);
        const to = dayjs((slot as any).to ?? (slot as any).from);
        if (to.isAfter(from)) {
          totalMinutes += to.diff(from, 'minute');
        }
      });

      return {
        ...assignment,
        activeSlots,
        totalSlots,
        totalMinutes,
      };
    });
  }, [mySchedule]);

  const today = dayjs();

  const todayAssignmentsCount = myAssignments.filter((assignment) => {
    const [start, end] = getAssignmentInterval(assignment);
    if (!start || !end) return false;
    return !today.isBefore(start, 'day') && !today.isAfter(end, 'day');
  }).length;

  const myWorkplace = workplaceData?.workplace ?? null;
  const hasAssignments = myAssignments.length > 0;

  // options рабочих мест: текущее + те, что есть в назначениях (чтобы select был "живой")
  const workplaceOptions = useMemo(() => {
    const list = workplacesPage?.data ?? [];
    const options = list.map((w) => ({
      value: w.id,
      label: w.code ? `${w.code} — ${w.name}` : w.name,
    }));

    // подстрахуем: если текущая точка не пришла в списке (например, не active) — добавим
    if (myWorkplace && !options.some((o) => o.value === myWorkplace.id)) {
      options.unshift({
        value: myWorkplace.id,
        label: myWorkplace.code
          ? `${myWorkplace.code} — ${myWorkplace.name}`
          : myWorkplace.name,
      });
    }

    return options;
  }, [workplacesPage, myWorkplace]);

  useEffect(() => {
    if (!isRequestModalOpen) return;

    const current = requestForm.getFieldValue('workplaceId');
    if (current) return;

    const fallback = myWorkplace?.id ?? workplaceOptions?.[0]?.value;
    if (fallback) {
      requestForm.setFieldsValue({ workplaceId: fallback });
    }
  }, [isRequestModalOpen, myWorkplace?.id, workplaceOptions, requestForm]);

  const correctionIntervalsList = useMemo(
    () =>
      Object.entries(correctionIntervals)
        .sort(([aKey, bKey]) => aKey.localeCompare(bKey))
        .map(([dateKey, intervals]) => ({
          dateKey,
          date: intervals[0]?.date ?? dayjs(dateKey),
          intervals,
        })),
    [correctionIntervals],
  );

  const hasCorrectionIntervals = correctionIntervalsList.length > 0;
  const hasInvalidCorrectionIntervals = correctionIntervalsList.some((day) =>
    day.intervals.some((item) => !item.to.isAfter(item.from)),
  );

  const requestIntervalsList = useMemo(
    () =>
      Object.entries(requestIntervals)
        .sort(([aKey, bKey]) => aKey.localeCompare(bKey))
        .map(([dateKey, intervals]) => ({
          dateKey,
          date: intervals[0]?.date ?? dayjs(dateKey),
          intervals,
        })),
    [requestIntervals],
  );

  const hasRequestIntervals = requestIntervalsList.length > 0;
  const hasInvalidRequestIntervals = requestIntervalsList.some((day) =>
    day.intervals.some((item) => !item.to.isAfter(item.from)),
  );

  const isInitialLoading = isWorkplaceLoading || isScheduleLoading;
  const hasError = isWorkplaceError || isScheduleError;

  // При открытии модалки отчёта подгружаем сохранённые часы за месяц выбранной даты
  useEffect(() => {
    if (!isWorkReportModalOpen) return;

    const base = workReportSelectedDate ?? dayjs();
    void loadWorkReportsForDate(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkReportModalOpen, workReportSelectedDate]);


  // ====== МАППИНГИ ДЛЯ ТИПОВ СМЕН ======

  const shiftKindLabel = (kind: ShiftKindType) => {
    switch (kind) {
      case 'OFFICE':
        return t('myPlace.shiftKindOffice', 'Офис');
      case 'REMOTE':
        return t('myPlace.shiftKindRemote', 'Удалённо');
      case 'DAY_OFF':
        return t('myPlace.shiftKindDayOff', 'Выходной');
      default:
        return t('myPlace.shiftKindDefault', 'Обычная смена');
    }
  };

  // ====== ОТКРЫТИЕ МОДАЛКИ «ДЕТАЛИ НАЗНАЧЕНИЯ» ======

  const openAssignmentDetails = (record: AssignmentWithStats) => {
    setSelectedAssignment(record);

    const allShifts: {
      date: Dayjs;
      from: Dayjs;
      to: Dayjs;
      hours: number;
    }[] = [];

    // 1) слоты, если есть
    const assignmentSlots = slots.filter(
      (slot) => (slot as any).assignmentId === record.id,
    );

    assignmentSlots.forEach((slot) => {
      const start = dayjs((slot as any).from);
      const end = dayjs((slot as any).to ?? (slot as any).from);
      if (!end.isAfter(start)) return;

      const date = start.startOf('day');
      const hours = end.diff(start, 'hour', true);

      allShifts.push({
        date,
        from: start,
        to: end,
        hours,
      });
    });

    // 2) если слотов нет — смены из assignment.shifts
    if (!allShifts.length) {
      const assignmentShifts = ((record as any).shifts ?? []) as any[];

      assignmentShifts.forEach((shift) => {
        const date = dayjs(shift.date ?? shift.startsAt).startOf('day');
        const from = dayjs(shift.startsAt ?? shift.date);
        const to = dayjs(shift.endsAt ?? shift.startsAt);
        if (!to.isAfter(from)) return;

        const hours = to.diff(from, 'hour', true);

        allShifts.push({
          date,
          from,
          to,
          hours,
        });
      });
    }

    allShifts.sort((a, b) => {
      const d = a.date.diff(b.date, 'minute');
      if (d !== 0) return d;
      return a.from.diff(b.from, 'minute');
    });

    setSelectedAssignmentShifts(allShifts);
  };

  // ====== КОРРЕКТИРОВКА ======

  const handleSendCorrection = async () => {
    if (!correctionAssignment) return;

    const allIntervals = Object.values(correctionIntervals).flatMap((intervals) => intervals);

    if (!allIntervals.length) {
      message.warning(
        t(
          'myPlace.noCorrectionIntervals',
          'Добавьте хотя бы один день/интервал для корректировки',
        ),
      );
      return;
    }

    const invalid = allIntervals.find((item) => !item.to.isAfter(item.from));
    if (invalid) {
      message.warning(
        t('myPlace.invalidInterval', 'Время окончания должно быть позже времени начала'),
      );
      return;
    }

    const first = allIntervals[0];

    const getKindLabel = (kind: ShiftKindType): string => {
      if (!kind || kind === 'DEFAULT') return 'Обычная смена';
      if (kind === 'OFFICE') return 'Офис';
      if (kind === 'REMOTE') return 'Удалёнка';
      if (kind === 'DAY_OFF') return 'Day off / больничный';
      return String(kind);
    };

    const lines = allIntervals.map((interval) => {
      const dateStr = interval.date.format('DD.MM.YYYY');
      const startStr = interval.from.format('HH:mm');
      const endStr = interval.to.format('HH:mm');
      const kindLabel = getKindLabel(interval.shiftKind);
      return `${dateStr}: ${startStr} → ${endStr} (${kindLabel})`;
    });

    const finalComment = 'Интервалы, которые сотрудник предлагает:\n' + lines.join('\n');

    try {
      setIsCorrectionSubmitting(true);

      await requestAssignmentScheduleAdjustment(correctionAssignment.id, {
        date: first.date.format('YYYY-MM-DD'),
        startsAt: first.from.toISOString(),
        endsAt: first.to.toISOString(),
        kind: first.shiftKind,
        comment: finalComment,
      });

      message.success(
        t(
          'myPlace.correctionRequestSent',
          'Запрос на корректировку расписания отправлен администратору',
        ),
      );
      setCorrectionModalOpen(false);
      setCorrectionIntervals({});
      setCorrectionAssignment(null);
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        t('myPlace.correctionRequestError', 'Не удалось отправить запрос на корректировку');
      message.error(String(msg));
    } finally {
      setIsCorrectionSubmitting(false);
    }
  };

  const handleAddCorrectionDay = () => {
    if (!correctionAssignment) return;

    const [intervalFrom, intervalTo] = getAssignmentInterval(correctionAssignment);
    if (!intervalFrom || !intervalTo) return;

    const dateFrom = intervalFrom.startOf('day');
    const dateTo = intervalTo.startOf('day');

    let dayToAdd = dateFrom.startOf('day');
    const existingDates = new Set(Object.keys(correctionIntervals));

    while (existingDates.has(dayToAdd.format('YYYY-MM-DD'))) {
      dayToAdd = dayToAdd.add(1, 'day');
      if (dayToAdd.isAfter(dateTo, 'day')) {
        message.warning(
          t('myPlace.allDaysAdded', 'Все дни в интервале назначения уже добавлены'),
        );
        return;
      }
    }

    const defaultFrom = dayToAdd.hour(9).minute(0);
    const defaultTo = dayToAdd.hour(18).minute(0);
    const key = dayToAdd.format('YYYY-MM-DD');

    setCorrectionIntervals((prev) => ({
      ...prev,
      [key]: [
        ...(prev[key] ?? []),
        {
          date: dayToAdd,
          from: defaultFrom,
          to: defaultTo,
          shiftKind: 'DEFAULT',
        },
      ],
    }));
  };

  const handleAddIntervalForDay = (dateKey: string) => {
    setCorrectionIntervals((prev) => {
      const existing = prev[dateKey];
      if (!existing || !existing.length) return prev;

      const baseDate = existing[0].date;
      const last = existing[existing.length - 1];
      let from = last.to.add(1, 'hour');
      let to = from.add(3, 'hour');

      if (to.isAfter(baseDate.endOf('day'))) {
        from = baseDate.hour(9).minute(0);
        to = from.add(3, 'hour');
      }

      return {
        ...prev,
        [dateKey]: [...existing, { date: baseDate, from, to, shiftKind: last.shiftKind }],
      };
    });
  };

  const handleRemoveDay = (dateKey: string) => {
    setCorrectionIntervals((prev) => {
      const { [dateKey]: removed, ...rest } = prev;
      return rest;
    });
  };

  const handleRemoveCorrectionInterval = (dateKey: string, index: number) => {
    setCorrectionIntervals((prev) => {
      const list = prev[dateKey];
      if (!list) return prev;
      const next = [...list];
      next.splice(index, 1);
      if (!next.length) {
        const { [dateKey]: removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [dateKey]: next,
      };
    });
  };

  const handleChangeCorrectionTime = (
    dateKey: string,
    index: number,
    field: 'from' | 'to',
    time: Dayjs | null,
  ) => {
    if (!time) return;

    setCorrectionIntervals((prev) => {
      const list = prev[dateKey];
      if (!list) return prev;

      const updated = [...list];
      const existing = updated[index];
      if (!existing) return prev;

      const baseDate = existing.date.format('YYYY-MM-DD');
      const newDateTime = dayjs(`${baseDate} ${time.format('HH:mm')}`);

      updated[index] = {
        ...existing,
        [field]: newDateTime,
      };

      return {
        ...prev,
        [dateKey]: updated,
      };
    });
  };

  const handleChangeCorrectionShiftKind = (
    dateKey: string,
    index: number,
    value: ShiftKindType,
  ) => {
    setCorrectionIntervals((prev) => {
      const list = prev[dateKey];
      if (!list) return prev;

      const updated = [...list];
      const existing = updated[index];
      if (!existing) return prev;

      updated[index] = {
        ...existing,
        shiftKind: value,
      };

      return {
        ...prev,
        [dateKey]: updated,
      };
    });
  };

  // ====== ЗАПРОС НАЗНАЧЕНИЯ (модалка как "создать назначение") ======

  const getUserDisplay = () => {
    const u = user as any;
    const p = profile as any;

    // Сначала пробуем собрать ФИО из profile (там обычно самые актуальные данные)
    const fioFromProfile =
      (typeof p?.fullName === 'string' && p.fullName.trim()) ||
      [p?.lastName, p?.firstName, p?.middleName]
        .map((part: unknown) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(' ') ||
      (typeof p?.name === 'string' ? p.name.trim() : '') ||
      (typeof p?.displayName === 'string' ? p.displayName.trim() : '');

    // Если в profile пусто — пробуем собрать ФИО из user (данные из токена)
    const fioFromUser =
      (typeof u?.fullName === 'string' && u.fullName.trim()) ||
      [u?.lastName, u?.firstName, u?.middleName]
        .map((part: unknown) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(' ') ||
      (typeof u?.name === 'string' ? u.name.trim() : '') ||
      (typeof u?.displayName === 'string' ? u.displayName.trim() : '');

    // В крайнем случае пробуем взять имя из какого-нибудь назначения (assignment.user)
    const anyAssignmentUser = (myAssignments[0] as any)?.user;
    const fioFromAssignments =
      (typeof anyAssignmentUser?.fullName === 'string' &&
        anyAssignmentUser.fullName.trim()) ||
      [anyAssignmentUser?.lastName, anyAssignmentUser?.firstName, anyAssignmentUser?.middleName]
        .map((part: unknown) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(' ') ||
      (typeof anyAssignmentUser?.name === 'string' ? anyAssignmentUser.name.trim() : '');

    const fio = fioFromProfile || fioFromUser || fioFromAssignments;

    // Email тоже попробуем взять сперва из profile, потом из user / assignment
    const emailFromProfile =
      typeof p?.email === 'string' ? p.email.trim() : '';
    const emailFromUser =
      typeof u?.email === 'string' ? u.email.trim() : '';
    const emailFromAssignment =
      typeof anyAssignmentUser?.email === 'string'
        ? anyAssignmentUser.email.trim()
        : '';

    const email = emailFromProfile || emailFromUser || emailFromAssignment;

    if (fio) {
      return fio;
    }

    if (email) {
      return email;
    }

    return 'Сотрудник';
  };

const rebuildRequestIntervalsFromPeriod = (
    period: [Dayjs, Dayjs],
    globalTime: [Dayjs | null, Dayjs | null],
  ) => {
    const [fromDate, toDate] = period;
    const keys = buildDateRangeKeys(fromDate, toDate);

    const [gtFrom, gtTo] = globalTime;
    const timeFrom = gtFrom ?? dayjs().hour(9).minute(0);
    const timeTo = gtTo ?? dayjs().hour(18).minute(0);

    const next: Record<string, CorrectionInterval[]> = {};
    keys.forEach((key) => {
      const base = dayjs(key).startOf('day');
      const from = dayjs(`${key} ${timeFrom.format('HH:mm')}`);
      const to = dayjs(`${key} ${timeTo.format('HH:mm')}`);

      next[key] = [
        {
          date: base,
          from,
          to,
          shiftKind: 'DEFAULT',
        },
      ];
    });

    return next;
  };

  const handleRequestPeriodChange = (range: any) => {
    if (!range || !range[0] || !range[1]) {
      setRequestPeriod(null);
      setRequestIntervals({});
      return;
    }

    const from = dayjs(range[0]).startOf('day');
    const to = dayjs(range[1]).startOf('day');

    const period: [Dayjs, Dayjs] = [from, to];
    setRequestPeriod(period);

    // при выборе периода — сразу рисуем дни (как в "создать назначение")
    const next = rebuildRequestIntervalsFromPeriod(period, requestGlobalTime);
    setRequestIntervals(next);
  };

  const handleRequestGlobalTimeChange = (value: any) => {
    const v = value as [Dayjs | null, Dayjs | null] | null;
    if (!v) return;

    setRequestGlobalTime(v);

    if (requestApplyToAll && requestPeriod) {
      const next = rebuildRequestIntervalsFromPeriod(requestPeriod, v);
      setRequestIntervals(next);
    }
  };

  const handleRequestApplyToAllChange = (checked: boolean) => {
    setRequestApplyToAll(checked);

    if (checked && requestPeriod) {
      const next = rebuildRequestIntervalsFromPeriod(requestPeriod, requestGlobalTime);
      setRequestIntervals(next);
    }
  };

  const handleAddRequestIntervalForDay = (dateKey: string) => {
    setRequestIntervals((prev) => {
      const existing = prev[dateKey];
      if (!existing || !existing.length) return prev;

      const baseDate = existing[0].date;
      const last = existing[existing.length - 1];

      let from = last.to.add(1, 'hour');
      let to = from.add(3, 'hour');

      if (to.isAfter(baseDate.endOf('day'))) {
        from = baseDate.hour(9).minute(0);
        to = from.add(3, 'hour');
      }

      return {
        ...prev,
        [dateKey]: [...existing, { date: baseDate, from, to, shiftKind: last.shiftKind }],
      };
    });
  };

  const handleRemoveRequestInterval = (dateKey: string, index: number) => {
    setRequestIntervals((prev) => {
      const list = prev[dateKey];
      if (!list) return prev;

      const next = [...list];
      next.splice(index, 1);

      if (!next.length) {
        // если в дне удалили последний интервал — день оставляем, но с дефолтом
        const base = dayjs(dateKey).startOf('day');
        const [gtFrom, gtTo] = requestGlobalTime;
        const from = dayjs(
          `${dateKey} ${(gtFrom ?? dayjs().hour(9)).format('HH:mm')}`,
        );
        const to = dayjs(
          `${dateKey} ${(gtTo ?? dayjs().hour(18)).format('HH:mm')}`,
        );

        return {
          ...prev,
          [dateKey]: [{ date: base, from, to, shiftKind: 'DEFAULT' }],
        };
      }

      return {
        ...prev,
        [dateKey]: next,
      };
    });
  };

  const handleChangeRequestIntervalRange = (
    dateKey: string,
    index: number,
    range: [Dayjs | null, Dayjs | null] | null,
  ) => {
    if (!range || !range[0] || !range[1]) return;

    const [fromT, toT] = range;

    setRequestIntervals((prev) => {
      const list = prev[dateKey];
      if (!list) return prev;

      const updated = [...list];
      const existing = updated[index];
      if (!existing) return prev;

      const baseDate = existing.date.format('YYYY-MM-DD');
      const newFrom = dayjs(`${baseDate} ${fromT.format('HH:mm')}`);
      const newTo = dayjs(`${baseDate} ${toT.format('HH:mm')}`);

      updated[index] = { ...existing, from: newFrom, to: newTo };

      return { ...prev, [dateKey]: updated };
    });
  };

  const handleChangeRequestShiftKind = (dateKey: string, index: number, value: ShiftKindType) => {
    setRequestIntervals((prev) => {
      const list = prev[dateKey];
      if (!list) return prev;

      const updated = [...list];
      const existing = updated[index];
      if (!existing) return prev;

      updated[index] = { ...existing, shiftKind: value };
      return { ...prev, [dateKey]: updated };
    });
  };

  const buildAssignmentRequestSlotsPayload = () => {
    return Object.entries(requestIntervals)
      .map(([date, intervals]) => {
        const normalized = (intervals ?? [])
          .map((iv) => {
            const from = iv.from ? iv.from.format('HH:mm') : undefined;
            const to = iv.to ? iv.to.format('HH:mm') : undefined;
            const shiftKind = (iv.shiftKind ?? 'DEFAULT') as ShiftKindType;

            // DAY_OFF можно отправлять даже без времени — бэк сам сделает 00:00–23:59
            if (shiftKind === 'DAY_OFF') {
              return { from, to, shiftKind };
            }

            if (!from || !to) return null;
            return { from, to, shiftKind };
          })
          .filter(Boolean) as Array<{ from?: string; to?: string; shiftKind: ShiftKindType }>;

        return { date, intervals: normalized };
      })
      .filter((d) => d.intervals.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const handleSendAssignmentRequest = async () => {
    try {
      const values = await requestForm.validateFields();

      const workplaceId = values.workplaceId as string;

      const period = values.period as [Dayjs, Dayjs];
      const [from, to] = period;

      const dateFrom = dayjs(from).startOf('day').format('YYYY-MM-DD');
      const dateTo = dayjs(to).startOf('day').format('YYYY-MM-DD');

      // если вдруг интервалы не сформированы (например, руками очистили), сформируем дефолт
      let intervalsMap = requestIntervals;
      if (!Object.keys(intervalsMap).length) {
        const p: [Dayjs, Dayjs] = [dayjs(from).startOf('day'), dayjs(to).startOf('day')];
        intervalsMap = rebuildRequestIntervalsFromPeriod(p, requestGlobalTime);
      }

      const allIntervals = Object.values(intervalsMap).flatMap((x) => x);

      if (!allIntervals.length) {
        message.warning('Добавьте хотя бы один интервал.');
        return;
      }

      const invalid = allIntervals.find((item) => !item.to.isAfter(item.from));
      if (invalid) {
        message.warning('Время окончания должно быть позже времени начала');
        return;
      }

      const getKindLabel = (kind: ShiftKindType): string => {
        if (!kind || kind === 'DEFAULT') return 'Обычная смена';
        if (kind === 'OFFICE') return 'Офис';
        if (kind === 'REMOTE') return 'Удалёнка';
        if (kind === 'DAY_OFF') return 'Day off / больничный';
        return String(kind);
      };

      const lines = allIntervals.map((interval) => {
        const dateStr = interval.date.format('DD.MM.YYYY');
        const startStr = interval.from.format('HH:mm');
        const endStr = interval.to.format('HH:mm');
        const kindLabel = getKindLabel(interval.shiftKind);
        return `${dateStr}: ${startStr} → ${endStr} (${kindLabel})`;
      });

      // статус UI добавим в comment, чтобы админ видел (бек может и не принимать поле status)
      const finalComment = `Интервалы, которые сотрудник предлагает:\n${lines.join('\n')}`;

      const slotsPayload = buildAssignmentRequestSlotsPayload();
      if (!slotsPayload.length) {
        message.error('Добавь хотя бы один интервал');
        return;
      }

      setIsRequestSubmitting(true);

      await requestAssignment({
        workplaceId: workplaceId ?? null,
        dateFrom,
        dateTo,
        slots: slotsPayload,
        comment: finalComment,
      });

      // сразу обновим статус запросов, чтобы на карточке отображалось "на рассмотрении"
      await refetchMyAssignmentRequests();

      message.success('Запрос на назначение отправлен администратору');
      setIsRequestModalOpen(false);

      requestForm.resetFields();
      setRequestPeriod(null);
      setRequestIntervals({});
      setRequestApplyToAll(true);
      setRequestGlobalTime([
        dayjs().hour(9).minute(0).second(0),
        dayjs().hour(18).minute(0).second(0),
      ]);
    } catch (error: any) {
      if (error?.errorFields) return;

      const msg =
        error?.response?.data?.message ||
        error?.message ||
        t('myPlace.assignmentRequestError', 'Не удалось отправить запрос на назначение');
      message.error(String(msg));
    } finally {
      setIsRequestSubmitting(false);
    }
  };

  // ====== СМЕНА ПАРОЛЯ ======

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        setChangePasswordError(
          t('myPlace.passwordsNotMatch', 'Новый пароль и подтверждение не совпадают'),
        );
        return;
      }
      setIsPasswordSubmitting(true);
      setChangePasswordError(null);
      await changeMyPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success(t('myPlace.passwordChanged', 'Пароль успешно изменён'));
      setPasswordModalOpen(false);
      passwordForm.resetFields();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        t('myPlace.changePasswordError', 'Не удалось сменить пароль. Попробуйте ещё раз.');
      setChangePasswordError(String(msg));
    } finally {
      setIsPasswordSubmitting(false);
    }
  };


  const handleSubmitWorkReport = async (values: any) => {
    try {
      setIsWorkReportSubmitting(true);

      const dateValue = values.date as Dayjs | null;
      const hoursValue = values.hours;

      if (!dateValue) {
        message.error(
          t('myPlace.workReport.dateRequired', 'Выберите дату'),
        );
        return;
      }

      const hours = Number(hoursValue);
      if (!Number.isFinite(hours) || hours < 0) {
        message.error(
          t(
            'myPlace.workReport.hoursRequired',
            'Укажите корректное количество часов',
          ),
        );
        return;
      }

      const dateKey = dateValue.format('YYYY-MM-DD');

      // TODO: backend должен реализовать POST /me/work-reports
      await createMyWorkReport({
        date: dateKey,
        hours,
      });

      setWorkReportHoursByDate((prev) => ({
        ...prev,
        [dateKey]: hours,
      }));

      message.success(
        t(
          'myPlace.workReport.success',
          'Отчёт по часам отправлен',
        ),
      );
    } catch (error) {
      console.error('Failed to submit work report', error);
      message.error(
        t(
          'myPlace.workReport.error',
          'Не удалось отправить отчёт, попробуйте ещё раз.',
        ),
      );
    } finally {
      setIsWorkReportSubmitting(false);
    }
  };

  // ====== РЕНДЕР ======

  if (isInitialLoading) {
    return (
      <Flex justify="center" style={{ padding: 40 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (hasError) {
    return (
      <Result
        status="error"
        title={t('myPlace.errorTitle', 'Ошибка загрузки данных')}
        subTitle={t(
          'myPlace.errorSubtitle',
          'Не удалось загрузить данные. Попробуйте перезагрузить страницу.',
        )}
      />
    );
  }

  return (
    <Flex vertical gap={8}>
      {/* МОЁ РАСПИСАНИЕ */}
      <Card
        title={t('myPlace.title', 'Моё расписание')}
        extra={
          <Button onClick={() => setPasswordModalOpen(true)}>
            {t('myPlace.changePassword', 'Сменить пароль')}
          </Button>
        }
      >
        {myWorkplace ? (
          <>
            <Descriptions bordered size="small" column={1} labelStyle={{ width: 200 }}>
              <Descriptions.Item label={t('myPlace.currentWorkplace', 'Текущее рабочее место')}>
                {myWorkplace.code ? `${myWorkplace.code} — ${myWorkplace.name}` : myWorkplace.name}
              </Descriptions.Item>
            </Descriptions>

            {hasAssignments ? (
              <Table<AssignmentWithStats>
                style={{ marginTop: 16 }}
                dataSource={myAssignments}
                rowKey="id"
                size="small"
                pagination={false}
                onRow={(record) => ({
                  onClick: () => openAssignmentDetails(record),
                  style: { cursor: 'pointer' },
                })}
                columns={[
                  {
                    title: t('myPlace.assignmentTitle', 'Рабочее место'),
                    dataIndex: ['workplace', 'name'],
                    key: 'workplaceName',
                    render: (value, record) => value || (record as any).workplaceId || '—',
                  },
                  {
                    title: t('myPlace.assignmentInterval', 'Интервал'),
                    key: 'interval',
                    render: (_, record) => {
                      const [start, end] = getAssignmentInterval(record);
                      if (!start || !end) return '—';
                      const text = humanizeDateRange(start, end);
                      return (
                        <Button
                          type="link"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAssignmentDetails(record);
                          }}
                        >
                          {text}
                        </Button>
                      );
                    },
                  },
                  {
                    title: t('myPlace.assignmentStatus', 'Статус'),
                    dataIndex: 'status',
                    key: 'status',
                    render: (value: AssignmentStatus) => (
                      <Tag
                        color={
                          value === 'ACTIVE'
                            ? 'green'
                            : value === 'ARCHIVED'
                            ? 'default'
                            : 'gold'
                        }
                      >
                        {value === 'ACTIVE'
                          ? t('myPlace.assignmentStatusActive', 'Активно')
                          : value === 'ARCHIVED'
                          ? t('myPlace.assignmentStatusArchived', 'Архив')
                          : value === 'PENDING'
                          ? t('myPlace.assignmentStatusPending', 'Ожидает')
                          : t('myPlace.assignmentStatusRejected', 'Отклонено')}
                      </Tag>
                    ),
                  },
                  {
                    title: t('myPlace.actions', 'Действия по назначению'),
                    key: 'actions',
                    render: (_, record) =>
                      record.status === 'ACTIVE' ? (
                        <Button
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCorrectionAssignment(record);

                            const intervals: Record<string, CorrectionInterval[]> = {};

                            if (mySchedule?.slots?.length) {
                              const slotsForAssignment = mySchedule.slots.filter(
                                (slot) => (slot as any).assignmentId === record.id,
                              );

                              const byDate: Record<
                                string,
                                {
                                  date: Dayjs;
                                  intervals: { from: Dayjs; to: Dayjs }[];
                                }
                              > = {};

                              slotsForAssignment.forEach((slot) => {
                                const start = dayjs((slot as any).from);
                                const end = dayjs((slot as any).to ?? (slot as any).from);
                                const dateKey = start.format('YYYY-MM-DD');
                                const date = start.startOf('day');

                                if (!byDate[dateKey]) {
                                  byDate[dateKey] = { date, intervals: [] };
                                }

                                byDate[dateKey].intervals.push({ from: start, to: end });
                              });

                              Object.entries(byDate).forEach(([dateKey, value]) => {
                                intervals[dateKey] = value.intervals.map((int) => ({
                                  date: value.date,
                                  from: int.from,
                                  to: int.to,
                                  shiftKind: 'DEFAULT',
                                }));
                              });
                            }

                            if (!Object.keys(intervals).length) {
                              const assignmentShifts = ((record as any).shifts ?? []) as any[];

                              assignmentShifts.forEach((shift) => {
                                const date = dayjs(shift.date ?? shift.startsAt).startOf('day');
                                const from = dayjs(shift.startsAt ?? shift.date);
                                const to = dayjs(shift.endsAt ?? shift.startsAt);
                                if (!to.isAfter(from)) return;

                                const dateKey = date.format('YYYY-MM-DD');

                                if (!intervals[dateKey]) {
                                  intervals[dateKey] = [];
                                }

                                intervals[dateKey].push({
                                  date,
                                  from,
                                  to,
                                  shiftKind: (shift.kind as ShiftKindType) || 'DEFAULT',
                                });
                              });
                            }

                            if (!Object.keys(intervals).length) {
                              const [start, end] = getAssignmentInterval(record);
                              const fromDate = start?.startOf('day') ?? dayjs().startOf('day');
                              const toDate = end?.startOf('day') ?? fromDate;

                              let cursor = fromDate;

                              while (!cursor.isAfter(toDate, 'day')) {
                                const dateKey = cursor.format('YYYY-MM-DD');
                                intervals[dateKey] = [
                                  {
                                    date: cursor,
                                    from: cursor.hour(9).minute(0),
                                    to: cursor.hour(18).minute(0),
                                    shiftKind: 'DEFAULT',
                                  },
                                ];
                                cursor = cursor.add(1, 'day');
                              }
                            }

                            setCorrectionIntervals(intervals);
                            setCorrectionModalOpen(true);
                          }}
                        >
                          {t(
                            'myPlace.requestAdjustment',
                            'Запросить корректировку расписания',
                          )}
                        </Button>
                      ) : null,
                  },
                ]}
              />
            ) : (
              <Result
                status="info"
                title={t('myPlace.noAssignmentsTitle', 'У вас пока нет назначений')}
                subTitle={t(
                  'myPlace.noAssignmentsSubtitle',
                  'Обратитесь к администратору для назначения на рабочее место.',
                )}
              />
            )}
          </>
        ) : (
          <Result
            status="info"
            title={t('myPlace.noWorkplaceTitle', 'Вы не привязаны к рабочему месту')}
            subTitle={t(
              'myPlace.noWorkplaceSubtitle',
              'Обратитесь к администратору для назначения на рабочее место.',
            )}
          />
        )}
      </Card>

      {/* БЛОК: ЗАПРОС НАЗНАЧЕНИЯ + ОТЧЁТ */}
      <Flex gap={16} align="stretch" wrap="wrap">
        <Card
          title={t('myPlace.requestAssignmentTitle', 'Запрос назначения')}
          style={{ flex: 1, minWidth: 320 }}
        >
          <Space direction="vertical" size={8}>
            <Typography.Text>
              {t(
                'myPlace.requestAssignmentDescription',
                'Если у вас нет назначений или вы хотите получить новое назначение, отправьте запрос администратору.',
              )}
            </Typography.Text>

            {pendingAssignmentRequestsCount > 0 && (
              <Alert
                type="info"
                showIcon
                message={t(
                  'myPlace.requestAssignmentPendingInfo',
                  'У вас {{count}} запрос(ов) на назначение на рассмотрении.',
                  { count: pendingAssignmentRequestsCount },
                )}
              />
            )}

            {pendingAssignmentRequestsCount === 0 &&
              showLatestRejectedAssignmentRequest &&
              latestRejectedAssignmentRequest &&
              !isLastRejectedAlertClosed && (
                <Alert
                  type="warning"
                  showIcon
                  closable
                  onClose={() => {
                    setIsLastRejectedAlertClosed(true);
                    if (lastRejectedAlertStorageKey && typeof window !== 'undefined') {
                      try {
                        window.localStorage.setItem(lastRejectedAlertStorageKey, '1');
                      } catch (error) {
                        console.error('Failed to persist last rejected alert state', error);
                      }
                    }
                  }}
                  message={t(
                    'myPlace.requestAssignmentLastRejectedInfo',
                    'Ваш последний запрос от {{date}} был отклонён.',
                    {
                      date: dayjs(
                        latestRejectedAssignmentRequest.createdAt,
                      ).format('DD.MM.YYYY'),
                    },
                  )}
                />
              )}

            <Button
              type="primary"
              disabled={pendingAssignmentRequestsCount > 0}
              onClick={() => {
                const defaultWorkplaceId =
                  myWorkplace?.id ??
                  workplaceOptions?.[0]?.value ??
                  undefined;

                requestForm.setFieldsValue({
                  workplaceId: defaultWorkplaceId,
                });

                setIsRequestModalOpen(true);
                setWorkplaceSearch('');
              }}
            >
              {pendingAssignmentRequestsCount > 0
                ? t(
                    'myPlace.requestAssignmentButtonDisabled',
                    'Запрос уже отправлен',
                  )
                : t(
                    'myPlace.requestAssignmentButton',
                    'Запросить назначение',
                  )}
            </Button>
          </Space>
        </Card>

        <Card
          title={t('myPlace.workReportTitle', 'Отчёт по отработанным часам')}
          style={{ flex: 0.8, minWidth: 260, maxWidth: 420 }}
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              {t(
                'myPlace.workReportDescriptionShort',
                'Каждый рабочий день заполните отчёт по фактически отработанным часам.',
              )}
            </Typography.Text>

            <Typography.Text>
              {todayAssignmentsCount > 0
                ? t(
                    'myPlace.workReportTodayHasAssignments',
                    'На сегодня в графике есть назначения — заполните отчёт по фактически отработанным часам.',
                  )
                : t(
                    'myPlace.workReportTodayNoAssignments',
                    'На сегодня назначений нет. Если это выходной — отметьте день как нерабочий или просто оставьте без отчёта.',
                  )}
            </Typography.Text>

            {todayAssignmentsCount > 0 && (
              <Tag>
                {t(
                  'myPlace.workReportTodayAssignmentsTag',
                  `Назначений на сегодня: ${todayAssignmentsCount}`,
                )}
              </Tag>
            )}

            <Space wrap>
              <Button
                onClick={() => {
                  // при открытии модалки по умолчанию ставим сегодняшнюю дату
                  const todayValue = dayjs();
                  const dateKey = todayValue.format('YYYY-MM-DD');
                  const savedHours = workReportHoursByDate[dateKey] ?? undefined;

                  workReportForm.setFieldsValue({
                    date: todayValue,
                    hours: savedHours,
                  });
                  setWorkReportSelectedDate(todayValue);
                  setIsWorkReportModalOpen(true);
                }}
              >
                {t('myPlace.workReport.openModal', 'Заполнить отчёт')}
              </Button>
            </Space>
          </Space>
        </Card>
      </Flex>


      {canViewPlannerGrid && (
        <Card
          style={{ marginTop: 24 }}
          title={t(
            'myPlace.assignmentsGridTitle',
            'График назначений (все сотрудники)',
          )}
        >
          {isPlannerMatrixLoading && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin />
            </div>
          )}

          {!isPlannerMatrixLoading &&
            (!plannerMatrix ||
              !plannerMatrix.rows ||
              plannerMatrix.rows.length === 0) && (
              <Result
                status="info"
                title={t(
                  'myPlace.assignmentsGrid.empty',
                  'Пока нет назначений в выбранном диапазоне.',
                )}
              />
            )}

          {!isPlannerMatrixLoading &&
            plannerMatrix &&
            plannerRowsWithLanes.length > 0 &&
            plannerDays.length > 0 && (
              <div style={{ display: 'flex', marginTop: 8 }}>
                {/* левая колонка с сотрудниками */}
                <div
                  style={{
                    flex: '0 0 260px',
                    borderRight: '1px solid #f0f0f0',
                  }}
                >
                  <div
                    style={{
                      height: GRID_HEADER_HEIGHT,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 16px',
                      borderBottom: '1px solid #f0f0f0',
                      background: '#fafafa',
                      fontWeight: 500,
                    }}
                  >
                    {t('myPlace.assignmentsGrid.employee', 'Сотрудник')}
                  </div>

                  <div
                    ref={plannerLeftBodyRef}
                    style={{
                      maxHeight: GRID_MAX_HEIGHT,
                      overflowY: 'auto',
                    }}
                    onWheel={handlePlannerLeftWheel}
                  >
                    {plannerRowsWithLanes.map(({ row, lanesCount }) => (
                      <div
                        key={row.key}
                        style={{
                          height:
                            lanesCount * GRID_ROW_HEIGHT +
                            GRID_ROW_VERTICAL_PADDING * 2,
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 16px',
                          borderBottom: '1px solid #f0f0f0',
                          boxSizing: 'border-box',
                        }}
                      >
                        {row.title}
                      </div>
                    ))}
                  </div>
                </div>

                {/* правая часть с датами и слотами */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {/* шапка с датами */}
                  <div
                    style={{
                      height: GRID_HEADER_HEIGHT,
                      borderBottom: '1px solid #f0f0f0',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        minWidth: plannerDays.length * GRID_CELL_WIDTH,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${plannerDays.length}, ${GRID_CELL_WIDTH}px)`,
                        height: '100%',
                      }}
                    >
                      {plannerDays.map((day) => (
                        <div
                          key={day.toISOString()}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            borderLeft: '1px solid #f5f5f5',
                            boxSizing: 'border-box',
                          }}
                        >
                          {day.format('DD.MM')}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* тело с сеткой и слотами */}
                  <div
                    ref={plannerRightBodyRef}
                    style={{
                      maxHeight: GRID_MAX_HEIGHT,
                      overflow: 'auto',
                    }}
                    onScroll={handlePlannerRightScroll}
                  >
                    {plannerRowsWithLanes.map(
                      ({ row, visibleSlots, laneById, lanesCount }) => (
                        <div
                          key={row.key}
                          style={{
                            position: 'relative',
                            minWidth: plannerDays.length * GRID_CELL_WIDTH,
                            padding: GRID_ROW_VERTICAL_PADDING,
                            boxSizing: 'border-box',
                            borderBottom: '1px solid #f0f0f0',
                            height:
                              lanesCount * GRID_ROW_HEIGHT +
                              GRID_ROW_VERTICAL_PADDING * 2,
                          }}
                        >
                          {/* сетка по дням */}
                          <div
                            style={{
                              position: 'absolute',
                              top: GRID_ROW_VERTICAL_PADDING,
                              left: 0,
                              right: 0,
                              bottom: GRID_ROW_VERTICAL_PADDING,
                              display: 'grid',
                              gridTemplateColumns: `repeat(${plannerDays.length}, ${GRID_CELL_WIDTH}px)`,
                              gridAutoRows: GRID_ROW_HEIGHT,
                            }}
                          >
                            {plannerDays.map((day) => (
                              <div
                                key={day.toISOString()}
                                style={{
                                  borderLeft: '1px solid #f5f5f5',
                                }}
                              />
                            ))}
                          </div>

                          {/* сами назначения */}
                          {visibleSlots.map((slot) => {
                            const lane = laneById[slot.id] ?? 0;

                            const slotStart = clampDateToRange(
                              dayjs(slot.from),
                              plannerFromDate!,
                              plannerToDate!,
                            );
                            const slotEnd = clampDateToRange(
                              dayjs(slot.to ?? slot.from),
                              plannerFromDate!,
                              plannerToDate!,
                            );

                            const startIndex = slotStart
                              .startOf('day')
                              .diff(plannerFromDate!.startOf('day'), 'day');
                            const endIndex =
                              slotEnd
                                .startOf('day')
                                .diff(plannerFromDate!.startOf('day'), 'day') +
                              1;

                            const left = startIndex * GRID_CELL_WIDTH;
                            const width = Math.max(
                              (endIndex - startIndex) * GRID_CELL_WIDTH - 4,
                              24,
                            );

                            const rawColor =
                              (slot as any).workplace?.color || undefined;
                            const bgColor = rawColor || '#e6f7ff';
                            const borderColor = rawColor || '#91d5ff';

                            const baseStartTime = dayjs(slot.from).format(
                              'DD.MM',
                            );
                            const baseEndTime = slot.to
                              ? dayjs(slot.to).format('DD.MM')
                              : '';

                            return (
                              <div
                                key={slot.id}
                                style={{
                                  position: 'absolute',
                                  top:
                                    GRID_ROW_VERTICAL_PADDING +
                                    lane * GRID_ROW_HEIGHT +
                                    4,
                                  left,
                                  width,
                                  height: GRID_ROW_HEIGHT - 8,
                                  borderRadius: 6,
                                  background: bgColor,
                                  border: `1px solid ${borderColor}`,
                                  padding: '4px 6px',
                                  boxSizing: 'border-box',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  cursor: 'default',
                                  fontSize: 12,
                                }}
                              >
                                {(slot as any).workplace?.code &&
                                  `${(slot as any).workplace.code} — `}
                                {(slot as any).workplace?.name || ''}
                                {` · ${baseStartTime}`}
                                {baseEndTime && ` → ${baseEndTime}`}
                              </div>
                            );
                          })}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}
        </Card>
      )}




      {/* Моя статистика (строго по текущему пользователю) */}
      <Card
        style={{ marginTop: 24 }}
        title={t('myPlace.myStatsTitle', 'Моя статистика')}
      >
        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 16, gap: 16, flexWrap: 'wrap' }}
        >
          <Space direction="vertical" size={4}>
            <Text type="secondary">
              {t(
                'myPlace.myStatsPeriod',
                'Статистика назначений и часов за выбранный период.',
              )}
            </Text>
          </Space>

          <Space style={{ flexWrap: 'wrap' }}>
            <Text>{t('myPlace.myStatsPeriodLabel', 'Период')}:</Text>
            <RangePicker
              allowClear={false}
              value={[myStatsFrom, myStatsTo]}
              onChange={(range) => {
                if (!range || range.length !== 2) return;
                const [start, end] = range;
                if (!start || !end) return;
                setMyStatsFrom(start.startOf('day'));
                setMyStatsTo(end.endOf('day'));
              }}
            />
          </Space>
        </Flex>

        {isMyStatsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : myStatsError ? (
          <Result
            status="error"
            title={t(
              'myPlace.myStatsErrorTitle',
              'Не удалось загрузить статистику.',
            )}
            subTitle={String(myStatsError)}
          />
        ) : (
          (() => {
            if (!myStatsData || !currentUserId) {
              return (
                <div style={{ padding: '16px 0' }}>
                  <Text type="secondary">
                    {t(
                      'myPlace.myStatsEmpty',
                      'Нет данных по назначениям и часам за выбранный период.',
                    )}
                  </Text>
                </div>
              );
            }

            const myUserStats = myStatsData.byUser.find(
              (u) => u.userId === currentUserId,
            );

            if (!myUserStats) {
              return (
                <div style={{ padding: '16px 0' }}>
                  <Text type="secondary">
                    {t(
                      'myPlace.myStatsEmpty',
                      'Нет данных по назначениям и часам за выбранный период.',
                    )}
                  </Text>
                </div>
              );
            }

            const totalHoursRaw = myUserStats.totalHours ?? 0;
            const reportedHourRaw =
              (myUserStats as any).reportedHour ??
              (myUserStats as any).reportedHours ??
              0;

            const totalHours = totalHoursRaw;
            const reportedHour = reportedHourRaw;
            const workingDays = Math.round(totalHours / 8);

            // Попробуем оценить количество назначений по строкам rows
            // Логика: считаем количество непрерывных отрезков дней по одному рабочему месту.
            const myRows = myStatsData.rows
              .filter((r) => r.userId === currentUserId)
              .sort((a, b) => a.date.localeCompare(b.date));

            let assignmentsCount = 0;
            let prevDate: string | null = null;
            let prevWorkplaceId: string | null = null;

            for (const r of myRows) {
              if (!prevDate) {
                assignmentsCount++;
              } else {
                const prev = dayjs(prevDate);
                const cur = dayjs(r.date);
                const dayDiff = cur.diff(prev, 'day');

                // Новое назначение, если:
                //  - смена на другом рабочем месте
                //  - или есть разрыв по датам больше чем 1 день
                if (r.workplaceId !== prevWorkplaceId || dayDiff > 1) {
                  assignmentsCount++;
                }
              }

              prevDate = r.date;
              prevWorkplaceId = r.workplaceId;
            }

            const displayName =
              myUserStats.userName ??
              (profile as any)?.fullName ??
              (user as any)?.fullName ??
              (user as any)?.email ??
              t('myPlace.unknownUser', 'Неизвестный сотрудник');

            const dataSource = [
              {
                key: currentUserId ?? 'me',
                name: displayName,
                workingDays,
                totalHours,
                reportedHour,
              },
            ];

            return (
              <>
                <Flex
                  style={{
                    marginBottom: 16,
                    gap: 32,
                    flexWrap: 'wrap',
                  }}
                >
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">
                      {t(
                        'myPlace.myStatsTotalHoursLabel',
                        'Всего часов по сменам',
                      )}
                    </Text>
                    <Text strong>{Math.round(totalHours)}</Text>
                  </Space>

                  <Space direction="vertical" size={4}>
                    <Text type="secondary">
                      {t(
                        'myPlace.myStatsTotalReportedHoursLabel',
                        'Всего отчётных часов',
                      )}
                    </Text>
                    <Text strong>{Math.round(reportedHour)}</Text>
                  </Space>
                </Flex>

                <Table
                  dataSource={dataSource}
                  pagination={false}
                  size="small"
                  scroll={{ x: true }}
                  columns={[
                    {
                      title: t(
                        'myPlace.myStatsColEmployee',
                        'Сотрудник',
                      ),
                      dataIndex: 'name',
                      key: 'name',
                    },
                    {
                      title: t(
                        'myPlace.myStatsColWorkingDays',
                        'Рабочих дней',
                      ),
                      dataIndex: 'workingDays',
                      key: 'workingDays',
                      render: (value: number) => value || '—',
                    },
                    {
                      title: t('myPlace.myStatsColHours', 'Количество часов'),
                      dataIndex: 'totalHours',
                      key: 'totalHours',
                      render: (value: number) =>
                        value || value === 0 ? Math.round(value) : '—',
                    },
                    {
                      title: t(
                        'myPlace.myStatsColReportedHours',
                        'Количество отчётных часов',
                      ),
                      dataIndex: 'reportedHour',
                      key: 'reportedHour',
                      render: (value: number | null | undefined) =>
                        value != null ? value.toFixed(2) : '—',
                    },
                  ]}
                />
              </>
            );
          })()
        )}
      </Card>




      {/* МОДАЛКА: отчёт по отработанным часам */}
      <Modal
        open={isWorkReportModalOpen}
        title={t('myPlace.workReportTitle', 'Отчёт по отработанным часам')}
        onCancel={() => {
          setIsWorkReportModalOpen(false);
        }}
        footer={null}
      >
        <Form
          form={workReportForm}
          layout="vertical"
        >
          {/* Храним выбранную дату в форме, но сам DatePicker не показываем */}
          <Form.Item
            name="date"
            rules={[
              {
                required: true,
                message: t(
                  'myPlace.workReport.dateRequired',
                  'Выберите дату',
                ),
              },
            ]}
            style={{ display: 'none' }}
          >
            <DatePicker />
          </Form.Item>

          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong>
              {t('myPlace.workReport.date', 'Дата')}
            </Typography.Text>
            <Calendar
              fullscreen={false}
              value={workReportSelectedDate ?? dayjs()}
              onSelect={(value) => {
                setWorkReportSelectedDate(value);
                const dateKey = value.format('YYYY-MM-DD');
                const hours = workReportHoursByDate[dateKey] ?? null;
                workReportForm.setFieldsValue({
                  date: value,
                  hours,
                });
              }}
              dateFullCellRender={(value) => {
                const dateKey = value.format('YYYY-MM-DD');
                const hasAssignments = assignmentDatesSet.has(dateKey);
                const isSelected =
                  !!workReportSelectedDate &&
                  value.isSame(workReportSelectedDate, 'day');
                const hours = workReportHoursByDate[dateKey] ?? null;
                return (
                  <div
                    style={{
                      borderRadius: 4,
                      padding: 4,
                      border: isSelected
                        ? '1px solid #1677ff'
                        : hasAssignments
                        ? '1px solid #52c41a'
                        : '1px solid transparent',
                      backgroundColor: isSelected ? '#e6f4ff' : undefined,
                    }}
                  >
                    <div>{value.date()}</div>
                    {hasAssignments && (
                      <div style={{ fontSize: 10 }}>
                        {t(
                          'myPlace.workReport.hasAssignmentsMark',
                          'Есть назначение',
                        )}
                      </div>
                    )}
                    {hours != null && (
                      <div style={{ fontSize: 10 }}>
                        {hours} ч
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>

          <Form.Item
            label={t('myPlace.workReport.hours', 'Отработано часов')}
            name="hours"
            rules={[
              {
                required: true,
                message: t(
                  'myPlace.workReport.hoursRequired',
                  'Укажите количество часов',
                ),
              },
            ]}
          >
            <InputNumber
              min={0}
              max={24}
              step={0.5}
              style={{ width: '100%' }}
              disabled={isWorkReportSubmitting}
              placeholder={t(
                'myPlace.workReport.hoursPlaceholder',
                'Например, 8',
              )}
              onBlur={() => {
                const values = workReportForm.getFieldsValue();
                void handleSubmitWorkReport(values);
              }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* МОДАЛКИ НИЖЕ */}

      {/* МОДАЛКА: детали назначения */}
      <Modal
        open={!!selectedAssignment}
        title={
          selectedAssignment
            ? `${t('myPlace.assignmentDetailsTitle', 'Детали назначения')}: ${
                (selectedAssignment.workplace as any)?.name ??
                (selectedAssignment as any).workplaceId ??
                ''
              }`
            : ''
        }
        onCancel={() => {
          setSelectedAssignment(null);
          setSelectedAssignmentShifts([]);
        }}
        footer={null}
        width={800}
      >
        {selectedAssignmentShifts.length ? (
          <List
            size="small"
            bordered
            dataSource={selectedAssignmentShifts}
            renderItem={(item) => (
              <List.Item>
                <Space>
                  <Text strong>{item.date.format('DD.MM.YYYY')}</Text>
                  <Text>
                    {item.from.format('HH:mm')} – {item.to.format('HH:mm')}
                  </Text>
                  <Text type="secondary">
                    {item.hours.toFixed(1)} {t('myPlace.hoursShort', 'ч')}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Result status="info" title={t('myPlace.noShiftsForAssignment', 'Для этого назначения нет смен')} />
        )}
      </Modal>

      {/* МОДАЛКА: запрос корректировки */}
      <Modal
        open={correctionModalOpen}
        title={t('myPlace.correctionModalTitle', 'Запрос на корректировку расписания')}
        onCancel={() => {
          setCorrectionModalOpen(false);
          setCorrectionIntervals({});
          setCorrectionAssignment(null);
        }}
        onOk={handleSendCorrection}
        okButtonProps={{
          loading: isCorrectionSubmitting,
          disabled: !hasCorrectionIntervals || hasInvalidCorrectionIntervals,
        }}
        width={900}
      >
        {correctionAssignment ? (
          <>
            <Text type="secondary">
              {t('myPlace.correctionAssignmentLabel', 'Назначение:')}{' '}
              {(correctionAssignment.workplace as any)?.name ??
                (correctionAssignment as any).workplaceId ??
                '—'}
            </Text>

            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <Button type="dashed" onClick={handleAddCorrectionDay}>
                {t('myPlace.addCorrectionDay', 'Добавить день')}
              </Button>
            </div>

            {correctionIntervalsList.length ? (
              <List
                dataSource={correctionIntervalsList}
                rowKey={(item) => item.dateKey}
                renderItem={(day) => (
                  <List.Item
                    actions={[
                      <Button
                        key="add-interval"
                        size="small"
                        onClick={() => handleAddIntervalForDay(day.dateKey)}
                      >
                        {t('myPlace.addInterval', 'Добавить интервал')}
                      </Button>,
                      <Button
                        key="remove-day"
                        size="small"
                        danger
                        onClick={() => handleRemoveDay(day.dateKey)}
                      >
                        {t('myPlace.removeDay', 'Удалить день')}
                      </Button>,
                    ]}
                  >
                    <div style={{ width: '100%' }}>
                      <Text strong>{day.date.format('DD.MM.YYYY')}</Text>

                      <List
                        style={{ marginTop: 8 }}
                        size="small"
                        bordered
                        dataSource={day.intervals}
                        renderItem={(interval, index) => (
                          <List.Item
                            actions={[
                              <Button
                                key="remove"
                                size="small"
                                danger
                                onClick={() =>
                                  handleRemoveCorrectionInterval(day.dateKey, index)
                                }
                              >
                                {t('myPlace.removeInterval', 'Удалить')}
                              </Button>,
                            ]}
                          >
                            <Space wrap>
                              <TimePicker
                                value={interval.from}
                                format="HH:mm"
                                onChange={(time) =>
                                  handleChangeCorrectionTime(day.dateKey, index, 'from', time)
                                }
                              />
                              <span>—</span>
                              <TimePicker
                                value={interval.to}
                                format="HH:mm"
                                onChange={(time) =>
                                  handleChangeCorrectionTime(day.dateKey, index, 'to', time)
                                }
                              />
                              <Select<ShiftKindType>
                                value={interval.shiftKind}
                                style={{ width: 160 }}
                                onChange={(value) =>
                                  handleChangeCorrectionShiftKind(day.dateKey, index, value)
                                }
                              >
                                <Select.Option value="DEFAULT">
                                  {shiftKindLabel('DEFAULT')}
                                </Select.Option>
                                <Select.Option value="OFFICE">
                                  {shiftKindLabel('OFFICE')}
                                </Select.Option>
                                <Select.Option value="REMOTE">
                                  {shiftKindLabel('REMOTE')}
                                </Select.Option>
                                <Select.Option value="DAY_OFF">
                                  {shiftKindLabel('DAY_OFF')}
                                </Select.Option>
                              </Select>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Result
                status="info"
                title={t(
                  'myPlace.noCorrectionDaysTitle',
                  'Добавьте дни, для которых нужна корректировка',
                )}
                subTitle={t(
                  'myPlace.noCorrectionDaysSubtitle',
                  'Нажмите «Добавить день», чтобы указать интервалы работы.',
                )}
              />
            )}

            {hasInvalidCorrectionIntervals && (
              <div style={{ marginTop: 16 }}>
                <Text type="danger">
                  {t(
                    'myPlace.invalidCorrectionHint',
                    'Есть интервалы, где время окончания не позже начала.',
                  )}
                </Text>
              </div>
            )}
          </>
        ) : (
          <Result
            status="info"
            title={t('myPlace.noCorrectionAssignmentTitle', 'Не выбрано назначение')}
            subTitle={t(
              'myPlace.noCorrectionAssignmentSubtitle',
              'Выберите назначение выше и нажмите «Запросить корректировку расписания».',
            )}
          />
        )}
      </Modal>

      {/* МОДАЛКА: запрос назначения (как "создать назначение") */}
      <Modal
        open={isRequestModalOpen}
        title="Запрос назначения"
        onCancel={() => {
          setIsRequestModalOpen(false);
          requestForm.resetFields();
          setRequestPeriod(null);
          setRequestIntervals({});
          setRequestApplyToAll(true);
          setRequestGlobalTime([
            dayjs().hour(9).minute(0).second(0),
            dayjs().hour(18).minute(0).second(0),
          ]);
        }}
        onOk={handleSendAssignmentRequest}
        okText="Отправить"
        cancelText="Отмена"
        okButtonProps={{
          loading: isRequestSubmitting,
          disabled:
            isRequestSubmitting ||
            !requestForm.getFieldValue('workplaceId') ||
            !requestForm.getFieldValue('period')?.[0] ||
            !requestForm.getFieldValue('period')?.[1] ||
            !hasRequestIntervals ||
            hasInvalidRequestIntervals,
        }}
        width={620}
      >
        <Form form={requestForm} layout="vertical" requiredMark={true}>
          <Form.Item label="Сотрудник" required>
            <Select
              value="me"
              disabled
              options={[
                {
                  value: 'me',
                  label: getUserDisplay(),
                },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="workplaceId"
            label="Рабочее место"
            rules={[{ required: true, message: 'Выберите место' }]}
            required
          >
            <Select
              placeholder="Выберите место"
              showSearch
              filterOption={false}
              onSearch={setWorkplaceSearch}
              options={workplaceOptions}
              loading={isAllWorkplacesLoading}
              notFoundContent={isAllWorkplacesLoading ? <Spin size="small" /> : null}
            />
          </Form.Item>

          <Form.Item
            name="period"
            label="Период"
            rules={[{ required: true, message: 'Укажите период' }]}
            required
          >
            <RangePicker
              format="DD.MM.YYYY"
              onChange={(v) => handleRequestPeriodChange(v)}
            />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />

          <div style={{ marginBottom: 8 }}>
            <Text strong>График смен по дням</Text>
          </div>

          <Space align="center" style={{ marginBottom: 12 }}>
            <TimePicker.RangePicker
              format="HH:mm"
              value={requestGlobalTime as any}
              onChange={(v) => handleRequestGlobalTimeChange(v)}
              placeholder={['Время начала', 'Время окончания']}
            />
            <Checkbox
              checked={requestApplyToAll}
              onChange={(e) => handleRequestApplyToAllChange(e.target.checked)}
            >
              Применить ко всем датам
            </Checkbox>
          </Space>

          {hasRequestIntervals ? (
            <div style={{ maxHeight: 320, overflow: 'auto', paddingRight: 6 }}>
              {requestIntervalsList.map((day) => (
                <div
                  key={day.dateKey}
                  style={{
                    border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 10,
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
                    <Text strong>{day.date.format('DD.MM.YYYY')}</Text>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => handleAddRequestIntervalForDay(day.dateKey)}
                    >
                      Добавить интервал
                    </Button>
                  </div>

                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {day.intervals.map((interval, idx) => (
                      <Space key={`${day.dateKey}-${idx}`} wrap style={{ width: '100%' }}>
                        <TimePicker.RangePicker
                          format="HH:mm"
                          value={[interval.from, interval.to] as any}
                          onChange={(v) =>
                            handleChangeRequestIntervalRange(day.dateKey, idx, v as any)
                          }
                          placeholder={['Время начала', 'Время окончания']}
                        />

                        <Select<ShiftKindType>
                          value={interval.shiftKind}
                          style={{ width: 170 }}
                          onChange={(v) => handleChangeRequestShiftKind(day.dateKey, idx, v)}
                        >
                          <Select.Option value="DEFAULT">Обычная смена</Select.Option>
                          <Select.Option value="OFFICE">Офис</Select.Option>
                          <Select.Option value="REMOTE">Удалённо</Select.Option>
                          <Select.Option value="DAY_OFF">Выходной</Select.Option>
                        </Select>

                        <Button
                          type="link"
                          danger
                          onClick={() => handleRemoveRequestInterval(day.dateKey, idx)}
                        >
                          Удалить
                        </Button>
                      </Space>
                    ))}
                  </Space>
                </div>
              ))}
            </div>
          ) : (
            <Result
              status="info"
              title="Выберите период, чтобы сформировать дни"
            />
          )}

          {hasInvalidRequestIntervals && (
            <div style={{ marginTop: 8 }}>
              <Text type="danger">Есть интервалы, где окончание не позже начала.</Text>
            </div>
          )}
        </Form>
      </Modal>

      {/* МОДАЛКА: смена пароля */}
      <Modal
        open={passwordModalOpen}
        title={t('myPlace.changePasswordTitle', 'Смена пароля')}
        onCancel={() => {
          setPasswordModalOpen(false);
          passwordForm.resetFields();
          setChangePasswordError(null);
        }}
        onOk={handleChangePassword}
        okButtonProps={{ loading: isPasswordSubmitting }}
      >
        <Form form={passwordForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="currentPassword"
            label={t('myPlace.currentPassword', 'Текущий пароль')}
            rules={[{ required: true, message: t('myPlace.required', 'Обязательное поле') }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label={t('myPlace.newPassword', 'Новый пароль')}
            rules={[{ required: true, message: t('myPlace.required', 'Обязательное поле') }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label={t('myPlace.confirmPassword', 'Повторите новый пароль')}
            dependencies={['newPassword']}
            rules={[{ required: true, message: t('myPlace.required', 'Обязательное поле') }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>

          {changePasswordError && <Text type="danger">{changePasswordError}</Text>}
        </Form>
      </Modal>
    </Flex>
  );
};

export default MyPlacePage;