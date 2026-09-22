# Login con email + contraseña — estado y cómo retomar

> Última actualización: **2026-09-22**. Rama: **`feat/login-password`** (pusheada, **SIN mergear a master**).
> Este documento es el punto de entrada para retomar la fase. Si algo acá contradice al código, manda el código.

## Estado en una línea

**F0–F5 hechas, con tests y probadas en vivo en el preview. F6 (salida a producción) FRENADA hasta tener dominio propio**: sin dominio verificado en Resend los mails no llegan bien a usuarios reales.

## Qué está hecho (F0–F5)

| Fase | Commit | Qué |
|---|---|---|
| F0 | `fa80d8e` | Datos + crypto: política de contraseñas (`lib/password.ts`), bcryptjs cost 12 |
| F1 | `d94fcf7` | Email con Resend + barreras anti-envío real (`lib/email.ts`, `lib/appUrl.ts`, `lib/emailTemplates.ts`) |
| F2 | `359b7e1` | Tokens de un solo uso (sha256, nunca el crudo) + `POST/GET /api/auth/set-password` + `POST /api/users/[id]/invite` |
| — | `fa7d175` | Merge de master (`fix/session-payload`, ya en prod como `c526eed`) |
| F3 | `ef0c1ad` | `POST /api/auth/password-login` (sesión en DB + cookie idéntica a la de Auth.js; `lib/auth.ts` intacto) + freno a la fuerza bruta (`login_throttle`) |
| F4 | `5df826a` | `POST /api/auth/forgot-password` (siempre 200, trabaja en `after()`) + arreglo de dos carreras (throttle atómico, índice único parcial de tokens) |
| F5 | `85ff316` | UI: bienvenida con dos caminos, `/forgot-password`, `/set-password`, botón "Enviar invitación" con confirmación en `UsersPanel` |
| F5 | `707eeb6` | Fix de contraste de la confirmación de invitación (medido en vivo 11,2:1) |

- Tests: **662 + 1 todo** (60 archivos), typecheck y build verdes.
- Preview de la rama (apunta a la base de PRUEBAS): `https://virtual-english-pla-git-d32837-nicolasmusanm-gmailcoms-projects.vercel.app`.
- Decisiones de diseño y hallazgos: memoria del proyecto `project_login_password.md`.

## Estado de las bases al frenar (verificado 2026-09-22)

- **Pruebas (`ep-delicate-salad`)**: tiene las 3 tablas nuevas y el enum. 9 usuarios, 0 tokens, 0 contraseñas guardadas, 0 filas de throttle, ningún usuario de prueba suelto.
- **Producción (`ep-falling-bonus`)**: **intacta**. No tiene `user_credentials`, `password_tokens`, `login_throttle` ni el enum `password_token_purpose`. Solo recibió, antes de esta fase, el fix del payload de sesión (`c526eed`), que no toca el esquema.

## F6 — pasos pendientes (en orden)

### 0. Antes de empezar
- [ ] Traer master a la rama (`git merge master`) por si avanzó mientras esperaba. Correr `npm run typecheck`, `npm test` y `npm run build`.
- [ ] Mirar de nuevo el preview (login de Google, login con contraseña, invitar, olvidé mi contraseña) para confirmar que nada se rompió con lo nuevo de master.

### 1. Dominio y Resend (lo que hoy bloquea)
- [ ] Comprar el dominio.
- [ ] En Resend: *Domains → Add domain* (conviene un subdominio de envío, p. ej. `mail.<dominio>`). Cargar en el DNS los registros que da Resend: **SPF** (TXT), **DKIM** (TXT/CNAME) y el MX de rebote si lo pide.
- [ ] Agregar **DMARC**: TXT en `_dmarc.<dominio>`, arrancar con `v=DMARC1; p=none; rua=mailto:<tu casilla>`.
- [ ] Esperar a que Resend marque el dominio como **Verified**.
- [ ] Mandar un mail de prueba a una casilla propia con `npm run email:test -- <tu mail> --send` (y `--reset`), con `EMAIL_FROM` del dominio nuevo. Revisar que llegue a la **bandeja de entrada** (no a spam), en Gmail y en al menos otro proveedor (Outlook/Hotmail).

### 2. Variables de entorno en Vercel (solo *Production*)
- [ ] `RESEND_API_KEY`: key de Resend (idealmente una nueva, solo con permiso de envío y restringida al dominio).
- [ ] `EMAIL_FROM`: p. ej. `Virtual English <no-responder@mail.<dominio>>`.
- [ ] **No** definir `EMAIL_MODE` en Production (el default ahí ya es `resend`). `EMAIL_TEST_ALLOWLIST` no aplica en Production.
- [ ] `APP_BASE_URL`: **solo si la app también se va a servir en el dominio nuevo**. Si no, los links usan solos `VERCEL_PROJECT_PRODUCTION_URL`. Si la app se muda al dominio nuevo, además hay que agregar en Google Cloud Console el redirect URI `https://<dominio>/api/auth/callback/google` y revisar `AUTH_URL`.
- [ ] Preview/Development quedan como están (`console` + allowlist).

### 3. Backup de producción
- [ ] En Neon, crear una branch de backup de prod (p. ej. `backup-pre-login-password-AAAA-MM-DD`) con **Auto-delete: Never**. Anotar el nombre acá.

### 4. Migración quirúrgica en prod (NUNCA `db:push`)
Solo son CREATEs: no hay columnas que borrar en prod (la columna vieja `user.password_hash` existió solo en pruebas). La guarda anti-prod exige `ALLOW_PROD_DB=1` a propósito. SQL exacto, sacado de la base de pruebas:

```sql
BEGIN;
CREATE TYPE "public"."password_token_purpose" AS ENUM ('invite', 'reset');

CREATE TABLE "user_credentials" (
  "user_id" uuid NOT NULL,
  "password_hash" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "password_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "purpose" "password_token_purpose" NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "password_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_tokens_token_hash_unique" UNIQUE ("token_hash"),
  CONSTRAINT "password_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX "password_tokens_user_id_idx" ON "password_tokens" ("user_id");
CREATE UNIQUE INDEX "password_tokens_live_uq" ON "password_tokens" ("user_id", "purpose") WHERE used_at IS NULL;

CREATE TABLE "login_throttle" (
  "key" text NOT NULL,
  "fails" integer DEFAULT 0 NOT NULL,
  "first_fail_at" timestamp DEFAULT now() NOT NULL,
  "locked_until" timestamp,
  CONSTRAINT "login_throttle_pkey" PRIMARY KEY ("key")
);
COMMIT;
```

- [ ] Correrlo con `ALLOW_PROD_DB=1` contra `ep-falling-bonus`.
- [ ] Verificar después: columnas, constraints e índices de las 3 tablas **idénticos** a los de pruebas (comparar `information_schema.columns`, `pg_constraint`, `pg_indexes`). `user`, `session` y `account` sin cambios.

Orden: la migración va **antes** del merge. Si el código llega a prod sin las tablas, las rutas nuevas darían 500 (Google no se vería afectado, pero mejor que no pase).

### 5. Merge y deploy
- [ ] `git checkout master && git merge --no-ff feat/login-password`, correr tests y build, y push. Vercel deploya prod.

### 6. Verificación en producción
- [ ] **Google sigue igual**: entrar con Google con un admin, y un usuario fuera de la allowlist sigue rebotado.
- [ ] `/api/auth/session` devuelve solo `{user:{id,name,email,image,role}, expires}`.
- [ ] Desde el panel de usuarios, invitarse a uno mismo (una casilla propia con rol) → llega el mail a la bandeja de entrada → poner contraseña → entrar con email y contraseña.
- [ ] Reusar el mismo link → "Este link ya no sirve".
- [ ] Contraseña incorrecta → mensaje genérico; "olvidé mi contraseña" con un email inexistente → el mismo mensaje fijo.
- [ ] Olvidé mi contraseña con la cuenta propia → llega en ≤1 min, cambia la contraseña, las otras sesiones se cierran.
- [ ] Conteos en prod al final: los tokens usados quedan marcados, y no queda nada de prueba suelto.

### 7. Cierre
- [ ] Actualizar este documento, la memoria del proyecto, `CLAUDE.md` (variables `RESEND_API_KEY`, `EMAIL_*`, `APP_BASE_URL`) y `Core/` (US, pantallas y TC nuevos).
- [ ] Borrar la rama `feat/login-password` (local y remota) cuando prod quede verificada.

### Vuelta atrás (si algo sale mal en prod)
- Código: `git revert -m 1 <merge>` en master y push. Vuelve el login solo con Google.
- Base: las tablas nuevas pueden quedarse (nadie las lee sin el código). Si hace falta, `DROP TABLE login_throttle, password_tokens, user_credentials; DROP TYPE password_token_purpose;`. El backup del paso 3 queda como red.

## Deuda anotada (no bloquea F6)
- Clases `.welcomeScreen`, `.wCenter` y `.wLogo` de `app/page.module.css` quedaron sin uso tras F5.
- Tests viejos intermitentes: `stageChannel` y `persistence`.

## Reglas de la fase (siguen vigentes al retomar)
- Diffs de `app/` se muestran y se aprueban uno por uno antes de escribir.
- Google y la allowlist de Fase 1 no se tocan ni se debilitan.
- Nada contra prod sin backup; nunca `db:push` a prod; se respeta la guarda anti-prod.
- Los mails de prueba nunca salen a terceros (`EMAIL_MODE=console` + `EMAIL_TEST_ALLOWLIST` fuera de prod).
- Las pruebas en vivo incluyen ráfagas en paralelo, no solo pedidos de a uno.
