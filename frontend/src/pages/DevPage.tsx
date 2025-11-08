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

  const [loadingSms, setLoadingSms] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [testingSms, setTestingSms] = useState(false);

  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState<DevLogsState | null>(null);

  const [backupLoading, setBackupLoading] = useState(false);

  const isAllowed =
    user &&
    (user.email === 'dev@armico.local' || user.role === 'SUPER_ADMIN');

  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

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

  useEffect(() => {
    if (!isAllowed) return;
    void loadSmsSettings();
  }, [isAllowed]); // плагина react-hooks может не быть, правило не используется

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
          Эта страница доступна только для developer / SUPER_ADMIN аккаунта.
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
