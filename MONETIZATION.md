# Stoa — Monetization Plan

*Drafted 2026-07-21. Working plan, not a commitment — revisit after launch data.*

## 1. Summary

Stoa monetizes with a **free core plus one paid tier**. The free tier delivers the
full two-noun pitch — *Read the Stoics. Keep a journal.* — including the daily
passage with its breakdown. The paid tier ("Stoa Plus", working name) unlocks
unlimited conversation with the Stoa voice and everything built on top of it:
weekly synthesis, passage-anchored threads, cross-links, audio.

- **Price target:** $6.99/month or $49/year (annual pushed as the default).
- **Marginal cost reality:** texts are public domain and journaling is Postgres
  rows; the only per-user cost is LLM calls. A heavy paid user costs ~$2–3/month
  in API spend; a typical one well under $1.
- **Never paywalled, ever:** reading the texts, writing/reading the journal, and
  exporting the journal. The journal is the user's; holding it hostage would
  poison the trust the whole product depends on.

## 2. Unit economics

Current models: `claude-opus-4-8` for the Stoa voice, `gpt-4o-mini-tts` for audio
(see `backend/app/config.py`).

API pricing (as of 2026-07): Opus 4.8 **$5 in / $25 out per MTok**; Sonnet 5
**$3/$15** (intro $2/$10 through 2026-08-31); Haiku 4.5 **$1/$5**.

Estimated per-action costs on Opus 4.8:

| Action | Rough tokens | Cost |
|---|---|---|
| Daily passage breakdown | one call **per day, total** — shared by all users | ~$0 per user |
| One reflection turn (entry + passage context → response) | ~3k in / ~700 out | ~$0.03 |
| Full 5-turn reflection thread (growing context) | — | ~$0.15–0.25 |
| Weekly synthesis (reads a week of entries) | ~15k in / ~1.5k out | ~$0.12 |
| TTS for one passage | cached per passage/voice, like breakdowns | ~$0 per user amortized |

Two structural advantages worth protecting in code:

1. **Shared artifacts stay shared.** The passage breakdown (`reflection.py`) and
   passage audio (`tts.py` + `PassageAudio`) are generated once and cached for
   everyone. As features are added, prefer per-passage artifacts (cacheable,
   ~free) over per-user generation wherever the product allows.
2. **The corpus is finite.** Anything keyed to a passage has bounded total cost
   ("whole corpus, once per variant" — already the reasoning in `ratelimit.py`).
   Only per-user conversation scales with users, which is exactly what the
   paywall covers.

Monthly cost envelope per user (Opus 4.8):

| Persona | Usage | API cost/mo |
|---|---|---|
| Free, typical | daily breakdown + a few taste reflections | < $0.10 |
| Free, maxed cap | 10 reflection turns | ~$0.30 |
| Paid, typical | ~1 thread/day, 4 syntheses | ~$1–2 |
| Paid, heavy | several threads/day, syntheses, audio | ~$3 |

At $49/year, even the heavy persona leaves >60% margin before infra
(Railway + Postgres are small and mostly fixed).

## 3. Tiers

### Free

| Feature | Notes |
|---|---|
| All Stoic texts, reading UI, margin notes | public domain; zero marginal cost |
| Unlimited journaling | Postgres rows; the habit loop must never be metered |
| Daily passage + breakdown | shared artifact, ~free to serve |
| Passage audio | already cached per passage; keep free while corpus coverage grows |
| **10 Stoa reflection turns / month** | the taste of the paid product |
| Journal export | free forever, prominent, no dark patterns |

### Stoa Plus — $6.99/mo or $49/yr

| Feature | Status |
|---|---|
| Unlimited Stoa reflection threads | exists (`conversations.py`) — the anchor benefit |
| Weekly synthesis | roadmap; build as paid-only from day one |
| Passage-anchored discussion threads in the reading pane | roadmap; paid |
| Entry↔passage cross-links | roadmap; paid |
| Morning/evening daily loop extras (evening review prompts) | roadmap; the *basic* daily prompt stays free |
| Deeper model for conversations | Opus 4.8 for paid; free-tier taste turns may run Sonnet 5 (see §4) |

### Deliberately not doing

- **Multiple paid tiers.** Inventing a Pro/Premium fence before knowing what
  users value fragments a product whose pitch is two nouns. One paywall.
- **Visible credits/tokens.** Making each conversation feel like spending is
  poison for a reflective practice. Enforce a soft monthly cap server-side;
  surface it only when the user is near it ("3 reflections left this month").
- **Ads, data sales.** Obviously; it's a journal.
- **Lifetime purchase at launch.** Attractive in this category ($99+), but
  unbounded usage against a fixed payment — defer until real per-user cost
  distributions exist. Revisit after ~6 months of data.

## 4. Model strategy

- **Paid conversations: `claude-opus-4-8`** (current default). Voice quality is
  the product; don't downgrade paid users to save cents.
- **Free-tier taste turns: consider `claude-sonnet-5`** (~40% cheaper, intro
  pricing cheaper still). Only worth doing if free-tier volume becomes a real
  line item; at a 10-turn cap the exposure is ~$0.30/user/mo, so this is an
  optimization, not a launch requirement. Implement as a per-tier model choice
  in `llm.py` reading from `Settings`.
- **Shared artifacts (breakdowns, syntheses of public texts): Opus.** They're
  generated once, so quality per dollar is maximal.
- **Prompt caching:** the system prompt + passage context in conversation
  threads is a stable prefix; add `cache_control` breakpoints when threads get
  long (cache reads are ~0.1× input price). Not urgent at current thread
  lengths (min cacheable prefix on Opus 4.8 is 4096 tokens).

## 5. Implementation plan

Ordered slices, each shippable alone. No payment processor until slice 3.

### Slice 1 — usage metering (invisible) ✅ shipped 2026-07-21

Count what would be billed before building billing.

- Table `llm_usage` (migration 0010): one row per Claude call with
  `user_id` (nullable — shared artifacts and anonymous chat), `kind`
  (`reflection_turn` | `passage_breakdown` | `translation`), `model`, and all
  four token counts including cache reads/writes. Recorded best-effort via
  `app/usage.py::record_usage` from all three call sites (chat in `main.py`,
  breakdowns in `reflection.py`, translations in `translation.py`).
- `GET /api/admin/usage` (superuser-only, `app/admin.py`): monthly rollup
  grouped by user/kind/model; cost math stays client-side.
- Zero user-facing change. This de-risks every number in §2.

### Slice 2 — tier flag + cap enforcement ✅ shipped 2026-07-21 (backend)

- `users.tier` (`'free' | 'plus'`, default `'free'`, migration 0011), flipped
  via `POST /api/admin/users/{id}/tier` (superuser-only) until Stripe owns it.
  Superusers and `plus` bypass caps.
- `enforce_reflection_cap` (`app/usage.py`) runs at the top of `POST /api/chat`:
  free users are capped at `Settings.free_tier_monthly_turns` (10) per calendar
  month (UTC), counted from `llm_usage`; over-cap returns
  `402 {code: "reflection_cap", scope, used, limit}`. Anonymous chat gets the
  same allowance per IP via an in-memory 30-day sliding window (`scope:
  "anonymous"` → sign-in nudge; resets on restart — a nudge, not enforcement).
- `GET /api/billing/summary` (`app/billing.py`) serves the frontend's
  `BillingSummary` contract: `{tier, reflections: {used, limit} | null,
  renews_at: null}`; `/api/billing/checkout` + `/portal` intentionally 404
  until slice 3.
- Frontend (shipped separately, see below): remaining-turns hint, upgrade
  modal on 402 via `onCapHit`, billing summary in the account view.

### Slice 3 — payments ✅ shipped 2026-07-22 (code; Stripe account setup pending)

- **Stripe Checkout + customer portal** (not in-app custom billing UI).
  Webhook (`POST /api/billing/webhook`: `checkout.session.completed`,
  `customer.subscription.created/updated/deleted`) owns `users.tier`; the
  admin endpoint remains as a manual override. Migration 0014 adds
  `users.stripe_customer_id` (unique) plus `plus_renews_at` /
  `plus_cancel_at_period_end`, mirrored from webhook events so
  `/api/billing/summary` never calls Stripe. Statuses `trialing`/`active`/
  `past_due` grant Plus (access survives smart retries; ends on
  `subscription.deleted`).
- Monthly + annual prices; annual presented first with the effective monthly
  price shown ("$49/yr — $4.08/mo").
- 7-day free trial of Plus via Stripe trials, card required
  (`STRIPE_TRIAL_DAYS`, 0 disables — the no-trial fallback if abuse appears).
- Config (`app/config.py`, unset = payments stay "not live" with a 503):
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ANNUAL`,
  `STRIPE_PRICE_MONTHLY`, `PUBLIC_BASE_URL` (prod redirect origin).
- Frontend: `/?checkout=success` return path polls the summary briefly
  (webhook can lag the redirect); `?checkout=cancelled` just cleans the URL.
- **Remaining manual setup (Stripe dashboard):** create the product with the
  two prices, add a webhook endpoint for the four events above pointing at
  `https://<domain>/api/billing/webhook`, then set the env vars in Railway.
  Local testing: `stripe listen --forward-to localhost:8001/api/billing/webhook`.

### Frontend contract (upgrade/billing UI shipped 2026-07-21, ahead of slices 2–3)

The web frontend renders the full account/upgrade/billing UI now and degrades
gracefully (no usage shown; checkout says "payments aren't live yet") until the
backend provides, matching these shapes (`frontend/src/api.ts`):

- `GET /api/billing/summary` → `{ tier: "free"|"plus", reflections: { used, limit } | null, renews_at: ISO-date | null, cancel_at_period_end?: bool }`; 401 when signed out.
- `POST /api/billing/checkout` with `{ plan: "annual"|"monthly" }` → `{ url }` (Stripe Checkout redirect).
- `POST /api/billing/portal` → `{ url }` (Stripe customer portal redirect).
- `POST /api/chat` at the free cap → **402** with `{ "detail": { "used": n, "limit": n, "message": str } }` (all optional); the UI shows the message inline and opens the upgrade modal.

### Slice 4 — paid features land behind the flag

Weekly synthesis and passage-anchored threads (already on the roadmap) check
`users.tier` at the endpoint. Building them paid-only from day one avoids ever
taking a feature away from free users.

- **Weekly synthesis ✅ shipped 2026-07-22.** `GET /api/synthesis/week`
  (`app/synthesis.py`, SSE): Plus/superuser only (402 `plus_required`
  otherwise). One synthesis per (user, client-local Monday), stored in
  `syntheses` (migration 0015) — one LLM call per user-week; regeneration
  only on explicit `refresh` or after a language switch. `peek=true` never
  generates (the Journal card can render on load without an unasked-for
  call). Grounded via retrieval over the week's own words; usage kind
  `weekly_synthesis`. UI: "Your week" card in the Journal's Stoa pane —
  appears at ≥2 entries in the week (falls back to last week), free tier
  sees a one-line pointer, generation is always an explicit click.
- **Passage-anchored discussion threads ✅ shipped 2026-07-22.**
  `conversations.passage_id` (migration 0016): `POST /api/chat` with
  `passage_id` starts a Plus-only discussion anchored to that passage
  (402 `plus_required` for free; one thread per user+passage, 409 after;
  seeded with the passage + breakdown like daily threads).
  `GET /api/passages/{id}/thread` lets the reading pane offer
  continue-vs-start. UI: "Discuss with the Stoa" under each passage in
  the reading pane; free tier sees the same control as a Plus pointer.
- **Entry↔passage cross-links ✅ shipped 2026-07-22.** `app/related.py`:
  `GET /api/notes/{id}/related-passages` ("passages that speak to this",
  under the open Journal entry) and `GET /api/passages/{id}/related-notes`
  ("from your journal", in the reading pane; excludes margin notes on the
  passage itself). Plus-gated via the shared `require_plus` (app/usage.py).
  With `VOYAGE_API_KEY`: pgvector cosine over `notes.embedding` (migration
  0017; embedded best-effort at write time in journal.py, lazily backfilled
  in batches of 50 at lookup) with a 0.65 distance ceiling — suggestions go
  silent rather than stretch. Keyless: FTS fallback, mirroring retrieval.py.
  No LLM calls, so no metering. UI shows nothing to free/empty — the
  discussion button is the pane's one Plus pointer.

## 6. Metrics to watch

- **Free→paid conversion** (target: 2–5% of monthly actives; journaling apps
  with strong habit loops reach the upper end).
- **Cap-hit rate**: % of free users hitting 10 turns. If almost nobody hits it,
  the taste is too small to sell against; if most do instantly, raise it or
  soften the UX. Tune the number, not the structure.
- **API cost per paid user per month** vs. the §2 envelope (from `llm_usage`).
- **Annual vs. monthly mix** and 30/90-day retention — annual is the real
  business; a habit app that retains sells annual plans.

## 7. Risks & open questions

- **Cap gaming via multiple accounts.** Email signup makes this cheap. Accept
  it at launch (abuse cost is ~$0.30/account/mo); add verification friction
  only if metering shows it's real.
- **Runaway thread costs.** A paid user can run very long threads (context
  grows quadratically-ish in cost). Mitigations, in order: prompt caching,
  a generous hidden per-day sanity cap (e.g. 100 turns) reusing the `MissCap`
  idea per-user, summarize-and-truncate for very long threads.
- **Sonnet intro pricing ends 2026-08-31** — re-run the free-tier math then.
- **Mobile.** A `mobile/` dir exists; App Store/Play billing takes 15–30% and
  requires in-app purchase for digital goods. Decide before mobile launch
  whether to ship IAP or make mobile read/journal-only with web billing.
  (Not a today problem; flagging so Stripe work doesn't assume web-only forever.)
  *2026-07-22 partial resolution:* mobile now has feature parity for the
  slice-4 Plus features (weekly synthesis, passage discussions, cross-links,
  synced via `billing`/`isPlus` in auth-context) but is deliberately
  **read-only about the plan**: no purchase surface, no upgrade pitch, no
  "buy on the web" link (App Store anti-steering). Plus features are simply
  hidden on free accounts; a 402 that slips through renders its message
  inline. IAP remains the open question for actively *selling* on mobile.
- **Open:** exact taste-cap number (10 is a starting guess), trial vs. no-trial,
  whether passage audio eventually moves behind Plus once the corpus is fully
  voiced (leaning: keep free — it's a cached shared artifact and a great hook).
