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
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';
import {
  PaginatedResponse,
  Workplace,
  createWorkplace,
  fetchWorkplaces,
  updateWorkplace,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const WorkplacesPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkplace, setEditingWorkplace] = useState<Workplace | null>(
    null,
  );
  const [form] = Form.useForm();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
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
          <Button
            type="link"
            onClick={() => {
              setEditingWorkplace(record);
              form.setFieldsValue({
                code: record.code,
                name: record.name,
                isActive: record.isActive,
              });
              setIsModalOpen(true);
            }}
          >
            {t('common.edit')}
          </Button>
        ),
      },
    ],
    [t],
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
      if (error instanceof Error) {
        console.error(error);
      }
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
      />

      <Modal
        title={
          editingWorkplace
            ? t('workplaces.editTitle')
            : t('workplaces.createTitle')
        }
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
    </Card>
  );
};

export default WorkplacesPage;
