import axios from 'axios';

export type UserRole = 'USER' | 'SUPER_ADMIN';

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
  createdAt: string;
  updatedAt: string;
  org?: Org;
};

export type AssignmentStatus = 'ACTIVE' | 'ARCHIVED';

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
  workplace?: Pick<Workplace, 'id' | 'code' | 'name' | 'location'>;
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
  workplace?: { id: string; code: string; name: string };
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
  workplace: Pick<Workplace, 'id' | 'code' | 'name' | 'location'> | null;
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
  workplace?: { id: string; code: string; name: string; location?: string | null } | null;
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

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
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

export const login = async (payload: LoginPayload) => {
  const { data } = await api.post<AuthResponse>('/auth/login', payload);
  return data.accessToken;
};

export const fetchMeProfile = async () => {
  const { data } = await api.get<MeProfile>('/me');
  return data;
};

export const fetchCurrentWorkplace = async () => {
  const { data } = await api.get<CurrentWorkplaceResponse>(
    '/me/current-workplace',
  );
  return data;
};

export const fetchNotifications = async (take = 10) => {
  const { data } = await api.get<Notification[]>(`/notifications/me`, {
    params: { take },
  });
  return data;
};

export const fetchAdminFeed = async (params?: {
  take?: number;
  userId?: string;
  orgId?: string;
}) => {
  const { data } = await api.get<FeedItem[]>(`/feed/admin`, {
    params,
  });
  return data;
};

export const fetchRecentFeed = async (params?: { take?: number; orgId?: string }) => {
  const { data } = await api.get<FeedItem[]>(`/feed/recent`, {
    params,
  });
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

export const fetchOrgs = async () => {
  const { data } = await api.get<Org[]>('/orgs');
  return data;
};

export const createWorkplace = async (payload: {
  orgId: string;
  code: string;
  name: string;
  location?: string;
  isActive?: boolean;
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
  }>,
) => {
  const { data } = await api.patch<Workplace>(`/workplaces/${id}`, payload);
  return data;
};

export const deleteWorkplace = async (id: string) => {
  await api.delete(`/workplaces/${id}`);
};

export const fetchAssignments = async (params: {
  userId?: string;
  workplaceId?: string;
  status?: AssignmentStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) => {
  const { data } = await api.get<PaginatedResponse<Assignment>>(
    '/assignments',
    {
      params,
    },
  );
  return data;
};

export const createAssignment = async (payload: {
  userId: string;
  workplaceId: string;
  startsAt: string;
  endsAt?: string | null;
  status?: AssignmentStatus;
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
  }>,
) => {
  const { data } = await api.patch<Assignment>(`/assignments/${id}`, payload);
  return data;
};

export const notifyAssignment = async (id: string) => {
  await api.post(`/assignments/${id}/notify`);
};

export const fetchUsers = async () => {
  const { data } = await api.get<User[]>('/users');
  return data;
};

export const createUser = async (payload: {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}) => {
  const { data } = await api.post<User>('/users', payload);
  return data;
};

export const updateUser = async (
  id: string,
  payload: Partial<{ fullName: string; email: string; password: string; role: UserRole }>,
) => {
  const { data } = await api.patch<User>(`/users/${id}`, payload);
  return data;
};

export const deleteUser = async (id: string) => {
  await api.delete(`/users/${id}`);
};

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
  const { data } = await api.get<PlannerMatrixResponse>('/planner/matrix', {
    params,
  });
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

export const fetchMySchedule = async () => {
  const { data } = await api.get<Slot[]>('/me/schedule');
  return data;
};

export const confirmMySlot = async (slotId: string) => {
  const { data } = await api.patch<Slot>(`/me/slots/${slotId}/confirm`, {});
  return data;
};

export const requestSlotSwap = async (slotId: string, payload: { comment: string }) => {
  const { data } = await api.post<Slot>(`/me/slots/${slotId}/request-swap`, payload);
  return data;
};

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    const decoded = JSON.parse(atob(payload));
    return decoded as JwtPayload;
  } catch (error) {
    console.warn('Failed to decode token', error);
    return null;
  }
};

export default api;
