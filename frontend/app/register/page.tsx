"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, register } from "@/lib/api";
import { useUser } from "@/lib/useUser";

const inputCls =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const buttonCls =
  "w-full rounded-lg bg-foreground py-2 font-medium text-background hover:opacity-85 disabled:opacity-50";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(email, password);
      await login(email, password);
      await refresh();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Create your account</h1>
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
        <input
          className={inputCls}
          type="password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={buttonCls} disabled={busy}>
          {busy ? "…" : "Create account"}
        </button>
      </form>
      <p className="text-sm opacity-75">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
