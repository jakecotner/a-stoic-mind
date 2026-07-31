"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { requestVerifyEmail, verifyEmail } from "@/lib/api";
import { useUser } from "@/lib/useUser";

const buttonCls =
  "w-full rounded-lg bg-foreground py-2 font-medium text-background hover:opacity-85 disabled:opacity-50";

// The verification email links here as /verify?token=... (the backend's
// on_after_request_verify builds the URL from PUBLIC_BASE_URL).
function VerifyResult() {
  const token = useSearchParams().get("token");
  const { user, refresh } = useUser();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // strict mode double-mounts; verify exactly once
    verifyEmail(token)
      .then(async () => {
        await refresh(); // pick up is_verified so the banner disappears
        setState("done");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setState("error");
      });
  }, [token, refresh]);

  if (!token)
    return (
      <p className="text-sm opacity-75">
        This page needs the link from a verification email. Check your inbox —
        or sign in and use the banner to request a new one.
      </p>
    );

  if (state === "working") return <p className="text-sm opacity-75">Verifying…</p>;

  if (state === "done")
    return (
      <p className="text-sm opacity-75">
        Email verified — you&apos;re all set.{" "}
        <Link href={user ? "/" : "/login"} className="underline">
          {user ? "Back to the app" : "Sign in"}
        </Link>
        .
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      {user && !resent && (
        <button
          className={buttonCls}
          onClick={async () => {
            await requestVerifyEmail(user.email);
            setResent(true);
          }}
        >
          Send a new link to {user.email}
        </button>
      )}
      {resent && (
        <p className="text-sm opacity-75">Sent — check your inbox.</p>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      {/* useSearchParams requires a Suspense boundary during prerender */}
      <Suspense>
        <VerifyResult />
      </Suspense>
    </div>
  );
}
