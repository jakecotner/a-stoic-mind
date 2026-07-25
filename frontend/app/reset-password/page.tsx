"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { resetPassword } from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const buttonCls =
  "w-full rounded-lg bg-foreground py-2 font-medium text-background hover:opacity-85 disabled:opacity-50";

// The reset email links here as /reset-password?token=... (the backend's
// on_after_forgot_password builds the URL from PUBLIC_BASE_URL).
function ResetForm() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token)
    return (
      <p className="text-sm opacity-75">
        This page needs the link from a password-reset email.{" "}
        <Link href="/login" className="underline">
          Request one here
        </Link>
        .
      </p>
    );

  if (done)
    return (
      <p className="text-sm opacity-75">
        Password updated.{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>{" "}
        with the new one.
      </p>
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          await resetPassword(token, password);
          setDone(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        className={inputCls}
        type="password"
        placeholder="New password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
        autoFocus
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button className={buttonCls} disabled={busy}>
        {busy ? "…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      {/* useSearchParams requires a Suspense boundary during prerender */}
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
