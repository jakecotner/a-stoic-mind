// Session state for the whole app: restores the stored token on launch,
// exposes the signed-in user plus signIn/signUp/signOut. The root layout
// renders the sign-in screen or the app based on `user`.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { fetchMe, login, logout, register, type AuthUser } from '@/lib/api';

type AuthState = {
  /** undefined while restoring the session on launch. */
  user: AuthUser | null | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setUser(await fetchMe());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    await login(email, password);
    setUser(await fetchMe());
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await register(email, password);
    setUser(await fetchMe());
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
