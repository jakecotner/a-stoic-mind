"use client";

import { useEffect, useState } from "react";
import { fetchMeta } from "@/lib/api";

/** Google's brand mark. Inlined (rather than an <img>) so it needs no
    network request and inherits nothing from the page's color scheme —
    Google's terms require the logo be shown in its own colors. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/** "Continue with Google", shown above the email/password form on the
    sign-in and sign-up pages.

    A plain link, not a fetch: the browser has to LEAVE for
    accounts.google.com and come back to /api/auth/google/callback, which
    sets the same session cookie a password sign-in does.

    Renders nothing (including the divider) until /api/meta says the server
    has Google credentials configured, so an unconfigured deployment shows
    the ordinary form with no dead button. */
export default function GoogleSignIn({ label }: { label: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void fetchMeta().then((meta) => setEnabled(meta.google_sign_in));
  }, []);

  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-6">
      <a
        href="/api/auth/google/authorize"
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-black/15 py-2 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        <GoogleMark />
        {label}
      </a>
      <div className="flex items-center gap-3 text-sm opacity-50">
        <span className="h-px flex-1 bg-current" />
        or
        <span className="h-px flex-1 bg-current" />
      </div>
    </div>
  );
}
