// Server-side session lookup, for server components and route handlers.
// The client-side counterpart is lib/useUser.ts.
//
// Server code can't rely on the /api rewrite (that's a browser-facing
// proxy), so this talks to the backend origin directly and forwards the
// incoming request's cookies. API_URL is read at RUNTIME here — the same
// variable the rewrite uses at build time.
//
// Usage in a server component:
//
//   import { redirect } from "next/navigation";
//   import { getUser } from "@/lib/auth-server";
//
//   export default async function Page() {
//     const user = await getUser();
//     if (!user) redirect("/login");
//     return <p>Signed in as {user.email}</p>;
//   }
import { cookies } from "next/headers";
import type { AuthUser } from "./api";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

/** The signed-in user, or null. Never throws — an unreachable backend
    renders as signed-out rather than a 500. */
export async function getUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookieHeader) return null;
  try {
    const resp = await fetch(`${API_URL}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    return (await resp.json()) as AuthUser;
  } catch {
    return null;
  }
}
