import { Button, Card, Form, Input, Result, Select, Typography, message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { createUser, type UserRole } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const roleOptions: UserRole[] = ['USER', 'SUPER_ADMIN'];

const UsersCreatePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { user } = useAuth();

  const isAdmin = user?.role === 'SUPER_ADMIN';

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(t('users.created'));
      navigate('/users');
    },
    onError: (error: unknown) => {
      const axiosError = error as AxiosError<{ message?: string }>;
      message.error(axiosError.response?.data?.message ?? t('common.error'));
    },
  });

  if (!isAdmin) {
    return <Result status="403" title={t('admin.accessDenied')} />;
  }

  return (
    <Card>
      <Typography.Title level={3}>{t('users.createTitle')}</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        className="mt-4 max-w-xl"
        initialValues={{ role: roleOptions[0] }}
        onFinish={(values: {
          fullName: string;
          email: string;
          password: string;
          role: UserRole;
        }) => {
          mutation.mutate({
            fullName: values.fullName.trim(),
            email: values.email.trim(),
            password: values.password,
            role: values.role,
          });
        }}
      >
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
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input.Password />
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
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={mutation.isLoading}
          >
            {t('users.createAction')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default UsersCreatePage;
