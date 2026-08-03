# astoicmind — dev notes

- **Layout**: `backend/` FastAPI + SQLAlchemy (sync) + Alembic; `frontend/`
  Next.js App Router + Tailwind. The browser talks only to the Next origin;
  `frontend/next.config.ts` rewrites `/api/*` to the backend.
- **Backend layers** (`backend/app/`): `models/` → `schemas/` → `crud/` →
  `services/` → `routes/`, plus `core/` (config, db, auth wiring, org-role
  gates, ratelimit). Placement rules — strict, no judgment calls:
  - `models/`: SQLAlchemy only, no logic. Every model module MUST be
    imported in `models/__init__.py` or alembic autogenerate silently
    misses it.
  - `schemas/`: Pydantic in/out shapes, no logic. Response models use
    Literal unions — they define the generated frontend types.
  - `crud/`: the ONLY layer that touches the DB session. Takes a `Session`,
    returns ORM objects. No HTTP concepts.
  - `services/`: business logic + external APIs (Stripe, Anthropic, email).
    Calls crud. No `Request`/`Response` objects (raising `HTTPException` is
    the sanctioned exception; routes pass in primitives like `base_url`).
  - `routes/`: thin — dependencies, parse input, call one service, shape
    output. Trivial reads may call crud directly (see routes/chat.py's
    list endpoint), but any logic means a service function.
  - A crud or service function that's a four-line pass-through is the
    accepted cost of zero-ambiguity placement — don't collapse layers.
  - When a domain outgrows this (≈3+ files per layer), promote it to
    `app/modules/<domain>/` carrying the same five folders inside.
- **Optional modules**: MODULES.md is the menu (orgs/RBAC, chat, metering,
  billing + the email-verification flavor) — which were kept or removed at
  spawn, their file lists, and the interdependencies. Consult it before
  adding to or removing any of them. If the orgs module is present, new
  domain models usually belong to the org (`org_id` FK +
  `require_org_role(...)` gates), not to a single user — ask the user which.
- **Ports**: backend uvicorn on **8000**, `next dev` on **3000**, Postgres in
  the docker container `astoicmind-db` on host port **5436**
  (`backend/docker-compose.yml`; 5432–5435 are taken by other projects'
  containers on this machine).
- Backend runs from `backend/` with its venv:
  `.venv/Scripts/python -m uvicorn app.main:app --port 8000`
- Run alembic as `python -m alembic` (the exe entry point can't import `app`).
- The backend is **deliberately sync** SQLAlchemy — psycopg's async mode
  doesn't run on the Windows Proactor event loop uvicorn uses, and threadpool
  concurrency is sufficient (see the docstring in `app/core/auth.py`). Don't
  convert it to async.
- **After changing any backend response/request schema**, regenerate the
  frontend types: `python scripts/export_openapi.py` (from `backend/`), then
  `npm run generate:types` (from `frontend/`) — this also copies the types
  to `mobile/src/lib/`. Commit both regenerated `api-types.d.ts` files.
- **`mobile/`** is the companion Expo app (see its README + AGENTS.md): same
  backend via bearer auth, tabs for Today / Journal (with dictation) /
  Library / Practice / Account. Billing links out to the website — no
  in-app purchases.
- The user coordinates git commits — do not commit or push unless asked.

## Working with the user (English-first)

The user is a domain expert, not a software engineer. `BUILDING.md` defines
the shared vocabulary — read it.

- When the user describes a feature or concept, reply FIRST with the mapping
  in English — which models and fields, who owns what, which routes, pages,
  and gates — and get agreement before writing code.
- Product decisions are theirs: ownership, visibility, deletion behavior,
  free-vs-paid gating, user-facing copy. Surface these as explicit questions.
  Implementation decisions (naming, indexes, file layout, library use) are
  yours — don't ask about mechanical choices.
- New feature work follows the `/new-feature` skill end-to-end; don't skip
  the type regeneration or verify steps.
- When something is broken, reproduce it with the verify skill before
  proposing a fix, and explain findings in terms of what the user saw, not
  stack traces.
