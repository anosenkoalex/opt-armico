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
import { useMemo, useState, useEffect } from 'react';
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

  // показываем только ACTIVE
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

  // один раз после загрузки – сдвигаем диапазон на первую дату назначения
  useEffect(() => {
    if (!matrix || autoRangeInitialized) return;
    if (!matrix.rows || matrix.rows.length === 0) return;

    let minStart: Dayjs | null = null;
    let maxEnd: Dayjs | null = null;

    for (const row of matrix.rows) {
      for (const slot of row.slots) {
        if (slot.status === 'ARCHIVED') continue; // подстрахуемся
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
        // ⚙️ отправляем только дату без времени, чтобы не было сдвига по часовому поясу
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
      {/* 🔹 Короткая сводка по выборке */}
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
            overflowX: 'auto',
          }}
        >
          {/* заголовок с датами */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #f0f0f0',
              background: '#fafafa',
            }}
          >
            <div
              style={{
                flex: '0 0 260px',
                padding: '8px 12px',
                borderRight: '1px solid #f0f0f0',
                fontWeight: 500,
              }}
            >
              {mode === 'byUsers'
                ? t('planner.employee', 'Сотрудник')
                : t('planner.workplace', 'Рабочее место')}
            </div>
            <div
              style={{
                flex: 1,
                minWidth: days.length * CELL_WIDTH,
                display: 'grid',
                gridTemplateColumns: `repeat(${days.length}, ${CELL_WIDTH}px)`,
              }}
            >
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  style={{
                    padding: '8px 4px',
                    textAlign: 'center',
                    fontSize: 12,
                    borderLeft: '1px solid #f5f5f5',
                  }}
                >
                  {d.format('DD.MM')}
                </div>
              ))}
            </div>
          </div>

          {/* строки */}
          {matrix.rows.map((row: PlannerMatrixRow) => {
            // убираем слоты в ARCHIVED
            const visibleSlots = row.slots.filter(
              (s) => s.status !== 'ARCHIVED',
            );

            const { laneById, lanesCount } = buildLanes(visibleSlots);

            return (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <div
                  style={{
                    flex: '0 0 260px',
                    padding: '8px 12px',
                    borderRight: '1px solid #f0f0f0',
                  }}
                >
                  <Typography.Text strong>{row.title}</Typography.Text>
                  {row.subtitle && (
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {row.subtitle}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    position: 'relative',
                    flex: 1,
                    minWidth: days.length * CELL_WIDTH,
                    padding: 8,
                    boxSizing: 'border-box',
                  }}
                >
                  {/* сетка по дням */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 8,
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

                  {/* сами прямоугольники назначений */}
                  {visibleSlots.map((slot: PlannerMatrixSlot) => {
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

                    // интервал для одного дня
                    const baseStartTime = dayjs(slot.from).format('HH:mm');
                    const baseEndTime = slot.to
                      ? dayjs(slot.to).format('HH:mm')
                      : '';

                    // список по дням: ДД.ММ: HH:mm–HH:mm
                    const perDayLines: string[] = [];
                    let dayCursor = slotStart.startOf('day');
                    const lastDay = slotEnd.startOf('day');
                    while (
                      dayCursor.isBefore(lastDay) ||
                      dayCursor.isSame(lastDay, 'day')
                    ) {
                      perDayLines.push(
                        `${dayCursor.format('DD.MM')}: ${baseStartTime}–${
                          baseEndTime || '...'
                        }`,
                      );
                      dayCursor = dayCursor.add(1, 'day');
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

                    // 🎨 цвет слота из рабочего места
                    const rawColor = slot.workplace?.color || undefined;
                    const bgColor = rawColor || '#e6f7ff';
                    const borderColor = rawColor || '#91d5ff';

                    return (
                      <Tooltip key={slot.id} title={tooltipTitle}>
                        <div
                          style={{
                            position: 'absolute',
                            top: 8 + lane * ROW_HEIGHT,
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

                  {/* высота под все “дорожки” */}
                  <div
                    style={{
                      height: lanesCount * ROW_HEIGHT + 16,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default PlannerPage;