"use client";

import { useEffect, useState } from "react";
import { fetchMeta, requestVerifyEmail } from "@/lib/api";
import { useUser } from "@/lib/useUser";

/** Shown under the header while the signed-in account is unverified AND the
    backend enforces verification (REQUIRE_EMAIL_VERIFICATION — surfaced via
    /api/meta). Invisible in every other state, so it can sit in the layout
    unconditionally. */
export default function VerifyBanner() {
  const { user } = useUser();
  const [required, setRequired] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    void fetchMeta().then((meta) => setRequired(meta.require_email_verification));
  }, []);

  if (!required || !user || user.is_verified) return null;

  return (
    <div className="border-b border-amber-600/30 bg-amber-500/10 text-sm">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2">
        <span className="opacity-90">
          Verify your email — we sent a link to {user.email}.
        </span>
        {resent ? (
          <span className="opacity-70">Sent — check your inbox.</span>
        ) : (
          <button
            className="underline opacity-90 hover:opacity-100"
            onClick={async () => {
              await requestVerifyEmail(user.email);
              setResent(true);
            }}
          >
            Resend
          </button>
        )}
      </div>
    </div>
  );
}
