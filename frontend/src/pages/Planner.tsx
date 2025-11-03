import {
  Card,
  DatePicker,
  Empty,
  Flex,
  Pagination,
  Result,
  Select,
  Spin,
  Typography,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  PlannerMatrixResponse,
  PlannerMatrixRow,
  PlannerMatrixSlot,
  fetchPlannerMatrix,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { RangePicker } = DatePicker;

const COLOR_PALETTE = [
  '#1677ff',
  '#13c2c2',
  '#fa8c16',
  '#eb2f96',
  '#52c41a',
  '#722ed1',
  '#fa541c',
  '#2f54eb',
];

type Mode = 'byUsers' | 'byOrgs';

const clampIndex = (value: number, max: number) => {
  if (value < 0) {
    return 0;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const PlannerPage = () => {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<Mode>('byUsers');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const pageSize = 10;

  const role = user?.role ?? 'USER';
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isAuditor = role === 'AUDITOR';
  const isOrgManager = role === 'ORG_MANAGER';
  const canView = isAdmin || isAuditor || isOrgManager;
  const canPaginate = isAdmin || isOrgManager;

  const query = useQuery<PlannerMatrixResponse>({
    queryKey: [
      'planner-matrix',
      mode,
      canPaginate ? page : 1,
      range[0]?.toISOString(),
      range[1]?.toISOString(),
      role,
      profile?.org?.id ?? null,
      user?.id ?? null,
    ],
    queryFn: async () => {
      const [fromRaw, toRaw] = range;

      if (!fromRaw || !toRaw) {
        throw new Error('Invalid range');
      }

      const params = {
        mode,
        from: fromRaw.startOf('day').toISOString(),
        to: toRaw.endOf('day').toISOString(),
        page: canPaginate ? page : 1,
        pageSize: canPaginate ? pageSize : undefined,
        userId: undefined as string | undefined,
        orgId: undefined as string | undefined,
      };

      if (isAuditor && user?.id) {
        params.userId = user.id;
      }

      if (isOrgManager && profile?.org?.id) {
        params.orgId = profile.org.id;
      }

      return fetchPlannerMatrix(params);
    },
    enabled: canView,
    keepPreviousData: true,
  });

  const days = useMemo<Dayjs[]>(() => {
    if (!query.data) {
      return [];
    }

    const start = dayjs(query.data.from).startOf('day');
    const end = dayjs(query.data.to).startOf('day');

    const result: Dayjs[] = [];
    let current = start;

    while (current.isSame(end) || current.isBefore(end)) {
      result.push(current);
      current = current.add(1, 'day');
    }

    return result;
  }, [query.data]);

  const colorMap = useMemo(() => {
    if (!query.data) {
      return new Map<string, string>();
    }

    const map = new Map<string, string>();
    let index = 0;

    for (const row of query.data.rows) {
      for (const slot of row.slots) {
        if (!slot.code) {
          continue;
        }

        if (!map.has(slot.code)) {
          map.set(slot.code, COLOR_PALETTE[index % COLOR_PALETTE.length]);
          index += 1;
        }
      }
    }

    return map;
  }, [query.data]);

  const gridTemplate = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(80px, 1fr))`,
    }),
    [days.length],
  );

  const renderSlot = (
    slot: PlannerMatrixSlot,
    matrix: PlannerMatrixResponse,
  ) => {
    if (days.length === 0) {
      return null;
    }

    const rangeStart = days[0];
    const rangeEnd = days[days.length - 1];

    const slotStart = dayjs(slot.from).startOf('day');
    const slotEnd = slot.to
      ? dayjs(slot.to).startOf('day')
      : dayjs(matrix.to).startOf('day');

    const maxIndex = days.length - 1;
    const startIndex = clampIndex(slotStart.diff(rangeStart, 'day'), maxIndex);
    const endIndex = clampIndex(slotEnd.diff(rangeStart, 'day'), maxIndex);

    if (endIndex < 0 || startIndex > maxIndex) {
      return null;
    }

    const color = colorMap.get(slot.code) ?? COLOR_PALETTE[0];
    const gridColumn = `${startIndex + 1} / ${endIndex + 2}`;
    const subtitle =
      mode === 'byOrgs'
        ? slot.user?.fullName || slot.user?.email || ''
        : slot.org?.slug?.toUpperCase() ?? slot.name;

    return (
      <div
        key={slot.id}
        className="planner-slot"
        style={{ gridColumn, gridRow: '1' }}
        title={slot.name}
      >
        <div
          className="planner-slot-content"
          style={{
            borderColor: color,
            backgroundColor: `${color}22`,
          }}
        >
          <Typography.Text style={{ color }} strong>
            {slot.code}
          </Typography.Text>
          <Typography.Text type="secondary">
            {`${dayjs(slot.from).format('DD.MM')} — ${
              slot.to ? dayjs(slot.to).format('DD.MM') : t('planner.openEnded')
            }`}
          </Typography.Text>
          {subtitle ? (
            <Typography.Text type="secondary">{subtitle}</Typography.Text>
          ) : null}
        </div>
      </div>
    );
  };

  if (!canView) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  return (
    <Flex vertical gap={16}>
      <Card>
        <Flex gap={12} align="center" wrap>
          <Select
            value={mode}
            onChange={(value: Mode) => {
              setMode(value);
              setPage(1);
            }}
            options={[
              { value: 'byUsers', label: t('planner.mode.users') },
              { value: 'byOrgs', label: t('planner.mode.orgs') },
            ]}
          />
          <RangePicker
            value={range}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) {
                return;
              }
              setRange([value[0], value[1]]);
              setPage(1);
            }}
            allowClear={false}
            format="DD.MM.YYYY"
          />
          {query.isFetching && <Spin size="small" />}
        </Flex>
      </Card>

      <Card>
        {query.isLoading ? (
          <Flex justify="center" className="py-12">
            <Spin />
          </Flex>
        ) : !query.data || query.data.rows.length === 0 ? (
          <Empty description={t('planner.noData')} />
        ) : (
          <div className="planner-table">
            <div className="planner-header">
              <div className="planner-info-cell">
                <Typography.Text type="secondary">
                  {mode === 'byUsers'
                    ? t('planner.columns.employee')
                    : t('planner.columns.org')}
                </Typography.Text>
              </div>
              <div
                className="planner-grid planner-grid-header"
                style={gridTemplate}
              >
                {days.map((day) => (
                  <div key={day.toISOString()} className="planner-grid-cell">
                    <Typography.Text type="secondary">
                      {day.format('DD.MM')}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            </div>

            {query.data.rows.map((row: PlannerMatrixRow) => (
              <div key={row.key} className="planner-row">
                <div className="planner-info-cell">
                  <Typography.Text strong>{row.title}</Typography.Text>
                  {row.subtitle ? (
                    <Typography.Text type="secondary">
                      {row.subtitle}
                    </Typography.Text>
                  ) : null}
                </div>
                <div
                  className="planner-grid planner-grid-body"
                  style={gridTemplate}
                >
                  {days.map((day) => (
                    <div
                      key={`cell-${row.key}-${day.toISOString()}`}
                      className="planner-grid-cell"
                    />
                  ))}
                  {row.slots.map((slot) => renderSlot(slot, query.data))}
                  {row.slots.length === 0 ? (
                    <div className="planner-empty-row">
                      <Typography.Text type="secondary">
                        {t('planner.noSlots')}
                      </Typography.Text>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {canPaginate && query.data ? (
          <Flex justify="end" className="mt-4">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={query.data.total}
              onChange={(nextPage) => setPage(nextPage)}
              showSizeChanger={false}
            />
          </Flex>
        ) : null}
      </Card>
    </Flex>
  );
};

export default PlannerPage;
