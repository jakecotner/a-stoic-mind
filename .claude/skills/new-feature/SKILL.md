---
name: new-feature
description: Add a domain concept end-to-end through the backend layers (model, migration, schemas, crud, service, routes), regenerate TS types, wire the api.ts client and Next.js page, then verify in the running app.
---

# New feature pipeline

Every new domain concept flows through the same slice, in order. The layer
placement rules live in CLAUDE.md — follow them strictly. Don't skip steps;
the easy-to-forget ones (3's import, 7, and 10) are why this checklist
exists.

1. **Agree the mapping first** (see `BUILDING.md` and CLAUDE.md): models,
   fields, ownership, routes, pages, gates — in English. Confirm the
   product decisions (ownership, deletion behavior, visibility, free vs.
   paid) before touching code.
2. **Model(s)** in `backend/app/models/<concept>.py` (one file can hold
   several closely-related entities), following the house conventions:
   UUID pk with `server_default=func.gen_random_uuid()`, timezone-aware
   `created_at` with `server_default=func.now()`, explicit `ondelete` on
   every FK (owned rows CASCADE; optional attribution SET NULL),
   `index=True` on FKs you'll filter by.
3. **Import the new model module in `app/models/__init__.py`** — alembic
   autogenerate only sees imported models; forgetting this ships an EMPTY
   migration.
4. **Migration**: `python -m alembic revision --autogenerate -m "<what>"`,
   then READ the generated file (autogenerate misses server-default changes
   and renames), then `python -m alembic upgrade head`. Then regenerate the
   data-model diagram — `python scripts/generate_erd.py` — and show the
   user what changed in the picture (docs/data-model.md): new entities and
   edges are how a non-engineer reviews a schema change.
5. **Schemas** in `backend/app/schemas/<concept>.py`: input and output
   models separate; `Literal` unions for enum-ish strings — response
   models define the OpenAPI schema the frontend types are generated from,
   so keep them precise.
6. **CRUD** in `backend/app/crud/<concept>.py` (Session in, ORM objects
   out), then the **service** in `backend/app/services/<concept>.py`
   (business rules, external APIs, HTTPException for domain errors), then
   **routes** in `backend/app/routes/<concept>.py` (thin; prefix
   `/api/<concept>`; auth deps from `app/core/auth.py`; hidden resources
   404 rather than 403; `response_model=` on every route) — included from
   `main.py`.
7. **Regenerate the type bridge**: from `backend/`
   `python scripts/export_openapi.py`, then from `frontend/`
   `npm run generate:types`. The compiler now points at every frontend
   call site the backend change affects. Commit the regenerated
   `frontend/lib/api-types.d.ts`.
8. **Client functions** in `frontend/lib/api.ts`, typed via the
   `Schema<"...">` helper. Follow the existing error style (readable
   messages, graceful degradation for optional features).
9. **Page/components** under `frontend/app/`. If the page is public, add it
   to `sitemap.ts`; if authed, add it to the `robots.ts` disallow list.
   If the feature calls the LLM, wire `record_usage` +
   `enforce_turn_cap` from `app/services/usage.py` (see
   `app/services/chat.py`).
10. **Verify** with the `verify` skill: drive the new flow through the Next
    origin (port 3000) in the running app — not just the build.

If the domain has grown past ~3 files in every layer, propose promoting it
to `app/modules/<domain>/` (same five folders nested) before adding more.
