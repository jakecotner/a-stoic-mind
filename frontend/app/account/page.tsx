"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getVoicePref, setVoicePref } from "@/lib/narration";
import {
  deleteAccount,
  fetchBillingSummary,
  fetchVoices,
  logout,
  openBillingPortal,
  startCheckout,
  type BillingSummary,
  type Voice,
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
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicePref, setVoicePrefState] = useState("");

  useEffect(() => {
    if (user) void fetchBillingSummary().then(setBilling);
  }, [user]);

  useEffect(() => {
    setVoicePrefState(getVoicePref());
    void fetchVoices().then(setVoices);
  }, []);

  if (loading) return null;

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

  // Narration is public and the voice is a device preference, so this
  // section serves signed-in and signed-out visitors alike.
  const voiceSection = voices.length > 0 && (
    <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
      <h2 className="mb-1 font-medium">Narration voice</h2>
      <p className="mb-3 text-sm opacity-60">
        The voice that reads passages aloud. Remembered on this device.
        Reading pace is set beside the play button while listening.
      </p>
      <div className="flex flex-col gap-2">
        {voices.map((v) => {
          const defaultId = voices.find((x) => x.default)?.id ?? "";
          const selected = (voicePref || defaultId) === v.id;
          return (
            <label
              key={v.id}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="narration-voice"
                checked={selected}
                onChange={() => {
                  // Choosing the server default clears the preference,
                  // so a future default change follows automatically.
                  const pref = v.id === defaultId ? "" : v.id;
                  setVoicePref(pref);
                  setVoicePrefState(pref);
                }}
              />
              <span className="capitalize">{v.id}</span>
              <span className="opacity-60">— {v.description}</span>
              {v.default && <span className="text-xs opacity-50">(default)</span>}
            </label>
          );
        })}
      </div>
    </section>
  );

  // Signed out, the page says what an account holds and where to get one.
  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-12">
        <section>
          <h1 className="mb-1 text-2xl font-semibold">Account</h1>
          <p className="text-sm opacity-70">
            The texts are free to read — an account keeps what&apos;s yours.
          </p>
        </section>

        <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
          <h2 className="mb-3 font-medium">What an account keeps</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm opacity-80">
            <li>
              A daily journal — each saved entry receives a short Stoic
              reflection.
            </li>
            <li>Margin notes on any passage in the Library.</li>
            <li>
              A practice calendar of your reading, journaling, and sits.
            </li>
            <li>Guided morning and evening practice sessions.</li>
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <Link
              href="/register"
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-85"
            >
              Create an account
            </Link>
            <Link
              href="/login"
              className="text-sm underline opacity-70 hover:opacity-100"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-3 text-xs opacity-50">
            Accounts are free. Plus adds unlimited journal reflections — you
            can upgrade here once signed in.
          </p>
        </section>

        {voiceSection}
      </div>
    );
  }

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
            {/* billing.turns (metered LLM turns) is not shown: nothing
                user-facing is metered since the chat module was removed. */}
            <p>Free plan</p>
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

      {voiceSection}

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
