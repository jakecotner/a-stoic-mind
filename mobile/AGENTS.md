# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Working in this app

- The phone talks straight to FastAPI with a bearer token — never assume
  the web app's cookie/proxy setup. Everything auth lives in
  `src/lib/api.ts` + `src/lib/auth-context.tsx`.
- Mirror `frontend/lib/api.ts` when adding endpoints, using the `getOr` /
  `send` helpers. Types come from `src/lib/api-types.d.ts`, which is a COPY
  of `frontend/lib/api-types.d.ts` — after a backend schema change,
  regenerate there and re-copy (see README.md).
- New tab = a file in `src/app/` + a Trigger in
  `src/components/app-tabs.tsx` (both `sf` and `md` icons). Nested stacks:
  a directory with its own `_layout.tsx`.
- Streaming (SSE) must use `expo/fetch`, not the global fetch.
- Dev backend URL is derived from the Metro host; only `BACKEND_PORT` in
  `src/lib/api.ts` is project-specific.
