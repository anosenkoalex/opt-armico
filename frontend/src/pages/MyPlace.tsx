import {
  Button,
  Card,
  Descriptions,
  Flex,
  Input,
  List,
  Modal,
  Result,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  DatePicker,
} from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  Assignment,
  AssignmentStatus,
  CurrentWorkplaceResponse,
  Slot,
  SlotStatus,
  confirmMySlot,
  fetchCurrentWorkplace,
  fetchMySchedule,
  requestSlotSwap,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const { RangePicker } = DatePicker;

const statusColor: Record<AssignmentStatus, string> = {
  ACTIVE: 'green',
  ARCHIVED: 'default',
};

const slotStatusColor: Record<SlotStatus, string> = {
  PLANNED: 'blue',
  CONFIRMED: 'green',
  REPLACED: 'orange',
  CANCELLED: 'red',
};

const CELL_WIDTH = 48;
const ROW_HEIGHT = 32;

function buildLanes(
  slots: Slot[],
): { laneById: Record<string, number>; lanesCount: number } {
  const sorted = [...slots].sort(
    (a, b) => dayjs(a.dateStart).valueOf() - dayjs(b.dateStart).valueOf(),
  );

  const laneEndTimes: Dayjs[] = [];
  const laneById: Record<string, number> = {};

  for (const slot of sorted) {
    const start = dayjs(slot.dateStart);
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
      laneEndTimes.push(dayjs(slot.dateEnd));
    } else {
      laneEndTimes[laneIndex] = dayjs(slot.dateEnd);
    }

    laneById[slot.id] = laneIndex;
  }

  return { laneById, lanesCount: laneEndTimes.length || 1 };
}

const MyPlace = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionComment, setCorrectionComment] = useState('');
  const [correctionRange, setCorrectionRange] = useState<[Dayjs, Dayjs] | null>(
    null,
  );

  const { data, isLoading } = useQuery<CurrentWorkplaceResponse>({
    queryKey: ['me', 'current-workplace'],
    queryFn: fetchCurrentWorkplace,
    refetchInterval: 60_000,
  });

  const scheduleQuery = useQuery<Slot[]>({
    queryKey: ['me', 'schedule'],
    queryFn: fetchMySchedule,
    refetchInterval: 60_000,
  });

  const confirmMutation = useMutation({
    mutationFn: (slotId: string) => confirmMySlot(slotId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'schedule'] });
      message.success(t('myPlace.confirmed', 'Участие подтверждено'));
    },
  });

  const swapMutation = useMutation({
    mutationFn: ({ slotId, comment }: { slotId: string; comment: string }) =>
      requestSlotSwap(slotId, { comment }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'schedule'] });
      message.success(
        t(
          'myPlace.swapRequested',
          'Запрос на корректировку отправлен менеджеру',
        ),
      );
      setSelectedSlot(null);
      setCorrectionMode(false);
      setCorrectionComment('');
      setCorrectionRange(null);
    },
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

  // ===== назначения (текущее + история) =====
  const assignmentsTableData: Assignment[] = useMemo(() => {
    const list: Assignment[] = [];
    if (currentAssignment) list.push(currentAssignment);
    if (history.length > 0) list.push(...history);
    return list;
  }, [currentAssignment, history]);

  const assignmentColumns = useMemo(
    () => [
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
        title: t('myPlace.startsAt'),
        dataIndex: 'startsAt',
        key: 'startsAt',
        render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm'),
      },
      {
        title: t('myPlace.endsAt'),
        dataIndex: 'endsAt',
        key: 'endsAt',
        render: (value: string | null) =>
          value
            ? dayjs(value).format('DD.MM.YYYY HH:mm')
            : t('myPlace.noEndDate'),
      },
      {
        title: t('myPlace.status'),
        dataIndex: 'status',
        key: 'status',
        render: (value: AssignmentStatus) => (
          <Tag color={statusColor[value]}>
            {value === 'ACTIVE'
              ? t('assignments.status.active')
              : t('assignments.status.archived')}
          </Tag>
        ),
      },
    ],
    [t],
  );

  const slotStatusLabel = useMemo(
    () => ({
      PLANNED: t('myPlace.slotStatus.planned', 'Запланировано'),
      CONFIRMED: t('myPlace.slotStatus.confirmed', 'Подтверждено'),
      REPLACED: t('myPlace.slotStatus.replaced', 'Корректировка'),
      CANCELLED: t('myPlace.slotStatus.cancelled', 'Отменено'),
    }),
    [t],
  );

  const handleOpenSlotModal = (slot: Slot) => {
    setSelectedSlot(slot);
    setCorrectionMode(false);
    setCorrectionComment('');
    setCorrectionRange([
      dayjs(slot.dateStart),
      dayjs(slot.dateEnd ?? slot.dateStart),
    ]);
  };

  const handleSendCorrection = () => {
    if (!selectedSlot) return;

    const [newStart, newEnd] =
      correctionRange ??
      [dayjs(selectedSlot.dateStart), dayjs(selectedSlot.dateEnd)];

    if (!newStart || !newEnd) {
      message.error(
        t(
          'myPlace.swapRangeRequired',
          'Выберите период, для которого нужен запрос корректировки',
        ),
      );
      return;
    }

    const oldStart = dayjs(selectedSlot.dateStart);
    const oldEnd = dayjs(selectedSlot.dateEnd ?? selectedSlot.dateStart);

    const autoText = `Запрос корректировки слота: было ${oldStart.format(
      'DD.MM.YYYY HH:mm',
    )} — ${oldEnd.format('DD.MM.YYYY HH:mm')}, стало ${newStart.format(
      'DD.MM.YYYY HH:mm',
    )} — ${newEnd.format('DD.MM.YYYY HH:mm')}.`;

    const commentPart = correctionComment.trim();
    const finalComment = commentPart
      ? `${autoText}\nКомментарий: ${commentPart}`
      : autoText;

    swapMutation.mutate({
      slotId: selectedSlot.id,
      comment: finalComment,
    });
  };

  // ===== мини-планировщик =====
  const plannerDays = useMemo(() => {
    if (!schedule.length) return [];

    let minDate = dayjs(schedule[0].dateStart).startOf('day');
    let maxDate = dayjs(schedule[0].dateEnd ?? schedule[0].dateStart).startOf(
      'day',
    );

    for (const slot of schedule) {
      const start = dayjs(slot.dateStart).startOf('day');
      const end = dayjs(slot.dateEnd ?? slot.dateStart).startOf('day');

      if (start.isBefore(minDate)) minDate = start;
      if (end.isAfter(maxDate)) maxDate = end;
    }

    minDate = minDate.subtract(1, 'day');
    maxDate = maxDate.add(1, 'day');

    const days: Dayjs[] = [];
    let cursor = minDate;

    while (cursor.isBefore(maxDate) || cursor.isSame(maxDate, 'day')) {
      days.push(cursor);
      cursor = cursor.add(1, 'day');
    }

    return days;
  }, [schedule]);

  const { laneById, lanesCount } = useMemo(() => {
    if (!schedule.length) return { laneById: {}, lanesCount: 1 };
    return buildLanes(schedule);
  }, [schedule]);

  return (
    <Flex vertical gap={16}>
      {/* Профиль */}
      <Card title={t('myPlace.title', 'Моя рабочая страница')}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label={t('myPlace.name', 'Сотрудник')}>
            {profile.fullName ?? profile.email}
          </Descriptions.Item>
          <Descriptions.Item label={t('myPlace.org', 'Организация')}>
            {profile.org?.name ?? t('myPlace.orgUnknown', 'Не указана')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Текущее назначение кратко */}
      <Card title={t('myPlace.currentAssignment', 'Текущее назначение')}>
        {isLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : !currentAssignment ? (
          <Result
            status="info"
            title={t(
              'myPlace.noAssignment',
              'Сейчас у вас нет активного назначения',
            )}
          />
        ) : (
          <Descriptions column={1} bordered>
            <Descriptions.Item
              label={t('assignments.workplace', 'Рабочее место')}
            >
              {currentWorkplace ? (
                <Typography.Text>
                  {currentWorkplace.code ? `${currentWorkplace.code} — ` : ''}
                  {currentWorkplace.name}
                </Typography.Text>
              ) : (
                t('assignments.workplace')
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('myPlace.startsAt', 'Начало')}>
              {dayjs(currentAssignment.startsAt).format('DD.MM.YYYY HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label={t('myPlace.endsAt', 'Окончание')}>
              {currentAssignment.endsAt
                ? dayjs(currentAssignment.endsAt).format('DD.MM.YYYY HH:mm')
                : t('myPlace.noEndDate', 'Без даты окончания')}
            </Descriptions.Item>
            <Descriptions.Item label={t('myPlace.status', 'Статус')}>
              <Tag color={statusColor[currentAssignment.status]}>
                {currentAssignment.status === 'ACTIVE'
                  ? t('assignments.status.active')
                  : t('assignments.status.archived')}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* ОДИН общий блок: назначения + расписание + планировщик */}
      <Card
        title={t(
          'myPlace.assignmentsAndSchedule',
          'Мои назначения и расписание',
        )}
      >
        {/* Таблица назначений */}
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {t('myPlace.assignmentsHistory', 'Мои назначения')}
        </Typography.Title>

        {assignmentsTableData.length === 0 ? (
          <Typography.Text type="secondary">
            {t('assignments.empty', 'Назначений пока нет')}
          </Typography.Text>
        ) : (
          <Table
            rowKey="id"
            dataSource={assignmentsTableData}
            columns={assignmentColumns}
            pagination={false}
            style={{ marginBottom: 24 }}
          />
        )}

        {/* СЛОТЫ (расписание) */}
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {t(
            'myPlace.scheduleTitle',
            'Слоты расписания (для запроса корректировки)',
          )}
        </Typography.Title>

        {scheduleQuery.isLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : schedule.length === 0 ? (
          <Result
            status="info"
            title={t(
              'myPlace.scheduleEmpty',
              'Расписание пока пустое — слотов нет',
            )}
          />
        ) : (
          <List
            dataSource={schedule}
            renderItem={(slot) => {
              const isConfirmDisabled =
                slot.status === 'CONFIRMED' || slot.status === 'CANCELLED';

              return (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleOpenSlotModal(slot)}
                  actions={[
                    <Button
                      key="confirm"
                      type="primary"
                      size="small"
                      disabled={isConfirmDisabled}
                      loading={
                        confirmMutation.isPending &&
                        confirmMutation.variables === slot.id
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmMutation.mutate(slot.id);
                      }}
                    >
                      {t(
                        'myPlace.confirmParticipation',
                        'Подтвердить участие',
                      )}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Flex gap={8} align="center">
                        <Typography.Text strong>
                          {slot.org?.slug
                            ? `${slot.org.slug.toUpperCase()} — ${slot.org.name}`
                            : slot.org?.name ??
                              t('myPlace.orgUnknown', 'Организация')}
                        </Typography.Text>
                        <Tag color={slotStatusColor[slot.status]}>
                          {slotStatusLabel[slot.status]}
                        </Tag>
                      </Flex>
                    }
                    description={
                      <div>
                        <div>
                          {t('myPlace.planName', {
                            name: slot.plan?.name ?? '—',
                          })}
                        </div>
                        <div>
                          {t('myPlace.schedulePeriod', {
                            start: dayjs(slot.dateStart).format(
                              'DD.MM.YYYY HH:mm',
                            ),
                            end: dayjs(slot.dateEnd).format(
                              'DD.MM.YYYY HH:mm',
                            ),
                          })}
                        </div>
                        {slot.status === 'REPLACED' && (
                          <Typography.Text type="secondary">
                            {t(
                              'myPlace.correctionApproved',
                              'Корректировка расписания одобрена',
                            )}
                          </Typography.Text>
                        )}
                        {slot.status === 'CANCELLED' && (
                          <Typography.Text type="secondary">
                            {t(
                              'myPlace.correctionCancelled',
                              'Слот отменён / запрос отклонён',
                            )}
                          </Typography.Text>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}

        {/* Мини-планировщик */}
        {schedule.length > 0 && plannerDays.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {t(
                'myPlace.plannerViewTitle',
                'Отображение как в планировщике',
              )}
            </Typography.Title>

            <div
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflowX: 'auto',
                padding: 8,
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
                    minWidth: plannerDays.length * CELL_WIDTH,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${plannerDays.length}, ${CELL_WIDTH}px)`,
                  }}
                >
                  {plannerDays.map((d) => (
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

              {/* линия с прямоугольниками слотов */}
              <div
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
                  <Typography.Text type="secondary">
                    {profile.org?.name ??
                      t('myPlace.orgUnknown', 'Организация')}
                  </Typography.Text>
                </div>

                <div
                  style={{
                    position: 'relative',
                    flex: 1,
                    minWidth: plannerDays.length * CELL_WIDTH,
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
                      gridTemplateColumns: `repeat(${plannerDays.length}, ${CELL_WIDTH}px)`,
                      gridAutoRows: ROW_HEIGHT,
                    }}
                  >
                    {plannerDays.map((d) => (
                      <div
                        key={d.toISOString()}
                        style={{ borderLeft: '1px solid #f5f5f5' }}
                      />
                    ))}
                  </div>

                  {/* блоки слотов */}
                  {schedule.map((slot) => {
                    const lane = laneById[slot.id] ?? 0;

                    const slotStart = dayjs(slot.dateStart);
                    const slotEnd = dayjs(slot.dateEnd ?? slot.dateStart);

                    const startIndex = slotStart
                      .startOf('day')
                      .diff(plannerDays[0].startOf('day'), 'day');
                    const endIndex =
                      slotEnd
                        .startOf('day')
                        .diff(plannerDays[0].startOf('day'), 'day') + 1;

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
                        title={`${dayjs(slot.dateStart).format(
                          'DD.MM HH:mm',
                        )} — ${dayjs(slot.dateEnd).format('DD.MM HH:mm')}`}
                      >
                        {slot.org?.slug
                          ? slot.org.slug.toUpperCase()
                          : slot.org?.name ?? ''}
                        {' · '}
                        {slotStatusLabel[slot.status]}
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
          </div>
        )}
      </Card>

      {/* Модалка слота + запрос корректировки */}
      <Modal
        open={Boolean(selectedSlot)}
        title={t(
          'myPlace.slotModalTitle',
          'Слот расписания / запрос корректировки',
        )}
        onCancel={() => {
          if (swapMutation.isPending) return;
          setSelectedSlot(null);
          setCorrectionMode(false);
          setCorrectionComment('');
          setCorrectionRange(null);
        }}
        footer={
          selectedSlot && !correctionMode
            ? [
                <Button
                  key="close"
                  onClick={() => {
                    if (swapMutation.isPending) return;
                    setSelectedSlot(null);
                    setCorrectionMode(false);
                    setCorrectionComment('');
                    setCorrectionRange(null);
                  }}
                >
                  {t('common.close', 'Закрыть')}
                </Button>,
                <Button
                  key="request"
                  type="primary"
                  onClick={() => setCorrectionMode(true)}
                >
                  {t(
                    'myPlace.requestSwap',
                    'Запросить корректировку расписания',
                  )}
                </Button>,
              ]
            : selectedSlot
              ? [
                  <Button
                    key="back"
                    onClick={() => {
                      if (swapMutation.isPending) return;
                      setCorrectionMode(false);
                      setCorrectionComment('');
                      setCorrectionRange([
                        dayjs(selectedSlot.dateStart),
                        dayjs(
                          selectedSlot.dateEnd ?? selectedSlot.dateStart,
                        ),
                      ]);
                    }}
                  >
                    {t('common.cancel', 'Отмена')}
                  </Button>,
                  <Button
                    key="submit"
                    type="primary"
                    loading={swapMutation.isPending}
                    onClick={handleSendCorrection}
                  >
                    {t('myPlace.sendSwapRequest', 'Отправить запрос')}
                  </Button>,
                ]
              : undefined
        }
      >
        {selectedSlot && (
          <>
            {!correctionMode && (
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('myPlace.org', 'Организация')}>
                  {selectedSlot.org?.name ??
                    t('myPlace.orgUnknown', 'Не указана')}
                </Descriptions.Item>
                <Descriptions.Item label={t('myPlace.planName', 'План')}>
                  {selectedSlot.plan?.name ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item
                  label={t('myPlace.schedulePeriod', 'Период')}
                >
                  {`${dayjs(selectedSlot.dateStart).format(
                    'DD.MM.YYYY HH:mm',
                  )} — ${dayjs(selectedSlot.dateEnd).format(
                    'DD.MM.YYYY HH:mm',
                  )}`}
                </Descriptions.Item>
                <Descriptions.Item label={t('myPlace.status', 'Статус')}>
                  <Tag color={slotStatusColor[selectedSlot.status]}>
                    {slotStatusLabel[selectedSlot.status]}
                  </Tag>
                </Descriptions.Item>
                {selectedSlot.note && (
                  <Descriptions.Item
                    label={t('myPlace.note', 'Примечание')}
                  >
                    {selectedSlot.note}
                  </Descriptions.Item>
                )}
              </Descriptions>
            )}

            {correctionMode && (
              <Flex vertical gap={12}>
                <Typography.Text>
                  {t(
                    'myPlace.swapExplain',
                    'Уточните новый период и опишите, что нужно изменить (day off, перенос времени и т.д.).',
                  )}
                </Typography.Text>

                <RangePicker
                  showTime
                  value={correctionRange ?? undefined}
                  format="DD.MM.YYYY HH:mm"
                  onChange={(values) => {
                    if (!values || !values[0] || !values[1]) {
                      setCorrectionRange(null);
                    } else {
                      setCorrectionRange([values[0], values[1]]);
                    }
                  }}
                />

                <Input.TextArea
                  rows={4}
                  value={correctionComment}
                  onChange={(e) => setCorrectionComment(e.target.value)}
                  placeholder={t(
                    'myPlace.swapPlaceholder',
                    'Опишите, какие дни/часы хотите изменить и почему (day off, больничный, смена смены и т.п.)',
                  )}
                />
              </Flex>
            )}
          </>
        )}
      </Modal>
    </Flex>
  );
};

export default MyPlace;