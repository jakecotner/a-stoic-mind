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
import type { BillingSummary } from "./types";

interface AuthState {
  /** null = signed out; undefined = still restoring the session. */
  user: AuthUser | null | undefined;
  /** Plan summary for the signed-in user (null while signed out/loading). */
  billing: BillingSummary | null;
  /** Uncapped account (Plus or superuser): Plus features are available.
      Mobile never sells the plan (App Store rules) — it only reflects it. */
  isPlus: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  registerAndSignIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Permanently delete the account and all of its data. */
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  // Restore the session from the stored token on launch.
  useEffect(() => {
    api
      .fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // Plan follows the session (signed out → null).
  useEffect(() => {
    let cancelled = false;
    const summary = user ? api.fetchBillingSummary() : Promise.resolve(null);
    summary.then((b) => {
      if (!cancelled) setBilling(b);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        billing,
        isPlus: billing !== null && billing.reflections === null,
        signIn,
        registerAndSignIn,
        signOut,
        deleteAccount,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
