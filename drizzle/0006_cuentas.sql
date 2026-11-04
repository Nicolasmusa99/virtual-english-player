-- ============================================================================
-- Cuentas y fotos (2026-11) — migración manual
-- ============================================================================
-- SOLO AGREGA cuatro columnas a "user". No borra ni cambia datos: todos los usuarios de
-- hoy siguen entrando con Google como siempre.
--
--   · username (único) + password_hash: cuentas con usuario y contraseña que crea el
--     admin. NULL en las dos = solo Google.
--   · google_image: la última foto de Google (se carga sola al entrar).
--   · image_custom: true = la persona subió su foto (entrar con Google no la pisa).
--
-- SEGURIDAD:
--   · Idempotente (IF NOT EXISTS). Transaccional (BEGIN/COMMIT).
--   · Correr PRIMERO contra la base de PRUEBAS; a prod solo con OK explícito.
--   · Verificar con: node drizzle/verify_cuentas.mjs check
-- Debe coincidir con users.username / passwordHash / googleImage / imageCustom de
-- lib/db/schema.ts.
-- ============================================================================

BEGIN;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS google_image text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS image_custom boolean NOT NULL DEFAULT false;
-- Mismo nombre que genera drizzle para users.username.unique().
DO $$ BEGIN
  ALTER TABLE "user" ADD CONSTRAINT user_username_unique UNIQUE (username);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

COMMIT;
