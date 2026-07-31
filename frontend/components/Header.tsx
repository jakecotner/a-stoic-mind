"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { useUser } from "@/lib/useUser";

export default function Header() {
  const { user, loading, refresh } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold">
          A Stoic Mind
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link
            href="/library"
            className={pathname.startsWith("/library") ? "font-medium" : "opacity-70 hover:opacity-100"}
          >
            Library
          </Link>
          {user && (
            <>
              <Link
                href="/"
                className={pathname === "/" ? "font-medium" : "opacity-70 hover:opacity-100"}
              >
                Journal
              </Link>
              <Link
                href="/practice"
                className={pathname === "/practice" ? "font-medium" : "opacity-70 hover:opacity-100"}
              >
                Practice
              </Link>
              <Link
                href="/account"
                className={pathname === "/account" ? "font-medium" : "opacity-70 hover:opacity-100"}
              >
                Account
              </Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {loading ? null : user ? (
            <>
              <span className="hidden sm:inline opacity-70">{user.email}</span>
              <button
                className="rounded border border-black/15 px-3 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                onClick={async () => {
                  await logout();
                  await refresh();
                  router.push("/");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="opacity-70 hover:opacity-100">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded bg-foreground px-3 py-1 text-background hover:opacity-85"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
