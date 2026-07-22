import { useEffect, useState, type ReactNode } from "react";
import {
  openBillingPortal,
  startCheckout,
  type AuthUser,
  type BillingPlan,
  type BillingSummary,
} from "./api";

/* Account & upgrade UI (MONETIZATION.md §3, §5): identity, plan, billing.
   One paid tier, annual presented first; reading/journaling/export
   reassurance stays visible on every pitch. No always-on usage meters — the
   account page may show usage, but in-flow surfaces only appear near the cap
   (CapHint). Look/read/sound preferences live in SettingsModal instead. */

function formatDate(iso: string): string {
  // Date-only strings parse as UTC midnight and can render a day early in
  // local time; pin them to local midnight instead.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Modal chrome shared with the auth dialog: overlay, card, close
    affordances. Also used by SettingsModal. */
export function Overlay({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="auth-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="auth-modal account-modal"
      >
        <button className="auth-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}

/** The Stoa Plus pitch: features, annual-first pricing, checkout CTA. */
function PlusPanel() {
  const [plan, setPlan] = useState<BillingPlan>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await startCheckout(plan); // navigates away on success
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="acct-section">
      <div className="pane-caption">Stoa Plus</div>
      <p className="acct-pitch">Unlimited conversation with the Stoa.</p>
      <ul className="plus-features">
        <li>Unlimited reflection threads on your entries</li>
        <li>Weekly synthesis of your journal</li>
        <li>Discussions anchored to passages as you read</li>
        <li>The deepest model for every conversation</li>
      </ul>
      <div className="price-cards">
        <button
          className={
            plan === "annual" ? "price-card price-selected" : "price-card"
          }
          onClick={() => setPlan("annual")}
        >
          <span className="price-badge">Best value</span>
          <span className="price-main">
            $49<span className="price-per">/year</span>
          </span>
          <span className="price-sub">$4.08 a month</span>
        </button>
        <button
          className={
            plan === "monthly" ? "price-card price-selected" : "price-card"
          }
          onClick={() => setPlan("monthly")}
        >
          <span className="price-main">
            $6.99<span className="price-per">/month</span>
          </span>
          <span className="price-sub">billed monthly</span>
        </button>
      </div>
      <button className="auth-primary acct-cta" onClick={checkout} disabled={busy}>
        {busy
          ? "Preparing checkout…"
          : plan === "annual"
            ? "Continue — $49/year"
            : "Continue — $6.99/month"}
      </button>
      {error && <p className="auth-error">{error}</p>}
      <p className="auth-note acct-note">
        Reading, journaling, and export are never paywalled. Cancel anytime.
      </p>
    </section>
  );
}

export function AccountModal({
  user,
  billing,
  onClose,
}: {
  user: AuthUser;
  billing: BillingSummary | null;
  onClose: () => void;
}) {
  const tier = billing?.tier ?? "free";
  const usage = billing?.reflections ?? null;
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  async function portal() {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalError(null);
    try {
      await openBillingPortal(); // navigates away on success
    } catch (e) {
      setPortalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} labelledBy="acct-title">
      <h2 id="acct-title">Account</h2>
      <p className="auth-sub">{user.email}</p>

      <section className="acct-section">
        <div className="pane-caption">Your plan</div>
        {tier === "plus" ? (
          <>
            <p className="acct-plan-name">Stoa Plus</p>
            <p className="acct-plan-line">
              {billing?.renews_at
                ? billing.cancel_at_period_end
                  ? `Paid through ${formatDate(billing.renews_at)} — it won't renew.`
                  : `Renews ${formatDate(billing.renews_at)}.`
                : "Unlimited conversation with the Stoa."}
            </p>
            <button className="auth-link" onClick={portal} disabled={portalBusy}>
              Manage billing
            </button>
            {portalError && <p className="auth-error">{portalError}</p>}
          </>
        ) : (
          <>
            <p className="acct-plan-name">Free</p>
            <p className="acct-plan-line">
              All texts, margin notes, and unlimited journaling — always.
            </p>
            {usage && (
              <div className="acct-usage">
                <div className="acct-usage-bar" aria-hidden="true">
                  <div
                    style={{
                      width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`,
                    }}
                  />
                </div>
                {usage.used} of {usage.limit} Stoa reflections used this month
              </div>
            )}
          </>
        )}
      </section>

      {tier === "free" && <PlusPanel />}
    </Overlay>
  );
}

/** Shown when a reflection request comes back 402: the month's taste is spent. */
export function UpgradeModal({
  limit,
  onClose,
}: {
  limit: number | null;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose} labelledBy="upgrade-title">
      <h2 id="upgrade-title">You've used this month's reflections</h2>
      <p className="auth-sub">
        All {limit ?? 10} free Stoa reflections are spent — they return at the
        start of next month. Reading and journaling are never limited.
      </p>
      <PlusPanel />
      <p className="auth-switch">
        <button className="auth-link" onClick={onClose}>
          Maybe later
        </button>
      </p>
    </Overlay>
  );
}

/** Quiet composer-side hint, per the plan: surface the cap only when near it. */
export function CapHint({
  remaining,
  onShowPlans,
}: {
  remaining: number | null;
  onShowPlans: () => void;
}) {
  if (remaining == null || remaining > 3) return null;
  return (
    <p className="cap-hint">
      {remaining <= 0
        ? "No free reflections left this month"
        : `${remaining} reflection${remaining === 1 ? "" : "s"} left this month`}{" "}
      ·{" "}
      <button className="auth-link" onClick={onShowPlans}>
        Stoa Plus
      </button>
    </p>
  );
}
