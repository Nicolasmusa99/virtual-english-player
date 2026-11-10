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
- `tests/api/transcribe.test.ts` — MSW-based tests for `POST /api/transcribe` (node environment)
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

## Design tokens (identidad Virtual English, rediseño 2026-10 "la sala y el aula")

Todo el color de la app pasa por variables CSS en **`app/globals.css` (`:root`)** — no hay hex de marca hardcodeados en el código de producción (el único hex crudo intencional es el SVG del logo de Google en la bienvenida). Para recolorear la plataforma se editan las definiciones de los tokens ahí; el resto (`page.module.css` y estilos inline en `ExercisesPanel.tsx` / `exercises-window` / `stage`) consume `var(--*)`.

- **Concepto:** *la sala* (el player, oscuro: se proyecta y se comparte en Zoom) y *el aula* (todo lo demás, de día: `.lightScope` en `page.module.css` remapea los tokens a la paleta clara).
- **Paleta base:** `--tinta #14284B` (texto del aula, fondo de la sala; navy del logo), `--azul #1F5FBF` (acciones principales con texto blanco; azul de "English" en el logo) / `--azulHover`, `--amarillo #F2C94C`, `--pizarra #5A6B85` (secundario del aula), `--tiza #E3E9F2` (líneas y campos del aula), `--rojo #B93A33` (cancelado/error).
- **El amarillo significa SOLO "acá y ahora"** (frase actual, hoy, la raya de la hora), como resaltador con texto `--tinta` encima. Nunca decora.
- **Tokens de superficie/texto** (los consumen todos los módulos): `--p1..p5` (sala: desde la tinta; aula: blanco → `--tiza`), `--tx/--tx2/--tx3`, `--ln/--ln2`, `--ac` (en la sala, Azul VE aclarado `#8FB4EC` para texto AA; en el aula, `--azul`), `--acDeep/--acDeepHover` (= `--azul`, fills con texto blanco), `--gr`, `--bl` (cian de info, distinto de los azules de marca), `--rd`.
- **Tipografía:** UNA familia, **Verdana** (fuente de sistema, sin `next/font`): `--font-sans: Verdana, Geneva, Tahoma, sans-serif` en el `:root` de `app/globals.css`, también para los subtítulos. Decisión del dueño (2026-10-16); antes era Atkinson Hyperlegible Next. El PDF de ejercicios (jsPDF) sigue en Helvetica porque Verdana no se puede embeber. Horas con `font-variant-numeric: tabular-nums`. Ya no hay `--font-mono` ni `--font-public-sans` (se quitaron al terminar el rediseño): todo usa `--font-sans`. Los estilos del panel de Ejercicios viven en `app/exercises.module.css`. Sin mayúsculas espaciadas, sin "·" ni "→" decorativos.
- **Rediseño 2026-11 ("moderno", misma paleta y Verdana):** el aula va sobre `--fondo` y todo son tarjetas blancas redondeadas (`--r-tarjeta`, `--sombra`); lo más importante de cada pantalla va en un panel de tinta (`.hero` en `aula.module.css`, `.clNext` en `student.module.css`). Botones tipo píldora (`.btn`, `.btnPri`, `.btnSec`, `.btnInk`, `.btnGhost`). `AulaPage` envuelve cada pantalla en una tarjeta; con `bare` ("Hoy") la pantalla arma las suyas. **Inicio del profe** (`TeacherToday`): panel de la próxima clase (hora, cuánto falta, Zoom, ver alumno), "Tus clases de hoy" con una línea de horas (`dayTimeline` en `lib/todayView.ts`) y la lista de siempre, accesos rápidos, y la semana en 7 tarjetas; un profe nuevo ve "Primeros pasos" (sala de Zoom, primer alumno, primera clase: `firstSteps`; se ocultan solos al completarse o con "Ocultar", `localStorage` `ve-first-steps-done`). **Inicio del alumno** (`StudentApp`): primero cuándo y cómo son las clases (panel con "Cómo entrar" y "Tus próximas clases"), después el material con las carpetas a la izquierda ("Todo" al entrar); sin profe todavía, se le dice qué falta y puede copiar su mail. **Player:** las acciones secundarias de la barra van en el menú "Más" (`ActionMenu`); en pantallas angostas pasa a una columna.
- La bienvenida (SCR-025) va con **fondo blanco** y `public/logo-ve.jpeg` (fuera del tema oscuro, para fundir el JPEG). Los subtítulos van **blancos** (US-014), no se pintan de acento.

## Architecture

Single-page Next.js 15 (App Router) + React 19 + Tailwind v4 application. Core files:

- **`app/page.tsx`** — one client component (`'use client'`) holding the whole UI as a state machine with two screens (`'load'` and `'player'`). Owns the video element, keyboard shortcuts, phrase selection, and the upload flow. UI strings are in Spanish; product is aimed at teachers sharing a video over Zoom.
- **`app/api/transcribe/route.ts`** — Node runtime route (`maxDuration = 300`). **[Corregida 2026-09-05]** Recibe `{ blobUrl, mimeType }` en **JSON** (ya no multipart FormData: el video de 5-8 MB rebotaba con HTTP 413 por el tope de ~4.5 MB de body de las funciones serverless de Vercel). Flow: `fetch(blobUrl)` baja el video de Vercel Blob → resumable upload to `generativelanguage.googleapis.com/upload/v1beta/files` → poll until `state === 'ACTIVE'` (up to 30 × 3s) → `gemini-2.5-flash:generateContent` con prompt SRT-only → return `{ srt }` y best-effort delete. El video lo sube el **browser directo a Blob** (ver `transcribe()` en page.tsx), reutilizando el flujo de la biblioteca; el video queda guardado en la biblioteca del profesor.
- **`app/api/upload-init/route.ts`** — **Eliminada (2026-09-07).** Era el intento de PUT browser→Gemini, muerto por el CORS de Google (Gemini no manda `Access-Control-Allow-Origin`). El 413 se resolvió con Vercel Blob. No reintroducir.
- **`lib/srt.ts`** — pure functions extracted from page.tsx: `parseSRT`, `timeToSec`, `fmtTime`, `Phrase` type.
- **`lib/hl.tsx`** — `hl(text): React.ReactNode[]` highlights content words (>3 chars, not in SKIP set) with `color:#E8C547`. Returns ReactNode[] so React escapes text automatically — safe against XSS via SRT files.

Bloques posteriores (13–17), no reflejados en la descripción original de dos pantallas — `app/page.tsx` maneja hoy cuatro pantallas (`'load' | 'player' | 'library' | 'exercises'`) más un gate de login:

- **Biblioteca (Bloque 13):** `lib/auth.ts` (NextAuth v5 + Google, estrategia `database`), `lib/db/schema.ts` (tablas de Auth.js + `videos` + `video_sessions`) y `lib/db/index.ts` (Neon + Drizzle). Rutas: `app/api/auth/[...nextauth]/route.ts`, `app/api/videos/route.ts` (GET/POST), `app/api/videos/[id]/route.ts` (GET/PATCH/DELETE), `app/api/videos/[id]/session/route.ts` (PUT), `app/api/blob-upload/route.ts` (Vercel Blob). Cuota 8 GB y helpers en `lib/library.ts`; la expiración (`VIDEO_RETENTION_DAYS`) está definida pero **no** implementada.
- **VE Drills (Bloques 14–16):** `app/api/exercises/route.ts` genera quiz/cloze/match con Anthropic `claude-sonnet-4-6` (tool-use); `lib/exercises.ts` (tipos + `resolveScope`), `app/ExercisesPanel.tsx` (UI + pestaña en el player), `lib/pdf.ts` + jsPDF (export alumno/profesor), y la ventana autónoma `app/exercises-window/page.tsx` con `lib/exercisesChannel.ts` (BroadcastChannel `ve-exercises-v1`).
- **Gate de login (Bloque 17):** con `authStatus !== 'authenticated'` solo se muestra la bienvenida; el modo invitado fue eliminado. `app/providers.tsx` provee `SessionProvider`.
- **Carpetas y personas (2026-11):** tablas `folders` (student_id NULL = biblioteca del admin; con alumno = carpetas de ese alumno), `folder_videos` y `assignments.folder_id` (migración manual `drizzle/0005_carpetas.sql` + `verify_carpetas.mjs`). Rutas `/api/folders/**`; quién edita qué en `lib/staffAccess.ts`. Lo puro en `lib/folderView.ts`, `lib/materialView.ts` y `lib/peopleView.ts` (las pantallas no importan módulos con base). Rediseño de UX (2026-11-04): "Alumnos" del profe en tarjetas (material, carpetas, próxima clase; la de hoy en amarillo; orden por nombre o próxima clase) y "Usuarios" del admin en tabla por sección con acciones en el menú "⋯" (`ActionMenu`) y filtro "Sin profe"; el alta va en una ventana (`UsersPanel`, `/api/users/stats`). La pantalla de un alumno (`StudentView`) tiene pestañas Material / Clases; el material va con las carpetas a la izquierda (Todo, cada carpeta, Sin carpeta) y la elegida a la derecha: mover desde el "⋯" de cada video, tildar varios y moverlos o quitarlos juntos, arrastrar a una carpeta, y "Quitar" con "Deshacer". "Asignar material" abre `MaterialPicker` (buscar, filtrar, tildar varios; asigna en la carpeta que se está mirando). **Bibliotecas** (`LibraryBrowser`, 2026-11-05): un solo componente para "Mi biblioteca" (`mode="mine"`, reemplaza a `LibraryList` y `LibraryFolders`: además "Publicados"/"Privados" en la izquierda, estado en la miniatura, y publicar/editar tipo y nivel/despublicar/renombrar/eliminar desde el "⋯" o de a varios, con `PublishDialog`; eliminar siempre confirma y sugiere despublicar si hay publicados) y la **Biblioteca compartida** (`SharedLibrary` = `mode="shared"`, rediseño 2026-11-04): carpetas a la izquierda (Todos los videos, cada carpeta, Sin carpeta) y tarjetas a la derecha con buscador y filtros; el admin (`canManage`) arma las carpetas ahí mismo (crear, renombrar, ordenar, eliminar), tilda varios videos y los agrega a una carpeta (o los saca) de una vez, con "Deshacer", o los arrastra a una carpeta; el profe solo navega. Solo muestra lo publicado. Estilos en `app/shared.module.css`. "Usuarios" del admin (2026-11-04): tabla más liviana (una línea por dato con elipsis, el profe con su avatar, filtros en control segmentado, el nombre abre al alumno y las acciones en el "⋯"). Estilos en `app/material.module.css` y `app/people.module.css`.
- **Player (2026-11):** el dock del profe tiene el estilo del player del alumno (botones redondos con nombre debajo). Tocar el subtítulo en el video edita SOLO su texto, ahí mismo (Enter o salir del campo guarda, Escape cancela); los tiempos se tocan desde la lista de frases. El alumno NO ve el guion (2026-11-05): su panel del costado es solo "Sonido" (el mismo `VoiceBoostControl`; su `<video>` lleva `crossOrigin`); en el celu va debajo de los controles y la pantalla se desplaza entera.
- **Cuentas y fotos (2026-11, migración manual `drizzle/0006_cuentas.sql` + `verify_cuentas.mjs`):** columnas `password_hash`, `google_image`, `image_custom` en `user` (no hay "usuario": se entra con el MAIL). **Foto:** al entrar con Google, `signIn` en `lib/auth.ts` llama a `syncGoogleProfile` (guarda la foto de Google y la muestra si la persona no subió una propia; completa el nombre solo si estaba vacío). "Mi perfil" (`ProfilePanel`, en el aula como pantalla `'profile'` y en la vista del alumno) sube la foto a Vercel Blob en `avatars/<id>/` (recortada cuadrada en el navegador) por `/api/me/photo` (token, `PUT {url}` que solo acepta SU carpeta, `DELETE` vuelve a la de Google). `Avatar` muestra la foto o las iniciales. **Mail y contraseña:** el admin crea cuentas así (`POST /api/users` con `access: 'password'`; el mail es obligatorio siempre) y les cambia la contraseña (`PATCH /api/users/[id] {password}`, cierra sus sesiones). Hash scrypt en `lib/password.ts` (reglas puras en `lib/passwordRules.ts`). `POST /api/login {email, password}` verifica, abre una sesión en la tabla `session` de Auth.js y deja la cookie `authjs.session-token` (`__Secure-` en https, `lib/sessionCookie.ts`): desde ahí `auth()` la trata igual que una de Google (no se usa el provider Credentials porque no anda con la estrategia `database`). Mismo 401 para mail o contraseña mal; 5 fallos seguidos frenan 5 minutos (en memoria, `lib/loginThrottle.ts`). Cada uno cambia su contraseña en `/api/me/password` (pide la actual, cierra sus otras sesiones). **Crear cuenta** (bienvenida, `WelcomeAuth`): nombre y apellido, mail y contraseña (los tres obligatorios) o "Crear cuenta con Google"; entra directo como ALUMNO sin profe (decisión del dueño, 2026-11-04; el admin le asigna profe desde "Sin profe"). `POST /api/signup` (rol fijo, abre sesión; hasta 5 altas por IP cada 30 min). Con Google: el botón deja la cookie `ve-signup` y el `signIn` crea el alumno solo con esa cookie y mail verificado por Google (`lib/signup.ts`); "Iniciar sesión con Google" con un mail desconocido sigue rechazando y ofrece crear la cuenta. Los mails de las cuentas con contraseña NO se verifican: la primera vez que alguien entra con Google a una de esas cuentas se le saca la contraseña y se cierran sus sesiones (`claimPasswordAccountByGoogle`). `/api/login`, `/api/signup` y `/api/me` (+ foto y contraseña) quedan fuera de la matriz de acceso del alumno a propósito.
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
