import { RightOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
  Spin,
  Flex,
  Popover,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';
import {
  PaginatedResponse,
  Workplace,
  createWorkplace,
  deleteWorkplace,
  fetchWorkplaces,
  updateWorkplace,
  fetchAssignments,
  type Assignment,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

type AssignmentsApiResponse =
  | PaginatedResponse<Assignment>
  | {
      items: Assignment[];
      total: number;
      page: number;
      pageSize: number;
    };

function formatHours(hours: number) {
  const rounded2 = Math.round(hours * 100) / 100;
  const isInt = Math.abs(rounded2 - Math.round(rounded2)) < 1e-9;
  return isInt ? `${Math.round(rounded2)} ч` : `${rounded2} ч`;
}

function getShiftHours(shift: { startsAt?: string; endsAt?: string } | null) {
  if (!shift?.startsAt || !shift?.endsAt) return 0;
  const start = dayjs(shift.startsAt);
  const end = dayjs(shift.endsAt);
  const diffMin = end.diff(start, 'minute');
  return Math.max(0, diffMin / 60);
}

function getPeriodFromShiftsOrAssignment(row: Assignment) {
  const shifts = Array.isArray(row.shifts) ? row.shifts : [];

  if (shifts.length > 0) {
    const dates = shifts
      .map((s) => dayjs(s.date))
      .filter((d) => d.isValid())
      .sort((a, b) => a.valueOf() - b.valueOf());

    const from = dates[0]?.format('DD.MM.YYYY');
    const to = dates[dates.length - 1]?.format('DD.MM.YYYY');
    return { from, to };
  }

  const from = row.startsAt ? dayjs(row.startsAt).format('DD.MM.YYYY') : '';
  const to = row.endsAt ? dayjs(row.endsAt).format('DD.MM.YYYY') : '';
  return { from, to };
}

const WorkplacesPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'all',
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkplace, setEditingWorkplace] = useState<Workplace | null>(null);
  const [form] = Form.useForm();

  // ====== MODAL: назначения по рабочему месту ======
  const [assignmentsModalOpen, setAssignmentsModalOpen] = useState(false);
  const [selectedWorkplace, setSelectedWorkplace] = useState<Workplace | null>(null);
  const [assPage, setAssPage] = useState(1);
  const [assPageSize, setAssPageSize] = useState(10);

  const isAdmin = user?.role === 'SUPER_ADMIN';
  const orgId = profile?.org?.id ?? null;

  const workplacesQuery = useQuery<PaginatedResponse<Workplace>>({
    queryKey: [
      'workplaces',
      {
        search,
        statusFilter,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      fetchWorkplaces({
        search: search || undefined,
        isActive:
          statusFilter === 'all'
            ? undefined
            : statusFilter === 'active'
              ? true
              : false,
        page,
        pageSize,
      }),
    keepPreviousData: true,
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: createWorkplace,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workplaces'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('workplaces.created'));
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: (error: unknown) => {
      console.error(error);
      const axiosError = error as AxiosError<{ message?: string }>;
      message.error(axiosError.response?.data?.message ?? t('common.error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Parameters<typeof updateWorkplace>[1];
    }) => updateWorkplace(id, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workplaces'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('workplaces.updated'));
      setIsModalOpen(false);
      setEditingWorkplace(null);
      form.resetFields();
    },
    onError: (error: unknown) => {
      console.error(error);
      const axiosError = error as AxiosError<{ message?: string }>;
      message.error(axiosError.response?.data?.message ?? t('common.error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkplace,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workplaces'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('workplaces.deleted'));
    },
    onError: (error: unknown) => {
      console.error(error);
      const axiosError = error as AxiosError<{ message?: string }>;
      message.error(axiosError.response?.data?.message ?? t('common.error'));
    },
  });

  const openAssignmentsModal = (workplace: Workplace) => {
    setSelectedWorkplace(workplace);
    setAssPage(1);
    setAssPageSize(10);
    setAssignmentsModalOpen(true);
  };

  // ✅ нормализуем ответ /assignments (items/... -> data/meta)
  const assignmentsQuery = useQuery<PaginatedResponse<Assignment>>({
    queryKey: [
      'workplace-assignments',
      {
        workplaceId: selectedWorkplace?.id ?? null,
        page: assPage,
        pageSize: assPageSize,
      },
    ],
    queryFn: async () => {
      if (!selectedWorkplace?.id) {
        return {
          data: [],
          meta: { total: 0, page: assPage, pageSize: assPageSize },
        };
      }

      const raw = (await fetchAssignments({
        workplaceId: selectedWorkplace.id,
        page: assPage,
        pageSize: assPageSize,
      })) as AssignmentsApiResponse;

      if (!Array.isArray((raw as any).data) && Array.isArray((raw as any).items)) {
        const r = raw as any;
        return {
          data: r.items ?? [],
          meta: {
            total: r.total ?? (r.items?.length ?? 0),
            page: r.page ?? assPage,
            pageSize: r.pageSize ?? assPageSize,
          },
        };
      }

      return raw as PaginatedResponse<Assignment>;
    },
    enabled: isAdmin && assignmentsModalOpen && !!selectedWorkplace?.id,
    keepPreviousData: true,
  });

  const columns: ColumnsType<Workplace> = useMemo(
    () => [
      {
        title: t('workplaces.code'),
        dataIndex: 'code',
        key: 'code',
      },
      {
        title: t('workplaces.title'),
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: t('workplaces.status'),
        dataIndex: 'isActive',
        key: 'isActive',
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'default'}>
            {value ? t('common.active') : t('common.inactive')}
          </Tag>
        ),
      },
      {
        title: t('workplaces.actions'),
        key: 'actions',
        render: (_value, record) => (
          <Space size="small">
            <Button
              type="link"
              onClick={(e) => {
                e.stopPropagation();
                openAssignmentsModal(record);
              }}
            >
              {t('common.open', 'Открыть')} <RightOutlined />
            </Button>

            <Button
              type="link"
              onClick={(e) => {
                e.stopPropagation();
                setEditingWorkplace(record);
                form.setFieldsValue({
                  code: record.code,
                  name: record.name,
                  isActive: record.isActive,
                  color: (record as any).color,
                });
                setIsModalOpen(true);
              }}
            >
              {t('common.edit')}
            </Button>

            <Button
              type="link"
              danger
              onClick={(e) => {
                e.stopPropagation();
                Modal.confirm({
                  title: t('workplaces.deleteConfirmTitle'),
                  content: t('workplaces.deleteConfirmDescription', {
                    code: record.code,
                  }),
                  okText: t('common.yes'),
                  cancelText: t('common.cancel'),
                  okButtonProps: { danger: true },
                  onOk: () => deleteMutation.mutateAsync(record.id),
                });
              }}
            >
              {t('common.delete')}
            </Button>
          </Space>
        ),
      },
    ],
    [form, deleteMutation, t],
  );

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (!orgId) {
        message.error(t('workplaces.orgRequired'));
        return;
      }

      if (editingWorkplace) {
        await updateMutation.mutateAsync({
          id: editingWorkplace.id,
          values,
        });
      } else {
        await createMutation.mutateAsync({
          orgId,
          ...values,
        });
      }
    } catch (error) {
      if (error instanceof Error) console.error(error);
    }
  };

  if (!isAdmin) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  if (!orgId) {
    return (
      <Card>
        <Typography.Text>{t('workplaces.noOrg')}</Typography.Text>
      </Card>
    );
  }

  const pagination = workplacesQuery.data?.meta;

  const assignmentColumns: ColumnsType<Assignment> = useMemo(
    () => [
      {
        title: t('assignments.employee', 'Сотрудник'),
        key: 'user',
        render: (_: unknown, row: Assignment) =>
          row.user?.fullName ?? row.user?.email ?? t('common.notSet', '—'),
      },
      {
        title: t('assignments.period', 'Период'),
        key: 'period',
        render: (_: unknown, row: Assignment) => {
          const { from, to } = getPeriodFromShiftsOrAssignment(row);

          if (!from && !to) return t('common.notSet', '—');
          if (from && to) return `${from} — ${to}`;
          return from || to;
        },
      },
      {
        title: t('assignments.statusLabel', 'Статус'),
        dataIndex: 'status',
        key: 'status',
        render: (value: string) => (
          <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>
            {value === 'ACTIVE'
              ? t('common.active', 'Активно')
              : t('common.inactive', 'Неактивно')}
          </Tag>
        ),
      },
      {
        title: t('assignments.shifts', 'Смены'),
        key: 'shifts',
        render: (_: unknown, row: Assignment) => {
          const shifts = Array.isArray(row.shifts) ? row.shifts : [];
          if (shifts.length === 0) return '—';

          const sorted = [...shifts].sort(
            (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
          );

          const totalHours = sorted.reduce((sum, s) => sum + getShiftHours(s), 0);

          const popContent = (
            <div style={{ width: 520 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <Typography.Text strong>
                  {t('assignments.shifts', 'Смены')}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {sorted.length} дн. · {formatHours(totalHours)}
                </Typography.Text>
              </div>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: 'auto',
                  paddingRight: 14, // чтобы скролл не залезал на текст/часы
                }}
              >
                {sorted.map((s) => {
                  const d = dayjs(s.date);
                  const start = s.startsAt ? dayjs(s.startsAt).format('HH:mm') : '—';
                  const end = s.endsAt ? dayjs(s.endsAt).format('HH:mm') : '—';
                  const h = getShiftHours(s);

                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        padding: '4px 0',
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <Typography.Text>
                        {d.isValid() ? d.format('DD.MM.YYYY') : '—'} — {start}–{end}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                        {formatHours(h)}
                      </Typography.Text>
                    </div>
                  );
                })}
              </div>
            </div>
          );

          return (
            <Popover
              placement="rightTop"
              content={popContent}
              trigger="hover"
              mouseEnterDelay={0.1}
              overlayInnerStyle={{
                padding: 12,
                borderRadius: 10,
              }}
            >
              <Typography.Text style={{ cursor: 'pointer' }}>
                {sorted.length} дн. / {formatHours(totalHours)}
              </Typography.Text>
            </Popover>
          );
        },
      },
    ],
    [t],
  );

  const assignmentsData = assignmentsQuery.data?.data ?? [];
  const assignmentsMeta = assignmentsQuery.data?.meta;

  return (
    <Card
      title={t('workplaces.manageTitle')}
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder={t('workplaces.searchPlaceholder')}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            style={{ width: 220 }}
          />
          <Select
            value={statusFilter}
            onChange={(value: 'all' | 'active' | 'inactive') => {
              setStatusFilter(value);
              setPage(1);
            }}
            options={[
              { value: 'all', label: t('workplaces.filters.all') },
              { value: 'active', label: t('workplaces.filters.active') },
              { value: 'inactive', label: t('workplaces.filters.inactive') },
            ]}
            style={{ width: 160 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ isActive: true });
              setEditingWorkplace(null);
              setIsModalOpen(true);
            }}
          >
            {t('workplaces.add')}
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={workplacesQuery.data?.data ?? []}
        loading={workplacesQuery.isLoading}
        pagination={{
          current: page,
          pageSize,
          total: pagination?.total ?? 0,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize ?? pageSize);
          },
          showSizeChanger: true,
        }}
        onRow={(record) => ({
          onClick: (e) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.closest('button') || target.closest('a')) return;
            openAssignmentsModal(record);
          },
        })}
      />

      <Modal
        title={editingWorkplace ? t('workplaces.editTitle') : t('workplaces.createTitle')}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingWorkplace(null);
          form.resetFields();
        }}
        onOk={handleModalOk}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('workplaces.code')}
            name="code"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('workplaces.title')}
            name="name"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('workplaces.color')} name="color">
            <Input type="color" />
          </Form.Item>
          <Form.Item
            label={t('workplaces.status')}
            name="isActive"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch
              checkedChildren={t('common.active')}
              unCheckedChildren={t('common.inactive')}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          selectedWorkplace
            ? `${t('workplaces.title', 'Рабочее место')}: ${selectedWorkplace.code}${
                selectedWorkplace.name ? ` — ${selectedWorkplace.name}` : ''
              }`
            : t('workplaces.title', 'Рабочее место')
        }
        open={assignmentsModalOpen}
        onCancel={() => {
          setAssignmentsModalOpen(false);
          setSelectedWorkplace(null);
        }}
        footer={null}
        width={920}
        destroyOnClose
      >
        {assignmentsQuery.isLoading ? (
          <Flex justify="center" className="py-8">
            <Spin />
          </Flex>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary">
                {t('assignments.listForWorkplace', 'Назначения на это рабочее место')}
              </Typography.Text>
            </div>

            <Table
              rowKey="id"
              columns={assignmentColumns}
              dataSource={assignmentsData}
              loading={assignmentsQuery.isFetching}
              pagination={{
                current: assPage,
                pageSize: assPageSize,
                total: assignmentsMeta?.total ?? 0,
                onChange: (nextPage, nextSize) => {
                  setAssPage(nextPage);
                  setAssPageSize(nextSize ?? assPageSize);
                },
                showSizeChanger: true,
              }}
            />
          </>
        )}
      </Modal>
    </Card>
  );
};

export default WorkplacesPage;