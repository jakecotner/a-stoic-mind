"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchMe, type AuthUser } from "./api";

type UserState = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const UserContext = createContext<UserState | null>(null);

/** Single client-side session state, mounted once in the root layout. All
    `useUser()` consumers share it, so a `refresh()` after login/logout
    updates every component at once (the Header persists across client-side
    navigations and would otherwise keep a stale signed-out state). */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await fetchMe());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ user, loading, refresh }), [user, loading, refresh]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/** Client-side session state. `user` is null while loading AND when signed
    out — check `loading` before treating null as signed-out (e.g. before
    redirecting to /login). */
export function useUser(): UserState {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}
