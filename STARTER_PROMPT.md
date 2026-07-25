# Starter prompt

Copy the block below, fill in the three placeholders, and paste it as your
first message to Claude Code in a NEW empty folder. The agent does the rest.
(Once the template lives on GitHub, replace the local path with the repo URL —
or use "Use this template" + clone, and delete step 1.)

```
I'm starting a new project from my stack template. Set it up completely,
verify it runs, and then ask me what we're building.

Fill-ins:
- TEMPLATE_SOURCE: <local path to stack-template, or a git URL>
- SLUG: <lowercase project identifier, e.g. carelog>
- PRODUCT_NAME: <human name, e.g. "CareLog">

Treat the numbered steps as goals with reference commands, not a script —
verify each stage before moving on, and adapt when this machine differs
(taken ports, Docker not running, etc.).

1. Copy the template into this folder:
   robocopy "<TEMPLATE_SOURCE>" . /E /XD .git node_modules .next __pycache__
   (macOS/Linux: rsync -a --exclude .git --exclude node_modules --exclude
   .next --exclude __pycache__ "<TEMPLATE_SOURCE>/" .
   From a git URL: clone to a temp dir, copy without .git.)
2. python rename.py <SLUG> "<PRODUCT_NAME>"   (it self-deletes on success)
3. git init, then commit everything as "Initial commit from stack-template".
   You may commit during this setup; afterward the CLAUDE.md rule applies
   (I coordinate commits).
4. Read MODULES.md, then ask me the module questions IN PRODUCT TERMS
   before touching the database:
   - "Will teams of people share data in this app, or does each user have
     their own?" → keep or remove the orgs/RBAC module
   - "Is there a conversation with an AI in this product?" → keep or
     remove the chat module
   - "Will this app charge money?" → keep or remove the billing module
   - "Should new accounts have to verify their email address?" → set
     REQUIRE_EMAIL_VERIFICATION in backend/.env (no files change)
   Remove unwanted modules by following their removal checklists in
   MODULES.md, and commit the result. The template ships with NO alembic
   migrations — the initial migration is generated in step 7, after this
   selection, so the schema only ever contains what we chose.
5. Defaults: backend port 8000, Postgres host port 5432, frontend 3000.
   CHECK each is free before using it; pick alternatives if not, apply them
   (backend/docker-compose.yml, backend/.env, API_URL for the frontend),
   and record the final choices in CLAUDE.md — it has a line reserved.
6. Backend setup (from backend/): create .venv, install requirements
   (invoke pip/alembic/uvicorn via .venv's python -m so shell activation
   policy never matters), copy .env.example to .env. Ask me for my
   ANTHROPIC_API_KEY; if I don't have one handy, leave it unset — chat
   degrades gracefully and everything else works.
7. Start Postgres (docker compose up -d), generate the initial migration,
   and apply it:
   python -m alembic revision --autogenerate -m "initial schema"
   python -m alembic upgrade head
   Sanity-check the generated migration lists exactly the tables the module
   selection implies (MODULES.md names them), then commit it.
8. Ask me for a superuser email + password, then run
   python scripts/create_superuser.py <email> <password>.
9. Frontend setup (from frontend/): npm install.
10. Launch both servers as background tasks (uvicorn on the chosen backend
    port; next dev with API_URL pointing at it). Verify like a user would:
    /api/health THROUGH the frontend origin (that exercises the rewrite
    proxy), the landing page, and register + login with a throwaway
    verify-*@example.com account.
11. Delete STARTER_PROMPT.md, commit the setup adjustments, and give me a
    short report: the URLs, the ports you settled on, the modules we kept,
    what you verified, and what's dark until keys are added (Stripe,
    Resend, Sentry).

Then read BUILDING.md and CLAUDE.md — they define how we work together —
and ask me what this app should do. I'll describe it in plain English.
```
