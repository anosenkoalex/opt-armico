import {
  Button,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';
import {
  createUser,
  deleteUser,
  fetchUsers,
  updateUser,
  type User,
  type UserRole,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const roleOptions: UserRole[] = ['USER', 'SUPER_ADMIN'];

const UsersPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const isAdmin = user?.role === 'SUPER_ADMIN';

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const handleRequestError = (error: unknown) => {
    const axiosError = error as AxiosError<{ message?: string }>;
    message.error(axiosError.response?.data?.message ?? t('common.error'));
  };

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(t('users.created'));
      setIsModalOpen(false);
      setEditingUser(null);
      form.resetFields();
    },
    onError: handleRequestError,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Parameters<typeof updateUser>[1];
    }) => updateUser(id, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(t('users.updated'));
      setIsModalOpen(false);
      setEditingUser(null);
      form.resetFields();
    },
    onError: handleRequestError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(t('users.deleted'));
    },
    onError: handleRequestError,
  });

  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: roleOptions[0] });
    setIsModalOpen(true);
  };

  const openEditModal = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      fullName: record.fullName ?? '',
      email: record.email,
      role: record.role,
      password: undefined,
    });
    setIsModalOpen(true);
  };

  const confirmDelete = (record: User) => {
    Modal.confirm({
      title: t('users.deleteConfirmTitle'),
      content: t('users.deleteConfirmDescription', {
        name: record.fullName ?? record.email,
      }),
      okText: t('common.yes'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(record.id),
    });
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        role: values.role as UserRole,
      };

      if (editingUser) {
        const updatePayload: Parameters<typeof updateUser>[1] = {
          fullName: payload.fullName,
          email: payload.email,
          role: payload.role,
        };

        if (values.password) {
          updatePayload.password = values.password;
        }

        await updateMutation.mutateAsync({
          id: editingUser.id,
          values: updatePayload,
        });
      } else {
        await createMutation.mutateAsync({
          ...payload,
          password: values.password,
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
      }
    }
  };

  const columns: ColumnsType<User & { key: string }> = useMemo(
    () => [
      {
        title: t('users.fullName'),
        dataIndex: 'fullName',
        key: 'fullName',
        render: (_value, record) => record.fullName ?? '—',
      },
      {
        title: t('users.email'),
        dataIndex: 'email',
        key: 'email',
      },
      {
        title: t('users.role'),
        dataIndex: 'role',
        key: 'role',
        render: (value: User['role']) => t(`users.roles.${value}` as const),
      },
      {
        title: t('users.actions'),
        key: 'actions',
        render: (_value, record) => (
          <Space size="small">
            <Button type="link" onClick={() => openEditModal(record)}>
              {t('common.edit')}
            </Button>
            <Button type="link" danger onClick={() => confirmDelete(record)}>
              {t('common.delete')}
            </Button>
          </Space>
        ),
      },
    ],
    [confirmDelete, openEditModal, t],
  );

  if (!isAdmin) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Typography.Title level={3} className="!mb-0">
          {t('users.title')}
        </Typography.Title>
        <Button type="primary" onClick={openCreateModal}>
          {t('users.createAction')}
        </Button>
      </div>
      <Table
        rowKey={(record) => record.id}
        loading={usersQuery.isLoading}
        dataSource={(usersQuery.data ?? []).map((item) => ({ ...item, key: item.id }))}
        columns={columns}
      />

      <Modal
        title={editingUser ? t('users.editTitle') : t('users.createTitle')}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingUser(null);
          form.resetFields();
        }}
        onOk={handleModalOk}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="fullName"
            label={t('users.fullName')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('users.email')}
            rules={[
              { required: true, message: t('common.required') },
              { type: 'email', message: t('users.email') },
            ]}
          >
            <Input type="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('login.password')}
            rules={
              editingUser
                ? []
                : [{ required: true, message: t('common.required') }]
            }
          >
            <Input.Password
              placeholder={
                editingUser ? t('users.passwordPlaceholder') : undefined
              }
            />
          </Form.Item>
          <Form.Item
            name="role"
            label={t('users.role')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              options={roleOptions.map((role) => ({
                label: t(`users.roles.${role}` as const),
                value: role,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersPage;
