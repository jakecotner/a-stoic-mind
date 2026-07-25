"use client";

// The right panel of the landing page. Signed out it invites signup —
// journaling is the reason to make an account. Signed in it will hold the
// day's journal entries (slice 3); until then it is an honest placeholder.
import Link from "next/link";
import { useUser } from "@/lib/useUser";

export default function JournalPad() {
  const { user, loading } = useUser();

  if (loading) return <div className="min-h-40" />;

  if (!user) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-4 rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-lg font-medium">Your journal</h2>
        <p className="text-sm opacity-75">
          Read the passage, then write — about it, or about whatever is on
          your mind. Your entries stay yours, kept alongside each day&apos;s
          reading.
        </p>
        <Link
          href="/register"
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-85"
        >
          Start your journal
        </Link>
        <p className="text-xs opacity-60">
          Already have an account?{" "}
          <Link href="/login" className="underline hover:opacity-80">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-black/10 p-6 dark:border-white/15">
      <h2 className="text-lg font-medium">Your journal</h2>
      <p className="text-sm opacity-60">
        The journal pad is being built — your entries will live here.
      </p>
    </div>
  );
}
