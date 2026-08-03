# A Stoic Mind — mobile

The companion Expo (React Native) app. Signs in against the same FastAPI
backend as the web app and mirrors its features where a phone does them
well: the daily passage, narration (background playback with lock-screen
"now playing"), the library reader, the practice calendar, and the journal —
including **dictation**: record an entry aloud and the backend transcribes
it into the draft.

## How it fits the stack

The web frontend proxies `/api/*` through the Next origin and rides an
httponly cookie. The phone can't do that — it talks **straight to FastAPI**
and authenticates with the backend's **bearer transport**
(`/api/auth/bearer/login`). Both transports share one JWT strategy, so one
account works everywhere. The token lives in the device keychain
(expo-secure-store).

What's on each tab:

- **Today** — the daily passage and its reflection, both narratable; a
  listen can roll from the passage into the reflection (the `auto` chip).
- **Journal** — write or dictate entries; each saved entry gets its LLM
  reflection (same free-tier cap as the web); browse previous days.
- **Library** — works → parts → reader. Tap a passage for its breakdown;
  a listen can continue to the end of the part. "Mark as read" feeds the
  practice calendar. (Margin notes are web-only for now.)
- **Practice** — the standing intention and the month at a glance, with
  each day's record beneath.
- **Account** — plan (upgrades/billing happen **on the website** — Stripe
  checkout is not in the app), narration voice, sign out, delete account.

Narration internals live in `src/lib/narration.ts` (a port of the web's
engine onto expo-audio: one queue, one player, voice/pace/continue prefs in
`src/lib/prefs.ts`). Dictation records with expo-audio and POSTs the file
to `/api/journal/transcribe` (OpenAI speech-to-text, same key as TTS).

## Daily development

1. Backend reachable from the phone — from `backend/`:

   ```
   .venv/Scripts/python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
   ```

   `--host 0.0.0.0` makes it answer on your Wi-Fi, not just localhost. If
   Windows Firewall asks, allow private networks.

2. Dev server — from `mobile/`: `npx expo start` (pass `--port` if 8081 is
   taken; the app derives the backend address either way).

3. On the phone: **Expo Go** (scan the QR) for zero-setup development, or an
   **EAS development build** for a real installable app:

   ```
   npx eas-cli build --platform ios --profile development
   ```

   First run: `eas login`, `eas init`, and an Apple sign-in to generate
   credentials. Rebuilds are only needed when native modules change — day to
   day the installed app loads code live from the dev server.

For deployed builds set `EXPO_PUBLIC_API_URL` (the backend origin) and
`EXPO_PUBLIC_WEB_URL` (the website, for the account links) in `eas.json`.

## Types

After any backend schema change, regenerate — the copy step is wired into
the frontend's script:

```
cd backend  && python scripts/export_openapi.py
cd frontend && npm run generate:types   # also copies to mobile/src/lib/
```

## Where things live

- `src/app/` — screens (expo-router file routing; tabs declared in
  `src/components/app-tabs.tsx`, one Trigger per screen)
- `src/lib/api.ts` — API client; add endpoints with `getOr`/`send`,
  mirroring `frontend/lib/api.ts`
- `src/lib/auth-context.tsx` — session state gating sign-in vs. the app
- `src/lib/narration.ts` + `src/lib/prefs.ts` — the listening engine
- `src/components/ui.tsx` — shared UI kit (`Accent` is the brand bronze)
