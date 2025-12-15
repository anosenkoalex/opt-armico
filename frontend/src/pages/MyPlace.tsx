// frontend/src/pages/MyPlace.tsx
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Flex,
  List,
  Modal,
  Result,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
  Select,
  TimePicker,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Assignment,
  AssignmentStatus,
  CurrentWorkplaceResponse,
  Slot,
  SlotStatus,
  ShiftKind,
  StatisticsResponse,
  fetchCurrentWorkplace,
  fetchMySchedule,
  fetchStatistics,
  requestAssignmentScheduleAdjustment,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { Text } = Typography;
const { RangePicker } = DatePicker;

type ShiftKindType = 'DEFAULT' | 'OFFICE' | 'REMOTE' | 'DAY_OFF';

const assignmentStatusColor: { [key in AssignmentStatus]: string } = {
  ACTIVE: 'green',
  ARCHIVED: 'default',
};

const slotStatusColor: { [key in SlotStatus]: string } = {
  PLANNED: 'blue',
  CONFIRMED: 'green',
  REPLACED: 'orange',
  CANCELLED: 'red',
};

const CELL_WIDTH = 48;
const ROW_HEIGHT = 32;

// ===== интервалы по дням для назначения =====

type DayInterval = {
  start: string; // 'HH:mm'
  end: string; // 'HH:mm'
  kind?: ShiftKindType;
};

type DayIntervalsMap = { [date: string]: DayInterval[] };

function buildAssignmentDayIntervalsFrom(
  assignment: Assignment | null,
  schedule: Slot[],
): DayIntervalsMap {
  const result: DayIntervalsMap = {};
  if (!assignment) return result;

  const anyAssignment: any = assignment;
  const shifts: any[] = Array.isArray(anyAssignment.shifts)
    ? anyAssignment.shifts
    : [];

  // 1) если у назначения есть shifts — используем их
  if (shifts.length > 0) {
    shifts.forEach((s) => {
      const dateSrc =
        s.date ?? s.startsAt ?? s.endsAt ?? assignment.startsAt;
      if (!dateSrc || !s.startsAt || !s.endsAt) return;

      const dateKey = dayjs(dateSrc).format('DD.MM.YYYY');
      const start = dayjs(s.startsAt).format('HH:mm');
      const end = dayjs(s.endsAt).format('HH:mm');
      const kind: ShiftKindType | undefined =
        (s.kind as ShiftKindType | undefined) ?? 'DEFAULT';

      if (!result[dateKey]) result[dateKey] = [];
      result[dateKey].push({ start, end, kind });
    });

    Object.keys(result).forEach((key) => {
      result[key].sort((a, b) => {
        const [ah, am] = a.start.split(':').map(Number);
        const [bh, bm] = b.start.split(':').map(Number);
        return ah * 60 + am - (bh * 60 + bm);
      });
    });

    return result;
  }

  // 2) fallback: берём слоты из расписания
  const start = dayjs(assignment.startsAt);
  const end = assignment.endsAt ? dayjs(assignment.endsAt) : null;

  const related = schedule.filter((slot) => {
    const slotStart = dayjs(slot.dateStart);
    if (end) {
      return !slotStart.isBefore(start) && !slotStart.isAfter(end);
    }
    return !slotStart.isBefore(start);
  });

  related.forEach((slot) => {
    const dateKey = dayjs(slot.dateStart).format('DD.MM.YYYY');
    const s = dayjs(slot.dateStart).format('HH:mm');
    const e = dayjs(slot.dateEnd ?? slot.dateStart).format('HH:mm');

    if (!result[dateKey]) result[dateKey] = [];
    result[dateKey].push({ start: s, end: e, kind: 'DEFAULT' });
  });

  Object.keys(result).forEach((key) => {
    result[key].sort((a, b) => {
      const [ah, am] = a.start.split(':').map(Number);
      const [bh, bm] = b.start.split(':').map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });
  });

  return result;
}

// ===== дорожки для слотов планов (старый мини-планировщик) =====

type LaneById = { [slotId: string]: number };

function buildLanes(slots: Slot[]): {
  laneById: LaneById;
  lanesCount: number;
} {
  const sorted = [...slots].sort(
    (a, b) => dayjs(a.dateStart).valueOf() - dayjs(b.dateStart).valueOf(),
  );

  const laneEndTimes: dayjs.Dayjs[] = [];
  const laneById: LaneById = {};

  for (const slot of sorted) {
    const start = dayjs(slot.dateStart);
    let laneIndex = 0;

    for (let i = 0; i < laneEndTimes.length; i++) {
      if (!laneEndTimes[i] || !laneEndTimes[i].isAfter(start)) {
        laneIndex = i;
        break;
      }
      laneIndex = laneEndTimes.length;
    }

    if (laneIndex === laneEndTimes.length) {
      laneEndTimes.push(dayjs(slot.dateEnd ?? slot.dateStart));
    } else {
      laneEndTimes[laneIndex] = dayjs(slot.dateEnd ?? slot.dateStart);
    }

    laneById[slot.id] = laneIndex;
  }

  return { laneById, lanesCount: laneEndTimes.length || 1 };
}

const MyPlace = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [viewAssignment, setViewAssignment] = useState<Assignment | null>(
    null,
  );
  const [correctionAssignment, setCorrectionAssignment] =
    useState<Assignment | null>(null);
  const [correctionComment, setCorrectionComment] = useState('');
  const [correctionIntervals, setCorrectionIntervals] =
    useState<DayIntervalsMap>({});
  const [isSendingCorrection, setIsSendingCorrection] = useState(false);

  // диапазон для личной статистики
  const [statsRange, setStatsRange] = useState<[Dayjs, Dayjs] | null>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);

  const { data, isLoading } = useQuery<CurrentWorkplaceResponse>({
    queryKey: ['me', 'current-workplace', 'my-place'],
    queryFn: fetchCurrentWorkplace,
    refetchInterval: 60_000,
  });

  const scheduleQuery = useQuery<Slot[]>({
    queryKey: ['me', 'schedule', 'my-place'],
    queryFn: fetchMySchedule,
    refetchInterval: 60_000,
  });

  // личная статистика по /statistics
  const statsFrom = (statsRange?.[0] ?? dayjs().startOf('month')).format(
    'YYYY-MM-DD',
  );
  const statsTo = (statsRange?.[1] ?? dayjs().endOf('month')).format(
    'YYYY-MM-DD',
  );

  const myStatisticsQuery = useQuery<StatisticsResponse>({
    queryKey: ['me', 'statistics', profile?.id, statsFrom, statsTo],
    enabled: !!profile,
    queryFn: () =>
      fetchStatistics({
        from: statsFrom,
        to: statsTo,
        userId: profile!.id,
      }),
  });

  if (!profile) {
    return (
      <Flex justify="center" align="center" className="min-h-[40vh]">
        <Spin tip={t('common.loading')} />
      </Flex>
    );
  }

  const currentAssignment = data?.assignment ?? null;
  const currentWorkplace = data?.workplace ?? null;
  const history = data?.history ?? [];
  const schedule = scheduleQuery.data ?? [];

  // ====== Мои назначения (текущие + история) ======

  const assignmentsTableData: Assignment[] = useMemo(() => {
    const list: Assignment[] = [];
    if (currentAssignment) list.push(currentAssignment);
    if (history.length > 0) list.push(...history);
    return list;
  }, [currentAssignment, history]);

  // только активные назначения (для таблицы и расписания)
  const activeAssignmentsOnly = useMemo(
    () => assignmentsTableData.filter((a) => a.status === 'ACTIVE'),
    [assignmentsTableData],
  );

  const assignmentColumns = useMemo(
    () => [
      {
        title: t('assignments.workplace', 'Рабочее место'),
        dataIndex: ['workplace', 'name'],
        key: 'workplace',
        render: (_: unknown, record: Assignment) => (
          <span>
            {record.workplace?.code ? `${record.workplace.code} — ` : ''}
            {record.workplace?.name}
          </span>
        ),
      },
      {
        title: t('myPlace.interval', 'Интервал'),
        key: 'interval',
        render: (_: unknown, record: Assignment) => {
          const start = dayjs(record.startsAt).format('DD.MM.YYYY');
          const end = record.endsAt
            ? dayjs(record.endsAt).format('DD.MM.YYYY')
            : t('myPlace.noEndDate', 'Без даты окончания');

          return (
            <Typography.Link onClick={() => setViewAssignment(record)}>
              {`${start} → ${end}`}
            </Typography.Link>
          );
        },
      },
      {
        title: t('myPlace.status', 'Статус'),
        dataIndex: 'status',
        key: 'status',
        render: (value: AssignmentStatus) => (
          <Tag color={assignmentStatusColor[value]}>
            {value === 'ACTIVE'
              ? t('assignments.status.active', 'Активно')
              : t('assignments.status.archived', 'Архив')}
          </Tag>
        ),
      },
      {
        title: t('myPlace.actions', 'Действия'),
        key: 'actions',
        render: (_: unknown, record: Assignment) => (
          <Button
            size="small"
            type="link"
            onClick={() => {
              setCorrectionAssignment(record);
              setCorrectionComment('');
              setCorrectionIntervals(
                buildAssignmentDayIntervalsFrom(record, schedule),
              );
            }}
          >
            {t('myPlace.requestAdjustment', 'Запросить корректировку')}
          </Button>
        ),
      },
    ],
    [t, schedule],
  );

  // ====== Мини-планировщик по слотам (старый режим) ======

  const slotPlannerDays = useMemo(() => {
    if (!schedule.length) return [];
    let minDate = dayjs(schedule[0].dateStart).startOf('day');
    let maxDate = dayjs(schedule[0].dateEnd ?? schedule[0].dateStart).startOf(
      'day',
    );

    for (const slot of schedule) {
      const s = dayjs(slot.dateStart).startOf('day');
      const e = dayjs(slot.dateEnd ?? slot.dateStart).startOf('day');
      if (s.isBefore(minDate)) minDate = s;
      if (e.isAfter(maxDate)) maxDate = e;
    }

    minDate = minDate.subtract(1, 'day');
    maxDate = maxDate.add(1, 'day');

    const days: dayjs.Dayjs[] = [];
    let cursor = minDate;

    while (cursor.isBefore(maxDate) || cursor.isSame(maxDate, 'day')) {
      days.push(cursor);
      cursor = cursor.add(1, 'day');
    }

    return days;
  }, [schedule]);

  const { laneById, lanesCount } = useMemo(() => {
    if (!schedule.length) return { laneById: {} as LaneById, lanesCount: 1 };
    return buildLanes(schedule);
  }, [schedule]);

  // ====== Мини-планировщик по активным назначениям (новый режим) ======

  const assignmentPlannerDays = useMemo(() => {
    if (!activeAssignmentsOnly.length) return [];

    let minDate = dayjs(activeAssignmentsOnly[0].startsAt).startOf('day');
    let maxDate = dayjs(
      activeAssignmentsOnly[0].endsAt ?? activeAssignmentsOnly[0].startsAt,
    ).startOf('day');

    for (const a of activeAssignmentsOnly) {
      const s = dayjs(a.startsAt).startOf('day');
      const e = dayjs(a.endsAt ?? a.startsAt).startOf('day');
      if (s.isBefore(minDate)) minDate = s;
      if (e.isAfter(maxDate)) maxDate = e;
    }

    // немножко поля по краям
    minDate = minDate.subtract(1, 'day');
    maxDate = maxDate.add(1, 'day');

    const days: dayjs.Dayjs[] = [];
    let cursor = minDate;

    while (cursor.isBefore(maxDate) || cursor.isSame(maxDate, 'day')) {
      days.push(cursor);
      cursor = cursor.add(1, 'day');
    }

    return days;
  }, [activeAssignmentsOnly]);

  // ====== статистика по назначениям (без слотов) ======

  const oldStats = useMemo(() => {
    const totalAssignments = assignmentsTableData.length;
    const activeAssignments = assignmentsTableData.filter(
      (a) => a.status === 'ACTIVE',
    ).length;
    const archivedAssignments = assignmentsTableData.filter(
      (a) => a.status === 'ARCHIVED',
    ).length;

    return {
      totalAssignments,
      activeAssignments,
      archivedAssignments,
    };
  }, [assignmentsTableData]);

  // ====== новая статистика по /statistics ======

  const myStatistics = myStatisticsQuery.data;
  const myRows = myStatistics?.rows ?? [];

  const myWorkingDays = useMemo(() => {
    const set = new Set<string>();
    myRows.forEach((r) => {
      const key = dayjs(r.startsAt ?? r.date).format('YYYY-MM-DD');
      set.add(key);
    });
    return set.size;
  }, [myRows]);

  const myTotalHours = useMemo(() => {
    if (!myStatistics) return 0;
    const byUser = myStatistics.byUser?.[0];
    if (byUser) return Number(byUser.totalHours.toFixed(2));
    return myRows.reduce((acc, r) => acc + r.hours, 0);
  }, [myStatistics, myRows]);

  const hoursByKind = useMemo(() => {
    const byUser = myStatistics?.byUser?.[0];
    const result: { kind: ShiftKind; hours: number }[] = [];
    const map = (byUser?.byKind ?? {}) as Record<string, number>;

    (['DEFAULT', 'OFFICE', 'REMOTE', 'DAY_OFF'] as ShiftKind[]).forEach(
      (k) => {
        const val = map[k] ?? 0;
        if (val > 0) {
          result.push({ kind: k, hours: Number(val.toFixed(2)) });
        }
      },
    );

    return result;
  }, [myStatistics]);

  // ====== интервалы для модалки просмотра ======

  const assignmentDayIntervals = useMemo(
    () => buildAssignmentDayIntervalsFrom(viewAssignment, schedule),
    [viewAssignment, schedule],
  );

  const hasAssignmentDayIntervals =
    Object.keys(assignmentDayIntervals).length > 0;

  const hasCorrectionIntervals =
    Object.keys(correctionIntervals).length > 0;

  const hasInvalidCorrectionIntervals = useMemo(() => {
    return Object.keys(correctionIntervals).some((dateKey) => {
      const intervals = correctionIntervals[dateKey];
      return intervals.some((interval) => {
        const start = dayjs(`${dateKey} ${interval.start}`, 'DD.MM.YYYY HH:mm');
        const end = dayjs(`${dateKey} ${interval.end}`, 'DD.MM.YYYY HH:mm');
        return !end.isAfter(start);
      });
    });
  }, [correctionIntervals]);

  const getShiftKindLabel = (kind?: ShiftKindType) => {
    if (!kind || kind === 'DEFAULT') return '';
    if (kind === 'OFFICE')
      return t('assignments.shiftKind.office', 'Офис');
    if (kind === 'REMOTE')
      return t('assignments.shiftKind.remote', 'Удалёнка');
    return t('assignments.shiftKind.dayOff', 'Day off / больничный');
  };

  // ====== отправка запросов корректировки ======

  const handleSendCorrection = async () => {
    if (!correctionAssignment) return;
    if (hasInvalidCorrectionIntervals) return;

    const text = correctionComment.trim();

    if (!text && !hasCorrectionIntervals) {
      message.warning(
        t(
          'myPlace.swapCommentRequired',
          'Напишите, что вы хотите скорректировать или измените статусы/интервалы смен',
        ),
      );
      return;
    }

    const intervalLines: string[] = [];

    Object.keys(correctionIntervals)
      .sort(
        (a, b) =>
          dayjs(a, 'DD.MM.YYYY').valueOf() -
          dayjs(b, 'DD.MM.YYYY').valueOf(),
      )
      .forEach((dateKey) => {
        const intervals = correctionIntervals[dateKey];
        intervals.forEach((interval) => {
          const kindLabel = getShiftKindLabel(interval.kind);
          intervalLines.push(
            `${dateKey}: ${interval.start} → ${interval.end}${
              kindLabel ? ` (${kindLabel})` : ''
            }`,
          );
        });
      });

    let commentToSend = text;
    if (intervalLines.length) {
      const intervalsBlock = `\n\n---\nИнтервалы, которые сотрудник предлагает:\n${intervalLines.join(
        '\n',
      )}`;
      commentToSend = commentToSend
        ? `${commentToSend}${intervalsBlock}`
        : intervalsBlock.trimStart();
    }

    if (!commentToSend) {
      commentToSend = t(
        'myPlace.defaultAdjustmentComment',
        'Запрос на корректировку расписания без комментария',
      );
    }

    const dateKeys = Object.keys(correctionIntervals);

    try {
      setIsSendingCorrection(true);

      if (dateKeys.length === 0) {
        const backendDate = dayjs(
          correctionAssignment.startsAt,
        ).format('YYYY-MM-DD');

        await requestAssignmentScheduleAdjustment(correctionAssignment.id, {
          date: backendDate,
          comment: commentToSend,
        });
      } else {
        const sortedDateKeys = [...dateKeys].sort(
          (a, b) =>
            dayjs(a, 'DD.MM.YYYY').valueOf() -
            dayjs(b, 'DD.MM.YYYY').valueOf(),
        );

        const requests: Promise<unknown>[] = [];

        for (const dateKey of sortedDateKeys) {
          const intervalsForDay = correctionIntervals[dateKey] ?? [];
          if (!intervalsForDay.length) continue;

          const baseDate = dayjs(dateKey, 'DD.MM.YYYY');
          const backendDate = baseDate.format('YYYY-MM-DD');

          const firstInterval = intervalsForDay[0];
          const startDt = dayjs(
            `${backendDate} ${firstInterval.start}`,
            'YYYY-MM-DD HH:mm',
          );
          const endDt = dayjs(
            `${backendDate} ${firstInterval.end}`,
            'YYYY-MM-DD HH:mm',
          );

          const backendStartsAt = startDt.toISOString();
          const backendEndsAt = endDt.toISOString();
          const backendKind: ShiftKindType =
            firstInterval.kind ?? 'DEFAULT';

          requests.push(
            requestAssignmentScheduleAdjustment(correctionAssignment.id, {
              date: backendDate,
              startsAt: backendStartsAt,
              endsAt: backendEndsAt,
              kind: backendKind,
              comment: commentToSend,
            }),
          );
        }

        if (!requests.length) {
          throw new Error('Нет валидных интервалов для отправки');
        }

        await Promise.all(requests);
      }

      message.success(
        t(
          'myPlace.swapRequested',
          'Запрос на корректировку отправлен менеджеру',
        ),
      );
      setCorrectionAssignment(null);
      setCorrectionComment('');
      setCorrectionIntervals({});
    } catch (err: any) {
      console.error('requestAssignmentScheduleAdjustment error', err);
      const backendMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        '';
      message.error(
        backendMessage
          ? `${t(
              'myPlace.swapRequestFailed',
              'Не удалось отправить запрос на корректировку. Попробуйте ещё раз.',
            )} (${backendMessage})`
          : t(
              'myPlace.swapRequestFailed',
              'Не удалось отправить запрос на корректировку. Попробуйте ещё раз.',
            ),
      );
    } finally {
      setIsSendingCorrection(false);
    }
  };

  // ====== РЕНДЕР ======

  const hasActiveAssignments = activeAssignmentsOnly.length > 0;

  return (
    <Flex vertical gap={16}>
      {/* Блок 1: Мои назначения */}
      <Card title={t('myPlace.assignmentsTitle', 'Мои назначения')}>
        {isLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : !hasActiveAssignments ? (
          <Result
            status="info"
            title={t(
              'myPlace.noAssignments',
              'Назначений пока нет — вы никуда не назначены',
            )}
          />
        ) : (
          <>
            {currentAssignment && currentWorkplace && (
              <Descriptions
                column={1}
                bordered
                size="small"
                style={{ marginBottom: 16 }}
              >
                <Descriptions.Item
                  label={t(
                    'myPlace.currentWorkplace',
                    'Текущее назначение',
                  )}
                >
                  {currentWorkplace.code
                    ? `${currentWorkplace.code} — ${currentWorkplace.name}`
                    : currentWorkplace.name}
                </Descriptions.Item>
              </Descriptions>
            )}

            <Table
              rowKey="id"
              dataSource={activeAssignmentsOnly}
              columns={assignmentColumns}
              pagination={false}
              size="small"
            />
          </>
        )}
      </Card>

      {/* Блок 2: Мой график */}
      <Card title={t('myPlace.scheduleTitle', 'Мой график')}>
        {scheduleQuery.isLoading && !hasActiveAssignments ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : schedule.length === 0 && !hasActiveAssignments ? (
          <Result
            status="info"
            title={t(
              'myPlace.scheduleEmpty',
              'Запланированных слотов нет',
            )}
          />
        ) : schedule.length === 0 ? (
          // 👉 нет слотов, но есть активные назначения — рисуем мини-планировщик по активным назначениям
          assignmentPlannerDays.length === 0 ? null : (
            <div
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflowX: 'auto',
                padding: 8,
              }}
            >
              {/* шапка с датами */}
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #f0f0f0',
                  background: '#fafafa',
                }}
              >
                <div
                  style={{
                    flex: '0 0 180px',
                    padding: '6px 8px',
                    borderRight: '1px solid #f0f0f0',
                    fontWeight: 500,
                  }}
                >
                  {t('myPlace.assignment', 'Назначение')}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: assignmentPlannerDays.length * CELL_WIDTH,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${assignmentPlannerDays.length}, ${CELL_WIDTH}px)`,
                  }}
                >
                  {assignmentPlannerDays.map((d) => (
                    <div
                      key={d.toISOString()}
                      style={{
                        padding: '4px 2px',
                        textAlign: 'center',
                        fontSize: 11,
                        borderLeft: '1px solid #f5f5f5',
                      }}
                    >
                      {d.format('DD.MM')}
                    </div>
                  ))}
                </div>
              </div>

              {/* строки по назначениям */}
              {activeAssignmentsOnly.map((a) => {
                const slotStart = dayjs(a.startsAt);
                const slotEnd = dayjs(a.endsAt ?? a.startsAt);

                const firstDay = assignmentPlannerDays[0].startOf('day');

                const startIndex = slotStart
                  .startOf('day')
                  .diff(firstDay, 'day');
                const endIndex =
                  slotEnd.startOf('day').diff(firstDay, 'day') + 1;

                const left = startIndex * CELL_WIDTH;
                const width = Math.max(
                  (endIndex - startIndex) * CELL_WIDTH - 4,
                  16,
                );

                const title =
                  a.workplace?.code && a.workplace?.name
                    ? `${a.workplace.code} — ${a.workplace.name}`
                    : a.workplace?.name ?? '';

                // 🔹 собираем интервалы смен для тултипа
                const dayIntervals = buildAssignmentDayIntervalsFrom(
                  a,
                  schedule,
                );
                const dateKeys = Object.keys(dayIntervals).sort(
                  (d1, d2) =>
                    dayjs(d1, 'DD.MM.YYYY').valueOf() -
                    dayjs(d2, 'DD.MM.YYYY').valueOf(),
                );

                const baseTooltip = `${slotStart.format(
                  'DD.MM.YYYY',
                )} → ${
                  a.endsAt
                    ? slotEnd.format('DD.MM.YYYY')
                    : t('myPlace.noEndDate', 'Без даты окончания')
                }`;

                let tooltip = baseTooltip;
                if (dateKeys.length) {
                  const lines: string[] = [];
                  dateKeys.forEach((dateKey) => {
                    const intervals = dayIntervals[dateKey];
                    intervals.forEach((interval) => {
                      const kindLabel = getShiftKindLabel(interval.kind);
                      lines.push(
                        `${dateKey}: ${interval.start} → ${interval.end}${
                          kindLabel ? ` (${kindLabel})` : ''
                        }`,
                      );
                    });
                  });
                  tooltip = `${baseTooltip}\n${lines.join('\n')}`;
                }

                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <div
                      style={{
                        flex: '0 0 180px',
                        padding: '8px 8px',
                        borderRight: '1px solid #f0f0f0',
                      }}
                    >
                      <Text>{title}</Text>
                    </div>

                    <div
                      style={{
                        position: 'relative',
                        flex: 1,
                        minWidth: assignmentPlannerDays.length * CELL_WIDTH,
                        padding: 8,
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* сетка */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 8,
                          display: 'grid',
                          gridTemplateColumns: `repeat(${assignmentPlannerDays.length}, ${CELL_WIDTH}px)`,
                          gridAutoRows: ROW_HEIGHT,
                        }}
                      >
                        {assignmentPlannerDays.map((d) => (
                          <div
                            key={d.toISOString()}
                            style={{
                              borderLeft: '1px solid #f5f5f5',
                            }}
                          />
                        ))}
                      </div>

                      {/* прямоугольник назначения */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 8,
                          left,
                          width,
                          height: ROW_HEIGHT - 6,
                          borderRadius: 6,
                          background: '#e6f7ff',
                          border: '1px solid #91d5ff',
                          padding: '2px 4px',
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          fontSize: 11,
                        }}
                        title={tooltip}
                      >
                        {title}
                      </div>

                      <div
                        style={{
                          height: ROW_HEIGHT + 16,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : slotPlannerDays.length === 0 ? null : (
          // 👉 есть реальные слоты планов — показываем старый мини-планировщик
          <div
            style={{
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              overflowX: 'auto',
              padding: 8,
            }}
          >
            {/* шапка с датами */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid #f0f0f0',
                background: '#fafafa',
              }}
            >
              <div
                style={{
                  flex: '0 0 180px',
                  padding: '6px 8px',
                  borderRight: '1px solid #f0f0f0',
                  fontWeight: 500,
                }}
              >
                {profile.fullName ?? profile.email}
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: slotPlannerDays.length * CELL_WIDTH,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${slotPlannerDays.length}, ${CELL_WIDTH}px)`,
                }}
              >
                {slotPlannerDays.map((d) => (
                  <div
                    key={d.toISOString()}
                    style={{
                      padding: '4px 2px',
                      textAlign: 'center',
                      fontSize: 11,
                      borderLeft: '1px solid #f5f5f5',
                    }}
                  >
                    {d.format('DD.MM')}
                  </div>
                ))}
              </div>
            </div>

            {/* один ряд со слотами */}
            <div
              style={{
                display: 'flex',
              }}
            >
              <div
                style={{
                  flex: '0 0 180px',
                  padding: '8px 8px',
                  borderRight: '1px solid #f0f0f0',
                }}
              >
                <Text type="secondary">
                  {profile.org?.name ??
                    t('myPlace.orgUnknown', 'Организация')}
                </Text>
              </div>

              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  minWidth: slotPlannerDays.length * CELL_WIDTH,
                  padding: 8,
                  boxSizing: 'border-box',
                }}
              >
                {/* сетка */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 8,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${slotPlannerDays.length}, ${CELL_WIDTH}px)`,
                    gridAutoRows: ROW_HEIGHT,
                  }}
                >
                  {slotPlannerDays.map((d) => (
                    <div
                      key={d.toISOString()}
                      style={{ borderLeft: '1px solid #f5f5f5' }}
                    />
                  ))}
                </div>

                {/* прямоугольники слотов */}
                {schedule.map((slot) => {
                  const lane = laneById[slot.id] ?? 0;

                  const slotStart = dayjs(slot.dateStart);
                  const slotEnd = dayjs(slot.dateEnd ?? slot.dateStart);

                  const startIndex = slotStart
                    .startOf('day')
                    .diff(slotPlannerDays[0].startOf('day'), 'day');
                  const endIndex =
                    slotEnd
                      .startOf('day')
                      .diff(slotPlannerDays[0].startOf('day'), 'day') + 1;

                  const left = startIndex * CELL_WIDTH;
                  const width = Math.max(
                    (endIndex - startIndex) * CELL_WIDTH - 4,
                    16,
                  );

                  return (
                    <div
                      key={slot.id}
                      style={{
                        position: 'absolute',
                        top: 8 + lane * ROW_HEIGHT,
                        left,
                        width,
                        height: ROW_HEIGHT - 6,
                        borderRadius: 6,
                        background: '#e6f7ff',
                        border: '1px solid #91d5ff',
                        padding: '2px 4px',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        fontSize: 11,
                      }}
                      title={`${slotStart.format(
                        'DD.MM HH:mm',
                      )} → ${slotEnd.format('DD.MM HH:mm')}`}
                    >
                      {slot.org?.slug
                        ? slot.org.slug.toUpperCase()
                        : slot.org?.name ?? ''}
                      {' · '}
                      {slotStatusColor[slot.status] &&
                        t(
                          `myPlace.slotStatus.${slot.status.toLowerCase()}` as any,
                          slot.status,
                        )}
                    </div>
                  );
                })}

                <div
                  style={{
                    height: lanesCount * ROW_HEIGHT + 16,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Блок 3: Моя статистика */}
      <Card title={t('myPlace.statsTitle', 'Моя статистика')}>
        {/* Фильтр по периоду для личной статистики */}
        <Flex
          align="center"
          gap={8}
          style={{ marginBottom: 16, flexWrap: 'wrap' }}
        >
          <Text strong>{t('myPlace.statsPeriod', 'Период')}:</Text>
          <RangePicker
            value={statsRange as [Dayjs, Dayjs] | null}
            onChange={(value) =>
              setStatsRange(value as [Dayjs, Dayjs] | null)
            }
          />
        </Flex>

        {/* Сводка по назначениям (без слотов) */}
        <Flex gap={24} wrap style={{ marginBottom: 16 }}>
          <Statistic
            title={t('myPlace.stats.totalAssignments', 'Всего назначений')}
            value={oldStats.totalAssignments}
          />
          <Statistic
            title={t(
              'myPlace.stats.activeAssignments',
              'Активные назначения',
            )}
            value={oldStats.activeAssignments}
          />
          <Statistic
            title={t(
              'myPlace.stats.archivedAssignments',
              'Назначения в архиве',
            )}
            value={oldStats.archivedAssignments}
          />
        </Flex>

        {/* Новая статистика по /statistics */}
        <Flex gap={24} wrap style={{ marginBottom: 8 }}>
          <Statistic
            title={t(
              'myPlace.stats.workingDays',
              'Рабочих дней за период',
            )}
            value={myWorkingDays}
          />
          <Statistic
            title={t(
              'myPlace.stats.totalHoursPeriod',
              'Всего часов за период',
            )}
            value={myTotalHours}
            precision={2}
          />
        </Flex>

        {myStatisticsQuery.isLoading && (
          <Text type="secondary">
            {t('common.loading', 'Загрузка…')}
          </Text>
        )}

        {hoursByKind.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Text strong>
              {t('myPlace.stats.hoursByKind', 'Часы по типам смен')}
            </Text>
            <div style={{ marginTop: 6 }}>
              {hoursByKind.map((item) => (
                <Tag key={item.kind}>
                  {item.kind === 'DEFAULT'
                    ? t(
                        'assignments.shiftKind.default',
                        'Обычная смена',
                      )
                    : item.kind === 'OFFICE'
                    ? t('assignments.shiftKind.office', 'Офис')
                    : item.kind === 'REMOTE'
                    ? t('assignments.shiftKind.remote', 'Удалёнка')
                    : t(
                        'assignments.shiftKind.dayOff',
                        'Выходной / Day off',
                      )}
                  {': '}
                  {item.hours.toFixed(2)}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Модалка просмотра назначения */}
      <Modal
        open={!!viewAssignment}
        title={t('myPlace.assignmentModalTitle', 'Назначение')}
        footer={[
          <Button key="close" onClick={() => setViewAssignment(null)}>
            {t('common.close', 'Закрыть')}
          </Button>,
        ]}
        onCancel={() => setViewAssignment(null)}
      >
        {viewAssignment && (
          <Flex vertical gap={16}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item
                label={t('assignments.workplace', 'Рабочее место')}
              >
                {viewAssignment.workplace?.code
                  ? `${viewAssignment.workplace.code} — ${viewAssignment.workplace.name}`
                  : viewAssignment.workplace?.name}
              </Descriptions.Item>
              <Descriptions.Item
                label={t('myPlace.interval', 'Интервал')}
              >
                {`${dayjs(viewAssignment.startsAt).format(
                  'DD.MM.YYYY',
                )} → ${
                  viewAssignment.endsAt
                    ? dayjs(viewAssignment.endsAt).format('DD.MM.YYYY')
                    : t('myPlace.noEndDate', 'Без даты окончания')
                }`}
              </Descriptions.Item>
              <Descriptions.Item label={t('myPlace.status', 'Статус')}>
                <Tag color={assignmentStatusColor[viewAssignment.status]}>
                  {viewAssignment.status === 'ACTIVE'
                    ? t('assignments.status.active', 'Активно')
                    : t('assignments.status.archived', 'Архив')}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong>
                {t('myPlace.dayScheduleTitle', 'График смен по дням')}
              </Text>
              <div style={{ marginTop: 8 }}>
                {!hasAssignmentDayIntervals ? (
                  <Text type="secondary">
                    {t(
                      'myPlace.noDaySchedule',
                      'Для этого назначения расписание смен пока не создано.',
                    )}
                  </Text>
                ) : (
                  <List
                    size="small"
                    dataSource={Object.keys(assignmentDayIntervals).sort(
                      (a, b) =>
                        dayjs(a, 'DD.MM.YYYY').valueOf() -
                        dayjs(b, 'DD.MM.YYYY').valueOf(),
                    )}
                    renderItem={(dateKey) => {
                      const intervals = assignmentDayIntervals[dateKey];
                      return (
                        <List.Item key={dateKey}>
                          <Flex vertical style={{ width: '100%' }} gap={4}>
                            <Text strong>{dateKey}</Text>
                            {intervals.map((interval, idx) => {
                              const kindLabel = getShiftKindLabel(
                                interval.kind,
                              );
                              return (
                                <Text key={idx}>
                                  {`${interval.start} → ${interval.end}${
                                    kindLabel ? ` (${kindLabel})` : ''
                                  }`}
                                </Text>
                              );
                            })}
                          </Flex>
                        </List.Item>
                      );
                    }}
                  />
                )}
              </div>
            </div>
          </Flex>
        )}
      </Modal>

      {/* Модалка "Запросить корректировку" */}
      <Modal
        open={!!correctionAssignment}
        width={900}
        title={t(
          'myPlace.requestAdjustmentTitle',
          'Запрос корректировки назначения',
        )}
        okText={t('myPlace.sendSwapRequest', 'Отправить запрос')}
        cancelText={t('common.cancel', 'Отмена')}
        confirmLoading={isSendingCorrection}
        okButtonProps={{ disabled: hasInvalidCorrectionIntervals }}
        onCancel={() => {
          setCorrectionAssignment(null);
          setCorrectionComment('');
          setCorrectionIntervals({});
        }}
        onOk={handleSendCorrection}
      >
        {correctionAssignment && (
          <Flex vertical gap={12}>
            <Text type="secondary">
              {correctionAssignment.workplace?.code
                ? `${correctionAssignment.workplace.code} — ${correctionAssignment.workplace.name}`
                : correctionAssignment.workplace?.name}
            </Text>
            <Text>
              {`${dayjs(correctionAssignment.startsAt).format(
                'DD.MM.YYYY',
              )} → ${
                correctionAssignment.endsAt
                  ? dayjs(correctionAssignment.endsAt).format('DD.MM.YYYY')
                  : t('myPlace.noEndDate', 'Без даты окончания')
              }`}
            </Text>

            {hasCorrectionIntervals && (
              <div>
                <Text strong>
                  {t('myPlace.dayScheduleTitle', 'График смен по дням')}
                </Text>
                <List
                  size="small"
                  style={{ marginTop: 8 }}
                  dataSource={Object.keys(correctionIntervals).sort(
                    (a, b) =>
                      dayjs(a, 'DD.MM.YYYY').valueOf() -
                      dayjs(b, 'DD.MM.YYYY').valueOf(),
                  )}
                  renderItem={(dateKey) => {
                    const intervals = correctionIntervals[dateKey];
                    return (
                      <List.Item key={dateKey}>
                        <Flex vertical style={{ width: '100%' }} gap={6}>
                          <div
                            style={{
                              padding: '6px 10px',
                              background: '#fafafa',
                              borderRadius: 6,
                            }}
                          >
                            <Text strong>{dateKey}</Text>
                          </div>
                          {intervals.map((interval, idx) => (
                            <Flex
                              key={idx}
                              align="center"
                              gap={8}
                              style={{
                                width: '100%',
                                flexWrap: 'wrap',
                              }}
                            >
                              <Flex
                                align="center"
                                gap={8}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <TimePicker
                                  size="middle"
                                  format="HH:mm"
                                  value={dayjs(interval.start, 'HH:mm')}
                                  style={{
                                    width: 120,
                                    flexShrink: 0,
                                  }}
                                  onChange={(value: Dayjs | null) => {
                                    const str = value
                                      ? value.format('HH:mm')
                                      : interval.start;
                                    setCorrectionIntervals((prev) => {
                                      const copy: DayIntervalsMap = {
                                        ...prev,
                                      };
                                      const dayList = [
                                        ...(copy[dateKey] ?? []),
                                      ];
                                      dayList[idx] = {
                                        ...dayList[idx],
                                        start: str,
                                      };
                                      copy[dateKey] = dayList;
                                      return copy;
                                    });
                                  }}
                                />
                                <span>→</span>
                                <TimePicker
                                  size="middle"
                                  format="HH:mm"
                                  value={dayjs(interval.end, 'HH:mm')}
                                  style={{
                                    width: 120,
                                    flexShrink: 0,
                                  }}
                                  onChange={(value: Dayjs | null) => {
                                    const str = value
                                      ? value.format('HH:mm')
                                      : interval.end;
                                    setCorrectionIntervals((prev) => {
                                      const copy: DayIntervalsMap = {
                                        ...prev,
                                      };
                                      const dayList = [
                                        ...(copy[dateKey] ?? []),
                                      ];
                                      dayList[idx] = {
                                        ...dayList[idx],
                                        end: str,
                                      };
                                      copy[dateKey] = dayList;
                                      return copy;
                                    });
                                  }}
                                />

                                <Select
                                  size="middle"
                                  style={{ minWidth: 220, flex: 1 }}
                                  value={interval.kind ?? 'DEFAULT'}
                                  onChange={(value) => {
                                    const v = value as ShiftKindType;
                                    setCorrectionIntervals((prev) => {
                                      const copy: DayIntervalsMap = {
                                        ...prev,
                                      };
                                      const dayList = [
                                        ...(copy[dateKey] ?? []),
                                      ];
                                      dayList[idx] = {
                                        ...dayList[idx],
                                        kind: v,
                                      };
                                      copy[dateKey] = dayList;
                                      return copy;
                                    });
                                  }}
                                >
                                  <Select.Option value="DEFAULT">
                                    {t(
                                      'assignments.shiftKind.default',
                                      'Обычная смена',
                                    )}
                                  </Select.Option>
                                  <Select.Option value="OFFICE">
                                    {t(
                                      'assignments.shiftKind.office',
                                      'Офис',
                                    )}
                                  </Select.Option>
                                  <Select.Option value="REMOTE">
                                    {t(
                                      'assignments.shiftKind.remote',
                                      'Удалёнка',
                                    )}
                                  </Select.Option>
                                  <Select.Option value="DAY_OFF">
                                    {t(
                                      'assignments.shiftKind.dayOff',
                                      'Day off / больничный',
                                    )}
                                  </Select.Option>
                                </Select>
                              </Flex>

                              <Button
                                danger
                                type="link"
                                size="small"
                                style={{ marginLeft: 'auto' }}
                                onClick={() => {
                                  setCorrectionIntervals((prev) => {
                                    const copy: DayIntervalsMap = {
                                      ...prev,
                                    };
                                    const dayList = [
                                      ...(copy[dateKey] ?? []),
                                    ];
                                    dayList.splice(idx, 1);
                                    if (dayList.length === 0) {
                                      delete copy[dateKey];
                                    } else {
                                      copy[dateKey] = dayList;
                                    }
                                    return copy;
                                  });
                                }}
                              >
                                {t('common.delete', 'Удалить')}
                              </Button>
                            </Flex>
                          ))}

                          <Button
                            type="link"
                            size="small"
                            onClick={() => {
                              setCorrectionIntervals((prev) => {
                                const copy: DayIntervalsMap = {
                                  ...prev,
                                };
                                const dayList = [
                                  ...(copy[dateKey] ?? []),
                                ];
                                const lastInterval = dayList[dayList.length - 1];
                                const defaultStart = lastInterval
                                  ? lastInterval.end
                                  : '09:00';
                                const startMoment = dayjs(
                                  `${dateKey} ${defaultStart}`,
                                  'DD.MM.YYYY HH:mm',
                                );
                                dayList.push({
                                  start: defaultStart,
                                  end: startMoment.add(1, 'hour').format('HH:mm'),
                                  kind: 'DEFAULT',
                                });
                                copy[dateKey] = dayList;
                                return copy;
                              });
                            }}
                          >
                            {t(
                              'myPlace.addInterval',
                              'Добавить интервал',
                            )}
                          </Button>
                        </Flex>
                      </List.Item>
                    );
                  }}
                />
              </div>
            )}

            {hasInvalidCorrectionIntervals && (
              <Text type="danger">
                {t(
                  'myPlace.invalidIntervalWarning',
                  'Время окончания должно быть позже начала.',
                )}
              </Text>
            )}

            <Text>
              {t(
                'myPlace.swapExplainShort',
                'Опишите, какие даты/часы и почему нужно скорректировать. Это попадёт менеджеру/администратору.',
              )}
            </Text>
            <textarea
              style={{ width: '100%', minHeight: 120 }}
              value={correctionComment}
              onChange={(e) => setCorrectionComment(e.target.value)}
            />
          </Flex>
        )}
      </Modal>
    </Flex>
  );
};

export default MyPlace;