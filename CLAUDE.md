# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server on http://localhost:3000
- `npm run build` — production build (surfaces TypeScript/lint errors)
- `npm start` — serve the built app
- `npm test` — run the full Vitest suite (non-interactive, CI-safe)
- `npm run test:watch` — Vitest in watch mode for local development
- `npm run typecheck` — `tsc --noEmit` (type-only check)
- `npm run db:push` — `drizzle-kit push` con `.env.development.local` (aplica el esquema a Neon)
- `npm run smoke:exercises` — smoke test del endpoint de ejercicios (`scripts/smoke-exercises.mjs`, requiere `ANTHROPIC_API_KEY`)

## Test suite

Vitest v4 with `@vitejs/plugin-react`, jsdom environment (default), and `// @vitest-environment node` per-file override for API route tests.

- `tests/lib/srt.test.ts` — 18 unit tests for `parseSRT`, `timeToSec`, `fmtTime`
- `tests/lib/hl.test.tsx` — 11 tests for `hl()`: RTL-based behavior checks + XSS/DOM security checks
- `tests/api/transcribe.test.ts` — 9 MSW-based tests + 1 todo for `POST /api/transcribe` (node environment)
- `tests/api/upload-init.test.ts` — 7 MSW-based tests for `POST /api/upload-init` (node environment)
- `tests/mocks/gemini-handlers.ts` — reusable MSW handlers for Gemini API endpoints
- `tests/setup.ts` — global setup (`@testing-library/jest-dom`)

Total: 45 passed + 1 todo across 4 test files.

Path alias `@/` maps to the repo root in both `tsconfig.json` and `vitest.config.ts`.

## Production code modification policy

**NEVER modify files under `app/` without explicit user approval per change.**

Workflow for any change to `app/page.tsx` or `app/api/**/*.ts`:
1. Read the current file
2. Show the exact diff (old → new)
3. Wait for explicit "ok, aplicá el cambio" before writing

Files that can be created or edited freely (no approval needed):
- `tests/**` — test files
- `lib/**` — pure utility helpers (no `'use client'`, no CSS imports)
- `package.json` — dev dependency additions
- Config files: `vitest.config.ts`, `tsconfig.json` (non-breaking changes)

## Required environment

- `GEMINI_API_KEY` — Google Gemini API key, read at runtime by `app/api/transcribe/route.ts`. Without it the transcribe endpoint returns 500. Stored locally in `.env.local` (gitignored) and as a Vercel project env var (`.vercel/project.json` links to project `virtual-english-player`).
- `ANTHROPIC_API_KEY` — Claude API key (modelo `claude-sonnet-4-6`), read by `app/api/exercises/route.ts` (VE Drills). Sin ella el endpoint de ejercicios devuelve 500.
- `DATABASE_URL` — Neon Postgres (pooled), leída en runtime por `lib/db/index.ts`. `DATABASE_URL_UNPOOLED` la usa `drizzle-kit` (`drizzle.config.ts`) y `db:push`.
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — NextAuth v5 / login con Google (`lib/auth.ts`).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob, usado por `app/api/blob-upload/route.ts`.

Ver `.env.example` para la plantilla completa.

## Documentación funcional (`Core/`)

Especificación viva en Markdown (fuente de verdad; los `.docx` son histórico congelado): `user-stories.md` (US-001..US-055), `screen-inventory.md` (SCR-001..SCR-030), `test-cases.md` (TC-001..TC-142), `posthog-events.md`. La auditoría más reciente está en `Core/AUDIT-2026-09-03.md`.

## Architecture

Single-page Next.js 15 (App Router) + React 19 + Tailwind v4 application. Core files:

- **`app/page.tsx`** — one client component (`'use client'`) holding the whole UI as a state machine with two screens (`'load'` and `'player'`). Owns the video element, keyboard shortcuts, phrase selection, and the upload flow. UI strings are in Spanish; product is aimed at teachers sharing a video over Zoom.
- **`app/api/transcribe/route.ts`** — Node runtime route (`maxDuration = 300`) that proxies a video file to Google Gemini. Flow: receive multipart upload → resumable upload to `generativelanguage.googleapis.com/upload/v1beta/files` → poll the file until `state === 'ACTIVE'` (up to 30 × 3s) → call `gemini-2.5-flash:generateContent` with a strict prompt that demands SRT-only output → return `{ srt }` and best-effort delete the uploaded file.
- **`app/api/upload-init/route.ts`** — Node runtime, `maxDuration = 30`. Accepts `{ mimeType, size }` JSON, calls Gemini's resumable upload start, returns `{ uploadUrl }` to the browser. The browser then PUTs the video directly to that URL, bypassing Vercel's body limit. API key stays server-side.
- **`lib/srt.ts`** — pure functions extracted from page.tsx: `parseSRT`, `timeToSec`, `fmtTime`, `Phrase` type.
- **`lib/hl.tsx`** — `hl(text): React.ReactNode[]` highlights content words (>3 chars, not in SKIP set) with `color:#E8C547`. Returns ReactNode[] so React escapes text automatically — safe against XSS via SRT files.

Bloques posteriores (13–17), no reflejados en la descripción original de dos pantallas — `app/page.tsx` maneja hoy cuatro pantallas (`'load' | 'player' | 'library' | 'exercises'`) más un gate de login:

- **Biblioteca (Bloque 13):** `lib/auth.ts` (NextAuth v5 + Google, estrategia `database`), `lib/db/schema.ts` (tablas de Auth.js + `videos` + `video_sessions`) y `lib/db/index.ts` (Neon + Drizzle). Rutas: `app/api/auth/[...nextauth]/route.ts`, `app/api/videos/route.ts` (GET/POST), `app/api/videos/[id]/route.ts` (GET/PATCH/DELETE), `app/api/videos/[id]/session/route.ts` (PUT), `app/api/blob-upload/route.ts` (Vercel Blob). Cuota 8 GB y helpers en `lib/library.ts`; la expiración (`VIDEO_RETENTION_DAYS`) está definida pero **no** implementada.
- **VE Drills (Bloques 14–16):** `app/api/exercises/route.ts` genera quiz/cloze/match con Anthropic `claude-sonnet-4-6` (tool-use); `lib/exercises.ts` (tipos + `resolveScope`), `app/ExercisesPanel.tsx` (UI + pestaña en el player), `lib/pdf.ts` + jsPDF (export alumno/profesor), y la ventana autónoma `app/exercises-window/page.tsx` con `lib/exercisesChannel.ts` (BroadcastChannel `ve-exercises-v1`).
- **Gate de login (Bloque 17):** con `authStatus !== 'authenticated'` solo se muestra la bienvenida; el modo invitado fue eliminado. `app/providers.tsx` provee `SessionProvider`.
- **Analítica:** `lib/capture.ts` (`capture(event, props)` → `window.__ve_posthog`). Nota: 24 eventos especificados en `posthog-events.md` no tienen `capture()` real (ver auditoría).

Key flow details that aren't obvious from the file list:

- The frontend uploads via **`XMLHttpRequest`** (not `fetch`) specifically to get `upload.onprogress` events for the progress bar. After the upload completes there is a fake "transcribing" progress animation that ticks until the server actually responds.
- Subtitle sync runs on **both** `timeupdate` and a `requestAnimationFrame` loop — the RAF loop exists because `timeupdate` alone fires too coarsely for tight subtitle timing. Several pieces of state (`phrasesRef`, `curIdxRef`, `ccRef`, `delayRef`) are mirrored into refs so the RAF callback and event listeners read fresh values without re-binding.
- `parseSRT` is tolerant: strips ```` ``` ```` code fences (Gemini occasionally adds them despite the prompt), normalizes CRLF, accepts `HH:MM:SS,mmm` or `MM:SS` timestamps.
- Drag-and-drop on the load screen accepts video + SRT together. If only a video is dropped, it goes through `/api/transcribe`; if an SRT is also present, transcription is skipped and the SRT is parsed directly in the browser. After successful transcription the generated SRT is auto-downloaded.
- Keyboard shortcuts in player mode (esquema por flechas, 2026-09-03): Space (play/pause), → / ← (next/prev phrase; **hold** to auto-repeat frame-to-frame every `NAV_HOLD_MS`=450ms), ↓ (restart current phrase), ↑ (jump to start of the current section — fixed grid of `SECTION_SECONDS`=2s from `phrase.start`). A/D/R/W were removed; micro-repeat was removed entirely; volume is slider-only (the old ↑/↓ volume shortcut is gone). All are no-ops when an `<input>` is focused. Auto-repeat uses a `setInterval` loop (ignores OS key-repeat via `e.repeat`) cleared on keyup/blur/unmount. Constants live at the top of `app/page.tsx`.

### Memory budget per request (Node.js runtime, Vercel Pro)

| Stage | Memory | Owner |
|-------|--------|-------|
| `req.formData()` buffers full multipart body | ~videoSize | Next.js (not fixable here) |
| Blob passthrough to Gemini PUT | ~0 extra | our code (post Bug 2 fix) |
| **Peak total** | **~videoSize** | — |

Practical limit: ~1.5 GB on Pro (3 008 MB function memory). For larger videos: `/api/upload-init` returns a Gemini upload URL, browser uploads directly. **Backend ready (Bug 4 session 1); frontend integration pending (Bug 4 session 2).**

## Deployment

Deploys to Vercel as a Next.js project (`vercel.json` only sets `framework: nextjs`). The 300-second `maxDuration` on the transcribe route is required for large-video Gemini round-trips and is the main reason it must run on a paid Vercel plan (Hobby caps at 60s).
