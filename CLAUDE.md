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

Especificación viva en Markdown (fuente de verdad; los `.docx` son histórico congelado): `user-stories.md` (US-001..US-056), `screen-inventory.md` (SCR-001..SCR-030), `test-cases.md` (TC-001..TC-152), `posthog-events.md`. La auditoría más reciente está en `Core/AUDIT-2026-09-03.md`.

## Design tokens (identidad Virtual English, Rediseño 2026-09-03)

Todo el color de la app pasa por variables CSS en **`app/globals.css` (`:root`)** — no hay hex de marca hardcodeados en el código de producción (el único hex crudo intencional es el SVG del logo de Google en la bienvenida). Para recolorear la plataforma se editan las definiciones de los tokens ahí; el resto (`page.module.css` y estilos inline en `ExercisesPanel.tsx` / `exercises-window` / `stage`) consume `var(--*)`.

- **Superficies (navy tint):** `--p1..p5` de más oscuro a más claro (`#0F1B2D → #2B4668`).
- **Texto (tono frío):** `--tx` (`#EAF1F8`) > `--tx2` (`#A6BACE`) > `--tx3` (`#7E97B4`, tenue).
- **Acento de marca:** `--ac` celeste `#6AA0E6` (texto/íconos/ticks/estados activos, AA sobre navy) + `--ac2/--ac3` (tints). `--acDeep #3D6FB6` / `--acDeepHover #2F5A94` para **fills sólidos con texto blanco** (botón Play). Sobre un fill celeste (`--ac`) el texto oscuro es `--p1`.
- **Estado:** `--gr` verde (live/SRT/OK), `--bl` cian `#2BB0E0` (info: volumen/delay+/restore — deliberadamente distinto de los azules de marca), `--rd` rojo `#E86B6B` (error/delay−).
- La bienvenida (SCR-025) va con **fondo blanco** y `public/logo-ve.jpeg` (fuera del tema oscuro, para fundir el JPEG). Los subtítulos van **blancos** (US-014), no se pintan de acento.

## Architecture

Single-page Next.js 15 (App Router) + React 19 + Tailwind v4 application. Core files:

- **`app/page.tsx`** — one client component (`'use client'`) holding the whole UI as a state machine with two screens (`'load'` and `'player'`). Owns the video element, keyboard shortcuts, phrase selection, and the upload flow. UI strings are in Spanish; product is aimed at teachers sharing a video over Zoom.
- **`app/api/transcribe/route.ts`** — Node runtime route (`maxDuration = 300`). **[Corregida 2026-09-05]** Recibe `{ blobUrl, mimeType }` en **JSON** (ya no multipart FormData: el video de 5-8 MB rebotaba con HTTP 413 por el tope de ~4.5 MB de body de las funciones serverless de Vercel). Flow: `fetch(blobUrl)` baja el video de Vercel Blob → resumable upload to `generativelanguage.googleapis.com/upload/v1beta/files` → poll until `state === 'ACTIVE'` (up to 30 × 3s) → `gemini-2.5-flash:generateContent` con prompt SRT-only → return `{ srt }` y best-effort delete. El video lo sube el **browser directo a Blob** (ver `transcribe()` en page.tsx), reutilizando el flujo de la biblioteca; el video queda guardado en la biblioteca del profesor.
- **`app/api/upload-init/route.ts`** — Node runtime, `maxDuration = 30`. **Ruta muerta a propósito.** Devuelve una upload URL reanudable de Gemini para que el browser haga PUT directo, pero eso está **bloqueado por el CORS de Google** (Gemini no manda `Access-Control-Allow-Origin` en el endpoint de upload). El 413 se resolvió con Vercel Blob (arriba), **no** con este endpoint. No reactivar.
- **`lib/srt.ts`** — pure functions extracted from page.tsx: `parseSRT`, `timeToSec`, `fmtTime`, `Phrase` type.
- **`lib/hl.tsx`** — `hl(text): React.ReactNode[]` highlights content words (>3 chars, not in SKIP set) with `color:#E8C547`. Returns ReactNode[] so React escapes text automatically — safe against XSS via SRT files.

Bloques posteriores (13–17), no reflejados en la descripción original de dos pantallas — `app/page.tsx` maneja hoy cuatro pantallas (`'load' | 'player' | 'library' | 'exercises'`) más un gate de login:

- **Biblioteca (Bloque 13):** `lib/auth.ts` (NextAuth v5 + Google, estrategia `database`), `lib/db/schema.ts` (tablas de Auth.js + `videos` + `video_sessions`) y `lib/db/index.ts` (Neon + Drizzle). Rutas: `app/api/auth/[...nextauth]/route.ts`, `app/api/videos/route.ts` (GET/POST), `app/api/videos/[id]/route.ts` (GET/PATCH/DELETE), `app/api/videos/[id]/session/route.ts` (PUT), `app/api/blob-upload/route.ts` (Vercel Blob). Cuota 8 GB y helpers en `lib/library.ts`; la expiración (`VIDEO_RETENTION_DAYS`) está definida pero **no** implementada.
- **VE Drills (Bloques 14–16):** `app/api/exercises/route.ts` genera quiz/cloze/match con Anthropic `claude-sonnet-4-6` (tool-use); `lib/exercises.ts` (tipos + `resolveScope`), `app/ExercisesPanel.tsx` (UI + pestaña en el player), `lib/pdf.ts` + jsPDF (export alumno/profesor), y la ventana autónoma `app/exercises-window/page.tsx` con `lib/exercisesChannel.ts` (BroadcastChannel `ve-exercises-v1`).
- **Gate de login (Bloque 17):** con `authStatus !== 'authenticated'` solo se muestra la bienvenida; el modo invitado fue eliminado. `app/providers.tsx` provee `SessionProvider`.
- **Analítica:** `lib/capture.ts` (`capture(event, props)` → `window.__ve_posthog`). Nota: 24 eventos especificados en `posthog-events.md` no tienen `capture()` real (ver auditoría).

Key flow details that aren't obvious from the file list:

- **[Corregida 2026-09-05]** The frontend uploads the video **directly to Vercel Blob** via `upload()` from `@vercel/blob/client` (`transcribe()` in page.tsx), then calls `POST /api/transcribe { blobUrl }`. Real upload progress comes from `upload({ onUploadProgress })`; after upload there is still a fake "transcribing" animation until Gemini responds. This bypasses the 413 (video never passes through the function) and the Gemini CORS problem (Blob sends proper CORS headers). Side effect: the video is saved to the teacher's library. On any failure (upload, transcription, 0 phrases, or cancel) the just-created video is deleted (`DELETE /api/videos/[id]`, `keepalive:true`) so no orphan eats quota — gated by a `succeeded` flag in the `finally`. **Player source rule: `src = videoUrl || storageUrl`.** `videoUrl` is the **local objectURL** (only alive while the `File` is in memory this session: video+SRT drop or just-transcribed) → a just-transcribed video plays instantly from the local copy, **no re-download from Blob**. `storageUrl` is the **Blob URL** (set on transcribe success and by `openFromLibrary`) and is the fallback when there is no local File (reopen from library). Discriminator: `videoFileRef.current` present ⟺ local source; absent ⟺ Blob. There is **no auto-restore of the open video after a page reload** (out of scope); `storageUrl` is kept for that future case. The transcribe `transcribe()` never revokes/replaces the local objectURL — it is only revoked on `backToLoad`/`cancelTranscription`/`handleSizeWarnDismiss` (leaving the player) or replaced in `handleFiles`/`closeStage`, never while the video is displayed.
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

**[Corregida 2026-09-05]** El video ya no pasa por `req.formData()` de `/api/transcribe`: el browser lo sube directo a Vercel Blob y la función hace `fetch(blobUrl)` + `.blob()` para pasarlo a Gemini (pico ≈ videoSize al bufferear el `.blob()`). Esto elimina el 413 de ~4.5 MB de body. El límite real ahora es la **duración** del video contra `maxDuration=300s` (no el tamaño): en la práctica videos de hasta ~10-15 min transcriben cómodos (`DURATION_WARN_MIN=15` avisa por encima de eso). El tope de memoria sigue siendo ~1.5 GB en Pro para el `.blob()`.

## Deployment

Deploys to Vercel as a Next.js project (`vercel.json` only sets `framework: nextjs`). The 300-second `maxDuration` on the transcribe route is required for large-video Gemini round-trips and is the main reason it must run on a paid Vercel plan (Hobby caps at 60s).
