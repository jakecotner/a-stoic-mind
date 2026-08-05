"use client";

import { useEffect, useState } from "react";
import {
  fetchAdminStats,
  fetchAdminUsers,
  type AdminStats,
  type AdminUserRow,
} from "@/lib/api";
import { useUser } from "@/lib/useUser";

// Per-MTok USD rates for the cost estimate. Client-side so pricing changes
// don't require a backend deploy (see backend/app/services/admin.py).
// Cache writes bill at 1.25x input, cache reads at 0.1x.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

function llmCost(row: {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}): number | null {
  const p = Object.entries(PRICING).find(([id]) => row.model.startsWith(id))?.[1];
  if (!p) return null;
  return (
    (row.input_tokens * p.input +
      row.output_tokens * p.output +
      row.cache_creation_input_tokens * p.input * 1.25 +
      row.cache_read_input_tokens * p.input * 0.1) /
    1_000_000
  );
}

const DAY_METRICS = [
  { key: "journal_entries", label: "Journal entries" },
  { key: "chat_turns", label: "Chat turns" },
  { key: "practice_sessions", label: "Practice sessions" },
  { key: "passages_read", label: "Passages read" },
  { key: "notes", label: "Notes" },
] as const;

function StatTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm opacity-60">{label}</div>
      {sub && <div className="mt-0.5 text-xs opacity-50">{sub}</div>}
    </div>
  );
}

/** One metric's last-30-days as a compact bar chart. Single series, so the
    title is the legend; each bar carries a tooltip with day + count. */
function Sparkbars({
  label,
  days,
  metric,
}: {
  label: string;
  days: AdminStats["days"];
  metric: (typeof DAY_METRICS)[number]["key"];
}) {
  const max = Math.max(1, ...days.map((d) => d[metric]));
  const total = days.reduce((sum, d) => sum + d[metric], 0);
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs opacity-60">{total} in 30 days</span>
      </div>
      <div className="flex h-16 items-end gap-[2px]" role="img" aria-label={`${label} per day, last 30 days`}>
        {days.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d[metric]}`}
            className="min-w-0 flex-1 rounded-t-[3px] bg-foreground/70 hover:bg-foreground"
            style={{
              height: d[metric] > 0 ? `${Math.max(6, (d[metric] / max) * 100)}%` : "2px",
              opacity: d[metric] > 0 ? undefined : 0.15,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] opacity-50">
        <span>{days[0]?.day.slice(5)}</span>
        <span>{days[days.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

const thCls = "px-3 py-2 text-left font-medium";
const tdCls = "px-3 py-2 tabular-nums";

export default function AdminPage() {
  const { user, loading } = useUser();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !!user?.is_superuser;

  useEffect(() => {
    if (!isAdmin) return;
    void fetchAdminStats().then(setStats).catch((e) => setError(e.message));
    void fetchAdminUsers().then(setUsers).catch((e) => setError(e.message));
  }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin) {
    // Deliberately indistinguishable from a missing page.
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-xl font-semibold">Page not found</h1>
      </main>
    );
  }

  const totalCost = stats
    ? stats.llm_days.reduce((sum, r) => sum + (llmCost(r) ?? 0), 0)
    : 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Admin console</h1>
      <p className="mb-8 text-sm opacity-60">
        Lifetime totals, the last 30 days of activity, and every account.
      </p>
      {error && (
        <p className="mb-6 rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {stats && (
        <>
          <section className="mb-10">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile
                label="Accounts"
                value={stats.totals.users}
                sub={`${stats.totals.verified_users} verified · ${stats.totals.plus_users} plus`}
              />
              <StatTile label="Journal entries" value={stats.totals.journal_entries} />
              <StatTile
                label="Chat turns"
                value={stats.totals.chat_turns}
                sub={`${stats.totals.conversations} conversations`}
              />
              <StatTile label="Practice sessions" value={stats.totals.practice_sessions} />
              <StatTile label="Passages read" value={stats.totals.passages_read} />
              <StatTile label="Notes" value={stats.totals.notes} />
            </div>
          </section>

          <section className="mb-10">
            <h2 className="mb-3 font-medium">Last 30 days</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DAY_METRICS.map((m) => (
                <Sparkbars key={m.key} label={m.label} days={stats.days} metric={m.key} />
              ))}
            </div>
          </section>

          <section className="mb-10">
            <h2 className="mb-1 font-medium">Mentor cost (last 30 days)</h2>
            <p className="mb-3 text-sm opacity-60">
              Every LLM call, with an estimated cost at current API rates
              {totalCost > 0 && (
                <>
                  {" — "}
                  <span className="font-medium opacity-100">
                    ${totalCost.toFixed(2)} total
                  </span>
                </>
              )}
              .
            </p>
            {stats.llm_days.length === 0 ? (
              <p className="text-sm opacity-60">No LLM usage in the last 30 days.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
                <table className="w-full text-sm">
                  <thead className="border-b border-black/10 dark:border-white/15">
                    <tr>
                      <th className={thCls}>Day</th>
                      <th className={thCls}>Model</th>
                      <th className={`${thCls} text-right`}>Calls</th>
                      <th className={`${thCls} text-right`}>Input tokens</th>
                      <th className={`${thCls} text-right`}>Output tokens</th>
                      <th className={`${thCls} text-right`}>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.llm_days.map((r) => {
                      const cost = llmCost(r);
                      return (
                        <tr
                          key={`${r.day}-${r.model}`}
                          className="border-b border-black/5 last:border-0 dark:border-white/10"
                        >
                          <td className={tdCls}>{r.day}</td>
                          <td className="px-3 py-2">{r.model}</td>
                          <td className={`${tdCls} text-right`}>{r.calls}</td>
                          <td
                            className={`${tdCls} text-right`}
                            title={`+${r.cache_creation_input_tokens.toLocaleString()} cache write, ${r.cache_read_input_tokens.toLocaleString()} cache read`}
                          >
                            {r.input_tokens.toLocaleString()}
                          </td>
                          <td className={`${tdCls} text-right`}>
                            {r.output_tokens.toLocaleString()}
                          </td>
                          <td className={`${tdCls} text-right`}>
                            {cost === null ? "—" : `$${cost.toFixed(3)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section>
        <h2 className="mb-3 font-medium">Accounts</h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 dark:border-white/15">
              <tr>
                <th className={thCls}>Email</th>
                <th className={thCls}>Tier</th>
                <th className={thCls}>Verified</th>
                <th className={thCls}>Sign-in</th>
                <th className={`${thCls} text-right`}>Journal</th>
                <th className={`${thCls} text-right`}>Chats</th>
                <th className={`${thCls} text-right`}>Sits</th>
                <th className={`${thCls} text-right`}>Reads</th>
                <th className={`${thCls} text-right`}>Notes</th>
                <th className={thCls}>Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-3 py-2">
                    {u.email}
                    {u.is_superuser && (
                      <span className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 text-[10px] uppercase dark:bg-white/15">
                        admin
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{u.tier}</td>
                  <td className="px-3 py-2">{u.is_verified ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    {u.oauth_providers.length > 0
                      ? u.oauth_providers.join(", ")
                      : "password"}
                  </td>
                  <td className={`${tdCls} text-right`}>{u.journal_entries}</td>
                  <td className={`${tdCls} text-right`}>{u.chat_turns}</td>
                  <td className={`${tdCls} text-right`}>{u.practice_sessions}</td>
                  <td className={`${tdCls} text-right`}>{u.passages_read}</td>
                  <td className={`${tdCls} text-right`}>{u.notes}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {u.last_active
                      ? new Date(u.last_active).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
