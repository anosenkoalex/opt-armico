import axios from 'axios';

type JwtPayload = {
  sub: string;
  email: string;
  orgId: string;
  role: string;
};

type LoginRequest = {
  email: string;
  password: string;
};

type LoginResponse = {
  accessToken: string;
};

export type Org = {
  id: string;
  name: string;
  timezone: string;
};

export type Workplace = {
  id: string;
  orgId: string;
  name: string;
  address: string;
  capacity: number;
  latitude?: number | null;
  longitude?: number | null;
};

export type Assignment = {
  id: string;
  orgId: string;
  userId: string;
  workplaceId: string;
  startsAt: string;
  endsAt: string;
  workplace?: Workplace;
  user?: {
    id: string;
    email: string;
  };
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

export const login = async (payload: LoginRequest) => {
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data.accessToken;
};

export const fetchWorkplaces = async () => {
  const { data } = await api.get<Workplace[]>('/workplaces');
  return data;
};

export const fetchAssignments = async () => {
  const { data } = await api.get<Assignment[]>('/assignments');
  return data;
};

export const fetchCurrentWorkplace = async () => {
  const { data } = await api.get<Assignment | null>('/me/current-workplace');
  return data;
};

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(window.atob(payload));
    return decoded as JwtPayload;
  } catch (error) {
    console.warn('Failed to decode token', error);
    return null;
  }
};

export default api;
