"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deleteAccount,
  fetchBillingSummary,
  logout,
  openBillingPortal,
  startCheckout,
  type BillingSummary,
} from "@/lib/api";
import { useUser } from "@/lib/useUser";

const buttonCls =
  "rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";

export default function AccountPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) void fetchBillingSummary().then(setBilling);
  }, [user]);

  if (loading || !user) return null;

  const act = (fn: () => Promise<void>) => async () => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-12">
      <section>
        <h1 className="mb-1 text-2xl font-semibold">Account</h1>
        <p className="text-sm opacity-70">{user.email}</p>
      </section>

      <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
        <h2 className="mb-3 font-medium">Plan</h2>
        {billing === null ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : billing.tier === "plus" ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <span className="font-medium">Plus</span>
              {billing.renews_at &&
                (billing.cancel_at_period_end
                  ? ` — ends ${billing.renews_at}`
                  : ` — renews ${billing.renews_at}`)}
            </p>
            <button className={buttonCls} disabled={busy} onClick={act(openBillingPortal)}>
              Manage billing
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Free plan
              {billing.turns &&
                ` — ${billing.turns.used} of ${billing.turns.limit} turns used this month`}
            </p>
            <div className="flex gap-3">
              <button
                className={buttonCls}
                disabled={busy}
                onClick={act(() => startCheckout("annual"))}
              >
                Upgrade — annual
              </button>
              <button
                className={buttonCls}
                disabled={busy}
                onClick={act(() => startCheckout("monthly"))}
              >
                Upgrade — monthly
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col items-start gap-3">
        <button
          className={buttonCls}
          onClick={act(async () => {
            await logout();
            router.push("/");
            router.refresh();
          })}
        >
          Sign out
        </button>
        <button
          className={`${buttonCls} border-red-600/40 text-red-600 hover:bg-red-600/5 dark:text-red-400`}
          disabled={busy}
          onClick={act(async () => {
            if (
              !window.confirm(
                "Delete your account and all its data? This cannot be undone.",
              )
            )
              return;
            await deleteAccount();
            router.push("/");
            router.refresh();
          })}
        >
          Delete account
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>
    </div>
  );
}
