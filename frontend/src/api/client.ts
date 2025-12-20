import axios from 'axios';

export type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

export type JwtPayload = {
  sub: string;
  email: string;
  orgId: string | null;
  role: UserRole;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthResponse = {
  accessToken: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
};

export type Org = {
  id: string;
  name: string;
  slug: string;
};

export type Workplace = {
  id: string;
  orgId: string;
  code: string;
  name: string;
  location?: string | null;
  isActive: boolean;
  /** цвет для планировщика, HEX/rgba/название */
  color?: string | null;
  createdAt: string;
  updatedAt: string;
  org?: Org;
};

export type AssignmentStatus = 'ACTIVE' | 'ARCHIVED';

/**
 * Тип смены
 */
export type ShiftKind = 'DEFAULT' | 'OFFICE' | 'REMOTE' | 'DAY_OFF';

export type ScheduleAdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Статус запроса на назначение */
export type AssignmentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type AssignmentShift = {
  id: string;
  assignmentId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  kind: ShiftKind;
  createdAt: string;
  updatedAt: string;
};

export type AssignmentShiftInput = {
  date: string;
  startsAt: string;
  endsAt: string;
  kind?: ShiftKind;
};

export type Assignment = {
  id: string;
  userId: string;
  workplaceId: string;
  startsAt: string;
  endsAt: string | null;
  status: AssignmentStatus;
  user?: {
    id: string;
    email: string;
    fullName?: string | null;
  };
  workplace?: Pick<Workplace, 'id' | 'code' | 'name' | 'location' | 'color'>;
  shifts?: AssignmentShift[];
};

export type ScheduleAdjustment = {
  id: string;
  assignmentId: string;
  userId: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  kind: ShiftKind;
  comment: string | null;
  status: ScheduleAdjustmentStatus;
  managerComment?: string | null;
  createdAt: string;
  updatedAt: string;
  assignment?:
    | {
        id: string;
        workplace?: { id: string; code: string; name: string } | null;
        user?: Pick<User, 'id' | 'email' | 'fullName'> | null;
      }
    | null;
  user?: Pick<User, 'id' | 'email' | 'fullName'> | null;
};

/** Запрос на назначение (то, что будет отправлять сотрудник) */
export type AssignmentRequest = {
  id: string;

  /** orgId из backend (может отсутствовать на старых ответах) */
  orgId?: string;

  /** новый каноничный id автора запроса */
  requesterId?: string;

  /** @deprecated legacy-алиас для requesterId (старый фронт) */
  userId?: string;

  workplaceId: string | null;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD

  /** интервалы/слоты по дням (backend хранит Json) */
  slots?: unknown;

  comment?: string | null;
  status: AssignmentRequestStatus;

  decidedById?: string | null;
  decidedAt?: string | null;
  decisionComment?: string | null;

  assignmentId?: string | null;

  createdAt: string;
  updatedAt: string;

  /** backend обычно возвращает requester; оставляем оба поля для совместимости */
  requester?: Pick<User, 'id' | 'email' | 'fullName'> | null;
  user?: Pick<User, 'id' | 'email' | 'fullName'> | null;

  decidedBy?: Pick<User, 'id' | 'email' | 'fullName'> | null;

  workplace?: Pick<Workplace, 'id' | 'code' | 'name' | 'location' | 'color'> | null;
};

/** DTO для отправки запроса на назначение с MyPlace */
export type CreateAssignmentRequestDto = {
  workplaceId?: string | null;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  /** интервалы по дням (backend принимает Json) */
  slots?: unknown;
  comment?: string | null;
};

/** Отчёт по фактически отработанным часам */
export type WorkReport = {
  id: string;
  userId: string;
  workplaceId: string;
  /** Дата отчёта в формате YYYY-MM-DD */
  date: string;
  /** Количество отработанных часов */
  hours: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: Pick<User, 'id' | 'email' | 'fullName' | 'position'> | null;
  workplace?: Pick<Workplace, 'id' | 'code' | 'name' | 'location' | 'color'> | null;
};

/** DTO для создания отчёта по часам от текущего пользователя */
export type CreateWorkReportDto = {
  /** Дата отчёта в формате YYYY-MM-DD */
  date: string;
  /** Рабочее место, к которому относится отчёт */
  workplaceId: string;
  /** Количество отработанных часов за день */
  hours: number;
  /** Необязательный комментарий сотрудника */
  comment?: string | null;
};

export type NotificationType =
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_UPDATED'
  | 'ASSIGNMENT_MOVED'
  | 'ASSIGNMENT_CANCELLED';

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt?: string | null;
};

export type FeedItemAction = 'created' | 'updated' | 'cancelled';

export type FeedItemMeta = {
  id: string;
  action: FeedItemAction;
  user?: Pick<User, 'id' | 'email' | 'fullName' | 'position'> | null;
  workplace?: { id: string; code: string; name: string; color?: string | null };
  org?: { id: string; name: string; slug: string } | null;
  period?: { from: string; to: string | null };
  status?: AssignmentStatus;
  code?: string;
  name?: string;
  isActive?: boolean;
};

export type FeedItem = {
  title: string;
  type: 'assignment' | 'workplace';
  at: string;
  meta: FeedItemMeta;
};

export type PlanStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type SlotStatus = 'PLANNED' | 'CONFIRMED' | 'REPLACED' | 'CANCELLED';

export type Plan = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
};

export type Slot = {
  id: string;
  planId: string;
  orgId: string;
  userId: string;
  dateStart: string;
  dateEnd: string;
  status: SlotStatus;
  colorCode?: string | null;
  note?: string | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  plan?: Pick<Plan, 'id' | 'name' | 'status'>;
  org?: { id: string; name: string; slug: string };
  user?: Pick<User, 'id' | 'email' | 'fullName' | 'position'>;
};

export type User = {
  id: string;
  email: string;
  fullName?: string | null;
  position?: string | null;
  role: UserRole;
  phone?: string | null;
  orgId: string | null;
  org?: Org | null;
  createdAt?: string;
};

export type MeProfile = {
  id: string;
  email: string;
  fullName: string | null;
  position: string | null;
  role: UserRole;
  org: Org | null;
};

export type CurrentWorkplaceResponse = {
  workplace: Pick<Workplace, 'id' | 'code' | 'name' | 'location' | 'color'> | null;
  assignment: Assignment | null;
  history: Assignment[];
};

export type PlannerMatrixSlot = {
  id: string;
  from: string;
  to: string | null;
  code: string;
  name: string;
  status: AssignmentStatus;
  user?: Pick<User, 'id' | 'email' | 'fullName' | 'position'> | null;
  org?: Pick<Org, 'id' | 'name' | 'slug'> | null;
  workplace?:
    | {
        id: string;
        code: string;
        name: string;
        location?: string | null;
        color?: string | null;
      }
    | null;
};

export type PlannerMatrixRow = {
  key: string;
  title: string;
  subtitle?: string;
  slots: PlannerMatrixSlot[];
};

export type PlannerMatrixResponse = {
  mode: 'byUsers' | 'byWorkplaces';
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  rows: PlannerMatrixRow[];
};

/* -------------------- API INSTANCE -------------------- */

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') {
    return config;
  }
  const token = window.localStorage.getItem('armico_token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('armico_token');
      window.dispatchEvent(new Event('armico:unauthorized'));
    }
    return Promise.reject(error);
  },
);

/* -------------------- AUTH -------------------- */

export const login = async (payload: LoginPayload) => {
  const { data } = await api.post<AuthResponse>('/auth/login', payload);
  return data.accessToken;
};

export const fetchMeProfile = async () => {
  const { data } = await api.get<MeProfile>('/me');
  return data;
};

/* ✅ текущая точка /me/current-workplace */
export const fetchCurrentWorkplace = async () => {
  const { data } = await api.get<CurrentWorkplaceResponse>('/me/current-workplace');
  return data;
};

/* -------------------- NOTIFICATIONS -------------------- */

export const fetchNotifications = async (take = 10) => {
  const resp = await api.get(`/notifications/me`, {
    params: { take },
  });

  const raw = resp.data;

  if (Array.isArray(raw)) {
    return raw as Notification[];
  }

  if (Array.isArray(raw?.data)) {
    return raw.data as Notification[];
  }

  if (Array.isArray(raw?.items)) {
    return raw.items as Notification[];
  }

  return [] as Notification[];
};

/* -------------------- ORGS & WORKPLACES -------------------- */

export const fetchAdminFeed = async (params?: { take?: number; userId?: string; orgId?: string }) => {
  const { data } = await api.get<FeedItem[]>(`/feed/admin`, { params });
  return data;
};

export const fetchRecentFeed = async (params?: { take?: number; orgId?: string }) => {
  const { data } = await api.get<FeedItem[]>(`/feed/recent`, { params });
  return data;
};

export const fetchWorkplaces = async (params: {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}) => {
  const { data } = await api.get<PaginatedResponse<Workplace>>('/workplaces', {
    params,
  });
  return data;
};

export const createWorkplace = async (payload: {
  orgId: string;
  code: string;
  name: string;
  location?: string;
  isActive?: boolean;
  color?: string | null;
}) => {
  const { data } = await api.post<Workplace>('/workplaces', payload);
  return data;
};

export const updateWorkplace = async (
  id: string,
  payload: Partial<{
    orgId: string;
    code: string;
    name: string;
    location?: string;
    isActive?: boolean;
    color?: string | null;
  }>,
) => {
  const { data } = await api.patch<Workplace>(`/workplaces/${id}`, payload);
  return data;
};

export const deleteWorkplace = async (id: string) => {
  await api.delete(`/workplaces/${id}`);
};

export const fetchOrgs = async () => {
  const { data } = await api.get<Org[]>('/orgs');
  return data;
};

/* -------------------- ASSIGNMENTS -------------------- */

export const fetchAssignments = async (params: {
  userId?: string;
  workplaceId?: string;
  status?: AssignmentStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) => {
  const { data } = await api.get<
    | PaginatedResponse<Assignment>
    | {
        items: Assignment[];
        total: number;
        page: number;
        pageSize: number;
      }
  >('/assignments', { params });
  return data;
};

export const createAssignment = async (payload: {
  userId: string;
  workplaceId: string;
  startsAt: string;
  endsAt?: string | null;
  status?: AssignmentStatus;
  shifts: AssignmentShiftInput[];
}) => {
  const { data } = await api.post<Assignment>('/assignments', payload);
  return data;
};

export const updateAssignment = async (
  id: string,
  payload: Partial<{
    userId: string;
    workplaceId: string;
    startsAt: string;
    endsAt: string | null;
    status: AssignmentStatus;
    shifts: AssignmentShiftInput[];
  }>,
) => {
  const { data } = await api.patch<Assignment>(`/assignments/${id}`, payload);
  return data;
};

export const notifyAssignment = async (id: string) => {
  await api.post(`/assignments/${id}/notify`);
};

export const completeAssignment = async (id: string) => {
  const { data } = await api.post<Assignment>(`/assignments/${id}/complete`);
  return data;
};

export const deleteAssignment = async (id: string) => {
  await api.delete(`/assignments/${id}`);
};

export const restoreAssignment = async (id: string) => {
  const { data } = await api.post<Assignment>(`/assignments/${id}/restore`);
  return data;
};

export const fetchAssignmentsFromTrash = async (params: {
  userId?: string;
  workplaceId?: string;
  status?: AssignmentStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) => {
  const { data } = await api.get<
    | PaginatedResponse<Assignment>
    | {
        items: Assignment[];
        total: number;
        page: number;
        pageSize: number;
      }
  >('/assignments/trash', { params });
  return data;
};



export type UserAssignmentsSummary = {
  id: string;
  fullName: string | null;
  email: string;
  assignmentsCount: number;
};

/**
 * 📊 Краткая статистика по сотрудникам:
 * Backend: GET /assignments/users-summary
 */
export const fetchUsersAssignmentsSummary = async (params?: { orgId?: string }) => {
  const { data } = await api.get<UserAssignmentsSummary[]>('/assignments/users-summary', {
    params,
  });
  return data;
};

/* -------------------- TRASH OPERATIONS -------------------- */

export const exportTrashAssignments = async (ids: string[]) => {
  const response = await api.post(
    '/assignments/trash/export',
    { ids },
    {
      responseType: 'blob',
    },
  );

  return response.data as Blob;
};

export const hardDeleteTrashAssignments = async (ids: string[]) => {
  const { data } = await api.post<{ deletedCount: number }>('/assignments/trash/delete', { ids });
  return data;
};

export const exportAndHardDeleteTrashAssignments = async (ids: string[]) => {
  const response = await api.post(
    '/assignments/trash/export-and-delete',
    { ids },
    {
      responseType: 'blob',
    },
  );

  return response.data as Blob;
};

/* -------------------- USERS -------------------- */

export const fetchUsers = async (params: {
  page?: number;
  pageSize?: number;
  role?: UserRole;
  search?: string;
}) => {
  const page = params.page ?? 1;
  const requestedPageSize = params.pageSize ?? 50;
  const safePageSize = Math.min(requestedPageSize, 100);

  const { data } = await api.get<PaginatedResponse<User>>('/users', {
    params: {
      page,
      pageSize: safePageSize,
      role: params.role,
      search: params.search,
    },
  });
  return data;
};

export const createUser = async (payload: {
  fullName?: string;
  email: string;
  password?: string;
  role?: UserRole;
  phone?: string;
}) => {
  const { data } = await api.post<User & { rawPassword?: string }>('/users', payload);
  return data;
};

export const updateUser = async (
  id: string,
  payload: Partial<{
    fullName: string;
    email: string;
    password: string;
    role: UserRole;
    phone: string;
  }>,
) => {
  const { data } = await api.patch<User>(`/users/${id}`, payload);
  return data;
};

export const deleteUser = async (id: string) => {
  await api.delete(`/users/${id}`);
};

export const sendUserPassword = async (id: string) => {
  await api.post(`/users/${id}/send-password`);
};

/* -------------------- PLANNER MATRIX -------------------- */

export const fetchPlannerMatrix = async (params: {
  mode?: 'byUsers' | 'byWorkplaces';
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
  userId?: string;
  orgId?: string;
  status?: AssignmentStatus;
}) => {
  const { data } = await api.get<PlannerMatrixResponse>('/planner/matrix', { params });
  return data;
};

export const fetchMyPlannerMatrix = async (params: {
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
  status?: AssignmentStatus;
}) => {
  const { data } = await api.get<PlannerMatrixResponse>('/planner/my-matrix', { params });
  return data;
};

export const downloadPlannerExcel = async (params: {
  from: string;
  to: string;
  mode: 'workplaces' | 'users';
  status?: AssignmentStatus;
  userId?: string;
  orgId?: string;
}) => {
  const response = await api.get<Blob>('/planner/export', {
    params,
    responseType: 'blob',
  });

  return response.data;
};



export type FetchMyWorkReportsParams = {
  /** Начало периода (включительно) в формате YYYY-MM-DD */
  from?: string;
  /** Конец периода (включительно) в формате YYYY-MM-DD */
  to?: string;
  /** Опциональное рабочее место, если нужно фильтровать отчёты по нему */
  workplaceId?: string;
};

export type FetchWorkReportsParams = {
  /** Начало периода (включительно) в формате YYYY-MM-DD */
  from?: string;
  /** Конец периода (включительно) в формате YYYY-MM-DD */
  to?: string;
  /** Пользователь, для которого нужно получить отчёты (для админов/менеджеров) */
  userId?: string;
  /** Рабочее место, по которому фильтруются отчёты */
  workplaceId?: string;
};

/* -------------------- WORK REPORTS -------------------- */

/**
 * Создать отчёт по отработанным часам от текущего пользователя.
 * Backend: POST /me/work-reports
 */
export const createMyWorkReport = async (payload: CreateWorkReportDto) => {
  const normalized: CreateWorkReportDto = {
    ...payload,
    comment: payload.comment ?? null,
  };

  const { data } = await api.post<WorkReport>('/me/work-reports', normalized);
  return data;
};

/**
 * Получить отчёты по часам для текущего пользователя.
 * Backend: GET /me/work-reports?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export const fetchMyWorkReports = async (params?: FetchMyWorkReportsParams) => {
  const search = new URLSearchParams();

  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.workplaceId) search.set('workplaceId', params.workplaceId);

  const qs = search.toString();
  const url = qs ? `/me/work-reports?${qs}` : '/me/work-reports';

  const { data } = await api.get<WorkReport[]>(url);
  return data;
};

/**
 * Получить отчёты по часам для любого пользователя (для админов/менеджеров).
 * Backend: GET /work-reports?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=...&workplaceId=...
 */
export const fetchWorkReports = async (params?: FetchWorkReportsParams) => {
  const search = new URLSearchParams();

  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.userId) search.set('userId', params.userId);
  if (params?.workplaceId) search.set('workplaceId', params.workplaceId);

  const qs = search.toString();
  const url = qs ? `/work-reports?${qs}` : '/work-reports';

  const { data } = await api.get<WorkReport[]>(url);
  return data;
};

/* -------------------- MY SCHEDULE -------------------- */

export const fetchMySchedule = async () => {
  const { data } = await api.get<{ assignments: Assignment[]; slots: Slot[] }>('/me/schedule');
  return data;
};

export const confirmMySlot = async (slotId: string) => {
  const { data } = await api.patch<Slot>(`/me/slots/${slotId}/confirm`, {});
  return data;
};

export const requestSlotAdjustment = async (slotId: string, payload: { comment: string }) => {
  const { data } = await api.post<Slot>(`/me/slots/${slotId}/request-swap`, payload);
  return data;
};

export const requestSlotSwap = requestSlotAdjustment;

export const requestAssignmentAdjustment = async (
  assignmentId: string,
  payload: { comment: string },
) => {
  const { data } = await api.post<ScheduleAdjustment>(
    `/me/assignments/${assignmentId}/request-adjustment`,
    payload,
  );
  return data;
};

export const requestAssignmentScheduleAdjustment = async (
  assignmentId: string,
  payload: {
    date: string;
    startsAt?: string;
    endsAt?: string;
    kind?: ShiftKind;
    comment: string;
  },
) => {
  const { data } = await api.post<ScheduleAdjustment>(
    `/assignments/${assignmentId}/adjustments`,
    payload,
  );
  return data;
};

/* -------------------- ASSIGNMENT REQUESTS -------------------- */

/**
 * Создать запрос назначения (от текущего пользователя).
 * Backend: POST /assignments/requests (или /assignments/request)
 */
export const requestAssignment = async (payload: CreateAssignmentRequestDto) => {
  const normalized = {
    ...payload,
    comment: payload.comment ?? null,
  };

  const { data } = await api.post<AssignmentRequest>('/assignments/requests', normalized);
  return data;
};

/**
 * Список запросов (для админа/менеджера).
 * Backend: GET /assignments/requests
 *
 * Примечание: раньше фронт мог слать userId — маппим его в requesterId.
 */
export const fetchAssignmentRequests = async (params?: {
  page?: number;
  pageSize?: number;
  status?: AssignmentRequestStatus;
  requesterId?: string;
  /** legacy */
  userId?: string;
  workplaceId?: string;
  orgId?: string;
}) => {
  const { userId, requesterId, ...rest } = params ?? {};
  const mappedParams = {
    ...rest,
    requesterId: requesterId ?? userId,
  };

  const resp = await api.get<any>('/assignments/requests', { params: mappedParams });

  const raw = resp.data;

  // поддержка разных форматов на всякий случай
  if (raw?.data && raw?.meta) {
    return raw as PaginatedResponse<AssignmentRequest>;
  }
  if (Array.isArray(raw?.items)) {
    return {
      data: raw.items as AssignmentRequest[],
      meta: {
        total: raw.total ?? raw.items.length,
        page: raw.page ?? 1,
        pageSize: raw.pageSize ?? raw.items.length,
      },
    } as PaginatedResponse<AssignmentRequest>;
  }

  // fallback
  return {
    data: Array.isArray(raw) ? (raw as AssignmentRequest[]) : [],
    meta: { total: Array.isArray(raw) ? raw.length : 0, page: 1, pageSize: Array.isArray(raw) ? raw.length : 0 },
  } as PaginatedResponse<AssignmentRequest>;
};

/** Одобрить запрос: POST /assignments/requests/:id/approve */
export const approveAssignmentRequest = async (
  requestId: string,
  payload?: { decisionComment?: string },
) => {
  const { data } = await api.post<AssignmentRequest>(
    `/assignments/requests/${requestId}/approve`,
    payload ?? {},
  );
  return data;
};

/** Отклонить запрос: POST /assignments/requests/:id/reject */
export const rejectAssignmentRequest = async (
  requestId: string,
  payload?: { decisionComment?: string },
) => {
  const { data } = await api.post<AssignmentRequest>(
    `/assignments/requests/${requestId}/reject`,
    payload ?? {},
  );
  return data;
};

/* -------------------- ADJUSTMENTS -------------------- */

export const fetchScheduleAdjustments = async (params: {
  page?: number;
  pageSize?: number;
  status?: ScheduleAdjustmentStatus;
  userId?: string;
  assignmentId?: string;
}) => {
  const resp = await api.get<any>('/assignments/adjustments', { params });

  const raw = resp.data;
  let items: ScheduleAdjustment[] = [];

  if (Array.isArray(raw?.items)) {
    items = raw.items as ScheduleAdjustment[];
  } else if (Array.isArray(raw?.data)) {
    items = raw.data as ScheduleAdjustment[];
  } else if (Array.isArray(raw)) {
    items = raw as ScheduleAdjustment[];
  }

  const page = raw?.page ?? raw?.meta?.page ?? params.page ?? 1;
  const pageSize = raw?.pageSize ?? raw?.meta?.pageSize ?? params.pageSize ?? items.length;
  const total = raw?.total ?? raw?.meta?.total ?? (Array.isArray(items) ? items.length : 0);

  return {
    items,
    total,
    page,
    pageSize,
    data: items,
    meta: {
      total,
      page,
      pageSize,
    },
  };
};

export const approveScheduleAdjustment = async (
  adjustmentId: string,
  payload?: { managerComment?: string },
) => {
  const { data } = await api.post<ScheduleAdjustment>(
    `/assignments/adjustments/${adjustmentId}/approve`,
    payload ?? {},
  );
  return data;
};

export const rejectScheduleAdjustment = async (
  adjustmentId: string,
  payload?: { managerComment?: string },
) => {
  const { data } = await api.post<ScheduleAdjustment>(
    `/assignments/adjustments/${adjustmentId}/reject`,
    payload ?? {},
  );
  return data;
};

/* -------------------- TOKEN -------------------- */

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;

    const decoded = JSON.parse(atob(payload));
    return decoded as JwtPayload;
  } catch (error) {
    console.warn('Failed to decode token', error);
    return null;
  }
};

/* -------------------- STATISTICS (НОВОЕ) -------------------- */

export type StatisticsRow = {
  shiftId: string;
  date: string;
  userId: string;
  userName: string | null;
  workplaceId: string;
  workplaceName: string | null;
  assignmentStatus: AssignmentStatus;
  shiftKind: ShiftKind;
  startsAt: string;
  endsAt: string | null;
  hours: number;
};

export type StatisticsByUser = {
  userId: string;
  userName: string | null;
  totalHours: number;
  /** Суммарные отчётные часы (из WorkReport) */
  reportedHour?: number | null;
  byKind: Record<string, number>;
};

export type StatisticsByWorkplace = {
  workplaceId: string;
  workplaceName: string | null;
  totalHours: number;
};

export type StatisticsResponse = {
  totalShifts: number;
  totalHours: number;
  byUser: StatisticsByUser[];
  byWorkplace: StatisticsByWorkplace[];
  rows: StatisticsRow[];
};

export type FetchStatisticsParams = {
  from: string;
  to: string;
  userId?: string;
  workplaceId?: string;
  assignmentStatuses?: AssignmentStatus[];
  kinds?: ShiftKind[];
};

export async function fetchStatistics(params: FetchStatisticsParams) {
  const search = new URLSearchParams();

  search.set('from', params.from);
  search.set('to', params.to);

  if (params.userId) search.set('userId', params.userId);
  if (params.workplaceId) search.set('workplaceId', params.workplaceId);

  if (params.assignmentStatuses?.length) {
    for (const st of params.assignmentStatuses) {
      search.append('assignmentStatuses', st);
    }
  }

  if (params.kinds?.length) {
    for (const k of params.kinds) {
      search.append('kinds', k);
    }
  }

  const res = await api.get<StatisticsResponse>(`/statistics?${search.toString()}`);
  return res.data;
}

export default api;

/* -------------------- ME / SECURITY -------------------- */

export const changeMyPassword = async (payload: {
  currentPassword: string;
  newPassword: string;
}) => {
  const { data } = await api.patch<{ success: true }>('/me/change-password', payload);
  return data;
};