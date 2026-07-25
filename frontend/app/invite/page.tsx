"use client";

// Invite-acceptance landing (orgs/RBAC module — delete with it). The invite
// email links here as /invite?token=... . Signed out, we park the user at
// sign-in/register; the token stays in the URL, so coming back to the link
// after signing in completes the flow.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { acceptOrgInvite } from "@/lib/api";
import { useUser } from "@/lib/useUser";

function InviteResult() {
  const token = useSearchParams().get("token");
  const { user, loading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || loading || !user || ran.current) return;
    ran.current = true; // strict mode double-mounts; accept exactly once
    acceptOrgInvite(token)
      .then(() => router.push("/team"))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Something went wrong"),
      );
  }, [token, loading, user, router]);

  if (!token)
    return (
      <p className="text-sm opacity-75">
        This page needs the link from an invitation email.
      </p>
    );

  if (loading) return <p className="text-sm opacity-75">One moment…</p>;

  if (!user)
    return (
      <p className="text-sm opacity-75">
        <Link href="/login" className="underline">
          Sign in
        </Link>{" "}
        or{" "}
        <Link href="/register" className="underline">
          create an account
        </Link>{" "}
        with the invited email address, then open this link again to join the
        team.
      </p>
    );

  if (error)
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;

  return <p className="text-sm opacity-75">Joining the team…</p>;
}

export default function InvitePage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Team invitation</h1>
      {/* useSearchParams requires a Suspense boundary during prerender */}
      <Suspense>
        <InviteResult />
      </Suspense>
    </div>
  );
}
