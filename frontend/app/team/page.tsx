"use client";

// Team management (orgs/RBAC module — delete this page with it, see
// MODULES.md). One page: your organizations, their members, and invites.
// What's editable follows your role, mirroring the backend rules: admins
// manage members, only the owner manages admins, the owner can't leave.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  changeMemberRole,
  createOrg,
  createOrgInvite,
  deleteOrg,
  fetchOrgInvites,
  fetchOrgMembers,
  fetchOrgs,
  leaveOrg,
  removeMember,
  revokeOrgInvite,
  type InviteRole,
  type Org,
  type OrgInvite,
  type OrgMember,
} from "@/lib/api";
import { useUser } from "@/lib/useUser";

const inputCls =
  "rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const buttonCls =
  "rounded-lg bg-foreground px-4 py-2 font-medium text-background hover:opacity-85 disabled:opacity-50";
const subtleButtonCls =
  "rounded border border-black/15 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

const ROLE_RANK = { member: 0, admin: 1, owner: 2 } as const;

export default function TeamPage() {
  const { user, loading } = useUser();
  const router = useRouter();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<Org | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [busy, setBusy] = useState(false);

  const myRank = selected ? ROLE_RANK[selected.role] : 0;
  const isAdmin = myRank >= ROLE_RANK.admin;

  const loadOrgs = useCallback(async () => {
    const list = await fetchOrgs();
    setOrgs(list);
    setSelected((cur) => list.find((o) => o.id === cur?.id) ?? list[0] ?? null);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (user) void loadOrgs();
  }, [user, loading, router, loadOrgs]);

  useEffect(() => {
    if (!selected) {
      setMembers([]);
      setInvites([]);
      return;
    }
    void fetchOrgMembers(selected.id).then(setMembers).catch(() => {});
    if (ROLE_RANK[selected.role] >= ROLE_RANK.admin)
      void fetchOrgInvites(selected.id).then(setInvites).catch(() => {});
    else setInvites([]);
  }, [selected]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    setMembers(await fetchOrgMembers(selected.id));
    if (isAdmin) setInvites(await fetchOrgInvites(selected.id));
  };

  if (loading || !user) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <h1 className="text-2xl font-semibold">Team</h1>

      {/* Org list + create */}
      <section className="flex flex-col gap-3">
        {orgs.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {orgs.map((org) => (
              <button
                key={org.id}
                className={`${subtleButtonCls} ${org.id === selected?.id ? "font-medium" : "opacity-70"}`}
                onClick={() => setSelected(org)}
              >
                {org.name}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await createOrg(newOrgName);
              setNewOrgName("");
              await loadOrgs();
            });
          }}
        >
          <input
            className={`${inputCls} flex-1`}
            placeholder={
              orgs.length === 0
                ? "Name your organization to get started"
                : "New organization name"
            }
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            maxLength={200}
            required
          />
          <button className={buttonCls} disabled={busy}>
            Create
          </button>
        </form>
      </section>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {selected && (
        <>
          {/* Members */}
          <section className="flex flex-col gap-3">
            <h2 className="font-medium">
              {selected.name} — members
              <span className="ml-2 text-sm opacity-60">
                you&apos;re {selected.role === "owner" ? "the owner" : `an ${selected.role}`}
              </span>
            </h2>
            <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/15">
              {members.map((m) => {
                // You may only act on roles strictly below your own,
                // and never on yourself (leave is separate).
                const actionable =
                  m.user_id !== user.id && myRank > ROLE_RANK[m.role];
                return (
                  <li key={m.user_id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1">{m.email}</span>
                    {actionable && selected.role === "owner" ? (
                      <select
                        className={inputCls}
                        value={m.role}
                        onChange={(e) =>
                          void run(async () => {
                            await changeMemberRole(
                              selected.id,
                              m.user_id,
                              e.target.value as InviteRole,
                            );
                            await refreshSelected();
                          })
                        }
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <span className="opacity-60">{m.role}</span>
                    )}
                    {actionable && (
                      <button
                        className={subtleButtonCls}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await removeMember(selected.id, m.user_id);
                            await refreshSelected();
                          })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Invites (admins and the owner) */}
          {isAdmin && (
            <section className="flex flex-col gap-3">
              <h2 className="font-medium">Invite someone</h2>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await createOrgInvite(selected.id, inviteEmail, inviteRole);
                    setInviteEmail("");
                    await refreshSelected();
                  });
                }}
              >
                <input
                  className={`${inputCls} flex-1`}
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                {/* only the owner can hand out the admin role */}
                {selected.role === "owner" && (
                  <select
                    className={inputCls}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                )}
                <button className={buttonCls} disabled={busy}>
                  Invite
                </button>
              </form>
              {invites.length > 0 && (
                <ul className="flex flex-col divide-y divide-black/10 text-sm dark:divide-white/15">
                  {invites.map((inv) => (
                    <li key={inv.id} className="flex items-center gap-3 py-2">
                      <span className="flex-1">{inv.email}</span>
                      <span className="opacity-60">invited as {inv.role}</span>
                      <button
                        className={subtleButtonCls}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await revokeOrgInvite(selected.id, inv.id);
                            await refreshSelected();
                          })
                        }
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Danger zone */}
          <section className="flex gap-3 border-t border-black/10 pt-4 dark:border-white/15">
            {selected.role === "owner" ? (
              <button
                className={subtleButtonCls}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${selected.name}? Every member loses access and its data is removed. This can't be undone.`,
                    )
                  )
                    void run(async () => {
                      await deleteOrg(selected.id);
                      await loadOrgs();
                    });
                }}
              >
                Delete organization
              </button>
            ) : (
              <button
                className={subtleButtonCls}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await leaveOrg(selected.id);
                    await loadOrgs();
                  })
                }
              >
                Leave organization
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
