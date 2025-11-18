import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Result,
  Select,
  Typography,
  message,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { createUser, sendUserPassword, type UserRole } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

const roleOptions: UserRole[] = ['USER', 'MANAGER'];

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
        initialValues={{ role: roleOptions[0], sendPassword: false }}
        onFinish={async (values: {
          fullName?: string;
          email: string;
          phone?: string;
          password?: string;
          role: UserRole;
          sendPassword?: boolean;
        }) => {
          try {
            const created = await mutation.mutateAsync({
              fullName: values.fullName?.trim() || undefined,
              email: values.email.trim(),
              password: values.password || undefined, // пустой → бэкенд сам генерит
              role: values.role,
              phone: values.phone?.trim() || undefined,
            });

            if (values.sendPassword && created?.id) {
              await sendUserPassword(created.id);
            }
          } catch (e) {
            // ошибки уже обработаны в onError
          }
        }}
      >
        <Form.Item name="fullName" label={t('users.fullName')}>
          <Input />
        </Form.Item>

        <Form.Item
          name="email"
          label={t('users.email')}
          rules={[
            { required: true, message: t('common.required') },
            { type: 'email', message: t('users.validation.email') },
          ]}
        >
          <Input type="email" />
        </Form.Item>

        <Form.Item name="phone" label={t('users.phone')}>
          <Input placeholder={t('users.phonePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('users.password')}
          extra={t('users.passwordPlaceholder')}
        >
          <Input.Password />
        </Form.Item>

        <Form.Item
          name="sendPassword"
          valuePropName="checked"
        >
          <Checkbox>{t('users.sendPasswordOnCreate')}</Checkbox>
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