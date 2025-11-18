import {
  Card,
  Tabs,
  Form,
  Input,
  Switch,
  Button,
  Typography,
  Space,
  List,
  Tag,
  message,
} from 'antd';
import type { TabsProps } from 'antd';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type SmsSettingsForm = {
  enabled: boolean;
  provider?: string | null;
  apiUrl?: string | null;
  apiKey?: string | null;
  sender?: string | null;
  testPhone?: string;
  testText?: string;
};

type EmailSettingsForm = {
  enabled: boolean;
  host?: string | null;
  port?: string | null;
  secure?: boolean;
  user?: string | null;
  password?: string | null;
  from?: string | null;
  testEmail?: string;
};

type DevUserInfo = {
  id: string;
  fullName?: string | null;
  email: string;
};

type DevWorkplaceInfo = {
  id: string;
  code: string;
  name: string;
};

type DevAssignmentLog = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  user?: DevUserInfo | null;
  workplace?: DevWorkplaceInfo | null;
};

type DevNotificationLog = {
  id: string;
  type: string;
  createdAt: string;
  user?: DevUserInfo | null;
};

type DevLogsState = {
  assignments: DevAssignmentLog[];
  notifications: DevNotificationLog[];
};

const DevPage = () => {
  const { user, token } = useAuth();
  const [smsForm] = Form.useForm<SmsSettingsForm>();
  const [emailForm] = Form.useForm<EmailSettingsForm>();

  const [loadingSms, setLoadingSms] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [testingSms, setTestingSms] = useState(false);

  const [loadingEmail, setLoadingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState<DevLogsState | null>(null);

  const [backupLoading, setBackupLoading] = useState(false);

  // доступ только для dev-аккаунта
  const isAllowed = !!user && user.email === 'dev@armico.local';

  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  // ----- SMS settings load -----

  const loadSmsSettings = async () => {
    try {
      setLoadingSms(true);
      const res = await fetch(`${API_URL}/dev/sms-settings`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load SMS settings');
      }

      const data: {
        enabled?: boolean;
        provider?: string | null;
        apiUrl?: string | null;
        apiKey?: string | null;
        sender?: string | null;
      } = await res.json();

      smsForm.setFieldsValue({
        enabled: Boolean(data.enabled),
        provider: data.provider ?? '',
        apiUrl: data.apiUrl ?? '',
        apiKey: data.apiKey ?? '',
        sender: data.sender ?? '',
      });
    } catch (err) {
      console.error(err);
      message.error('Не удалось загрузить SMS-настройки');
    } finally {
      setLoadingSms(false);
    }
  };

  // ----- Email settings load -----

  const loadEmailSettings = async () => {
    try {
      setLoadingEmail(true);
      const res = await fetch(`${API_URL}/dev/email-settings`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });

      if (!res.ok) {
        console.warn('Failed to load email settings', res.status);
        return;
      }

      const data: {
        enabled?: boolean;
        host?: string | null;
        port?: number | string | null;
        secure?: boolean;
        user?: string | null;
        from?: string | null;
      } = await res.json();

      emailForm.setFieldsValue({
        enabled: Boolean(data.enabled),
        host: data.host ?? '',
        port: data.port != null ? String(data.port) : '',
        secure: data.secure ?? true,
        user: data.user ?? '',
        password: '',
        from: data.from ?? '',
      });
    } catch (err) {
      console.error(err);
      message.error('Не удалось загрузить Email-настройки');
    } finally {
      setLoadingEmail(false);
    }
  };

  useEffect(() => {
    if (!isAllowed) return;
    void loadSmsSettings();
    void loadEmailSettings();
  }, [isAllowed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- SMS settings -----

  const handleSmsSave = async (values: SmsSettingsForm) => {
    try {
      setSavingSms(true);
      const res = await fetch(`${API_URL}/dev/sms-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        throw new Error('Failed to save SMS settings');
      }

      message.success('SMS-настройки сохранены');
    } catch (err) {
      console.error(err);
      message.error('Ошибка при сохранении SMS-настроек');
    } finally {
      setSavingSms(false);
    }
  };

  const handleSmsTest = async () => {
    try {
      const values = smsForm.getFieldsValue();
      const phone = values.testPhone;
      const text = values.testText;

      if (!phone) {
        message.warning('Укажи номер телефона для теста');
        return;
      }

      setTestingSms(true);
      const res = await fetch(`${API_URL}/dev/test-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ phone, text }),
      });

      if (!res.ok) {
        throw new Error('Failed to send test SMS');
      }

      message.success('Тестовое SMS отправлено (если шлюз настроен)');
    } catch (err) {
      console.error(err);
      message.error('Ошибка при отправке тестового SMS');
    } finally {
      setTestingSms(false);
    }
  };

  // ----- Email settings -----

  const handleEmailSave = async (values: EmailSettingsForm) => {
    try {
      setSavingEmail(true);

      const payload = {
        enabled: Boolean(values.enabled),
        host: values.host?.trim() || '',
        port: values.port ? Number(values.port) : null,
        secure: Boolean(values.secure),
        user: values.user?.trim() || '',
        password: values.password ?? '',
        from: values.from?.trim() || '',
      };

      const res = await fetch(`${API_URL}/dev/email-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Failed to save email settings');
      }

      message.success('Email-настройки сохранены');
    } catch (err) {
      console.error(err);
      message.error('Ошибка при сохранении Email-настроек');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleEmailTest = async () => {
    try {
      const values = emailForm.getFieldsValue();
      const email = values.testEmail;

      if (!email) {
        message.warning('Укажи email для теста');
        return;
      }

      setTestingEmail(true);
      const res = await fetch(`${API_URL}/dev/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        // пробуем вытащить message из ответа NestJS
        try {
          const data = (await res.json()) as { message?: string };
          if (typeof data?.message === 'string' && data.message.trim()) {
            message.error(data.message);
            return;
          }
        } catch {
          // если не json — идём вниз
        }

        message.error('Ошибка при отправке тестового письма');
        return;
      }

      message.success('Тестовое письмо отправлено (если шлюз настроен)');
    } catch (err) {
      console.error(err);
      message.error('Ошибка при отправке тестового письма');
    } finally {
      setTestingEmail(false);
    }
  };

  // ----- Logs -----

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      const res = await fetch(`${API_URL}/dev/logs`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load logs');
      }

      const data: DevLogsState = await res.json();
      setLogs(data);
    } catch (err) {
      console.error(err);
      message.error('Не удалось загрузить логи');
    } finally {
      setLogsLoading(false);
    }
  };

  // ----- Backup -----

  const handleBackupDownload = async () => {
    try {
      setBackupLoading(true);
      const res = await fetch(`${API_URL}/dev/backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to create backup');
      }

      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');

      link.href = url;
      link.download = `armico-backup-${ts}.json`;
      link.click();

      window.URL.revokeObjectURL(url);
      message.success('Backup выгружен');
    } catch (err) {
      console.error(err);
      message.error('Ошибка при создании backup');
    } finally {
      setBackupLoading(false);
    }
  };

  // ----- Access guard -----

  if (!isAllowed) {
    return (
      <Card>
        <Typography.Title level={3}>Доступ запрещён</Typography.Title>
        <Typography.Paragraph>
          Эта страница доступна только для developer-аккаунта
          (dev@armico.local).
        </Typography.Paragraph>
      </Card>
    );
  }

  // ----- Tabs -----

  const items: TabsProps['items'] = [
    {
      key: 'sms',
      label: 'SMS настройки',
      children: (
        <Card loading={loadingSms}>
          <Form<SmsSettingsForm>
            form={smsForm}
            layout="vertical"
            initialValues={{ enabled: false }}
            onFinish={handleSmsSave}
          >
            <Form.Item
              name="enabled"
              label="Включить SMS-уведомления"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item name="provider" label="Провайдер (для себя)">
              <Input placeholder="Например, sms.ru / nexmo / twilio" />
            </Form.Item>

            <Form.Item name="apiUrl" label="API URL">
              <Input placeholder="Полный URL endpoint-а отправки SMS" />
            </Form.Item>

            <Form.Item name="apiKey" label="API ключ">
              <Input.Password placeholder="Секретный ключ / токен" />
            </Form.Item>

            <Form.Item name="sender" label="Подпись отправителя (sender)">
              <Input placeholder="ARMICO или имя компании" />
            </Form.Item>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Тестовое SMS
            </Typography.Title>

            <Form.Item name="testPhone" label="Телефон для теста">
              <Input placeholder="+7..." />
            </Form.Item>

            <Form.Item name="testText" label="Текст для теста">
              <Input.TextArea
                placeholder="Если не заполнено — отправится дефолтный текст"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </Form.Item>

            <Space>
              <Button type="primary" htmlType="submit" loading={savingSms}>
                Сохранить настройки
              </Button>
              <Button onClick={handleSmsTest} loading={testingSms}>
                Отправить тестовое SMS
              </Button>
            </Space>
          </Form>
        </Card>
      ),
    },
    {
      key: 'email',
      label: 'Email настройки',
      children: (
        <Card loading={loadingEmail}>
          <Form<EmailSettingsForm>
            form={emailForm}
            layout="vertical"
            initialValues={{ enabled: false, secure: true }}
            onFinish={handleEmailSave}
          >
            <Form.Item
              name="enabled"
              label="Включить email-уведомления"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item name="host" label="SMTP host">
              <Input placeholder="smtp.example.com" />
            </Form.Item>

            <Form.Item name="port" label="SMTP порт">
              <Input placeholder="465 / 587" />
            </Form.Item>

            <Form.Item
              name="secure"
              label="Защищённое соединение (TLS/SSL)"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item name="user" label="SMTP пользователь">
              <Input placeholder="smtp-user@example.com" />
            </Form.Item>

            <Form.Item name="password" label="SMTP пароль">
              <Input.Password placeholder="Пароль или токен" />
            </Form.Item>

            <Form.Item name="from" label="Адрес отправителя (From)">
              <Input placeholder="noreply@armico.local" />
            </Form.Item>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Тестовое письмо
            </Typography.Title>

            <Form.Item name="testEmail" label="Email для теста">
              <Input placeholder="test@example.com" />
            </Form.Item>

            <Space>
              <Button type="primary" htmlType="submit" loading={savingEmail}>
                Сохранить настройки
              </Button>
              <Button onClick={handleEmailTest} loading={testingEmail}>
                Отправить тестовое письмо
              </Button>
            </Space>
          </Form>
        </Card>
      ),
    },
    {
      key: 'logs',
      label: 'Логи',
      children: (
        <Card
          extra={
            <Button onClick={loadLogs} loading={logsLoading}>
              Обновить
            </Button>
          }
        >
          {!logs ? (
            <Typography.Text type="secondary">
              Нажми «Обновить», чтобы загрузить последние события.
            </Typography.Text>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div>
                <Typography.Title level={5}>Назначения</Typography.Title>
                <List
                  size="small"
                  dataSource={logs.assignments}
                  locale={{ emptyText: 'Нет назначений' }}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <Typography.Text>
                          <strong>
                            {item.user?.fullName || item.user?.email}
                          </strong>{' '}
                          →{' '}
                          <strong>
                            {item.workplace?.code}{' '}
                            {item.workplace?.name
                              ? `— ${item.workplace.name}`
                              : ''}
                          </strong>
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {new Date(item.startsAt).toLocaleString()} —
                          {item.endsAt
                            ? ` ${new Date(
                                item.endsAt,
                              ).toLocaleString()}`
                            : ' бессрочно'}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Статус: <Tag>{item.status}</Tag>
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>

              <div>
                <Typography.Title level={5}>Уведомления</Typography.Title>
                <List
                  size="small"
                  dataSource={logs.notifications}
                  locale={{ emptyText: 'Нет уведомлений' }}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <Typography.Text>
                          <strong>
                            {item.user?.fullName || item.user?.email}
                          </strong>
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Тип: {item.type}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Время:{' '}
                          {new Date(item.createdAt).toLocaleString()}
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            </Space>
          )}
        </Card>
      ),
    },
    {
      key: 'backup',
      label: 'Бэкапы',
      children: (
        <Card>
          <Typography.Paragraph>
            Здесь можно выгрузить JSON-backup основных таблиц (организация,
            пользователи, рабочие места, назначения, планы, слоты,
            ограничения).
          </Typography.Paragraph>
          <Button
            type="primary"
            onClick={handleBackupDownload}
            loading={backupLoading}
          >
            Скачать backup (JSON)
          </Button>
        </Card>
      ),
    },
  ];

  return (
    <Card>
      <Typography.Title level={3} style={{ marginBottom: 16 }}>
        Developer console
      </Typography.Title>
      <Tabs
        defaultActiveKey="sms"
        items={items}
        onChange={(key) => {
          if (key === 'logs' && !logs) {
            void loadLogs();
          }
        }}
      />
    </Card>
  );
};

export default DevPage;