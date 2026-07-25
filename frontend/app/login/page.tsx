"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { forgotPassword, login } from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const buttonCls =
  "w-full rounded-lg bg-foreground py-2 font-medium text-background hover:opacity-85 disabled:opacity-50";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (forgotMode) {
        await forgotPassword(email);
        setResetSent(true);
      } else {
        await login(email, password);
        router.push("/chat");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">
        {forgotMode ? "Reset your password" : "Sign in"}
      </h1>
      {resetSent ? (
        <p className="text-sm opacity-75">
          If an account exists for {email}, a reset link is on its way. Check
          your inbox.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input
            className={inputCls}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          {!forgotMode && (
            <input
              className={inputCls}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button className={buttonCls} disabled={busy}>
            {busy ? "…" : forgotMode ? "Send reset link" : "Sign in"}
          </button>
        </form>
      )}
      <div className="flex flex-col gap-1 text-sm opacity-75">
        <button
          className="self-start hover:underline"
          onClick={() => {
            setForgotMode(!forgotMode);
            setResetSent(false);
            setError(null);
          }}
        >
          {forgotMode ? "Back to sign in" : "Forgot your password?"}
        </button>
        <p>
          No account?{" "}
          <Link href="/register" className="underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
