import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import * as api from "./api";
import type { AuthUser } from "./api";

interface AuthState {
  /** null = signed out; undefined = still restoring the session. */
  user: AuthUser | null | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  registerAndSignIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  // Restore the session from the stored token on launch.
  useEffect(() => {
    api
      .fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    setUser(await api.fetchMe());
  }, []);

  const registerAndSignIn = useCallback(
    async (email: string, password: string) => {
      await api.register(email, password);
      await api.login(email, password);
      setUser(await api.fetchMe());
    },
    [],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, signIn, registerAndSignIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
