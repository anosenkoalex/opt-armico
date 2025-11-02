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
} from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
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

const MyPlace = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [swapState, setSwapState] = useState<{ slot: Slot | null; comment: string }>({
    slot: null,
    comment: '',
  });

  const columns = useMemo(
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
      message.success(t('myPlace.confirmed'));
    },
  });

  const swapMutation = useMutation({
    mutationFn: ({ slotId, comment }: { slotId: string; comment: string }) =>
      requestSlotSwap(slotId, { comment }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'schedule'] });
      message.success(t('myPlace.swapRequested'));
      setSwapState({ slot: null, comment: '' });
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

  const slotStatusLabel = useMemo(
    () => ({
      PLANNED: t('myPlace.slotStatus.planned'),
      CONFIRMED: t('myPlace.slotStatus.confirmed'),
      REPLACED: t('myPlace.slotStatus.replaced'),
      CANCELLED: t('myPlace.slotStatus.cancelled'),
    }),
    [t],
  );

  const handleSwapSubmit = () => {
    if (!swapState.slot || !swapState.comment.trim()) {
      message.error(t('myPlace.swapCommentRequired'));
      return;
    }

    swapMutation.mutate({ slotId: swapState.slot.id, comment: swapState.comment.trim() });
  };

  return (
    <Flex vertical gap={16}>
      <Card title={t('myPlace.title')}>
        <Descriptions column={1} bordered>
          <Descriptions.Item label={t('myPlace.name')}>
            {profile.fullName ?? profile.email}
          </Descriptions.Item>
          <Descriptions.Item label={t('myPlace.position')}>
            {profile.position ?? t('myPlace.positionUnknown')}
          </Descriptions.Item>
          <Descriptions.Item label={t('myPlace.org')}>
            {profile.org?.name ?? t('myPlace.orgUnknown')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={t('myPlace.currentAssignment')}>
        {isLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : !currentAssignment ? (
          <Result status="info" title={t('myPlace.noAssignment')} />
        ) : (
          <Descriptions column={1} bordered>
            <Descriptions.Item label={t('assignments.workplace')}>
              {currentWorkplace ? (
                <Typography.Text>
                  {currentWorkplace.code ? `${currentWorkplace.code} — ` : ''}
                  {currentWorkplace.name}
                </Typography.Text>
              ) : (
                t('assignments.workplace')
              )}
            </Descriptions.Item>
            {currentWorkplace?.location ? (
              <Descriptions.Item label={t('workplaces.location')}>
                {currentWorkplace.location}
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label={t('myPlace.startsAt')}>
              {dayjs(currentAssignment.startsAt).format('DD.MM.YYYY HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label={t('myPlace.endsAt')}>
              {currentAssignment.endsAt
                ? dayjs(currentAssignment.endsAt).format('DD.MM.YYYY HH:mm')
                : t('myPlace.noEndDate')}
            </Descriptions.Item>
            <Descriptions.Item label={t('myPlace.status')}>
              <Tag color={statusColor[currentAssignment.status]}>
                {currentAssignment.status === 'ACTIVE'
                  ? t('assignments.status.active')
                  : t('assignments.status.archived')}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title={t('myPlace.assignmentsHistory')}>
        <Table
          rowKey="id"
          dataSource={history}
          columns={columns}
          pagination={false}
          locale={{ emptyText: t('assignments.empty') }}
        />
      </Card>

      <Card title={t('myPlace.scheduleTitle')}>
        {scheduleQuery.isLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : schedule.length === 0 ? (
          <Result status="info" title={t('myPlace.scheduleEmpty')} />
        ) : (
          <List
            dataSource={schedule}
            renderItem={(slot) => {
              const isConfirmDisabled =
                slot.status === 'CONFIRMED' || slot.status === 'CANCELLED';

              return (
                <List.Item
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
                      onClick={() => confirmMutation.mutate(slot.id)}
                    >
                      {t('myPlace.confirmParticipation')}
                    </Button>,
                    <Button
                      key="swap"
                      size="small"
                      disabled={slot.status === 'CANCELLED'}
                      onClick={() => setSwapState({ slot, comment: '' })}
                    >
                      {t('myPlace.requestSwap')}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Flex gap={8} align="center">
                        <Typography.Text strong>
                          {slot.org?.slug
                            ? `${slot.org.slug.toUpperCase()} — ${slot.org.name}`
                            : slot.org?.name ?? t('myPlace.orgUnknown')}
                        </Typography.Text>
                        <Tag color={slotStatusColor[slot.status]}>
                          {slotStatusLabel[slot.status]}
                        </Tag>
                      </Flex>
                    }
                    description={
                      <div>
                        <div>
                          {t('myPlace.planName', { name: slot.plan?.name ?? '—' })}
                        </div>
                        <div>
                          {t('myPlace.schedulePeriod', {
                            start: dayjs(slot.dateStart).format('DD.MM.YYYY'),
                            end: dayjs(slot.dateEnd).format('DD.MM.YYYY'),
                          })}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      <Modal
        open={Boolean(swapState.slot)}
        title={t('myPlace.swapModalTitle')}
        okText={t('myPlace.sendSwapRequest')}
        cancelText={t('common.cancel')}
        onCancel={() => setSwapState({ slot: null, comment: '' })}
        onOk={handleSwapSubmit}
        confirmLoading={swapMutation.isPending}
      >
        <Input.TextArea
          rows={4}
          value={swapState.comment}
          onChange={(event) =>
            setSwapState((prev) => ({ ...prev, comment: event.target.value }))
          }
          placeholder={t('myPlace.swapPlaceholder')}
        />
      </Modal>
    </Flex>
  );
};

export default MyPlace;
