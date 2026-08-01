"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/api";
import { useUser } from "@/lib/useUser";

const COLLAPSED_KEY = "sidebar-collapsed";

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function SignInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5M15 12H3" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded px-2.5 py-2 text-sm ${
        active
          ? "bg-black/5 font-medium dark:bg-white/10"
          : "opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export default function Sidebar() {
  const { user, loading, refresh } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) {
      setCollapsed(stored === "1");
    } else if (window.innerWidth < 768) {
      setCollapsed(true);
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      return !c;
    });
  };

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-black/10 transition-[width] duration-200 dark:border-white/15 ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <div className={`flex items-center gap-2 px-3 py-3 ${collapsed ? "justify-center px-0" : ""}`}>
        {!collapsed && (
          <Link href="/" className="truncate font-semibold">
            A Stoic Mind
          </Link>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto rounded p-1.5 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 data-[centered=true]:ml-0"
          data-centered={collapsed}
        >
          <ChevronIcon collapsed={collapsed} />
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-2">
        <NavLink
          href="/library"
          label="Library"
          icon={<BookIcon />}
          active={pathname.startsWith("/library")}
          collapsed={collapsed}
        />
        {user && (
          <>
            <NavLink
              href="/"
              label="Journal"
              icon={<PenIcon />}
              active={pathname === "/"}
              collapsed={collapsed}
            />
            <NavLink
              href="/practice"
              label="Practice"
              icon={<CalendarIcon />}
              active={pathname === "/practice"}
              collapsed={collapsed}
            />
            <NavLink
              href="/account"
              label="Account"
              icon={<UserIcon />}
              active={pathname === "/account"}
              collapsed={collapsed}
            />
          </>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-black/10 px-2 py-3 dark:border-white/15">
        {loading ? null : user ? (
          <>
            {!collapsed && (
              <span className="truncate px-2.5 pb-1 text-xs opacity-70" title={user.email}>
                {user.email}
              </span>
            )}
            <button
              title={collapsed ? "Sign out" : undefined}
              className={`flex items-center gap-3 rounded px-2.5 py-2 text-sm opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 ${
                collapsed ? "justify-center" : ""
              }`}
              onClick={async () => {
                await logout();
                await refresh();
                router.push("/");
              }}
            >
              <SignOutIcon />
              {!collapsed && <span>Sign out</span>}
            </button>
          </>
        ) : (
          <>
            <NavLink
              href="/login"
              label="Sign in"
              icon={<SignInIcon />}
              active={pathname === "/login"}
              collapsed={collapsed}
            />
            <Link
              href="/register"
              title={collapsed ? "Get started" : undefined}
              className={`flex items-center gap-3 rounded bg-foreground px-2.5 py-2 text-sm text-background hover:opacity-85 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <SparkIcon />
              {!collapsed && <span>Get started</span>}
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
