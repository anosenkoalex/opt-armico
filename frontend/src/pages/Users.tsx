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
  Checkbox,
  Tag,
  Spin,
  Flex,
  Popover,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AxiosError } from 'axios';
import {
  PaginatedResponse,
  User,
  UserRole,
  createUser,
  deleteUser,
  fetchUsers,
  updateUser,
  sendUserPassword,
  fetchAssignments,
  type Assignment,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

type UsersQueryResult = PaginatedResponse<User>;

// Только обычные роли, системные (SUPER_ADMIN) в списке не показываем
const roleOptions: UserRole[] = ['USER', 'MANAGER'];

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

const UsersPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{
    role?: UserRole;
    search?: string;
  }>({});
  const [form] = Form.useForm();

  const isAdmin = user?.role === 'SUPER_ADMIN';

  // ====== MODAL: назначения по сотруднику ======
  const [assignmentsModalOpen, setAssignmentsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Pick<User, 'id' | 'email' | 'fullName'> | null>(null);
  const [assPage, setAssPage] = useState(1);
  const [assPageSize, setAssPageSize] = useState(10);

  const usersQuery = useQuery<UsersQueryResult>({
    queryKey: ['users', { page, pageSize, ...filters }],
    queryFn: () =>
      fetchUsers({
        page,
        pageSize,
        role: filters.role,
        search: filters.search,
      }),
    enabled: isAdmin,
    keepPreviousData: true,
  });

  // Список сотрудников для отображения:
  // скрываем всех SUPER_ADMIN (админ и dev)
  const visibleUsers = useMemo(
    () =>
      (usersQuery.data?.data ?? []).filter(
        (item) => item.role !== 'SUPER_ADMIN',
      ),
    [usersQuery.data],
  );

  const handleUserError = (error: unknown) => {
    const axiosError = error as AxiosError<{ message?: string | string[] }>;
    const msg = axiosError?.response?.data?.message;

    if (typeof msg === 'string') {
      message.error(msg);
      return;
    }

    if (Array.isArray(msg)) {
      message.error(msg.join('\n'));
      return;
    }

    message.error((msg as any) ?? t('common.error'));
  };

  const createMutation = useMutation({
    mutationFn: createUser,
    onError: (error: unknown) => {
      handleUserError(error);
    },
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
    onError: (error: unknown) => {
      handleUserError(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(t('users.deleted'));
    },
    onError: (error: unknown) => {
      handleUserError(error);
    },
  });

  const sendPasswordMutation = useMutation({
    mutationFn: (id: string) => sendUserPassword(id),
    onSuccess: () => {
      message.success(t('users.sendPasswordSuccess'));
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

      message.error(t('users.sendPasswordError'));
    },
  });

  // ====== query: назначения выбранного сотрудника ======
  const userAssignmentsQuery = useQuery<PaginatedResponse<Assignment>>({
    queryKey: [
      'user-assignments',
      { userId: selectedUser?.id ?? null, page: assPage, pageSize: assPageSize },
    ],
    queryFn: async () => {
      if (!selectedUser?.id) {
        return {
          data: [],
          meta: { total: 0, page: assPage, pageSize: assPageSize },
        };
      }

      const raw = (await fetchAssignments({
        userId: selectedUser.id,
        page: assPage,
        pageSize: assPageSize,
      })) as AssignmentsApiResponse;

      // нормализация items -> data/meta
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
    enabled: isAdmin && assignmentsModalOpen && !!selectedUser?.id,
    keepPreviousData: true,
  });

  const columns: ColumnsType<User> = useMemo(
    () => [
      {
        title: t('users.fullName'),
        dataIndex: 'fullName',
        key: 'fullName',
        render: (value: string | null | undefined, record: User) =>
          value || record.email || t('users.noName'),
      },
      {
        title: t('users.email'),
        dataIndex: 'email',
        key: 'email',
      },
      {
        title: t('users.phone'),
        dataIndex: 'phone',
        key: 'phone',
        render: (value: string | null | undefined) => value ?? '—',
      },
      {
        title: t('users.role'),
        dataIndex: 'role',
        key: 'role',
        render: (value: UserRole) =>
          value === 'MANAGER'
            ? t('users.roles.manager')
            : value === 'USER'
              ? t('users.roles.user')
              : t('users.roles.superAdmin'),
      },
      {
        title: t('users.actions'),
        key: 'actions',
        render: (_value, record) => (
          <Space size="small">
            <Button
              type="link"
              onClick={(e) => {
                e.stopPropagation();
                setEditingUser(record);
                form.setFieldsValue({
                  fullName: record.fullName,
                  email: record.email,
                  role: record.role,
                  phone: (record as any).phone,
                });
                setIsModalOpen(true);
              }}
            >
              {t('common.edit')}
            </Button>

            <Button
              type="link"
              onClick={(e) => {
                e.stopPropagation();
                sendPasswordMutation.mutate(record.id);
              }}
            >
              {t('users.sendPassword')}
            </Button>

            <Button
              type="link"
              danger
              onClick={(e) => {
                e.stopPropagation();
                Modal.confirm({
                  title: t('users.deleteConfirmTitle'),
                  content: t('users.deleteConfirmDescription', {
                    name: record.fullName || record.email,
                  }),
                  okText: t('common.delete'),
                  cancelText: t('common.cancel'),
                  centered: true,
                  onOk: () => deleteMutation.mutate(record.id),
                });
              }}
            >
              {t('common.delete')}
            </Button>
          </Space>
        ),
      },
    ],
    [t, deleteMutation, form, sendPasswordMutation],
  );

  const assignmentColumns: ColumnsType<Assignment> = useMemo(
    () => [
      {
        title: t('workplaces.title', 'Рабочее место'),
        key: 'workplace',
        render: (_: unknown, row: Assignment) => {
          const w = row.workplace;
          if (!w) return '—';
          return `${w.code}${w.name ? ` — ${w.name}` : ''}`;
        },
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
              : t('assignments.archived', 'Архив')}
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

          const content = (
            <div style={{ width: 540 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <Typography.Text strong>{t('assignments.shifts', 'Смены')}</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 12, whiteSpace: 'nowrap' }}>
                  {sorted.length} {t('common.days', 'дн.')} · {formatHours(totalHours)}
                </Typography.Text>
              </div>

              <div style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 16 }}>
                {sorted.map((s: any) => {
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
                        padding: '6px 0',
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
              content={content}
              trigger="hover"
              mouseEnterDelay={0.1}
              overlayStyle={{ maxWidth: 600 }}
            >
              <Typography.Text style={{ cursor: 'pointer' }}>
                {sorted.length} {t('common.days', 'дн.')} / {formatHours(totalHours)}
              </Typography.Text>
            </Popover>
          );
        },
      },
    ],
    [t],
  );

  const pagination = usersQuery.data?.meta;

  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'USER', sendPasswordOnCreate: false });
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (editingUser) {
        // Редактирование пользователя — пароль не трогаем
        await updateMutation.mutateAsync({
          id: editingUser.id,
          values: {
            fullName: values.fullName,
            email: values.email,
            role: values.role,
            phone: values.phone,
          },
        });
      } else {
        // Создание пользователя
        const sendPasswordOnCreate = Boolean(values.sendPasswordOnCreate);

        const created = await createMutation.mutateAsync({
          fullName: values.fullName,
          email: values.email,
          // если пароль пустой — не отправляем, бэкенд сам сгенерирует
          password: values.password || undefined,
          role: values.role,
          phone: values.phone,
        });

        // Обновляем список
        void queryClient.invalidateQueries({ queryKey: ['users'] });
        message.success(t('users.created'));

        // Если стоит галочка "Отправить пароль" — сразу шлём пароль
        if (sendPasswordOnCreate && created?.id) {
          await sendPasswordMutation.mutateAsync(created.id).catch(() => {
            // Ошибка уже обработана в sendPasswordMutation.onError
          });
        }

        setIsModalOpen(false);
        setEditingUser(null);
        form.resetFields();
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

      <Form
        layout="inline"
        className="mb-4"
        onValuesChange={(_changedValues, allValues) => {
          setFilters({
            role: allValues.role,
            search: allValues.search,
          });
          setPage(1);
        }}
      >
        <Form.Item name="role" label={t('users.role')}>
          <Select
            allowClear
            options={roleOptions.map((value) => ({
              value,
              label:
                value === 'MANAGER'
                  ? t('users.roles.manager')
                  : t('users.roles.user'),
            }))}
            style={{ width: 220 }}
          />
        </Form.Item>
        <Form.Item name="search" label={t('users.search')}>
          <Input.Search allowClear style={{ width: 260 }} />
        </Form.Item>
      </Form>

      <Table
        rowKey={(record) => record.id}
        loading={usersQuery.isLoading}
        dataSource={visibleUsers}
        columns={columns}
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

            setSelectedUser({ id: record.id, email: record.email, fullName: record.fullName });
            setAssPage(1);
            setAssPageSize(10);
            setAssignmentsModalOpen(true);
          },
        })}
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
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item label={t('users.fullName')} name="fullName">
            <Input />
          </Form.Item>

          <Form.Item
            label={t('users.email')}
            name="email"
            rules={[
              { required: true, message: t('common.required') },
              { type: 'email', message: t('users.validation.email') },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item label={t('users.phone')} name="phone">
            <Input placeholder={t('users.phonePlaceholder')} />
          </Form.Item>

          {!editingUser && (
            <>
              <Form.Item
                label={t('users.password')}
                name="password"
                rules={[]}
                extra={t('users.passwordPlaceholder')}
              >
                <Input.Password />
              </Form.Item>

              <Form.Item name="sendPasswordOnCreate" valuePropName="checked">
                <Checkbox>{t('users.sendPassword')}</Checkbox>
              </Form.Item>
            </>
          )}

          <Form.Item
            label={t('users.role')}
            name="role"
            rules={[{ required: true, message: t('common.required') }]}
            initialValue="USER"
          >
            <Select
              options={roleOptions.map((value) => ({
                value,
                label:
                  value === 'MANAGER'
                    ? t('users.roles.manager')
                    : t('users.roles.user'),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ====== MODAL: назначения сотрудника ====== */}
      <Modal
        title={
          selectedUser
            ? `${t('users.fullName', 'Сотрудник')}: ${selectedUser.fullName ?? selectedUser.email}`
            : t('users.fullName', 'Сотрудник')
        }
        open={assignmentsModalOpen}
        onCancel={() => {
          setAssignmentsModalOpen(false);
          setSelectedUser(null);
        }}
        footer={null}
        width={980}
        destroyOnClose
      >
        {userAssignmentsQuery.isLoading ? (
          <Flex justify="center" className="py-8">
            <Spin />
          </Flex>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary">
                {t('assignments.listForUser', 'Назначения сотрудника')}
              </Typography.Text>
            </div>

            <Table
              rowKey="id"
              columns={assignmentColumns}
              dataSource={userAssignmentsQuery.data?.data ?? []}
              loading={userAssignmentsQuery.isFetching}
              pagination={{
                current: assPage,
                pageSize: assPageSize,
                total: userAssignmentsQuery.data?.meta.total ?? 0,
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
    </div>
  );
};

export default UsersPage;
//opt/armico/frontend/src/pages/Users.tsx