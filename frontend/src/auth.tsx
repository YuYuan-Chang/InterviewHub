import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getTokens, setTokens } from './api';
import type { Profile } from './types';

interface RegisterInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
  school: string;
  targetRoles: string[];
}

interface AuthContextValue {
  me: Profile | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): void;
  reloadMe(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function reloadMe() {
    if (!getTokens()) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Profile>('/api/users/me'));
    } catch {
      setMe(null);
    }
  }

  useEffect(() => {
    reloadMe().finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api<{ accessToken: string; refreshToken: string }>('/api/auth/login', {
      body: { email, password },
    });
    setTokens(res);
    await reloadMe();
  }

  async function register(input: RegisterInput) {
    const res = await api<{ accessToken: string; refreshToken: string }>('/api/auth/register', {
      body: input,
    });
    setTokens(res);
    await reloadMe();
  }

  function logout() {
    const tokens = getTokens();
    if (tokens) void api('/api/auth/logout', { body: { refreshToken: tokens.refreshToken } }).catch(() => {});
    setTokens(null);
    setMe(null);
  }

  return (
    <AuthContext.Provider value={{ me, loading, login, register, logout, reloadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
