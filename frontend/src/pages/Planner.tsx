// frontend/src/pages/Planner.tsx
import {
  Button,
  Card,
  DatePicker,
  Result,
  Select,
  Space,
  Typography,
  message,
  Tooltip,
  Spin,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  AssignmentStatus,
  PlannerMatrixResponse,
  PlannerMatrixRow,
  PlannerMatrixSlot,
  fetchPlannerMatrix,
  downloadPlannerExcel,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { RangePicker } = DatePicker;

type PlannerMode = 'byUsers' | 'byWorkplaces';

const CELL_WIDTH = 80;
const ROW_HEIGHT = 36;
const ROW_VERTICAL_PADDING = 8;
const GRID_MAX_HEIGHT = 600;
const HEADER_HEIGHT = ROW_HEIGHT + ROW_VERTICAL_PADDING * 2;

const clampDateToRange = (d: Dayjs, from: Dayjs, to: Dayjs) => {
  if (d.isBefore(from, 'day')) return from;
  if (d.isAfter(to, 'day')) return to;
  return d;
};

function buildLanes(
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

const PlannerPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [mode, setMode] = useState<PlannerMode>('byUsers');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const [fromDate, setFromDate] = useState<Dayjs | null>(null);
  const [toDate, setToDate] = useState<Dayjs | null>(null);
  const [autoRangeInitialized, setAutoRangeInitialized] = useState(false);

  const canViewPlanner =
    user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  const effectiveFrom = fromDate ?? dayjs().startOf('month');
  const effectiveTo = toDate ?? dayjs().endOf('month');

  const statusFilter: AssignmentStatus = 'ACTIVE';

  const matrixQuery = useQuery<PlannerMatrixResponse>({
    queryKey: [
      'planner-matrix',
      {
        mode,
        from: effectiveFrom.toISOString(),
        to: effectiveTo.toISOString(),
        page,
        pageSize,
        status: statusFilter,
      },
    ],
    queryFn: () =>
      fetchPlannerMatrix({
        mode,
        from: effectiveFrom.toISOString(),
        to: effectiveTo.toISOString(),
        page,
        pageSize,
        status: statusFilter,
      }),
    enabled: canViewPlanner,
    keepPreviousData: true,
  });

  const matrix = matrixQuery.data;

  // авто-установка периода по фактическим слотам
  useEffect(() => {
    if (!matrix || autoRangeInitialized) return;
    if (!matrix.rows || matrix.rows.length === 0) return;

    let minStart: Dayjs | null = null;
    let maxEnd: Dayjs | null = null;

    for (const row of matrix.rows) {
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
      const proposedTo = maxEnd
        ? maxEnd.endOf('day')
        : proposedFrom.add(30, 'day').endOf('day');

      setFromDate(proposedFrom);
      setToDate(proposedTo);
      setAutoRangeInitialized(true);
    }
  }, [matrix, autoRangeInitialized]);

  const days = useMemo(() => {
    if (!fromDate || !toDate) return [];
    const list: Dayjs[] = [];
    let current = fromDate.startOf('day');
    const last = toDate.startOf('day');

    while (current.isBefore(last) || current.isSame(last, 'day')) {
      list.push(current);
      current = current.add(1, 'day');
    }

    return list;
  }, [fromDate, toDate]);

  const handleDownloadExcel = async () => {
    if (!fromDate || !toDate) {
      message.warning(
        t(
          'planner.selectPeriodFirst',
          'Сначала выберите период, который хотите выгрузить',
        ),
      );
      return;
    }

    try {
      const blob = await downloadPlannerExcel({
        from: fromDate.format('YYYY-MM-DD'),
        to: toDate.format('YYYY-MM-DD'),
        mode: mode === 'byUsers' ? 'users' : 'workplaces',
        status: statusFilter,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `planner-${mode}-${dayjs().format(
        'YYYY-MM-DD_HH-mm-ss',
      )}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      message.error(
        t('planner.exportError', 'Не удалось скачать файл планировщика'),
      );
    }
  };

  if (!canViewPlanner) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  const totalLabel =
    mode === 'byUsers'
      ? t('planner.totalEmployees', 'Сотрудников в выборке')
      : t('planner.totalWorkplaces', 'Рабочих мест в выборке');

  // refs для синхронизации вертикального скролла
  const leftBodyRef = useRef<HTMLDivElement | null>(null);
  const rightBodyRef = useRef<HTMLDivElement | null>(null);

  const handleRightScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const target = e.currentTarget;
    if (leftBodyRef.current) {
      leftBodyRef.current.scrollTop = target.scrollTop;
    }
  };

  // если крутим колёсиком по левой колонке — скроллим правую
  const handleLeftWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (rightBodyRef.current) {
      rightBodyRef.current.scrollTop += e.deltaY;
      e.preventDefault();
    }
  };

  /**
   * Обогащаем строки:
   * - считаем lanes
   * - считаем primaryWorkplaceKey для сортировки по проектам (в режиме byUsers)
   * - в режиме byWorkplaces собираем список имён сотрудников
   */
  const rowsWithLanes = useMemo(() => {
    if (!matrix || !fromDate || !toDate) return [];

    const result = matrix.rows.map((row: PlannerMatrixRow) => {
      const visibleSlots = row.slots.filter(
        (s) => s.status !== 'ARCHIVED',
      ) as PlannerMatrixSlot[];

      const { laneById, lanesCount } = buildLanes(visibleSlots);

      // primary project for grouping (byUsers mode)
      let primaryWorkplaceKey = '';
      if (mode === 'byUsers' && visibleSlots.length > 0) {
        let earliestStart: Dayjs | null = null;
        let key = '';

        for (const s of visibleSlots) {
          if (!s.workplace) continue;
          const start = dayjs(s.from);
          if (!earliestStart || start.isBefore(earliestStart)) {
            earliestStart = start;
            key =
              (s.workplace.code || '') +
              ' ' +
              (s.workplace.name || '');
          }
        }

        primaryWorkplaceKey = key.toLowerCase();
      }

      // employees summary (byWorkplaces mode)
      let employeesSummary = row.subtitle ?? '';
      if (mode === 'byWorkplaces' && visibleSlots.length > 0) {
        const names = Array.from(
          new Set(
            visibleSlots
              .map((s) => {
                const anySlot = s as any;
                return (
                  anySlot.userName ||
                  anySlot.userFullName ||
                  anySlot.user?.fullName ||
                  ''
                );
              })
              .filter((n: string) => n && n.trim().length > 0),
          ),
        );

        if (names.length > 0) {
          const shown = names.slice(0, 3).join(', ');
          const rest = names.length > 3 ? ` + ещё ${names.length - 3}` : '';
          employeesSummary = `Сотрудники: ${shown}${rest}`;
        }
      }

      return {
        row,
        visibleSlots,
        laneById,
        lanesCount,
        primaryWorkplaceKey,
        displaySubtitle: employeesSummary,
      };
    });

    // сортировка: сначала с назначениями, потом без;
    // в режиме byUsers внутри группируем по проекту, затем по имени
    result.sort((a, b) => {
      const aHasSlots = a.visibleSlots.length > 0 ? 0 : 1;
      const bHasSlots = b.visibleSlots.length > 0 ? 0 : 1;
      if (aHasSlots !== bHasSlots) return aHasSlots - bHasSlots;

      if (mode === 'byUsers') {
        if (a.primaryWorkplaceKey !== b.primaryWorkplaceKey) {
          return a.primaryWorkplaceKey.localeCompare(
            b.primaryWorkplaceKey,
            'ru',
          );
        }
      }

      return a.row.title.localeCompare(b.row.title, 'ru');
    });

    return result;
  }, [matrix, fromDate, toDate, mode]);

  return (
    <Card
      title={t('planner.title', 'Планировщик')}
      extra={
        <Space>
          <Select
            style={{ width: 180 }}
            value={mode}
            onChange={(value: PlannerMode) => {
              setMode(value);
              setPage(1);
            }}
            options={[
              {
                value: 'byUsers',
                label: t('planner.byUsers', 'По сотрудникам'),
              },
              {
                value: 'byWorkplaces',
                label: t('planner.byWorkplaces', 'По рабочим местам'),
              },
            ]}
          />
          <RangePicker
            value={fromDate && toDate ? [fromDate, toDate] : undefined}
            format="DD.MM.YYYY"
            onChange={(values) => {
              if (!values || !values[0] || !values[1]) {
                setFromDate(null);
                setToDate(null);
                setPage(1);
                return;
              }
              setFromDate(values[0].startOf('day'));
              setToDate(values[1].endOf('day'));
              setPage(1);
            }}
          />
          <Button icon={<DownloadOutlined />} onClick={handleDownloadExcel}>
            {t('planner.downloadExcel', 'Скачать Excel')}
          </Button>
        </Space>
      }
    >
      {matrix && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {totalLabel}: <strong>{matrix.total}</strong>.{' '}
          {t('planner.periodSummary', 'Период')}{' '}
          <strong>{dayjs(matrix.from).format('DD.MM.YYYY')}</strong> —{' '}
          <strong>{dayjs(matrix.to).format('DD.MM.YYYY')}</strong>.
        </Typography.Paragraph>
      )}

      {matrixQuery.isLoading && (
        <div
          style={{
            padding: 40,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Spin />
        </div>
      )}

      {!matrixQuery.isLoading && (!matrix || matrix.rows.length === 0) && (
        <Typography.Text type="secondary">
          {t('planner.noData', 'Нет данных для выбранного периода')}
        </Typography.Text>
      )}

      {!!matrix && matrix.rows.length > 0 && fromDate && toDate && (
        <div
          style={{
            marginTop: 16,
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            display: 'flex',
          }}
        >
          {/* ЛЕВАЯ КОЛОНКА: имена / рабочие места */}
          <div
            style={{
              flex: '0 0 260px',
              borderRight: '1px solid #f0f0f0',
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* шапка слева */}
            <div
              style={{
                height: HEADER_HEIGHT,
                padding: `${ROW_VERTICAL_PADDING}px 12px`,
                borderBottom: '1px solid #f0f0f0',
                fontWeight: 500,
                background: '#fafafa',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {mode === 'byUsers'
                ? t('planner.employee', 'Сотрудник')
                : t('planner.workplace', 'Рабочее место')}
            </div>
            {/* список имён, скролл синхронизируется с правой частью */}
            <div
              ref={leftBodyRef}
              onWheel={handleLeftWheel}
              style={{
                maxHeight: GRID_MAX_HEIGHT,
                overflowY: 'hidden',
              }}
            >
              {rowsWithLanes.map(({ row, lanesCount, displaySubtitle }) => (
                <div
                  key={row.key}
                  style={{
                    height:
                      lanesCount * ROW_HEIGHT + ROW_VERTICAL_PADDING * 2,
                    borderBottom: '1px solid #f0f0f0',
                    padding: `${ROW_VERTICAL_PADDING}px 12px`,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <Typography.Text strong>{row.title}</Typography.Text>
                  {displaySubtitle && (
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {displaySubtitle}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ПРАВАЯ ЧАСТЬ: календарь (вертикальный + горизонтальный скролл) */}
          <div
            ref={rightBodyRef}
            onScroll={handleRightScroll}
            style={{
              flex: 1,
              overflow: 'auto',
              maxHeight: GRID_MAX_HEIGHT + HEADER_HEIGHT,
              minWidth: 400,
            }}
          >
            {/* шапка с датами */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${days.length}, ${CELL_WIDTH}px)`,
                minWidth: days.length * CELL_WIDTH,
                borderBottom: '1px solid #f0f0f0',
                background: '#fafafa',
                height: HEADER_HEIGHT,
                alignItems: 'center',
              }}
            >
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  style={{
                    padding: '0 4px',
                    textAlign: 'center',
                    fontSize: 12,
                    borderLeft: '1px solid #f5f5f5',
                  }}
                >
                  {d.format('DD.MM')}
                </div>
              ))}
            </div>

            {/* строки с сеткой и слотами */}
            <div>
              {rowsWithLanes.map(
                ({ row, visibleSlots, laneById, lanesCount }) => (
                  <div
                    key={row.key}
                    style={{
                      position: 'relative',
                      minWidth: days.length * CELL_WIDTH,
                      padding: ROW_VERTICAL_PADDING,
                      boxSizing: 'border-box',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    {/* сетка по дням */}
                    <div
                      style={{
                        position: 'absolute',
                        top: ROW_VERTICAL_PADDING,
                        left: 0,
                        right: 0,
                        bottom: ROW_VERTICAL_PADDING,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${days.length}, ${CELL_WIDTH}px)`,
                        gridAutoRows: ROW_HEIGHT,
                      }}
                    >
                      {days.map((d) => (
                        <div
                          key={d.toISOString()}
                          style={{
                            borderLeft: '1px solid #f5f5f5',
                          }}
                        />
                      ))}
                    </div>

                    {/* слоты */}
                    {visibleSlots.map((slot) => {
                      const lane = laneById[slot.id] ?? 0;

                      const slotStart = clampDateToRange(
                        dayjs(slot.from),
                        fromDate,
                        toDate,
                      );
                      const slotEnd = clampDateToRange(
                        dayjs(slot.to ?? slot.from),
                        fromDate,
                        toDate,
                      );

                      const startIndex = slotStart
                        .startOf('day')
                        .diff(fromDate.startOf('day'), 'day');
                      const endIndex =
                        slotEnd
                          .startOf('day')
                          .diff(fromDate.startOf('day'), 'day') + 1;

                      const left = startIndex * CELL_WIDTH;
                      const width = Math.max(
                        (endIndex - startIndex) * CELL_WIDTH - 4,
                        24,
                      );

                      const baseStartTime = dayjs(slot.from).format('HH:mm');
                      const baseEndTime = slot.to
                        ? dayjs(slot.to).format('HH:mm')
                        : '';

                      // интервал по дням – только текущий месяц
                      const perDayLines: string[] = [];
                      let dayCursor = slotStart.startOf('day');
                      const lastDay = slotEnd.startOf('day');
                      const currentMonth = fromDate.month();
                      const currentYear = fromDate.year();

                      while (
                        dayCursor.isBefore(lastDay) ||
                        dayCursor.isSame(lastDay, 'day')
                      ) {
                        if (
                          dayCursor.month() === currentMonth &&
                          dayCursor.year() === currentYear
                        ) {
                          perDayLines.push(
                            `${dayCursor.format(
                              'DD.MM',
                            )}: ${baseStartTime}–${baseEndTime || '...'}`,
                          );
                        }
                        dayCursor = dayCursor.add(1, 'day');
                      }

                      if (perDayLines.length === 0) {
                        perDayLines.push(
                          `${slotStart.format('DD.MM')}: ${baseStartTime}–${
                            baseEndTime || '...'
                          }`,
                        );
                      }

                      const tooltipTitle = (
                        <div>
                          <div>
                            <strong>
                              {slot.workplace?.code
                                ? `${slot.workplace.code} — ${slot.workplace.name}`
                                : slot.workplace?.name ?? row.title}
                            </strong>
                          </div>
                          <div>
                            {t('planner.period', 'Период')}:&nbsp;
                            {slotStart.format('DD.MM.YYYY')} —{' '}
                            {slotEnd.format('DD.MM.YYYY')}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            {t(
                              'planner.dailyIntervals',
                              'Интервалы по дням:',
                            )}
                          </div>
                          {perDayLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      );

                      const rawColor = slot.workplace?.color || undefined;
                      const bgColor = rawColor || '#e6f7ff';
                      const borderColor = rawColor || '#91d5ff';

                      return (
                        <Tooltip
                          key={slot.id}
                          title={tooltipTitle}
                          placement="right"
                          overlayStyle={{ maxWidth: 360 }}
                          overlayInnerStyle={{
                            maxHeight: 400,
                            overflowY: 'auto',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top:
                                ROW_VERTICAL_PADDING +
                                lane * ROW_HEIGHT +
                                1,
                              left,
                              width,
                              height: ROW_HEIGHT - 6,
                              borderRadius: 6,
                              background: bgColor,
                              border: `1px solid ${borderColor}`,
                              padding: '4px 6px',
                              boxSizing: 'border-box',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              cursor: 'default',
                            }}
                          >
                            <span style={{ fontSize: 12 }}>
                              {slot.code
                                ? `${slot.code} — ${slot.name}`
                                : slot.name ?? ''}
                            </span>
                          </div>
                        </Tooltip>
                      );
                    })}

                    {/* заполнитель высоты */}
                    <div
                      style={{
                        height: lanesCount * ROW_HEIGHT,
                      }}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default PlannerPage;