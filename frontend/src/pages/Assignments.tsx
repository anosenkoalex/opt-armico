import {
  Button,
  Card,
  DatePicker,
  Form,
  Modal,
  Result,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';
import {
  Assignment,
  AssignmentStatus,
  PaginatedResponse,
  User,
  Workplace,
  createAssignment,
  fetchAssignments,
  fetchUsers,
  fetchWorkplaces,
  notifyAssignment,
  updateAssignment,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const statusOptions: AssignmentStatus[] = ['ACTIVE', 'ARCHIVED'];

const AssignmentsPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filters, setFilters] = useState<{
    userId?: string;
    workplaceId?: string;
    status?: AssignmentStatus;
    range?: [Dayjs, Dayjs];
  }>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(
    null,
  );
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const isAdmin = user?.role === 'SUPER_ADMIN';

  const assignmentsQuery = useQuery<PaginatedResponse<Assignment>>({
    queryKey: [
      'assignments',
      {
        ...filters,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      fetchAssignments({
        userId: filters.userId,
        workplaceId: filters.workplaceId,
        status: filters.status,
        from: filters.range?.[0]?.toISOString(),
        to: filters.range?.[1]?.toISOString(),
        page,
        pageSize,
      }),
    keepPreviousData: true,
    enabled: isAdmin,
  });

  const usersQuery = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const workplacesQuery = useQuery<PaginatedResponse<Workplace>>({
    queryKey: ['workplaces', 'options'],
    queryFn: () => fetchWorkplaces({ page: 1, pageSize: 100, isActive: true }),
    enabled: isAdmin,
  });

  const handleAssignmentError = (error: unknown) => {
    const axiosError = error as AxiosError<{ message?: string | string[] }>;
    const msg = axiosError?.response?.data?.message;

    if (typeof msg === 'string') {
      const normalized = msg.toLowerCase();

      if (normalized.includes('overlap') || normalized.includes('пересек')) {
        message.error(t('assignments.overlapError'));
        return;
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

  const createMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('assignments.created'));
      setIsModalOpen(false);
      setEditingAssignment(null);
      form.resetFields();
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
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
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      message.success(t('assignments.updated'));
      setIsModalOpen(false);
      setEditingAssignment(null);
      form.resetFields();
    },
    onError: (error: unknown) => {
      handleAssignmentError(error);
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

  const columns: ColumnsType<Assignment> = useMemo(
    () => [
      {
        title: t('assignments.user'),
        dataIndex: ['user', 'email'],
        key: 'user',
        render: (_value: unknown, record: Assignment) =>
          record.user?.fullName ?? record.user?.email ?? t('assignments.user'),
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
          <Typography.Text>
            {dayjs(record.startsAt).format('DD.MM.YYYY HH:mm')} →{' '}
            {record.endsAt
              ? dayjs(record.endsAt).format('DD.MM.YYYY HH:mm')
              : t('dashboard.openEnded')}
          </Typography.Text>
        ),
      },
      {
        title: t('assignments.status.title'),
        dataIndex: 'status',
        key: 'status',
        render: (value: AssignmentStatus) => (
          <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>
            {value === 'ACTIVE'
              ? t('assignments.status.active')
              : t('assignments.status.archived')}
          </Tag>
        ),
      },
      {
        title: t('workplaces.actions'),
        key: 'actions',
        render: (_value, record) => {
          const canNotify =
            record.status === 'ACTIVE' && Boolean(record.user?.email);

          return (
            <Space size="small">
              <Button
                type="link"
                onClick={() => {
                  setEditingAssignment(record);
                  form.setFieldsValue({
                    userId: record.userId,
                    workplaceId: record.workplaceId,
                    status: record.status,
                    period: [
                      dayjs(record.startsAt),
                      record.endsAt ? dayjs(record.endsAt) : null,
                    ],
                    isOpenEnded: !record.endsAt,
                  });
                  setIsModalOpen(true);
                }}
              >
                {t('common.edit')}
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
            </Space>
          );
        },
      },
    ],
    [
      form,
      notifyMutation,
      notifyingId,
      setEditingAssignment,
      setIsModalOpen,
      t,
    ],
  );

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const period = values.period as [Dayjs | null, Dayjs | null] | undefined;

      if (!period || !period[0]) {
        message.error(t('assignments.validation.startRequired'));
        return;
      }

      const [start, end] = period;
      const isOpenEnded = values.isOpenEnded as boolean | undefined;

      if (!isOpenEnded && !end) {
        message.error(t('assignments.validation.endRequired'));
        return;
      }

      const payload = {
        userId: values.userId,
        workplaceId: values.workplaceId,
        startsAt: start.toISOString(),
        endsAt: isOpenEnded ? null : end ? end.toISOString() : null,
        status: values.status,
      };

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

  const pagination = assignmentsQuery.data?.meta;

  if (!isAdmin) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  return (
    <Card
      title={t('assignments.manageTitle')}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ status: 'ACTIVE', isOpenEnded: false });
            setEditingAssignment(null);
            setIsModalOpen(true);
          }}
        >
          {t('assignments.add')}
        </Button>
      }
    >
      <Form
        layout="inline"
        className="mb-4"
        onValuesChange={(changedValues, allValues) => {
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
            options={
              usersQuery.data?.map((item) => ({
                value: item.id,
                label: `${item.fullName ?? item.email} (${item.email})`,
              })) ?? []
            }
            placeholder={t('assignments.filters.user')}
            loading={usersQuery.isLoading}
            optionFilterProp="label"
            style={{ width: 240 }}
          />
        </Form.Item>
        <Form.Item name="workplaceId" label={t('assignments.workplace')}>
          <Select
            allowClear
            showSearch
            options={
              workplacesQuery.data?.data.map((item) => ({
                value: item.id,
                label: `${item.code} — ${item.name}`,
              })) ?? []
            }
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

      <Table
        rowKey="id"
        dataSource={assignmentsQuery.data?.data ?? []}
        columns={columns}
        loading={assignmentsQuery.isLoading}
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
      />

      <Modal
        title={
          editingAssignment
            ? t('assignments.editTitle')
            : t('assignments.createTitle')
        }
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingAssignment(null);
          form.resetFields();
        }}
        onOk={handleModalOk}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('assignments.user')}
            name="userId"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              showSearch
              options={
                usersQuery.data?.map((item) => ({
                  value: item.id,
                  label: `${item.fullName ?? item.email} (${item.email})`,
                })) ?? []
              }
              optionFilterProp="label"
              placeholder={t('assignments.filters.user')}
            />
          </Form.Item>
          <Form.Item
            label={t('assignments.workplace')}
            name="workplaceId"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              showSearch
              options={
                workplacesQuery.data?.data.map((item) => ({
                  value: item.id,
                  label: `${item.code} — ${item.name}`,
                })) ?? []
              }
              optionFilterProp="label"
              placeholder={t('assignments.filters.workplace')}
            />
          </Form.Item>
          <Form.Item
            label={t('assignments.status.title')}
            name="status"
            initialValue="ACTIVE"
          >
            <Select
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
            name="period"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <DatePicker.RangePicker showTime format="DD.MM.YYYY HH:mm" />
          </Form.Item>
          <Form.Item
            label={t('assignments.openEnded')}
            name="isOpenEnded"
            valuePropName="checked"
            initialValue={false}
          >
            <Switch
              checkedChildren={t('common.yes')}
              unCheckedChildren={t('common.no')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AssignmentsPage;
