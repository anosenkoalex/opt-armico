import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { decodeToken } from '../api/client.js';

type AuthUser = ReturnType<typeof decodeToken>;

type AuthContextValue = {
  token: string | null;
  user: AuthUser;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem('armico_token');
  });

  const user = useMemo<AuthUser>(() => {
    if (!token || typeof window === 'undefined') {
      return null;
    }

    return decodeToken(token);
  }, [token]);

  const login = useCallback((newToken: string) => {
    setToken(newToken);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('armico_token', newToken);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('armico_token');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = () => logout();

    window.addEventListener('armico:unauthorized', handler);
    return () => {
      window.removeEventListener('armico:unauthorized', handler);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      logout,
    }),
    [token, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
