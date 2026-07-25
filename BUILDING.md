# Building with this template — a non-engineer's guide

You bring the domain knowledge and make the product decisions; the agent
brings the engineering. This page is the shared vocabulary between those two
roles. Every feature in this stack is built from the same small set of
parts, and each part has a plain-English meaning.

## The translation table

| When you're thinking… | It becomes | The decisions that are YOURS |
| --- | --- | --- |
| "A thing the app needs to remember" (a patient, a note, a quote, a plan) | A **SQLAlchemy model** — one database table per kind of thing (`backend/app/models/`) | Does each one belong to a user? Does it point at another thing? What happens to it when its owner is deleted? |
| "A change to what's remembered" (new field, new kind of thing) | An **Alembic migration** (`backend/alembic/versions/`) | None — the agent generates and applies these; you never edit them |
| "What someone sends in" vs. "what they get shown" | **Pydantic schemas** (`backend/app/schemas/`) — input and output are deliberately separate | What's visible to whom (the output shape is a promise the frontend depends on) |
| "Reading and writing what's remembered" | **CRUD functions** (`backend/app/crud/`) — the only code that talks to the database | None — mechanical |
| "The rules of how the product behaves" | **Services** (`backend/app/services/`) — business logic, and where Stripe/Claude/email get called | The rules themselves — this layer IS your product decisions, in code |
| "An action someone can take" (save, ask, upgrade, delete) | A **FastAPI route** (`backend/app/routes/`) | Who's allowed to do it, and what the user should see when it fails |
| "A rule about who can do it" | An **auth dependency** on the route — signed-in (`current_active_user`), optional (`current_user_optional`), paying (`require_plus`), admin (`current_superuser`) | Free vs. paid vs. admin — a pricing decision, not a technical one |
| "A team/workspace that shares the app" (a practice, a firm, a company) | An **Organization** with role-based memberships — the orgs/RBAC module (see MODULES.md); in a teams app, new things usually belong to the org, not to one user | Who counts as a team? What can each role (owner / admin / member) do? What happens to the team's data when the owner leaves? |
| "A rule about who ON THE TEAM can do it" | A **role gate** on the route — `require_org_role("member" / "admin" / "owner")` | Which role each action needs — an org-chart decision, not a technical one |
| "A screen" | A **Next.js page** (`frontend/app/<route>/page.tsx`) | Is it public (search engines see it) or behind sign-in? |
| "The screen talking to the backend" | A function in `frontend/lib/api.ts`, typed automatically from the backend | None — mechanical |
| "Something that costs money each time it's used" | The **usage metering** pattern (`backend/app/services/usage.py`) | The monthly free allowance, and what the upgrade nudge says |
| "The AI responds, gradually, like typing" | The **SSE streaming** pattern (`backend/app/services/chat.py` is the reference) | The AI's voice and boundaries (the system prompt) |

## Sentences that start features

Each of these is a complete, useful request — and predicts what will get built:

- **"I need the app to keep track of ___."** → a model (+ migration, schemas, routes, and usually a page). The agent should ask you the ownership questions before writing anything.
- **"Users should be able to ___."** → a route, wired to a button or form on some page.
- **"Only paying users should ___."** → a `require_plus` gate on a route, plus the upgrade nudge in the UI.
- **"Teammates should be able to ___ (but only admins should ___)."** → role gates on routes in the orgs module, and the matching show/hide on the page.
- **"There should be a page where ___."** → a Next.js page; decide together whether it's public (SEO surface) or authed.
- **"The AI should ___ / shouldn't ___."** → the system prompt in `backend/app/services/llm.py`.
- **"Something looks wrong."** → describe what you expected vs. what you saw; the agent drives the app with the verify skill to reproduce it.

## The picture of your app

`docs/data-model.md` is a diagram of everything the app remembers — one box
per kind of thing, one arrow per relationship, with the deletion behavior
written on each arrow. It's regenerated from the code after every schema
change, so it is always true. When the agent proposes a new feature, ask to
see how the picture changes; approving a diagram change is how you approve
a data-model change without reading code.

## The rhythm

1. You describe the concept or feature in English.
2. The agent replies with the mapping — which models and fields, who owns
   what, which routes and pages — **in English, before writing code**.
3. You settle the product questions (ownership, visibility, deletion, free
   vs. paid, wording).
4. The agent implements the whole slice — including the migration and
   regenerating the frontend types (`/new-feature` is the checklist).
5. The agent verifies it in the running app; you check that it feels right.

Rule of thumb: a new **noun** in your product means a model; a new **verb**
means a route; a new **place** means a page. If a request doesn't add any of
those, it's a change to something that already exists — say what should be
different about it.
