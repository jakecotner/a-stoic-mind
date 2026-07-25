"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMe, type AuthUser } from "./api";

/** Client-side session state. `user` is null while loading AND when signed
    out — check `loading` before treating null as signed-out (e.g. before
    redirecting to /login). */
export function useUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await fetchMe());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, loading, refresh };
}
