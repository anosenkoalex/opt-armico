import { Card, Form, Input, Button, message } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';

const Login = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login: authenticate } = useAuth();

  const { mutateAsync, isPending } = useMutation({
    mutationFn: authenticate,
  });

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      await mutateAsync(values);
      message.success(t('login.submit'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      message.error(t('common.error'));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <Card title={t('login.title')} className="w-full max-w-md shadow-md">
        <Form
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ email: 'admin@armico.local' }}
        >
          <Form.Item
            label={t('login.email')}
            name="email"
            rules={[{ required: true, message: t('login.email') }]}
          >
            <Input type="email" autoComplete="email" />
          </Form.Item>

          <Form.Item
            label={t('login.password')}
            name="password"
            rules={[{ required: true, message: t('login.password') }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={isPending}>
              {t('login.submit')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
