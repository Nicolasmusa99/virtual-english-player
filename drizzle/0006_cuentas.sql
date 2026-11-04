-- ============================================================================
-- Cuentas y fotos (2026-11) — migración manual
-- ============================================================================
-- SOLO AGREGA tres columnas a "user". No borra ni cambia datos: todos los usuarios de
-- hoy siguen entrando con Google como siempre.
--
--   · password_hash: cuentas que entran con mail y contraseña (las crea el admin o la
--     persona desde "Crear cuenta"). NULL = solo Google.
--   · google_image: la última foto de Google (se carga sola al entrar).
--   · image_custom: true = la persona subió su foto (entrar con Google no la pisa).
--
-- SEGURIDAD:
--   · Idempotente (IF NOT EXISTS). Transaccional (BEGIN/COMMIT).
--   · Correr PRIMERO contra la base de PRUEBAS; a prod solo con OK explícito.
--   · Verificar con: node drizzle/verify_cuentas.mjs check
-- Debe coincidir con users.passwordHash / googleImage / imageCustom de
-- lib/db/schema.ts.
-- ============================================================================

BEGIN;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS google_image text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS image_custom boolean NOT NULL DEFAULT false;

COMMIT;
