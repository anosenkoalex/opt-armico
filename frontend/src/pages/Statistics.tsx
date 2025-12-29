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
  Button,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchUsers, fetchStatistics, fetchWorkReports, fetchWorkplaces } from '../api/client.js';
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

type DayWorkSummaryRow = {
  workplaceId: string;
  workplaceName: string;
  plannedHours: number;
  reportedHours: number;
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

  const [isExporting, setIsExporting] = useState(false);

  const [reportUserId, setReportUserId] = useState<string | null>(null);
  const [reportUserName, setReportUserName] = useState<string>('');
  const [selectedReportDate, setSelectedReportDate] = useState<Dayjs | null>(null);

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
  
  /* ---------- справочник рабочих мест ---------- */

  const workplacesQuery = useQuery({
    queryKey: ['workplaces', 'all-for-statistics'],
    queryFn: async () => {
      const res = await fetchWorkplaces({ page: 1, pageSize: 1000, isActive: true });
      return res.data.items;
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

    const workplaceNameById = useMemo(() => {
    const map: Record<string, string> = {};

    // из строк статистики
    for (const row of allRows) {
      if (!row.workplaceId) continue;
      if (!map[row.workplaceId]) {
        map[row.workplaceId] = row.workplaceName ?? row.workplaceId;
      }
    }

    // из справочника рабочих мест (код / имя)
    const workplaces = workplacesQuery.data ?? [];
    for (const w of workplaces) {
      if (!map[w.id]) {
        map[w.id] = (w.code || w.name || w.id).toString();
      }
    }

    return map;
  }, [allRows, workplacesQuery.data]);

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

  // Сумма плановых часов по датам для выбранного пользователя (для календаря отчётов)
  const plannedHoursByDateForReportUser = useMemo(() => {
    const map: Record<string, number> = {};
    if (!reportUserId) return map;
    for (const row of filteredRows) {
      if (row.userId !== reportUserId) continue;
      const key = dayjs(row.startsAt ?? row.date).format('YYYY-MM-DD');
      map[key] = (map[key] ?? 0) + row.hours;
    }
    return map;
  }, [filteredRows, reportUserId]);


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

  

  const handleExport = async () => {
    if (!statistics) {
      message.error('Нет данных для экспорта');
      return;
    }

    // Диапазон дат
    const start = effectiveFrom.startOf('day');
    const end = effectiveTo.startOf('day');

    const days: Dayjs[] = [];
    let cursor = start.clone();
    while (cursor.isSame(end, 'day') || cursor.isBefore(end, 'day')) {
      days.push(cursor);
      cursor = cursor.add(1, 'day');
    }

    if (!days.length) {
      message.error('Неверный период для экспорта');
      return;
    }

    setIsExporting(true);
    try {
      // Загружаем все отчёты по часам для выбранного диапазона и фильтров
      const workReports = await fetchWorkReports({
        from: effectiveFrom.format('YYYY-MM-DD'),
        to: effectiveTo.format('YYYY-MM-DD'),
        userId: filters.userId,
        workplaceId: filters.workplaceId,
      });

      // Карта имён сотрудников
      const userNameById: Record<string, string> = {};
      (usersQuery.data ?? []).forEach((u) => {
        const full = (u.fullName ?? '').trim();
        userNameById[u.id] = full || u.email || u.id;
      });
      allRows.forEach((row) => {
        if (!userNameById[row.userId]) {
          userNameById[row.userId] = row.userName ?? row.userId;
        }
      });
      workReports.forEach((wr) => {
        if (!userNameById[wr.userId] && wr.user) {
          const full = (wr.user.fullName ?? '').trim();
          userNameById[wr.user.id] =
            full || wr.user.email || wr.user.id;
        }
      });

      // Карта названий рабочих мест
      const workplaceNameById: Record<string, string> = {};
      allRows.forEach((row) => {
        if (row.workplaceId) {
          workplaceNameById[row.workplaceId] =
            row.workplaceName ?? row.workplaceId;
    
    }
      });
      workReports.forEach((wr) => {
        if (wr.workplaceId) {
          workplaceNameById[wr.workplaceId] =
            wr.workplace?.name ?? wr.workplace?.code ?? wr.workplaceId;
        }
      });

      
      // Собираем всех сотрудников для экспорта
      const userIds = new Set<string>();

      // Базово берём только тех, кто есть в таблице статистики (filteredRows)
      filteredRows.forEach((row) => userIds.add(row.userId));

      if (filters.workplaceId) {
        // Если выбран фильтр по рабочему месту — оставляем только тех,
        // у кого есть отчётные часы по этому рабочему месту
        const hasWorkOnFilteredPlace: Record<string, boolean> = {};
        workReports.forEach((wr) => {
          if (!wr.hours) return;
          if (wr.workplaceId === filters.workplaceId) {
            hasWorkOnFilteredPlace[wr.userId] = true;
          }
        });

        Array.from(userIds).forEach((uid) => {
          if (!hasWorkOnFilteredPlace[uid]) {
            userIds.delete(uid);
          }
        });
      }

      if (!userIds.size) {
        message.warning('Нет данных по сотрудникам за выбранный период');
        return;
      }

// Плановые часы: userId -> date -> workplaceId -> hours
      const planMap: Record<
        string,
        Record<string, Record<string, number>>
      > = {};
      filteredRows.forEach((row) => {
        const uid = row.userId;
        const dateKey = dayjs(row.startsAt ?? row.date).format('YYYY-MM-DD');
        const wid = row.workplaceId;
        if (!planMap[uid]) planMap[uid] = {};
        if (!planMap[uid][dateKey]) planMap[uid][dateKey] = {};
        planMap[uid][dateKey][wid] =
          (planMap[uid][dateKey][wid] ?? 0) + row.hours;
      });

      // Отчётные часы: userId -> date -> workplaceId -> hours
      const reportMap: Record<
        string,
        Record<string, Record<string, number>>
      > = {};
      workReports.forEach((wr) => {
        const uid = wr.userId;
        const dateKey = wr.date;

        let intervals: { workplaceId: string | null; hours: number | null }[] | null = null;
        const rawComment = (wr.comment ?? '').trim();

        if (rawComment.startsWith('{')) {
          try {
            const parsed = JSON.parse(rawComment) as any;
            if (parsed && Array.isArray(parsed.intervals)) {
              intervals = parsed.intervals.map((it: any) => ({
                workplaceId:
                  typeof it.workplaceId === 'string' ? it.workplaceId : wr.workplaceId ?? null,
                hours:
                  typeof it.hours === 'number'
                    ? it.hours
                    : Number.isFinite(Number(it.hours))
                    ? Number(it.hours)
                    : null,
              }));
            }
          } catch {
            // ignore parse errors, fallback to single interval
          }
        }

        if (!intervals) {
          intervals = [
            {
              workplaceId: wr.workplaceId ?? null,
              hours: wr.hours,
            },
          ];
        }

        intervals.forEach((interval) => {
          if (interval.hours == null) return;
          const wid = interval.workplaceId ?? 'unknown';
          if (!reportMap[uid]) reportMap[uid] = {};
          if (!reportMap[uid][dateKey]) reportMap[uid][dateKey] = {};
          reportMap[uid][dateKey][wid] =
            (reportMap[uid][dateKey][wid] ?? 0) + interval.hours;
        });
      });

      // Итоги по рабочим местам: userId -> workplaceId -> { planned, reported }
      const totalByUserWorkplace: Record<
        string,
        Record<string, { planned: number; reported: number }>
      > = {};

      const ensureTotalEntry = (uid: string, wid: string) => {
        if (!totalByUserWorkplace[uid]) {
          totalByUserWorkplace[uid] = {};
        }
        if (!totalByUserWorkplace[uid][wid]) {
          totalByUserWorkplace[uid][wid] = { planned: 0, reported: 0 };
        }
      };

      // Считаем плановые суммы
      Object.entries(planMap).forEach(([uid, byDate]) => {
        Object.values(byDate).forEach((byWorkplace) => {
          Object.entries(byWorkplace).forEach(([wid, hours]) => {
            ensureTotalEntry(uid, wid);
            totalByUserWorkplace[uid][wid].planned += hours;
          });
        });
      });

      // Считаем отчётные суммы
      Object.entries(reportMap).forEach(([uid, byDate]) => {
        Object.values(byDate).forEach((byWorkplace) => {
          Object.entries(byWorkplace).forEach(([wid, hours]) => {
            ensureTotalEntry(uid, wid);
            totalByUserWorkplace[uid][wid].reported += hours;
          });
        });
      });

      const formatHours = (value: number) => {
        if (!value) return '0';
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
      };

      const escapeCsv = (value: string | number | null | undefined) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (/[";,]/.test(str)) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      // Заголовок: сотрудник + даты + итоги
      const header = [
        'Сотрудник',
        ...days.map((d) => d.format('DD.MM')),
      ];

      const lines: string[] = [];
      lines.push(header.map(escapeCsv).join(';'));

      // Строим строки по сотрудникам
      Array.from(userIds).forEach((uid) => {
        const rowCells: (string | number)[] = [];
        const name = userNameById[uid] ?? uid;
        rowCells.push(name);

        days.forEach((d) => {
          const dateKey = d.format('YYYY-MM-DD');
          const plannedByWorkplace = planMap[uid]?.[dateKey] ?? {};
          const reportedByWorkplace = reportMap[uid]?.[dateKey] ?? {};

          const wids = new Set<string>([
            ...Object.keys(plannedByWorkplace),
            ...Object.keys(reportedByWorkplace),
          ]);

          const parts: string[] = [];
          wids.forEach((wid) => {
            const planned = plannedByWorkplace[wid] ?? 0;
            const reported = reportedByWorkplace[wid] ?? 0;
            if (!planned && !reported) return;
            const wname =
              workplaceNameById[wid] ?? (wid === 'unknown' ? 'Без рабочего места' : wid);
            parts.push(
              `${wname}: план ${formatHours(planned)}, отчёт ${formatHours(
                reported,
              )}`,
            );
          });

          rowCells.push(parts.join(' | '));
        });

        lines.push(rowCells.map(escapeCsv).join(';'));
      });

      // Вторая таблица: итоги по рабочим местам
      // Собираем список всех рабочих мест, по которым есть план или отчёт
      const allWorkplaceIdsSet = new Set<string>();
      Object.values(totalByUserWorkplace).forEach((byWorkplace) => {
        Object.keys(byWorkplace).forEach((wid) => {
          allWorkplaceIdsSet.add(wid);
        });
      });
      const allWorkplaceIds = Array.from(allWorkplaceIdsSet).filter(
        (wid) => wid !== 'unknown',
      );

      if (allWorkplaceIds.length) {
        // Пустая строка-разделитель
        lines.push('');

        // Заголовок раздела
        lines.push(escapeCsv('Итого по рабочим местам'));

        // Шапка: Сотрудник + рабочие места
        const workplaceHeader: string[] = ['Сотрудник'];
        allWorkplaceIds.forEach((wid) => {
          const wname =
            workplaceNameById[wid] ??
            (wid === 'unknown' ? 'Без рабочего места' : wid);
          workplaceHeader.push(wname);
        });
        lines.push(workplaceHeader.map(escapeCsv).join(';'));

        // Строки по сотрудникам
        Array.from(userIds).forEach((uid) => {
          const totals = totalByUserWorkplace[uid];
          const rowCells: string[] = [];
          const name = userNameById[uid] ?? uid;
          rowCells.push(name);

          allWorkplaceIds.forEach((wid) => {
            const val = totals?.[wid];
            if (!val || (!val.planned && !val.reported)) {
              rowCells.push('');
              return;
            }
            rowCells.push(
              `План ${formatHours(val.planned)}, отчёт ${formatHours(
                val.reported,
              )}`,
            );
          });

          lines.push(rowCells.map(escapeCsv).join(';'));
        });
      }

      const csvContent = '\uFEFF' + lines.join('\r\n');
      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `statistics_${effectiveFrom.format(
        'YYYY-MM-DD',
      )}_${effectiveTo.format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      message.error('Ошибка при формировании файла для экспорта');
    } finally {
      setIsExporting(false);
    }
  };
const workReportsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    if (!workReportsQuery.data) return map;
    for (const wr of workReportsQuery.data) {
      const key = wr.date;
      map[key] = (map[key] ?? 0) + wr.hours;
    }
    return map;
  }, [workReportsQuery.data]);

  
  
  const daySummaryRows: DayWorkSummaryRow[] = useMemo(() => {
    if (!reportUserId || !selectedReportDate) {
      return [];
    }

    const targetDate = selectedReportDate.format('YYYY-MM-DD');

    // Плановые часы по рабочим местам на выбранную дату (из назначений)
    const plannedByWorkplace: Record<string, { workplaceName: string; hours: number }> = {};

    filteredRows.forEach((row) => {
      if (row.userId !== reportUserId) return;

      const dateKey = dayjs(row.startsAt ?? row.date).format('YYYY-MM-DD');
      if (dateKey !== targetDate) return;

      const wid = row.workplaceId ?? 'unknown';
      const name = row.workplaceName ?? row.workplaceId ?? '—';

      if (!plannedByWorkplace[wid]) {
        plannedByWorkplace[wid] = { workplaceName: name, hours: 0 };
      }

      plannedByWorkplace[wid].hours += row.hours;
    });

    const plannedKeys = Object.keys(plannedByWorkplace);

    // Отчётные часы по рабочим местам на выбранную дату (из WorkReport)
    const reportedByWorkplace: Record<string, number> = {};

    const addReported = (
      rawWorkplaceId: string | null | undefined,
      rawHours: number | null | undefined,
      wr: WorkReport,
    ) => {
      if (rawHours == null) return;

      const hours = Number(rawHours);
      if (!Number.isFinite(hours) || hours <= 0) return;

      let wid = rawWorkplaceId ?? null;

      // Если в отчёте нет рабочего места, но в плане оно одно — считаем, что отчёт по нему
      if (!wid && plannedKeys.length === 1) {
        wid = plannedKeys[0];
      }

      const key = wid ?? 'unknown';

      reportedByWorkplace[key] = (reportedByWorkplace[key] ?? 0) + hours;

      // Если по этому рабочему месту не было плана, но есть название у репорта — добавим строку плана с 0 часами,
      // чтобы в таблице было нормальное имя, а не просто id.
      if (!plannedByWorkplace[key]) {
        const displayName =
          wr.workplace?.name ??
          workplaceNameById[key] ??
          (key === 'unknown' ? 'Без рабочего места' : key);
        plannedByWorkplace[key] = { workplaceName: displayName, hours: 0 };
      }
    };

    (workReportsQuery.data ?? []).forEach((wr) => {
      if (!wr) return;
      if (wr.userId !== reportUserId) return;
      if (wr.date !== targetDate) return;

      const rawComment = (wr.comment ?? '').trim();
      let usedIntervals = false;

      // Пытаемся вытащить интервалы из comment как JSON { intervals: [{ workplaceId, hours }, ...] }
      if (rawComment.startsWith('{')) {
        try {
          const parsed: any = JSON.parse(rawComment);
          if (parsed && Array.isArray(parsed.intervals)) {
            parsed.intervals.forEach((it: any) => {
              const wid =
                typeof it?.workplaceId === 'string'
                  ? it.workplaceId
                  : wr.workplaceId ?? null;

              const hrs =
                typeof it?.hours === 'number'
                  ? it.hours
                  : Number.isFinite(Number(it?.hours))
                  ? Number(it.hours)
                  : null;

              if (hrs != null) {
                usedIntervals = true;
                addReported(wid, hrs, wr);
              }
            });
          }
        } catch {
          // Игнорируем ошибки парсинга и падаем в дефолтный сценарий
        }
      }

      // Если интервалы не распарсились — считаем как один отчёт по wr.workplaceId
      if (!usedIntervals) {
        addReported(wr.workplaceId, wr.hours, wr);
      }
    });

    const allIds = new Set<string>([
      ...Object.keys(plannedByWorkplace),
      ...Object.keys(reportedByWorkplace),
    ]);

    const rows: DayWorkSummaryRow[] = [];

    allIds.forEach((wid) => {
      const planned = plannedByWorkplace[wid];
      const plannedHours = planned?.hours ?? 0;
      const reportedHours = reportedByWorkplace[wid] ?? 0;

      if (plannedHours === 0 && reportedHours === 0) {
        return;
      }

      const displayName =
        planned?.workplaceName ??
        workplaceNameById[wid] ??
        (wid === 'unknown' ? 'Без рабочего места' : wid);

      rows.push({
        workplaceId: wid,
        workplaceName: displayName,
        plannedHours,
        reportedHours,
      });
    });

    return rows;
  }, [reportUserId, selectedReportDate, filteredRows, workReportsQuery.data, workplaceNameById]);
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
              setSelectedReportDate(effectiveFrom);
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

  const daySummaryColumns: ColumnsType<DayWorkSummaryRow> = [
    {
      title: 'Рабочее место',
      dataIndex: 'workplaceName',
      key: 'workplaceName',
    },
    {
      title: 'Назначено часов',
      dataIndex: 'plannedHours',
      key: 'plannedHours',
      render: (value: number) => value.toFixed(2),
    },
    {
      title: 'Отработано по отчёту',
      dataIndex: 'reportedHours',
      key: 'reportedHours',
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
      <Button
        type="primary"
        onClick={handleExport}
        loading={isExporting}
        style={{ marginBottom: 16 }}
      >
        Скачать Excel
      </Button>



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
          setSelectedReportDate(null);
        }}
      >
        {!reportUserId ? null : workReportsQuery.isLoading ? (
          <Spin />
        ) : (
          <>
            <Calendar
              fullscreen={false}
              value={selectedReportDate ?? effectiveFrom}
              onSelect={(value) => {
                setSelectedReportDate(value);
              }}
              dateFullCellRender={(value) => {
                const key = value.format('YYYY-MM-DD');
                const planned = plannedHoursByDateForReportUser[key];
                const reported = workReportsByDate[key];
                const outOfRange =
                  value.isBefore(effectiveFrom, 'day') ||
                  value.isAfter(effectiveTo, 'day');

                const hasData =
                  (planned != null && planned > 0) ||
                  (reported != null && reported > 0);

                const isSelected =
                  !!selectedReportDate &&
                  value.isSame(selectedReportDate, 'day');

                return (
                  <div
                    style={{
                      textAlign: 'center',
                      borderRadius: 4,
                      padding: 2,
                      border: isSelected
                        ? '1px solid #1677ff'
                        : hasData
                        ? '1px solid #52c41a'
                        : '1px solid transparent',
                      backgroundColor: isSelected ? '#e6f4ff' : undefined,
                      opacity: outOfRange ? 0.2 : hasData ? 1 : 0.4,
                    }}
                  >
                    <div>{value.date()}</div>
                    {hasData && (
                      <div style={{ fontSize: 10 }}>
                        {planned != null && planned > 0 && (
                          <div>{planned.toFixed(1)} ч план</div>
                        )}
                        {reported != null && reported > 0 && (
                          <div>{reported.toFixed(1)} ч отчёт</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }}
              defaultValue={effectiveFrom}
            />

            <div style={{ marginTop: 16 }}>
              {selectedReportDate ? (
                daySummaryRows.length > 0 ? (
                  <Table<DayWorkSummaryRow>
                    rowKey="workplaceId"
                    size="small"
                    dataSource={daySummaryRows}
                    columns={daySummaryColumns}
                    pagination={false}
                  />
                ) : (
                  <Typography.Text type="secondary">
                    На выбранную дату нет данных по сменам или отчётам.
                  </Typography.Text>
                )
              ) : (
                <Typography.Text type="secondary">
                  Выберите дату в календаре, чтобы увидеть детали по рабочим
                  местам.
                </Typography.Text>
              )}
            </div>
          </>
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