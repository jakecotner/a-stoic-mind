# Modules — the capability menu

The template ships every module BUILT-IN and WIRED, so all of it stays
exercised and tested. Spawning a project means subtracting what the product
doesn't need. Do the subtraction BEFORE generating the initial alembic
migration (`alembic/versions/` is empty in the template on purpose): the
import list in `backend/app/models/__init__.py` decides which tables exist,
so a project's schema only ever contains what it kept.

Two kinds of optionality:

- **Modules** — deletable slices of code (orgs/RBAC, chat, usage metering,
  billing). Each lists its files on both sides and a removal checklist.
- **Flavors** — always-shipped behavior behind a setting (email
  verification). Nothing to delete; flip the env var.

The spawn questions, in product terms:

| Question for the product owner | Decides |
| --- | --- |
| "Will teams of people share data in this app, or does each user have their own?" | orgs/RBAC module |
| "Is there a conversation with an AI in this product?" | chat module |
| "Does anything cost you money per use (LLM calls) that free users should get a limited allowance of?" | usage metering module |
| "Will this app charge money?" | billing module |
| "Should new accounts have to verify their email address?" | `REQUIRE_EMAIL_VERIFICATION` flavor |

## Dependencies between modules

```
chat ──needs──▶ usage metering (turn caps + per-call recording)
billing ──reads──▶ usage metering (turns shown in /api/billing/summary)
orgs/RBAC ──independent (billing stays per-user: "owner pays")
email verification ──independent (flavor; gates chat turns + checkout when on)
```

- Removing **metering** while keeping **chat**: also strip
  `enforce_turn_cap` / `record_usage` / `ensure_verified`-adjacent cap logic
  from `services/chat.py` — chat becomes uncapped.
- Removing **metering** while keeping **billing**: drop the `turns` field
  from `BillingSummary` (schema + `services/billing.py` + the account page).
- `require_plus` (the paid gate) and `tier` on the user row live OUTSIDE the
  billing module (`core/auth.py`, `models/user.py`) and are kept even if
  billing is removed: `tier` just stays `"free"` and `require_plus` denies
  everyone but superusers — honest behavior for an app that never charges.

## orgs/RBAC (teams)

Organizations with roles — exactly one **owner** (the creator), plus
**admin** and **member**. Owners/admins manage the team, acting only on
roles strictly below their own. Invites go to an email address, expire in
7 days, and must be accepted by an account signed in with that address.

Product decisions baked in (change knowingly):
- **Owner pays**: billing stays on the owner's user row; the org's
  effective tier is the owner's tier (`services/org.py::effective_tier`).
  Per-seat billing is a future upgrade, not v1.
- **Owned orgs die with the owner**: deleting your account deletes orgs you
  own (DB cascade), including other members' access. No ownership transfer
  in v1.
- In a teams app, NEW domain models should carry `org_id` ownership (FK to
  `organizations.id`) and routes should gate with
  `require_org_role("member"/"admin"/"owner")` instead of per-user checks.

Files (backend): `app/models/org.py` (+ imports in `models/__init__.py`),
`app/schemas/org.py`, `app/crud/org.py`, `app/services/org.py`,
`app/routes/org.py`, `app/core/rbac.py`, router include in `app/main.py`,
the orgs note in `app/services/user.py::delete_account`'s docstring.
Files (frontend): `app/team/page.tsx`, `app/invite/page.tsx`, the orgs
section of `lib/api.ts`, the Team link in `components/Header.tsx`, the
`/team` + `/invite` entries in `app/robots.ts`.
Tables: `organizations`, `memberships`, `org_invites`.

Removal: delete the files above, remove the three imports/includes
(models/__init__.py, main.py, Header link), remove the robots entries and
the api.ts section. `crud/user.py::get_by_email` stays (generic).

## chat (LLM conversations) — REINSTATED (2026-08) as "the mentor"

Removed 2026-07 in favor of the journal as the first-class page;
reinstated 2026-08 as a Stoic-mentor chat (`/chat`, "Mentor" in the
sidebar). Differences from the original module:

- **Signed-in only** — the anonymous per-IP taste allowance was NOT
  reinstated (its IP-metering machinery is gone; unmetered anonymous LLM
  turns would be an open cost hole). Reinstate per-IP metering first if
  anonymous chat comes back.
- The mentor always sees today's passage; `conversations.share_journal`
  (off by default, per-conversation, PATCH to toggle) opts the user's
  recent journal entries into the context.
- Chat turns and journal reflections draw from ONE free monthly allowance
  (`services/usage.py::METERED_KINDS`).

Streaming SSE chat with persisted conversations. Needs the metering module.

Files (backend): `app/models/conversation.py` (+ imports),
`app/schemas/chat.py`, `app/crud/conversation.py`, `app/services/chat.py`,
`app/routes/chat.py`, router include in `app/main.py`; the
conversation-cleanup call in `app/services/user.py::delete_account`.
`app/services/llm.py` is the generic LLM wiring — keep it if ANY feature
calls Claude, delete it only for LLM-free products.
Files (frontend): `app/chat/` page, the chat section of `lib/api.ts`, the
Chat link in `components/Header.tsx`, the `/chat` entry in `app/robots.ts`.
Tables: `conversations`, `messages`.

## usage metering (free-tier caps)

One row per LLM call; monthly free allowance per user (per IP when
anonymous); superuser cost rollup at `/api/admin`.

Files (backend): `app/models/usage.py` (+ imports), `app/crud/usage.py`,
`app/services/usage.py`, `app/routes/admin.py` + `app/services/admin.py`
(the rollup is its only consumer today), router include in `app/main.py`.
Tables: `llm_usage`.

## billing (Stripe)

Checkout, customer portal, and the webhook that owns `users.tier`. All keys
unset = payments dark (503s + honest UI copy), so an undecided project can
simply leave it dark instead of removing it.

Files (backend): `app/schemas/billing.py`, `app/services/billing.py`,
`app/routes/billing.py`, router include in `app/main.py`, Stripe settings
in `core/config.py`, Stripe fields on `models/user.py` (keep the columns —
harmless — or remove them with the module).
Files (frontend): the billing section of `lib/api.ts` and the upgrade
surface in `app/account/page.tsx`.
Tables: none of its own (fields on `users`).

## sign in with Google (flavor — not a module)

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `backend/.env` (setup steps
in `backend/.env.example`). Unset: the sign-in and sign-up pages show only
the email/password form and `/api/auth/google/*` returns 503 — nothing to
delete. Set: "Continue with Google" appears, and the callback issues the
same session cookie a password sign-in does, so every other route is
unaffected.

Product decisions baked in (change knowingly, in `app/services/oauth.py`):
- **One person, one account**: a Google address that matches an existing
  account signs into THAT account rather than creating a second one
  (`LINK_BY_EMAIL`). Only addresses Google reports as verified are accepted,
  which is what makes that safe.
- Accounts created this way start `is_verified=True` — they never need the
  confirm-your-email round trip even with the verification flavor on.
- A Google-created account has an unusable random password; "Forgot your
  password?" is the escape hatch if someone later wants to sign in without
  Google.

Files (backend): `app/models/oauth.py` (+ imports in `models/__init__.py`),
`app/services/oauth.py`, the Google routes in `app/routes/auth.py`, the
OAuth methods + `attach_session_cookie` in `app/core/auth.py`,
`oauth_accounts` on `app/models/user.py`, the Google settings in
`core/config.py`, `google_sign_in` in `schemas/meta.py` + `app/main.py`.
Files (frontend): `components/GoogleSignIn.tsx` and its use in
`app/login/page.tsx` + `app/register/page.tsx`.
Tables: `oauth_accounts`.

Adding Microsoft or Apple later: the table already carries `oauth_name`, so
it's a second httpx-oauth client, a second settings pair, a second pair of
routes, and a second button — no schema change.

## email verification (flavor — not a module)

`REQUIRE_EMAIL_VERIFICATION` in `backend/.env`. Off: registration is
frictionless; the verify endpoints and `/verify` page sit dark. On: new
accounts get a verification email; unverified users can sign in and look
around, but chat turns and checkout are gated
(`core/auth.py::current_verified_user` / `ensure_verified`), and the
frontend shows a banner (`components/VerifyBanner.tsx`, driven by
`/api/meta`). Flip it any time — no schema change, nothing to delete.
